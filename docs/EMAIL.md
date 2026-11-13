# Insight transactional email

Email is sent through **Resend**, from the server only. This page is the setup guide, the DNS
checklist and the privacy notes. Nothing here has been activated: until you complete the steps in
"Activation", `EMAIL_ENABLED` stays `false` and the app behaves normally without sending anything.

## What is sending and what is receiving

| | Address | Role |
|---|---|---|
| **Sending (outgoing)** | `EMAIL_FROM_ADDRESS` on a domain you own and have verified in Resend | The "From" of every email. Resend delivers it. |
| **Receiving (incoming)** | `stylintech.x@gmail.com` | The only official contact address. It receives contact-form messages, admin notifications and customer replies (Reply-To). It is **not** a Resend sender and Resend does not need access to it. |

No other mailbox exists. Insight does not create or display support@, privacy@ or similar addresses.
Gmail is only an inbox here; replying to a message simply uses Gmail's own sending.

## How it works

- `lib/email/*` is the whole system: `config` (env), `provider` (Resend over `fetch`), `templates`
  (branded HTML and plain text), `service` (record, send, retry), `webhook`, `preferences`, `events`.
- Every email is a row in `EmailMessage`: it is both the outbox and the delivery record. Message bodies,
  links and tokens are **never stored**. The row keeps category, template name, recipient address,
  status, attempts and a short sanitised error.
- One-time links (verification, password reset) are built at send time, held only in memory, and the
  database keeps only a SHA-256 of the token. If such an email fails, the user asks for a new link.
- Duplicates are prevented by an idempotency key per email. Failures never break the action that
  caused them (registration, orders, invitations all succeed regardless).
- Retries: 1, 5, 30, 120, 360 minutes, at most 5 attempts, then `FAILED`. Permanent errors fail at once.
  A 429 honours Resend's `Retry-After`. Retries run from `/api/cron/email` (daily by default, see below) and
  from the "Process queue now" button in the admin Email section.
- Switches: `EMAIL_ENABLED` (environment) **and** the Super Admin switch must both allow sending.

### Who gets which email

| Group | Emails | Can be switched off? |
|---|---|---|
| Account and security | Welcome, email confirmation, password reset, password changed, repeated failed sign-ins, employee added | No |
| Seller applications | Submitted, under review, information required, approved, rejected | No |
| Business (owners and managers) | Low or out of stock (once per product per day), purchase order recorded, daily sales summary (off by default) | Yes, Settings, Notifications |
| Marketplace (sellers) | New order request, order status recorded | Yes, Settings, Notifications |
| Admin (to the central Gmail) | New seller application, security events, compliance events, delivery problems | Super Admin can switch all email off or change the central address |

There is no marketing list and no newsletter. Order emails say an order is a **request**; Insight does
not claim WhatsApp delivery, seller acceptance, payment or fulfilment.

## Activation (what you must do; I cannot do these)

1. Create a Resend account and an **API key** (sending access). Put it in Vercel as `RESEND_API_KEY`.
2. In Resend, add your sending domain. If you intend to use `insight.app`, you must own it first (it is
   not owned or verified today). A subdomain such as `send.<yourdomain>` is the usual choice.
