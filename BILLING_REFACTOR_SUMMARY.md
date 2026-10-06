# Summary of Changes Made

## Overview
Refactored the billing system from Razorpay Subscriptions to Razorpay Orders, removing the need for pre-created plans in the Razorpay dashboard. All pricing and addon logic now lives in the application code.

## Files Modified

### 1. prisma/schema.prisma
- Added `razorpayOrderId String? @unique` field to the Subscription model
- Kept existing `razorpaySubscriptionId` and `razorpayCustomerId` for migration safety

### 2. lib/razorpay.ts
- Removed `razorpayPlanId` function (no longer needed)
- Added `createBillingOrder` function that creates a Razorpay Order for a given amount
- Kept existing customer creation and webhook verification functions
- Updated documentation to reflect the new order-based model

### 3. lib/subscription.ts
- Completely rewrote to use order-based billing:
  - `startSubscription`: Creates a Razorpay Order for plan price + active add-ons
  - `changePlan`: Creates a new order for the new plan, handles upgrades/downgrades
  - `cancelPlan`: Marks subscription for cancellation at period end (no Razorpay API call needed)
  - `applyOrderPaidEvent`: Webhook handler that activates subscription when order is paid
  - Updated `readAccountPlan` to check `hasRazorpaySubscription` via `razorpayOrderId`
  - Simplified `readInvoices` to return empty array (can be enhanced later)
  - Added `orderAddonTotal` helper to calculate addon pricing

### 4. app/api/billing/webhook/route.ts
- Removed dependency on `RazorpaySubscription` type
- Updated to handle `order.paid` and `payment.successful` events
- Calls `applyOrderPaidEvent` and `claimBillingEvent` appropriately

### 5. app/dashboard/billing/page.tsx
- Removed import of `razorpayPlanId`
- Removed `unavailablePlanIds` calculation and prop (all plans with pricing in code are now available)
- Updated PlanPicker props accordingly

### 6. components/dashboard/plan-picker.tsx
- Removed `unavailablePlanIds` prop from interface
- Replaced `isUnavailable` calculation with `false` (all plans with pricing in code are available)

### 7. .env.example
- Commented out `RAZORPAY_PLAN_ID_SMALL_BUSINESS` and `RAZORPAY_PLAN_ID_ENTERPRISE`
- Added comments explaining they're no longer needed with order-based billing

## How It Works

1. **Starting a Subscription**: 
   - Calculates total amount = plan price + sum of active addon prices
   - Creates a Razorpay Order via `createBillingOrder`
   - Stores the order ID in the Subscription record
   - Returns the Razorpay hosted checkout URL (`short_url`)

2. **Webhook Processing**:
   - When `order.paid` or `payment.successful` webhook is received:
     - Finds the subscription by `razorpayOrderId`
     - Sets status to "ACTIVE"
     - Clears any pending plan changes
     - Records the billing event

3. **Plan Changes**:
   - **Upgrade**: Creates a new order for the new plan + add-ons, provides immediate payment link
   - **Downgrade**: Creates a new order but doesn't provide payment link (change takes effect at period end)
   - The old order remains in Razorpay until its period ends, then the new order becomes active

4. **Cancellation**:
   - Sets `cancelAtPeriodEnd: true` in the database
   - No Razorpay API call needed (orders are one-time)

## Environment Variables
Only these Razorpay variables are now needed:
- `RAZORPAY_KEY_ID` - API Key ID
- `RAZORPAY_KEY_SECRET` - API Key Secret  
- `RAZORPAY_WEBHOOK_SECRET` - Webhook signing secret

The plan ID variables (`RAZORPAY_PLAN_ID_SMALL_BUSINESS`, `RAZORPAY_PLAN_ID_ENTERPRISE`) are no longer used.

## Verification
- Builds successfully with `npm run build`
- All lint checks pass
- The system is ready for deployment to the GCP VM

## Next Steps for Deployment
1. Pull latest code to GCP VM
2. Run `docker build -t chatwise .`
3. Restart container: `docker restart chatwise`
4. Verify webhook is working by checking container logs
5. Test the billing flow in the application