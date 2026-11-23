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
5. Choose a payment experience:
   - **TCW pages + hosted payment window** is the backward-compatible default. TCW owns the review, pending status and receipt; Razorpay hosts sensitive payment entry.
   - **TCW pages + in-page payment methods** uses Razorpay Custom Checkout. Ask Razorpay to activate Custom Checkout for the registered website and **UPI QR non-redirect flow**. The latter is an on-demand desktop feature. Test mode selection does not prove Live activation.
6. In Custom mode, TCW shows the available UPI QR and netbanking methods reported by the SDK. QR images are generated locally from the provider's validated UPI URI. A phone can scan from another device. Netbanking can open the bank's approval page. Raw card numbers, CVV and UPI PIN are never collected by TCW. Cards remain in the hosted experience.
7. Test success, pending, cancellation/failure, QR expiry, reload, duplicate callback/webhook, correct invoice, and credited upgrade with the actual merchant sandbox. Only then explicitly select the matching Live experience. No automatic fallback to a different checkout experience occurs.

Changing the experience retains credential and webhook versions. Each payment session snapshots its experience so existing orders continue through their original flow. Rotating keys or secrets creates a new credential version; preserve old routes and valid credentials for existing orders and historical mandates.

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
