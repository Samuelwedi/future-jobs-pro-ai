import Stripe from 'stripe';
import { pool } from '../config/database';

type PlanKey = 'basic' | 'professional' | 'enterprise';

const PLAN_DEFINITIONS: Record<PlanKey, {
  name: string;
  envName: string;
  features: string[];
}> = {
  basic: {
    name: 'Basic',
    envName: 'STRIPE_PRICE_BASIC_MONTHLY',
    features: ['Up to 5 employees', 'Time tracking', 'GPS location', 'Basic reports'],
  },
  professional: {
    name: 'Professional',
    envName: 'STRIPE_PRICE_PRO_MONTHLY',
    features: ['Up to 20 employees', 'AI photo compliance', 'Voice notes', 'Advanced reports'],
  },
  enterprise: {
    name: 'Enterprise',
    envName: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    features: ['Unlimited employees', 'Evidence packages', 'Priority support', 'Custom integrations'],
  },
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function stripeClient(): any {
  return new Stripe(required('STRIPE_SECRET_KEY'));
}

function frontendUrl(): string {
  return required('FRONTEND_URL').replace(/\/$/, '');
}

function trialDays(): number {
  const parsed = Number.parseInt(process.env.STRIPE_TRIAL_DAYS || '14', 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 90)) : 14;
}

function configuredPriceId(plan: PlanKey): string {
  return required(PLAN_DEFINITIONS[plan].envName);
}

function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && value in PLAN_DEFINITIONS;
}

async function billingActor(userId: string, companyId?: string) {
  if (!companyId) throw new Error('Your user is not assigned to a company');
  const result = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
            c.id AS company_id, c.name AS company_name,
            c.stripe_customer_id, c.stripe_subscription_id,
            c.stripe_trial_used_at
       FROM users u
       JOIN companies c ON c.id = u.company_id
      WHERE u.id = $1 AND c.id = $2
      LIMIT 1`,
    [userId, companyId],
  );
  if (!result.rowCount) throw new Error('Company billing account was not found');
  const actor = result.rows[0];
  if (!['boss', 'owner', 'admin'].includes(String(actor.role || '').toLowerCase())) {
    throw new Error('Only a company owner or administrator can change billing');
  }
  return actor;
}

async function ensureCustomer(actor: any): Promise<string> {
  if (actor.stripe_customer_id) return String(actor.stripe_customer_id);
  const stripe = stripeClient();
  const customer = await stripe.customers.create({
    email: actor.email || undefined,
    name: actor.company_name || `${actor.first_name || ''} ${actor.last_name || ''}`.trim(),
    metadata: { companyId: String(actor.company_id) },
  });
  await pool.query(
    `UPDATE companies SET stripe_customer_id = $1, subscription_updated_at = NOW() WHERE id = $2`,
    [customer.id, actor.company_id],
  );
  return String(customer.id);
}

export async function getPricingPlans() {
  const stripe = stripeClient();
  return Promise.all((Object.keys(PLAN_DEFINITIONS) as PlanKey[]).map(async (key) => {
    const definition = PLAN_DEFINITIONS[key];
    const price: any = await stripe.prices.retrieve(configuredPriceId(key));
    if (!price.active || price.type !== 'recurring') {
      throw new Error(`${definition.envName} must reference an active recurring Stripe Price`);
    }
    return {
      key,
      name: definition.name,
      amount: Number(price.unit_amount || 0),
      currency: String(price.currency || 'usd'),
      interval: String(price.recurring?.interval || 'month'),
      features: definition.features,
      trialDays: trialDays(),
    };
  }));
}

export async function createCheckoutSession(
  userId: string,
  companyId: string | undefined,
  requestedPlan: unknown,
): Promise<string> {
  if (!isPlanKey(requestedPlan)) throw new Error('Choose a valid subscription plan');
  const actor = await billingActor(userId, companyId);
  const stripe = stripeClient();
  const customerId = await ensureCustomer(actor);

  if (actor.stripe_subscription_id) {
    const existing: any = await stripe.subscriptions.retrieve(actor.stripe_subscription_id);
    if (['active', 'trialing', 'past_due', 'unpaid'].includes(existing.status)) {
      throw new Error('This company already has a subscription. Use Manage billing to change it.');
    }
  }

  const days = actor.stripe_trial_used_at ? 0 : trialDays();
  const session: any = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: String(actor.company_id),
    line_items: [{ price: configuredPriceId(requestedPlan), quantity: 1 }],
    success_url: `${frontendUrl()}/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/pricing?checkout=cancelled`,
    billing_address_collection: 'required',
    allow_promotion_codes: true,
    metadata: { companyId: String(actor.company_id), planKey: requestedPlan },
    subscription_data: {
      metadata: { companyId: String(actor.company_id), planKey: requestedPlan },
      ...(days > 0 ? { trial_period_days: days } : {}),
    },
  });
  if (!session.url) throw new Error('Stripe did not return a Checkout URL');
  return session.url;
}

export async function createBillingPortalSession(
  userId: string,
  companyId?: string,
): Promise<string> {
  const actor = await billingActor(userId, companyId);
  const customerId = await ensureCustomer(actor);
  const session: any = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${frontendUrl()}/subscription`,
  });
  return String(session.url);
}

