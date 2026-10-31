import { useMutation } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { consoleOrdersService } from '@/services/console-orders.service';

/**
 * Attach a client's locations, orders and invoices to the ARTINU account the
 * business has since registered.
 *
 * Deliberate by design: someone types the exact address the account signs in
 * with and says how they confirmed it is the same business. Nothing links
 * because two emails happen to match, and the server refuses an account that
 * has not verified its address.
 */
export function LinkClientAccount({
  clientId,
  clientName,
  onLinked,
}: {
  clientId: string;
  clientName: string;
  onLinked?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [reason, setReason] = React.useState('');

  const link = useMutation({
    mutationFn: () => consoleOrdersService.linkClient(clientId, { email: email.trim() }, reason.trim()),
    onSuccess: () => {
      toast.success(`${clientName} is now on that account. The owner sees their orders and invoices there.`);
      setOpen(false);
      onLinked?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Link2 /> Link to a registered account
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-3.5">
      <p className="text-xs leading-relaxed text-muted">
        Only when the business has registered on ARTINU itself. Its locations, orders and invoices move to that account.
      </p>
      <Field label="Email the account signs in with" htmlFor={`link-email-${clientId}`}>
        <Input
          id={`link-email-${clientId}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="owner@cafe.in"
          autoComplete="off"
        />
      </Field>
      <Field label="How you confirmed it is the same business" htmlFor={`link-reason-${clientId}`}>
        <Textarea
          id={`link-reason-${clientId}`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Called the owner on the number on file"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          loading={link.isPending}
          disabled={!/^\S+@\S+\.\S+$/.test(email.trim()) || reason.trim().length < 5}
          onClick={() => link.mutate()}
        >
          Link account
        </Button>
      </div>
    </div>
  );
}
