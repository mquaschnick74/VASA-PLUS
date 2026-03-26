import { Router } from 'express';
import Stripe from 'stripe';
import { supabase } from '../services/supabase-service';
import { error as logError, info as logInfo, warn as logWarn } from '../utils/logger';

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(stripeSecretKey || '');

function isDuplicateKeyError(err: any): boolean {
  return err?.code === '23505' || String(err?.message || '').toLowerCase().includes('duplicate key');
}

function minimalEventData(event: Stripe.Event) {
  const obj: any = event.data?.object || {};
  return {
    stripe_event_id: event.id,
    event_type: event.type,
    created: event.created,
    livemode: event.livemode,
    customer: obj.customer ?? null,
    subscription: obj.subscription ?? null,
    checkout_session_id: obj.id ?? null,
  };
}

async function markWebhookLog(
  webhookEventId: string | null,
  status: 'success' | 'failed' | 'pending',
  updates?: Record<string, any>
) {
  if (!webhookEventId) return;
  const payload = {
    processing_status: status,
    processed_at: new Date().toISOString(),
    ...(updates || {}),
  };
  await supabase.from('stripe_webhook_events').update(payload).eq('id', webhookEventId);
}

async function extractPlanMetadata(session: Stripe.Checkout.Session) {
  let tier = 'intro';
  let minutesLimit = 45;
  let planType = session.mode === 'payment' ? 'one_time' : 'recurring';
  let userType = 'individual';

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const firstItem = lineItems.data[0];

    const productId = typeof firstItem?.price?.product === 'string'
      ? firstItem.price.product
      : firstItem?.price?.product?.id;

    if (productId) {
      const product = await stripe.products.retrieve(productId);
      const metadata = product.metadata || {};
      tier = metadata.tier || tier;
      minutesLimit = Number.parseInt(metadata.minutes_limit || '', 10) || minutesLimit;
      planType = metadata.plan_type || planType;
      userType = metadata.user_type || userType;
    }
  } catch (e: any) {
    logWarn('stripe_metadata_lookup_failed', { message: e?.message });
  }

  return { tier, minutesLimit, planType, userType };
}

