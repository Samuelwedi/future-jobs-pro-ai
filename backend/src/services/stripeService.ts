// ============================================
// STRIPE PAYMENT SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import Stripe from 'stripe';
import { pool } from '../config/database';

// Use `any` to avoid TypeScript namespace issues
let stripe: any = null;
const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
if (stripeKey && stripeKey !== 'sk_test_your_key_here') {
  stripe = new Stripe(stripeKey);
  console.log('💳 Stripe initialized – payments are live.');
} else {
  console.log('⚠️  Stripe API key not set – payment features are disabled.');
}

// ============================================
// Create a Stripe customer
// ============================================
export async function createStripeCustomer(
  email: string,
  name: string,
  companyId: string
): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured');

  console.log(`👤 [Samuel B.] Creating Stripe customer for: ${email}`);

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { companyId },
  });

  await pool.query(
    `UPDATE companies SET stripe_customer_id = $1 WHERE id = $2`,
    [customer.id, companyId]
  );

  console.log(`✅ Stripe customer created: ${customer.id}`);
  return customer.id;
}

// ============================================
// Create a subscription checkout session (14‑day trial)
// ============================================
export async function createCheckoutSession(
  companyId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured');

  console.log(`🛒 [Samuel B.] Creating checkout for company: ${companyId}`);

  const companyResult = await pool.query(
    `SELECT stripe_customer_id FROM companies WHERE id = $1`,
    [companyId]
  );
  let customerId = companyResult.rows[0]?.stripe_customer_id;

  if (!customerId) {
    const userResult = await pool.query(
      `SELECT email, first_name || ' ' || last_name as name
       FROM users WHERE company_id = $1 AND role = 'boss' LIMIT 1`,
      [companyId]
    );
    const user = userResult.rows[0];
    customerId = await createStripeCustomer(user.email, user.name, companyId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { companyId },
    subscription_data: {
      trial_period_days: 14,
    },
    payment_method_collection: 'always',
  });

  console.log(`✅ Checkout session created: ${session.id}`);
  return session.url || '';
}

// ============================================
// Cancel a subscription
// ============================================
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  if (!stripe) throw new Error('Stripe is not configured');
  await stripe.subscriptions.cancel(subscriptionId);
  await pool.query(
    `UPDATE companies SET subscription_tier = 'cancelled', subscription_expires_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
}

// ============================================
// Get subscription status (works without Stripe)
// ============================================
export async function getSubscriptionStatus(companyId: string): Promise<{
  tier: string;
  status: string;
  expiresAt: Date | null;
}> {
  const result = await pool.query(
    `SELECT subscription_tier, subscription_status, subscription_expires_at
     FROM companies WHERE id = $1`,
    [companyId]
  );
  const company = result.rows[0];
  return {
    tier: company?.subscription_tier || 'trial',
    status: company?.subscription_status || 'active',
    expiresAt: company?.subscription_expires_at,
  };
}

// ============================================
// Pricing plans (always available)
// ============================================
export async function getPricingPlans(): Promise<any[]> {
  return [
    {
      id: 'price_basic_monthly',
      name: 'Basic',
      price: 49,
      interval: 'month',
      features: ['Up to 5 employees', 'Time tracking', 'GPS location', 'Basic reports'],
    },
    {
      id: 'price_pro_monthly',
      name: 'Professional',
      price: 99,
      interval: 'month',
      features: ['Up to 20 employees', 'AI photo compliance', 'Voice notes', 'Advanced reports'],
    },
    {
      id: 'price_enterprise_monthly',
      name: 'Enterprise',
      price: 199,
      interval: 'month',
      features: ['Unlimited employees', 'Dispute evidence reports', 'Priority support', 'Custom integrations'],
    },
  ];
}

// ============================================
// Webhook handler
// ============================================
export async function handleStripeWebhook(
  payload: any,
  signature: string
): Promise<{ received: boolean; type: string }> {
  if (!stripe) throw new Error('Stripe is not configured');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err);
    throw new Error('Invalid webhook signature');
  }

  console.log(`📨 [Samuel B.] Received Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const companyId = session.metadata?.companyId;
      if (companyId && session.mode === 'subscription') {
        await pool.query(
          `UPDATE companies SET subscription_tier = $1, subscription_status = 'active',
           stripe_customer_id = $2, stripe_subscription_id = $3 WHERE id = $4`,
          [session.metadata?.plan || 'pro', session.customer, session.subscription, companyId]
        );
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await pool.query(
        `UPDATE companies SET subscription_status = 'canceled', subscription_tier = 'trial'
         WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );
      break;
    }
  }

  return { received: true, type: event.type };
}

console.log('💳 Stripe Service loaded – Future Jobs Pro AI by Samuel B.');
