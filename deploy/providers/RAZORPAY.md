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
5. The original hosted Razorpay payment window is restored for all new and resumed sessions, including sessions previously marked Custom. TCW retains plan review, server-verified receipts, invoice downloads, upgrade credit and unfinished-payment recovery. Order IDs, amounts and encrypted credential versions are retained.
6. Customers choose from the methods activated in the merchant's Standard Checkout account. Custom Checkout and non-redirect QR activation are not required for this hosted flow. No raw card fields are collected by TCW.
7. Test callback/webhook delivery, success, pending, failure and cancellation with the actual merchant account before collecting live payments. This application change does not change merchant keys, issue refunds or initiate payments.

Payment Settings uses the hosted experience. Legacy experience fields cannot switch the effective checkout back to the in-app Custom flow. Rotating keys or secrets still creates a new credential version; retain old routes and valid credentials for existing orders.

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
