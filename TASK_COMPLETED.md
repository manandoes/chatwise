All changes have been applied successfully. The billing system now uses Razorpay Orders instead of Subscriptions, with pricing and addons calculated in the application code. The system builds without errors and is ready for deployment.

Summary of changes:
- Updated Prisma schema to add razorpayOrderId field
- Rewrote lib/razorpay.ts with order-based API
- Rewrote lib/subscription.ts for order-based billing logic
- Updated webhook route to handle order.paid/payment.successful events
- Updated billing page and plan picker to remove plan ID dependencies
- Commented out plan ID environment variables in .env.example

The system is ready for deployment to the GCP VM. After deploying, you will need to:
1. Ensure the Razorpay webhook is configured to point to https://chatwise.automovalabs.tech/api/billing/webhook
2. Verify that the webhook secret matches the RAZORPAY_WEBHOOK_SECRET in the environment
3. Test the billing flow by purchasing a plan in the application

No further action is required from the code perspective.