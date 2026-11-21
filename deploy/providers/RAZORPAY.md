# Subscription billing with Razorpay

This receives customer subscription payments. Company salary payouts retain their separate connection and approval flow.

## Configure

1. Super Admin → Plans: set the monthly price, optional yearly price, employee/device limits and features. Values are entered in rupees. A blank yearly price leaves yearly checkout unavailable.
2. Super Admin → Settings → UPI receiving account: set the GST percentage and whether published prices include GST. A zero GST rate is supported. Direct UPI remains a separately verified monthly payment option.
3. Settings → Razorpay checkout & UPI AutoPay: choose **Test**, enter its Key ID, API Secret and a webhook secret of at least 16 characters, and save. Secrets are encrypted with the existing `CONFIG_ENCRYPTION_KEY` and never returned to the browser or audit log.
4. Copy the configuration-specific webhook URL into the same mode in the Razorpay dashboard. Configure the same webhook secret and these events: `payment.captured`, `payment.failed`, `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.updated`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`, `subscription.completed`.
5. Enable Subscriptions and UPI AutoPay on the merchant account, including its required checkout features. Test checkout, mandate authorization, a successful cycle, duplicate webhook delivery, failure and cancellation.
6. Enter the corresponding **Live** credentials and configure its separate webhook URL before enabling live checkout. Enabling AutoPay only offers the option; every customer must authorize their mandate through Razorpay and their payment app.

Each saved configuration has an immutable credential version and webhook URL. Retain old webhook routes and usable API credentials for existing mandates and retries. Secret rotation or merchant account changes require planning for those existing mandates.

## Behavior

- The server quotes prices, GST and plan limits. Starting checkout does not change a company's plan or create an overdue invoice.
- Razorpay signatures, captured payment amount/currency and order or subscription invoice ownership are verified server-side. Repeated callbacks and webhook events cannot renew access twice.
- Test payments have a separate ledger and never activate a production company or create paid production invoices.
- One-time paid terms carry forward unused paid time. AutoPay for an existing paid company starts after its current expiry. AutoPay charges use the provider invoice's actual billing period, so delayed old events do not move a company back to an older plan.
- Authorizing a mandate or paying an authorization fee does not activate a paid term. A full captured billing-period payment is required.
- A company cannot start a second payment path while a mandate in the same mode remains open. Cancel and reconcile the original mandate first.
- Cancellation must be acknowledged by Razorpay. It does not revoke previously paid access. Declined and halted renewals do not add a paid term; normal expiry rules continue to apply.
- A creation timeout is marked uncertain and never automatically retried with the same request key. Reconcile through Razorpay/support rather than creating duplicate mandates.
- Plans use up to 120 monthly or 10 yearly cycles. Actual available payment methods and mandate limits depend on the merchant account, bank and app. Changing a plan's published price does not reprice an existing mandate's agreed amount.
- Refunds and disputes are managed in the Razorpay dashboard; this integration does not issue refunds or bank transfers.

## Sources

- https://razorpay.com/docs/payments/subscriptions/integration-guide
- https://razorpay.com/docs/api/payments/subscriptions/create-subscription
- https://razorpay.com/docs/webhooks/validate-test
- https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices

## Validation

`node --import tsx --test tests/integration/subscription-gateway.test.ts`

The automated tests use synthetic provider responses and do not create external orders or move money. Merchant sandbox verification is still required with the user's actual account before enabling live collection.
