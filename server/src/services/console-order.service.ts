import {
  calculatePricing,
  DEFAULT_FRAME,
  FRAME_COLOR_MATERIAL,
  fromPaise,
  hasPermission,
  inBranchScope,
  PRICING,
  INTERNAL_ROLES,
  priceConsoleOrder,
  tariffBookFor,
  toPaise,
  type CartItem,
  type Client,
  type ConsoleOrderInput,
  type ConsoleQuote,
  type ConsoleQuoteInput,
  type FrameConfiguration,
  type OfflinePaymentInput,
  type Order,
  type OrderItem,
  type PriceApproval,
  type PriceBreakdown,
  type Role,
  type Space,
  type SpaceType,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { assertInScope, branchForNewRecord, branchScopeOf } from '@/services/branch.service';
import { createClient, createClientLocation, findDuplicateClient } from '@/services/client.service';
import { sendClientOrderMail } from '@/services/email.service';
import { financeSettings } from '@/services/finance.service';
import { gstCharged } from '@/services/gst.service';
import { notifyMany, notifyOwner } from '@/services/notification.service';
import { orderMoneyFor } from '@/services/order-money.service';
import { advanceOrder, loadOrderableArtworks, nextOrderReference, priceDraft } from '@/services/order.service';
import { confirmOrder, settlePayment } from '@/services/settlement.service';
import { badRequest, conflict, forbidden, notFound } from '@/utils/errors';
import { now, paymentReference } from '@/utils/ids';

/**
 * Orders created by staff in the Console - for any client, at the standard
 * tariff or at a negotiated price, and paid however it was actually paid.
 *
 * ── What the server trusts ──────────────────────────────────────────────────
 *
 * The request names a client, some lines and how payment stands. Every number
 * is recomputed here from those lines: the standard rate, the totals, the
 * discount cap, whether approval is needed. A total, a standard price or an
 * approval flag in the request body is never read - there is no field for it.
 *
 * ── Where it joins the existing system ──────────────────────────────────────
 *
 * The order is an ordinary order from the moment it exists: same reference
 * sequence, same statuses, same printing queue. Confirmation goes through
 * confirmOrder/settlePayment, the functions the payment gateway uses, so the
 * invoice, the artist notifications and the production alert all happen
 * exactly as they do for a customer who checked out online.
 */

type Actor = Pick<StoredUser, 'id' | 'email' | 'role'> & { branch?: string | null };

interface ResolvedClient {
  space: Space | null;
  client: Client | null;
  spaceType: SpaceType;
}

/** Work out who the order is for, without creating anything yet. */
async function resolveClient(input: ConsoleQuoteInput['client']): Promise<ResolvedClient> {
  if (input.kind === 'space') {
    const space = await db.spaces.byId(input.spaceId);
    if (!space) throw notFound('That space');
    const client = space.clientId ? await db.clients.byId(space.clientId) : null;
    return { space, client, spaceType: space.type };
  }
  if (input.kind === 'client') {
    const client = await db.clients.byId(input.clientId);
    if (!client || client.status !== 'active') throw notFound('That client');
    let space: Space | null = null;
    if (input.spaceId) {
      space = await db.spaces.byId(input.spaceId);
      if (!space || space.clientId !== client.id) throw badRequest('That location does not belong to this client.');
    } else {
      const locations = await db.spaces.find({ where: { clientId: client.id } });
      if (locations.length > 1) throw badRequest('This client has several locations - choose which one the order is for.');
      space = locations[0] ?? null;
    }
    return { space, client, spaceType: client.type };
  }
  return { space: null, client: null, spaceType: input.client.type };
}

async function quoteFor(input: ConsoleQuoteInput, spaceType: SpaceType) {
  const settings = await financeSettings();
  try {
    return {
      settings,
      quote: priceConsoleOrder(
        input.pricingMode,
        input.lines.map((line) => ({ ...line, unitPrice: input.pricingMode === 'custom' ? line.unitPrice : null })),
        {
          book: tariffBookFor(spaceType),
          discount: input.discount,
          approvalThresholdPercent: settings.priceOverrideApprovalPercent,
          gstRegistered: gstCharged(),
        },
      ),
    };
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Those lines could not be priced.');
  }
}

/** Standard mode keeps the self-service arithmetic exactly, coupon included. */
async function standardPricing(quote: ConsoleQuote, couponCode: string | null | undefined, spaceType: SpaceType) {
  const items = quote.lines
    .filter((line) => line.kind === 'frames')
    .flatMap((line) =>
      (line.artworkIds ?? []).map(() => ({ frame: frameFor(line.size, line.color), quantity: 1 })),
    );
  if (!couponCode?.trim()) return calculatePricing(items, { book: tariffBookFor(spaceType), gstRegistered: gstCharged() });
  return priceDraft(
    items.map((item) => ({ ...item, artworkId: '' }) as unknown as OrderItem),
    { spaceId: '', items: [], couponCode },
    spaceType,
  );
}

function frameFor(size?: string, color?: string): FrameConfiguration {
  return {
    ...DEFAULT_FRAME,
    size: (size ?? DEFAULT_FRAME.size) as FrameConfiguration['size'],
    color: (color ?? DEFAULT_FRAME.color) as FrameConfiguration['color'],
    material: (FRAME_COLOR_MATERIAL[color ?? ''] ?? DEFAULT_FRAME.material) as FrameConfiguration['material'],
  };
}

/** The live preview: same arithmetic the order will be created with. */
export async function quoteConsoleOrder(input: ConsoleQuoteInput) {
  const { spaceType } = await resolveClient(input.client);
  const { quote, settings } = await quoteFor(input, spaceType);
  const breakdown = input.pricingMode === 'standard' ? await standardPricing(quote, input.couponCode, spaceType) : null;

  return {
    quote,
    // In standard mode the coupon is applied by the same code checkout uses.
    total: breakdown ? breakdown.total : quote.total,
    discount: breakdown ? breakdown.discount : quote.discount,
    couponApplied: breakdown?.couponCode ?? null,
    approvalThresholdPercent: settings.priceOverrideApprovalPercent,
  };
}

async function buildItems(quote: ConsoleQuote): Promise<OrderItem[]> {
  const frameLines = quote.lines.filter((line) => line.kind === 'frames');
  const cart: CartItem[] = frameLines.flatMap((line) =>
    (line.artworkIds ?? []).map((artworkId) => ({ artworkId, quantity: 1, frame: frameFor(line.size, line.color) })),
  );
  if (cart.length === 0) return [];

  const artworks = await loadOrderableArtworks(cart);
  const profiles = await db.profiles.find();
  const nameByUser = new Map(profiles.map((profile) => [profile.userId, profile.displayName || profile.fullName]));

  return frameLines.flatMap((line) =>
    (line.artworkIds ?? []).map((artworkId) => {
      const artwork = artworks.get(artworkId)!;
      const frame = frameFor(line.size, line.color);
      return {
        id: `${artwork.id}-${frame.size}-${frame.material}-${frame.color}`,
        artworkId: artwork.id,
        quantity: 1,
        frame,
        artworkTitle: artwork.title,
        artworkImageUrl: artwork.thumbnailUrl,
        artistId: artwork.artistId,
        artistName: nameByUser.get(artwork.artistId) ?? 'ARTINU artist',
        // The agreed price per framed photograph - the tariff rate or the negotiated one.
        unitPrice: line.unitPrice,
        framePrice: line.unitPrice,
        printPrice: 0,
        licensePrice: 0,
        lineTotal: line.unitPrice,
        artistCommission: 0,
      };
    }),
  );
}

export async function createConsoleOrder(actor: Actor, input: ConsoleOrderInput) {
  // A double click or a retry returns the order the first request created.
  const replay = await db.orders.findOne({ idempotencyKey: input.idempotencyKey } as never);
  if (replay) return { order: replay, money: await orderMoneyFor(replay), replayed: true };

  if (input.pricingMode === 'custom' && !hasPermission(actor.role, 'orders.custom_price')) {
    throw forbidden('Your role cannot set custom prices. Use standard pricing, or ask a manager.');
  }
  if (input.payment.terms === 'credit' && !hasPermission(actor.role, 'orders.extend_credit')) {
    throw forbidden('Only finance or the CEO can confirm an order on credit.');
  }
  if (input.payment.terms === 'paid_offline' && !hasPermission(actor.role, 'payments.record_offline')) {
    throw forbidden('Your role cannot record payments.');
  }

  const resolved = await resolveClient(input.client);
  const { quote, settings } = await quoteFor(input, resolved.spaceType);

  if (quote.customised && !input.priceReason?.trim()) {
    throw badRequest('Say why this order is priced differently from the standard tariff.');
  }

  // Approval: needed above the threshold, granted at once if the creator holds it.
  const needsApproval = quote.requiresApproval && !hasPermission(actor.role, 'orders.approve_price');
  if (needsApproval && (input.payment.terms === 'paid_offline' || input.payment.terms === 'credit')) {
    throw badRequest(
      `This price is ${quote.reductionPercent}% below standard and needs approval first. Create the order with payment to be collected later, then record the payment once it is approved.`,
    );
  }
  const approval: PriceApproval = {
    required: quote.requiresApproval,
    status: !quote.requiresApproval ? 'not_required' : needsApproval ? 'pending' : 'approved',
    thresholdPercent: settings.priceOverrideApprovalPercent,
    reductionPercent: quote.reductionPercent,
    reason: input.priceReason?.trim() || null,
    requestedBy: actor.id,
    requestedByEmail: actor.email,
    requestedAt: now(),
    ...(quote.requiresApproval && !needsApproval
      ? { decidedBy: actor.id, decidedByEmail: actor.email, decidedAt: now(), decisionNote: 'Approved by the creator, who holds approval rights.' }
      : {}),
  };

  if (input.payment.terms === 'paid_offline' && toPaise(input.payment.amount) > toPaise(quote.total)) {
    throw badRequest('The amount received is more than the order total.');
  }

  // Everything is validated: photographs first, before any client is created.
  const items = await buildItems(quote);

  let { space, client } = resolved;
  if (input.client.kind === 'new') {
    const created = await createClient(actor, input.client.client);
    client = created.client;
    space = created.space;
  } else if (!space && client) {
    space = await createClientLocation(client);
  }
  if (!space) throw badRequest('There is no location to deliver this order to.');

  const standard = input.pricingMode === 'standard' ? await standardPricing(quote, input.couponCode, resolved.spaceType) : null;
  const pricing: PriceBreakdown = standard
    ? {
        ...standard,
        mode: 'standard',
        lines: quote.lines,
        standardTotal: standard.total,
        priceReason: null,
        commercialTerms: input.commercialTerms?.trim() || null,
        approval: { ...approval, required: false, status: 'not_required' },
      }
    : {
        artworkTotal: 0,
        frameTotal: quote.framesTotal,
        printingTotal: quote.printing,
        otherCharges: quote.otherCharges,
        subtotal: fromPaise(toPaise(quote.framesTotal) + toPaise(quote.printing) + toPaise(quote.otherCharges)),
        discount: quote.discount,
        couponCode: null,
        gst: quote.tax,
        delivery: quote.delivery,
        installation: quote.installation,
        securityDeposit: 0,
        total: quote.total,
        quantity: quote.frameCount,
        mode: 'custom',
        lines: quote.lines,
        standardTotal: quote.standardTotal,
        priceReason: input.priceReason?.trim() || null,
        commercialTerms: input.commercialTerms?.trim() || null,
        approval,
      };

  const branch = await branchForNewRecord(await branchScopeOf(actor), input.branch);
  const placedAt = now();
  const order = await db.orders.insert({
    reference: await nextOrderReference(),
    branch,
    spaceId: space.id,
    ownerId: space.ownerId ?? null,
    clientId: client?.id ?? space.clientId ?? null,
    createdBy: actor.id,
    createdByEmail: actor.email,
    paymentTerms: input.payment.terms,
    idempotencyKey: input.idempotencyKey,
    items,
    pricing,
    status: 'pending_payment',
    timeline: [
      {
        status: 'pending_payment',
        at: placedAt,
        note:
          approval.status === 'pending'
            ? `Created in the Console. Price awaiting approval (${quote.reductionPercent}% below standard).`
            : 'Created in the Console, awaiting payment.',
        by: actor.email,
      },
    ],
    paymentId: null,
    invoiceId: null,
    installationId: null,
    notes: input.notes?.trim() || null,
    placedAt,
    updatedAt: placedAt,
    completedAt: null,
  } as never);

  await recordAudit({
    actor,
    action: 'order.created_in_console',
    entity: 'order',
    entityId: order.id,
    meta: {
      reference: order.reference,
      clientId: order.clientId ?? null,
      spaceId: space.id,
      pricingMode: input.pricingMode,
      total: pricing.total,
      standardTotal: pricing.standardTotal ?? null,
      reductionPercent: quote.reductionPercent,
      approval: approval.status,
      priceReason: pricing.priceReason ?? null,
      paymentTerms: input.payment.terms,
    },
  });

  // A price waiting for approval is useless until someone with the right sees it.
  if (approval.status === 'pending') {
    const approvers = (await db.users.find({ where: { role: INTERNAL_ROLES as unknown as Role } })).filter(
      (user) => user.status === 'verified' && user.id !== actor.id && hasPermission(user.role, 'orders.approve_price'),
    );
    await notifyMany(
      approvers.map((user) => ({
        userId: user.id,
        type: 'system' as const,
        title: `Price for ${order.reference} needs approval`,
        body: `${quote.reductionPercent}% below the standard price, set by ${actor.email}: ${approval.reason ?? 'no reason given'}`,
        link: `/console/orders/${order.id}`,
      })),
    );
  }

  let result: Order = order;
  if (input.payment.terms === 'credit') {
    ({ order: result } = await confirmOrder(order, {
      note: `Confirmed on approved credit by ${actor.email}${input.payment.note ? ` - ${input.payment.note}` : ''}.`,
      by: actor.email,
    }));
    await recordAudit({
      actor,
      action: 'order.confirmed_on_credit',
      entity: 'order',
      entityId: order.id,
      meta: { total: pricing.total, note: input.payment.note ?? null },
    });
  } else if (input.payment.terms === 'paid_offline') {
    ({ order: result } = await recordOfflinePayment(actor, order.id, {
      amount: input.payment.amount,
      receivedOn: input.payment.receivedOn,
      method: input.payment.method,
      reference: input.payment.reference,
      notes: input.payment.notes,
      idempotencyKey: `${input.idempotencyKey}:payment`,
    }));
  } else if (input.payment.terms === 'request_payment') {
    await notifyOwner(order.ownerId, {
      type: 'order_update',
      title: `Order ${order.reference} is ready to pay`,
      body: `We have put together ${pricing.quantity} frames for ${space.name}.`,
      link: `/space/orders/${order.id}`,
    });
    if (!order.ownerId && client?.email && approval.status !== 'pending') {
      await sendClientOrderMail(client.email, client.contactName, order, 'summary');
    }
  }

  return { order: result, money: await orderMoneyFor(result), replayed: false };
}

/**
 * Money received outside the gateway - cash, UPI to the account, a transfer.
 *
 * It can be part of the total. The payment that completes the total confirms
 * the order through settlePayment, the same path as a gateway payment, so the
 * invoice and production follow exactly as they would online. Never more than
 * is owed, and a retried request records nothing twice.
 */
export async function recordOfflinePayment(actor: Actor, orderId: string, input: OfflinePaymentInput) {
  const target = await db.orders.byId(orderId);
  if (!target) throw notFound('That order');
  assertInScope(await branchScopeOf(actor), target.branch, 'That order');

  const replay = await db.payments.findOne({ idempotencyKey: input.idempotencyKey } as never);
  if (replay) {
    if (replay.orderId !== orderId) throw conflict('That request key was already used for another order.');
    const order = (await db.orders.byId(orderId))!;
    return { order, payment: replay, money: await orderMoneyFor(order), replayed: true };
  }

  const order = await db.orders.byId(orderId);
  if (!order) throw notFound('That order');
  if (order.status === 'cancelled') throw badRequest('A cancelled order cannot take a payment.');
  if (order.pricing.approval?.status === 'pending') {
    throw badRequest('This order’s price is waiting for approval. Record the payment once it is approved.');
  }

  const before = await orderMoneyFor(order);
  if (toPaise(before.outstanding) <= 0) throw badRequest('This order is already paid in full.');
  if (toPaise(input.amount) > toPaise(before.outstanding)) {
    throw badRequest(`That is more than the ${before.outstanding.toFixed(2)} still owed on this order.`);
  }

  const completes = toPaise(input.amount) === toPaise(before.outstanding);
  const awaitingConfirmation = order.status === 'pending_payment' || order.status === 'payment_failed';
  const reference = input.reference?.trim() || paymentReference();

  const payment = await db.payments.insert({
    orderId: order.id,
    provider: 'manual',
    amount: input.amount,
    currency: PRICING.CURRENCY,
    // Settlement flips the completing payment to succeeded itself.
    status: completes && awaitingConfirmation ? 'awaiting_payment' : 'succeeded',
    qrPayload: null,
    qrImageDataUrl: null,
    reference,
    gatewayOrderId: null,
    gatewayPaymentId: null,
    expiresAt: null,
    attempts: 1,
    failureReason: null,
    method: input.method,
    // The calendar date it arrived, held at midday India time so it can never slip a day.
    paidAt: `${input.receivedOn}T12:00:00+05:30`,
    recordedBy: actor.id,
    recordedByEmail: actor.email,
    notes: input.notes?.trim() || null,
    idempotencyKey: input.idempotencyKey,
    createdAt: now(),
    updatedAt: now(),
  } as never);

  await db.orders.update(order.id, { paymentId: payment.id, updatedAt: now() });
  let updated = (await db.orders.byId(order.id))!;

  if (completes && awaitingConfirmation) {
    ({ order: updated } = await settlePayment(payment, updated, null, {
      reference,
      actor: { id: actor.id, email: actor.email },
    }));
  } else {
    const after = await orderMoneyFor(updated);
    updated = await db.orders.update(order.id, {
      timeline: [
        ...updated.timeline,
        {
          status: updated.status,
          at: now(),
          note: completes
            ? `Paid in full - ₹${input.amount.toFixed(2)} received (${reference}).`
            : `Part payment of ₹${input.amount.toFixed(2)} received (${reference}); ₹${after.outstanding.toFixed(2)} outstanding.`,
          by: actor.email,
        },
      ],
      updatedAt: now(),
    });
  }

  const money = await orderMoneyFor(updated);
  await recordAudit({
    actor,
    action: 'payment.recorded_offline',
    entity: 'payment',
    entityId: payment.id,
    meta: { orderId: order.id, amount: input.amount, method: input.method, reference, outstanding: money.outstanding },
  });

  if (order.ownerId) {
    await notifyOwner(order.ownerId, {
      type: 'payment_received',
      title: `Payment recorded for ${order.reference}`,
      body: money.outstanding > 0 ? `₹${money.outstanding.toFixed(2)} remains outstanding.` : 'Your order is paid in full.',
      link: `/space/orders/${order.id}`,
    });
  } else if (order.clientId) {
    const client = await db.clients.byId(order.clientId);
    if (client?.email) {
      void sendClientOrderMail(client.email, client.contactName, updated, 'payment_received', {
        amount: input.amount,
        outstanding: money.outstanding,
      });
    }
  }

  return { order: updated, payment: (await db.payments.byId(payment.id))!, money, replayed: false };
}

/** Approve or reject a price that went past the threshold. */
export async function decidePriceApproval(actor: Actor, orderId: string, decision: 'approve' | 'reject', note?: string | null) {
  const order = await db.orders.byId(orderId);
  if (!order) throw notFound('That order');
  assertInScope(await branchScopeOf(actor), order.branch, 'That order');
  const approval = order.pricing.approval;
  if (approval?.status !== 'pending') throw badRequest('This order is not waiting for a price approval.');
  if (approval.requestedBy === actor.id) throw forbidden('You created this price, so someone else has to approve it.');
  if (decision === 'reject' && !note?.trim()) throw badRequest('Say why the price is rejected.');

  const decided: PriceApproval = {
    ...approval,
    status: decision === 'approve' ? 'approved' : 'rejected',
    decidedBy: actor.id,
    decidedByEmail: actor.email,
    decidedAt: now(),
    decisionNote: note?.trim() || null,
  };
  let updated = await db.orders.update(order.id, {
    pricing: { ...order.pricing, approval: decided },
    timeline: [
      ...order.timeline,
      {
        status: order.status,
        at: now(),
        note: decision === 'approve' ? 'Price approved.' : `Price rejected: ${note?.trim()}`,
        by: actor.email,
      },
    ],
    updatedAt: now(),
  });
  if (decision === 'reject') {
    updated = await advanceOrder(updated, 'cancelled', { note: 'Cancelled - the price was not approved.', by: actor.email });
  }

  await recordAudit({
    actor,
    action: decision === 'approve' ? 'order.price_approved' : 'order.price_rejected',
    entity: 'order',
    entityId: order.id,
    meta: { reductionPercent: approval.reductionPercent, total: order.pricing.total, note: note?.trim() || null },
  });

  if (approval.requestedBy) {
    await notifyOwner(approval.requestedBy, {
      type: 'system',
      title: `Price ${decision === 'approve' ? 'approved' : 'rejected'} for ${order.reference}`,
      body: decision === 'approve' ? 'You can now collect payment for it.' : (note?.trim() ?? ''),
      link: `/console/orders/${order.id}`,
    });
  }
  return { order: updated, money: await orderMoneyFor(updated) };
}

/** Orders whose custom price waits for a decision - for someone who may make it. */
export async function pendingPriceApprovals(actor: Actor) {
  const [allOrders, spaces, clients, scope] = await Promise.all([db.orders.find(), db.spaces.find(), db.clients.find(), branchScopeOf(actor)]);
  const orders = allOrders.filter((order) => inBranchScope(scope, order.branch));
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const clientById = new Map(clients.map((client) => [client.id, client]));
  return orders
    .filter((order) => order.pricing.approval?.status === 'pending' && order.status !== 'cancelled')
    .map((order) => ({
      id: order.id,
      reference: order.reference,
      customer: (order.clientId ? clientById.get(order.clientId)?.name : null) ?? spaceById.get(order.spaceId)?.name ?? 'Unknown customer',
      total: order.pricing.total,
      standardTotal: order.pricing.standardTotal ?? null,
      reductionPercent: order.pricing.approval!.reductionPercent,
      thresholdPercent: order.pricing.approval!.thresholdPercent,
      reason: order.pricing.approval!.reason ?? null,
      requestedByEmail: order.pricing.approval!.requestedByEmail ?? null,
      requestedAt: order.pricing.approval!.requestedAt ?? order.placedAt,
      // Whoever set the price cannot approve it.
      mayDecide: order.pricing.approval!.requestedBy !== actor.id,
    }))
    .sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
}

/** Exposed for the new-client step: is this business already on file? */
export { findDuplicateClient };