3. Add the DNS records Resend shows you (next section) at your DNS host. Wait for Resend to show **Verified**.
4. Set `EMAIL_FROM_ADDRESS` to an address on that verified domain, and `APP_PUBLIC_URL` to the public URL.
5. Create a webhook in Resend pointing to `https://<APP_PUBLIC_URL host>/api/email/webhook` with events
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`,
   `email.failed`. Copy its signing secret into `EMAIL_WEBHOOK_SECRET`.
6. Set `CRON_SECRET` (any long random string) so Vercel Cron can call `/api/cron/email`.
7. Apply migration `9_transactional_email` to the production database (see `DEPLOY.md`).
8. Set `EMAIL_ENABLED=true`, redeploy, then in **Admin, Email** press **Send test email**. It sends one
   message to the central Gmail and shows the exact Resend answer. "Accepted" is not "delivered":
   check the inbox and the delivery status, which updates through the webhook.

Until you have done step 8 and seen the message arrive, do not treat production email as working.

### Testing before the domain is verified

Resend's test sender (`onboarding@resend.dev`, used when `EMAIL_FROM_ADDRESS` is empty) only delivers to
the email address of the Resend account owner. If that is your Gmail, the test email will arrive; mail to
anyone else will be refused by Resend and shown as `FAILED` with Resend's message. The admin Email
section warns when the test sender is in use.

## DNS records

Do not copy values from this page. Resend generates them for your domain; the admin Email section
shows the domain status when the API key is allowed to read domains. Expect these record types:

| Purpose | Type | Where | Notes |
|---|---|---|---|
| SPF | `TXT` (and an `MX` for bounce handling) | on the sending (sub)domain, for example `send` | Value supplied by Resend |
| DKIM | `TXT` (Resend may use `CNAME`) | `resend._domainkey` on the domain | Value supplied by Resend |
| DMARC | `TXT` | `_dmarc` on the domain | Recommended start: `v=DMARC1; p=none; rua=mailto:stylintech.x@gmail.com`. Tighten to `quarantine` later once reports look clean. This record is yours to choose; Resend does not generate it. |
| Return path / tracking | as shown | as shown | Only if Resend lists them |

Insight never edits DNS. Add the records yourself at your DNS provider.

## Webhooks

`POST /api/email/webhook` checks the Svix-style signature (`svix-id`, `svix-timestamp`, `svix-signature`)
with `EMAIL_WEBHOOK_SECRET`, rejects timestamps older than 5 minutes, ignores replayed event ids, and
never moves a status backwards (a late "sent" cannot undo "delivered"). Bounces, complaints and failures
are marked on the delivery row and the central address is told once per category per day. Raw payloads and
addresses are not logged.

## Cron

`vercel.json` calls `/api/cron/email` once a day (the limit on the Hobby plan). It retries due emails, sends
daily sales summaries to businesses that opted in, and deletes webhook ids older than 30 days and delivery rows
older than 180 days. On a plan that allows it, change the schedule to every few minutes for faster retries.
Normal sending does not depend on cron: the first attempt happens immediately.

## Monitoring and troubleshooting

- **Admin, Email** shows state, configuration (never secrets), 7-day counts by status and category, and recent
  activity with masked addresses. Message contents and links are never shown.
- `Off: EMAIL_ENABLED...`: set the variable to `true` and redeploy.
- `Off: RESEND_API_KEY...`: the key is missing in this environment.
- Test email `FAILED` with a "domain is not verified" or "you can only send to your own address" message:
  the domain is not verified yet, or the test sender is in use.
- Emails `SENT` but never `DELIVERED`: the webhook is not configured or the secret does not match.
- Forms say email is unavailable: that is the truthful answer while email is off; users are pointed to the Gmail address.

## Privacy (Ghana Data Protection Act, 2012, Act 843)

This is a technical summary for legal review, not legal advice. Insight makes no claim of registration or
certification with the Data Protection Commission and none is displayed anywhere.

- **Personal data in email:** recipient email address, name, business name, and (for order requests) order
  reference and totals. Message bodies and one-time links are not stored.
- **Stored in the database:** the recipient address, category, template, status and timestamps of each email,
  kept 180 days and then deleted. Verification and reset tokens are stored only as hashes and expire.
- **Processor:** Resend delivers the email and therefore processes the recipient address and message content.
  Resend operates outside Ghana, so this is an **international transfer** to document and review (data processing
  agreement, lawful basis, notice to users).
- **Contact and privacy requests:** the only official address is stylintech.x@gmail.com. The contact form sends
  there; it is not stored beyond the delivery record above.
- **Essential versus optional:** account, security and application emails are necessary to run the service;
  optional business and marketplace emails can be switched off by the business owner, and every change is
  written to the audit log. There is no marketing mailing.
- **Items for counsel:** Resend DPA and transfer basis, retention periods, wording of the privacy notice,
  and whether registration with the Commission applies to the operator.