router.post('/', async (req, res) => {
  let webhookEventId: string | null = null;

  const requestId = req.headers['x-request-id'];
  const isProduction = process.env.NODE_ENV === 'production';
  const signature = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!Buffer.isBuffer(req.body)) {
    logError('stripe_webhook_misconfigured_non_buffer_body', { requestId, path: req.path });
    return res.status(500).json({ error: 'Webhook configuration error' });
  }

  if (isProduction && (!webhookSecret || !signature)) {
    logError('stripe_webhook_misconfigured_signature', {
      requestId,
      hasSecret: !!webhookSecret,
      hasSignature: !!signature,
    });
    return res.status(500).json({ error: 'Webhook configuration error' });
  }

  if (!stripeSecretKey) {
    logError('stripe_secret_key_missing', { requestId });
    return res.status(500).json({ error: 'Webhook configuration error' });
  }

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } else {
      if (isProduction) {
        return res.status(500).json({ error: 'Webhook configuration error' });
      }
      event = JSON.parse(req.body.toString('utf8')) as Stripe.Event;
    }
  } catch (e: any) {
    logWarn('stripe_webhook_signature_invalid', { requestId, message: e?.message });
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    const minimal = minimalEventData(event);

    const { data: webhookLog, error: insertError } = await supabase
      .from('stripe_webhook_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        event_data: minimal,
        processing_status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      if (isDuplicateKeyError(insertError)) {
        logInfo('stripe_webhook_duplicate_event', { requestId, eventId: event.id, eventType: event.type });
        return res.json({ received: true });
      }
      logError('stripe_webhook_log_insert_failed', { requestId, message: insertError.message });
      return res.status(500).json({ error: 'Webhook processing error' });
    }

    webhookEventId = webhookLog?.id || null;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;

        if (!userId) {
          await markWebhookLog(webhookEventId, 'failed', { error_message: 'Missing user_id in checkout session' });
          return res.json({ received: true });
        }

        const metadata = await extractPlanMetadata(session);
        let { tier, minutesLimit, planType, userType } = metadata;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_type')
          .eq('id', userId)
          .single();

        if (profile?.user_type === 'therapist') {
          userType = 'therapist';
          if (tier === 'premium') minutesLimit = 600;
          else if (tier === 'basic') minutesLimit = 180;
        }

        const isOneTimePurchase = session.mode === 'payment';
        if (isOneTimePurchase) planType = 'one_time';

        const clientLimit = userType === 'therapist' ? (tier === 'premium' ? 10 : 3) : 0;
        const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const stripeSubscriptionId = isOneTimePurchase
          ? `otp_${session.id}`
          : (typeof session.subscription === 'string' ? session.subscription : null);

        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            subscription_tier: tier,
            subscription_status: 'active',
            plan_type: planType,
            trial_ends_at: null,
            usage_minutes_limit: minutesLimit,
            usage_minutes_used: 0,
            client_limit: clientLimit,
            clients_used: 0,
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (error) {
          await markWebhookLog(webhookEventId, 'failed', { error_message: error.message });
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        try {
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('promo_code, promo_discount_expires_at')
            .eq('id', userId)
            .single();

          if (userProfile?.promo_code && userProfile?.promo_discount_expires_at) {
            const expiryDate = new Date(userProfile.promo_discount_expires_at);
            if (expiryDate > new Date()) {
              const firstBillingEnd = new Date();
              firstBillingEnd.setDate(firstBillingEnd.getDate() + 30);
              await supabase
                .from('user_profiles')
                .update({ promo_discount_expires_at: firstBillingEnd.toISOString() })
                .eq('id', userId);
            }
          }
        } catch (e: any) {
          logWarn('promo_extension_failed', { requestId, message: e?.message });
        }

        await markWebhookLog(webhookEventId, 'success', {
          user_id: userId,
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription & { current_period_end: number };
        const previousAttributes = (event.data as any).previous_attributes || {};

        let status = 'active';
        if (subscription.status === 'canceled') status = 'canceled';
        else if (subscription.status === 'past_due') status = 'past_due';
        else if (subscription.status === 'unpaid') status = 'expired';

        // If subscription lapses and pattern gate was previously fired, revert to pattern_gated
        if (status === 'canceled' || status === 'expired') {
          const { data: gateCheck } = await supabase
            .from('subscriptions')
            .select('pattern_gate_fired')
            .eq('stripe_subscription_id', subscription.id)
            .single();
          if (gateCheck?.pattern_gate_fired) {
            status = 'pattern_gated';
          }
        }

        const updateData: any = {
          subscription_status: status,
          current_period_end: new Date(subscription.current_period_end * 1000),
          updated_at: new Date().toISOString(),
        };

        // Detect plan change: Stripe includes 'items' in previous_attributes when the plan changed
        const planChanged = !!previousAttributes.items;

        if (planChanged && status === 'active') {
          try {
            const firstItem = subscription.items?.data?.[0];
            const productId = typeof firstItem?.price?.product === 'string'
              ? firstItem.price.product
              : (firstItem?.price?.product as any)?.id;

            if (productId) {
              const product = await stripe.products.retrieve(productId);
              const metadata = product.metadata || {};

              const newTier = metadata.tier;
              const newMinutesLimit = Number.parseInt(metadata.minutes_limit || '', 10);

              if (newTier) updateData.subscription_tier = newTier;
              if (!isNaN(newMinutesLimit) && newMinutesLimit > 0) updateData.usage_minutes_limit = newMinutesLimit;

              logInfo('stripe_plan_change_detected', {
                subscriptionId: subscription.id,
                newTier,
                newMinutesLimit,
              });
            }
          } catch (e: any) {
            logWarn('stripe_plan_change_metadata_lookup_failed', { message: e?.message });
          }
        }

        if (status === 'active' && !planChanged) {
          const { data: currentSub } = await supabase
            .from('subscriptions')
            .select('current_period_end, plan_type, user_id')
            .eq('stripe_subscription_id', subscription.id)
            .single();

          if (currentSub?.plan_type === 'recurring') {
            const oldPeriodEnd = new Date(currentSub.current_period_end || 0);
            const newPeriodEnd = new Date(subscription.current_period_end * 1000);
            if (newPeriodEnd > oldPeriodEnd) {
              updateData.usage_minutes_used = 0;

              if (currentSub.user_id) {
                await supabase
                  .from('user_profiles')
                  .update({ promo_discount_expires_at: null })
                  .eq('id', currentSub.user_id);
              }
            }
          }
        }

        const { error } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          await markWebhookLog(webhookEventId, 'failed', { error_message: error.message });
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        await markWebhookLog(webhookEventId, 'success', {
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // If user previously hit pattern gate, revert to pattern_gated (not canceled)
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('pattern_gate_fired')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        const canceledStatus = existingSub?.pattern_gate_fired ? 'pattern_gated' : 'canceled';

        const { error } = await supabase
          .from('subscriptions')
          .update({
            subscription_status: canceledStatus,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          await markWebhookLog(webhookEventId, 'failed', { error_message: error.message });
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        await markWebhookLog(webhookEventId, 'success', {
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
        });
        break;
      }

      default:
        await markWebhookLog(webhookEventId, 'success');
        break;
    }

    return res.json({ received: true });
  } catch (e: any) {
    await markWebhookLog(webhookEventId, 'failed', { error_message: e?.message || 'Unknown error' });
    logError('stripe_webhook_processing_error', { requestId, eventId: webhookEventId, message: e?.message });
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