export async function setSubscriptionCancellation(
  userId: string,
  companyId: string | undefined,
  cancelAtPeriodEnd: boolean,
) {
  const actor = await billingActor(userId, companyId);
  if (!actor.stripe_subscription_id) throw new Error('No Stripe subscription was found');
  const subscription: any = await stripeClient().subscriptions.update(
    actor.stripe_subscription_id,
    { cancel_at_period_end: cancelAtPeriodEnd },
  );
  await applySubscription(subscription, String(actor.company_id));
  return subscription;
}

export async function getSubscriptionStatus(companyId?: string) {
  if (!companyId) throw new Error('Your user is not assigned to a company');
  const result = await pool.query(
    `SELECT subscription_tier, subscription_status, subscription_expires_at,
            subscription_provider, subscription_current_period_end,
            subscription_cancel_at_period_end, stripe_subscription_id
       FROM companies WHERE id = $1`,
    [companyId],
  );
  if (!result.rowCount) throw new Error('Company was not found');
  const company = result.rows[0];
  return {
    plan: company.subscription_tier || 'trial',
    status: company.subscription_status || 'inactive',
    provider: company.subscription_provider || null,
    currentPeriodEnd: company.subscription_current_period_end || company.subscription_expires_at || null,
    cancelAtPeriodEnd: Boolean(company.subscription_cancel_at_period_end),
    hasStripeSubscription: Boolean(company.stripe_subscription_id),
  };
}

function unixDate(value: unknown): Date | null {
  const seconds = Number(value || 0);
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function planFromSubscription(subscription: any): PlanKey | null {
  if (isPlanKey(subscription?.metadata?.planKey)) return subscription.metadata.planKey;
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  return (Object.keys(PLAN_DEFINITIONS) as PlanKey[]).find(
    (key) => process.env[PLAN_DEFINITIONS[key].envName]?.trim() === priceId,
  ) || null;
}

async function companyIdForSubscription(subscription: any, db: any = pool): Promise<string | null> {
  if (subscription?.metadata?.companyId) return String(subscription.metadata.companyId);
  const customerId = typeof subscription?.customer === 'string'
    ? subscription.customer
    : subscription?.customer?.id;
  if (!customerId) return null;
  const result = await db.query(
    `SELECT id FROM companies WHERE stripe_customer_id = $1 LIMIT 1`,
    [customerId],
  );
  return result.rows[0]?.id || null;
}

async function applySubscription(subscription: any, knownCompanyId?: string, db: any = pool) {
  const companyId = knownCompanyId || await companyIdForSubscription(subscription, db);
  if (!companyId) throw new Error(`Could not match Stripe subscription ${subscription.id} to a company`);
  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  const plan = planFromSubscription(subscription);
  const periodEnd = unixDate(
    subscription.current_period_end || subscription?.items?.data?.[0]?.current_period_end,
  );
  await db.query(
    `UPDATE companies SET
       stripe_customer_id = COALESCE($1, stripe_customer_id),
       stripe_subscription_id = $2,
       stripe_price_id = $3,
       subscription_tier = COALESCE($4, subscription_tier),
       subscription_status = $5,
       subscription_provider = 'stripe',
       subscription_current_period_end = $6,
       subscription_expires_at = $6,
       subscription_cancel_at_period_end = $7,
       subscription_updated_at = NOW(),
       stripe_trial_used_at = CASE WHEN $5 = 'trialing'
         THEN COALESCE(stripe_trial_used_at, NOW()) ELSE stripe_trial_used_at END
     WHERE id = $8`,
    [
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
      subscription.id,
      priceId,
      plan,
      subscription.status,
      periodEnd,
      Boolean(subscription.cancel_at_period_end),
      companyId,
    ],
  );
}

async function processPlatformEvent(event: any, db: any) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subscription: any = await stripeClient().subscriptions.retrieve(
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
      );
      await applySubscription(subscription, session.metadata?.companyId || session.client_reference_id, db);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(event.data.object, undefined, db);
      return;
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
      if (!subscriptionId) return;
      const subscription: any = await stripeClient().subscriptions.retrieve(subscriptionId);
      await applySubscription(subscription, undefined, db);
      return;
    }
    default:
      return;
  }
}

export async function handleStripeWebhook(payload: Buffer, signature: string) {
  const stripe = stripeClient();
  const event: any = stripe.webhooks.constructEvent(
    payload,
    signature,
    required('STRIPE_WEBHOOK_SECRET'),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [event.id]);
    const existing = await client.query(
      `SELECT event_id FROM stripe_webhook_events WHERE event_id = $1`,
      [event.id],
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      return { received: true, duplicate: true, type: event.type };
    }
    await processPlatformEvent(event, client);
    const inserted = await client.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, livemode)
       VALUES ($1, $2, $3)
       RETURNING event_id`,
      [event.id, event.type, Boolean(event.livemode)],
    );
    if (!inserted.rowCount) throw new Error('Could not record Stripe webhook event');
    await client.query('COMMIT');
    return { received: true, duplicate: false, type: event.type };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

console.log(`Stripe platform billing loaded (${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test'} mode).`);
