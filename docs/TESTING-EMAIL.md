# Testing the email flow

Two ways to do this. **Path A** works right now with no setup and proves the
logic. **Path B** proves real delivery into a real inbox. Do A first — if a
message is missing there, SMTP will not fix it.

Right now the server reports `email: console`, which means every message is
captured but nothing is delivered.

---

## Path A — verify the flow with no setup (5 minutes)

Everything Curate sends is recorded with its full rendered body.

1. Start both servers from the repo root:

   ```
   npm run dev
   ```

2. Sign in at `http://localhost:5173/signin` as **IT**
   (`it@curate.ac.in` / `Curate@IT2026`).

3. Open **Console → System → Email Log** (`/console/system/mail`).

Now trigger something in another tab — book a consultation at `/lets-talk` — and
hit **Refresh** on the log. The message appears. Click it to read the exact HTML
the recipient would get.

Each row also tells you **who caused it**, so you can confirm the right account
is accountable for the right action.

---

## Path B — real delivery to a real inbox

### Step 1 · Get a Gmail App Password

Gmail rejects your normal password over SMTP.

1. Turn on 2-Step Verification — [myaccount.google.com/security](https://myaccount.google.com/security)
2. Create an app password — [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   (name it "Curate"). You get 16 characters like `abcd efgh ijkl mnop`.

### Step 2 · Put it in `.env` at the repo root

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=vibhukrishnas7@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM="Curate <vibhukrishnas7@gmail.com>"
```

Remove the spaces from the app password. `SMTP_FROM` must use the same address
as `SMTP_USER` — Gmail rewrites or rejects anything else.

### Step 3 · Restart and prove it

Restart the server. The boot line should now read `email=smtp`, not
`email=console`.

Then **Console → System → Email Log → Send a test**, enter your address, send.

- Toast says *"Sent to … Check the inbox"* → SMTP works.
- Toast says *"Your provider rejected it"* → the server log has the reason.
  Usually a wrong app password or 2FA not enabled.
- The banner still says no provider is configured → `.env` was not picked up.
  Confirm it is at the **repo root**, not in `server/`, and restart.

Check spam on the first send. Mark it "not spam" so later ones arrive cleanly.

---

## The full journey, click by click

Two browsers (or one normal + one private window) makes this much easier, since
you are switching between five accounts.

| Accounts you will need | |
| --- | --- |
| Artist | `vibhukrishnas7@gmail.com` / `Curate@Artist2026` |
| Space | `1853552.vibhukrishnas@gmail.com` / `Curate@Space2026` |
| Manager | `manager@curate.ac.in` / `Curate@Mgr2026` |
| Field Operations | `fieldops@curate.ac.in` / `Curate@Ops2026` |
| Accounts | `accounts@curate.ac.in` / `Curate@Acc2026` |

### 1 · The artist uploads

Sign in as the **artist** → `/studio/upload`.

Drop in a photograph **at least 1200px on the long edge** (smaller is rejected —
it genuinely cannot be printed). Fill in title, category, location, and **at
least one tag**. Submit.

📧 **artist** receives *"We have your photograph — …"*

### 2 · The curator approves it

Sign in as the **manager** → `/console/moderation`.

The upload is at the top of the queue with its automated checks shown. Press
**A** to approve (or click Approve).

📧 **artist** receives *"… is live on Curate"*

### 3 · The space finds it

Sign in as the **space** → `/space/collections`. Search the title — it is now in
the gallery. Click **Add to cart**, choose a frame, set quantity to **3**
(minimum order), add.

### 4 · The space pays

`/space/cart` → **Continue to checkout** → pick the venue → **Place order**.

You land on the QR page. There is no payment gateway wired up, so use
**Simulate successful payment** in the dashed *Development* panel.

📧 **space** receives *"Payment received"* and *"Order … received"*
📧 **artist** receives *"… is going up at The Test Kitchen"*

### 5 · Operations books the installation

Sign in as **field operations** → `/console/orders` → open the order →
**Schedule installation** with a date and time window.

📧 **space** receives *"Installation scheduled"*
📧 **artist** receives *"Your work is going up at …"*

### 6 · Accounts pays the artist

Sign in as **accounts** → `/console/accounts` → find the pending payout for that
order → **Mark as paid**.

📧 **artist** receives *"Your … payout is on its way"*

---

## Checking the result

Sign in as **IT** or **CEO** and open the Email Log. You should see eight
messages from that run. Filter by recipient to see one side of the story, or by
the account that triggered it to see what one person caused.

Every message shows its `requestId`, which is the same id recorded on the audit
entry for that action — so **Console → Users & Roles → Audit Log** and the Email
Log line up. One action, one id, everything it caused.

## If something does not arrive

1. **Check the Email Log first.** If the message is not there at all, the flow
   did not fire — that is a product problem, not a mail problem.
2. If it is there marked **Captured** rather than **Sent**, the provider refused
   it. The server log says why.
3. If it says **Sent** but the inbox is empty, check spam, then check the Gmail
   sending limit (roughly 500 a day on a free account).
