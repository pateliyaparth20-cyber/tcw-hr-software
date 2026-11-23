# TCW subscription payments

Customer subscription payments use their own TCW review and payment/receipt routes. Salary payouts remain a separate connection.

## Pages

- `/subscription/checkout?plan=GROWTH&cycle=MONTHLY`: server quote, discount, GST, unused-time upgrade credit and explicit consent.
- `/subscription/payment/<checkout UUID>`: method selection, pending status, verified receipt and private invoice PDF download. The session is company-scoped and survives a page reload.
- Only a verified server ledger entry marks the receipt paid. A URL, client callback or client-entered amount cannot activate access. Test receipts never activate the live plan or create a production invoice.

## Merchant setup

1. Configure catalog prices in Super Admin → Plans and GST in Payment Settings. AutoPay is removed; renewals are manual.
2. In Payment Settings → Razorpay checkout, configure Test keys and a webhook secret of at least 16 characters. Secrets are encrypted and never returned to the browser.
3. Register the exact configuration-specific webhook URL in the same Razorpay mode with the same secret. Enable `payment.captured` and `payment.failed`. Retain subscription lifecycle events and old webhook URLs for any historical mandates.
4. Verify an actual signed webhook delivery. Saving credentials does not verify delivery.
5. TCW now uses its own in-app payment UI exclusively. The hosted method-selection SDK/window has been removed. Old saved sessions also use the current own-page UI, retaining their original order, amount and credential revision. There is no hosted fallback or setting to re-enable it.
6. Ask Razorpay to activate **Custom Checkout** for the registered website, and **UPI QR non-redirect flow** for desktop QR. The QR feature is on demand. Mobile UPI uses the documented intent flow and the customer's selected UPI app. Enabled debit/credit cards, netbanking banks and wallets come from the Custom SDK's method availability. The merchant must complete its applicable activation and card-acceptance requirements; SDK availability is not evidence that the actual merchant flow has been tested.
7. TCW collects card fields only in transient browser state and passes them directly to the processor SDK. They are not sent to TCW API endpoints, logged or saved by the application. Fields are cleared after initiation or failure. Bank/issuer authentication and UPI or wallet app approval may still require a handoff; own-page checkout does not remove customer authorization.
8. Keep Test mode until the actual merchant sandbox passes success, pending, cancellation/failure, QR expiry, mobile intent, cards, banks/wallets, reload, duplicate callbacks/webhooks, correct invoice and credited upgrade. Test activation does not prove Live activation. If a method is not activated, show an inline setup/error state instead of opening hosted checkout.

Changing this UI does not rotate credentials or create replacement orders. Keys and secrets retain their versioned encryption and existing webhook URLs. Preserve old routes and credentials for historical orders and mandates.

## Verification and limits

The server checks signatures, captured status, exact INR amount and stored order ownership. Duplicate payments cannot grant access twice. Only verified live payments create invoices and paid terms. Immediate upgrades apply verified unused-time credit once; downgrades are unavailable. Late payments that conflict with a newer plan require review rather than reverting access.

A provider creation timeout remains uncertain and is never blindly retried. Reconcile the original order before starting another. Refunds and disputes are managed in Razorpay; this integration does not issue refunds or bank transfers.

Automated checks use synthetic provider responses and never move money:

```
node --import tsx --test tests/unit/payment-provider.test.ts tests/integration/subscription-gateway.test.ts
npm run typecheck
npm run build
```

Actual merchant activation and sandbox acceptance remain separate from these automated checks.

## Primary references

- https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/build-integration/
- https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/
- https://razorpay.com/docs/webhooks/validate-test/

## Recover an unfinished upgrade

Plans and billing lists the original pending upgrade. Check payment status to reconcile a captured payment, or continue the original checkout while its quote is valid. Unused verified paid time is shown as a negative credit in the upgrade total. The lower-plan button says “Choose plan” but remains disabled; the downgrade policy is unchanged.

“Replace unpaid checkout” requires explicit confirmation. The server checks the original order and its payment attempts first. Captured payments are reconciled; authorized, created, incomplete or uncertain attempts prevent replacement. Only confirmed unpaid sessions are marked closed in TCW. No provider cancellation or refund is claimed. Any later capture on a replaced order is ledgered and invoiced for billing review without changing the current plan or consuming its upgrade credit. An expired quote cannot launch a new payment from the TCW page; return to plans to replace an unpaid session and review a fresh quote.
