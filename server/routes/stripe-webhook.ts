import { Router } from 'express';
import Stripe from 'stripe';
import { supabase } from '../services/supabase-service';

const router = Router();

// Initialize Stripe for signature verification
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Stripe webhook endpoint - processes payment events
// Route is mounted at /api/stripe/webhook, so this handles /api/stripe/webhook
router.post('/', async (req, res) => {
  let webhookEventId: string | null = null;

  try {
    const signature = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    // Get raw body for signature verification
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    // Verify webhook signature using Stripe's official method
    if (process.env.STRIPE_WEBHOOK_SECRET && signature) {
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET
        );
        console.log('✅ Webhook signature verified successfully');
      } catch (signatureError: any) {
        console.error('❌ Webhook signature verification failed:', signatureError.message);
        return res.status(400).json({ error: 'Invalid signature: ' + signatureError.message });
      }
    } else {
      // No secret configured - parse body directly (for development/testing)
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured - skipping signature verification');
      event = Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString('utf8'))
        : req.body;
    }

    console.log('💳 Stripe webhook received:', event.type);

    // Log webhook event to database for audit trail
    const { data: webhookLog, error: logError } = await supabase
      .from('stripe_webhook_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        event_data: event,
        processing_status: 'pending',
      })
      .select()
      .single();

    if (webhookLog) {
      webhookEventId = webhookLog.id;
    }

    if (logError) {
      console.error('⚠️ Failed to log webhook event (non-fatal):', logError);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        // Extract user ID from client_reference_id (passed during checkout)
        const userId = session.client_reference_id;

        if (!userId) {
          console.error('❌ No user_id in checkout session');
          return res.json({ received: true });
        }

        // Get metadata from the LINE ITEMS (this is where product metadata lives)
        let tier = 'intro'; // default
        let minutesLimit = 45; // default
        let planType = 'recurring';
        let userType = 'individual';

        try {
          // Fetch line items to get product metadata
          const lineItemsResponse = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${session.id}/line_items`,
            {
              headers: {
                'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
              }
            }
          );

          if (lineItemsResponse.ok) {
            const lineItemsData = await lineItemsResponse.json();
            const firstItem = lineItemsData.data[0];

            if (firstItem?.price?.product) {
              // Fetch the product to get its metadata
              const productResponse = await fetch(
                `https://api.stripe.com/v1/products/${firstItem.price.product}`,
                {
                  headers: {
                    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
                  }
                }
              );

              if (productResponse.ok) {
                const product = await productResponse.json();
                const metadata = product.metadata || {};

                console.log('📦 Product metadata:', metadata);

                // Read from metadata (added in Stripe Dashboard)
                tier = metadata.tier || 'intro';
                minutesLimit = parseInt(metadata.minutes_limit) || 45;
                planType = metadata.plan_type || 'recurring';
                userType = metadata.user_type || 'individual';
              }
            }
          }
        } catch (fetchError) {
          console.error('⚠️ Failed to fetch product metadata, using defaults:', fetchError);
        }

        // Get user profile to determine if therapist
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_type')
          .eq('id', userId)
          .single();

        if (profile?.user_type === 'therapist') {
          userType = 'therapist';
          // Therapist-specific limits
          if (tier === 'premium') {
            minutesLimit = 600; // 10 hours
          } else if (tier === 'basic') {
            minutesLimit = 180; // 3 hours
          }
        }

        // Detect one-time purchases vs subscriptions
        const isOneTimePurchase = session.mode === 'payment';
        if (isOneTimePurchase) {
          planType = 'one_time';
        }

        console.log('📊 Activating subscription:', {
          userId,
          tier,
          planType,
          userType,
          minutesLimit,
          customerId: session.customer,
          subscriptionId: session.subscription,
          sessionMode: session.mode,
          isOneTimePurchase
        });

        // Calculate client limit for therapists
        let clientLimit: number = 0;
        if (userType === 'therapist') {
          clientLimit = tier === 'premium' ? 10 : 3;
        }

        // Calculate period end based on plan type
        let currentPeriodEnd: Date;
        if (isOneTimePurchase) {
          // One-time purchase: valid for 30 days from now
          currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else {
          // Recurring subscription: 30 days from now (will be updated by subscription.updated webhook)
          currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        // For one-time purchases, store the session ID as a reference
        const stripeSubscriptionId = isOneTimePurchase
          ? `otp_${session.id}` // Prefix with otp_ for one-time purchase
          : (session.subscription as string || null);

        // Update or create subscription record
        // CRITICAL: Always reset usage_minutes_used to 0 on new subscription
        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            subscription_tier: tier,
            subscription_status: 'active',
            plan_type: planType,
            trial_ends_at: null, // Clear trial since they paid
            usage_minutes_limit: minutesLimit,
            usage_minutes_used: 0, // ✅ ALWAYS RESET TO 0 - FRESH START
            client_limit: clientLimit,
            clients_used: 0,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (error) {
          console.error('❌ Failed to activate subscription:', error);
          // Update webhook log as failed
          if (webhookEventId) {
            await supabase
              .from('stripe_webhook_events')
              .update({
                processing_status: 'failed',
                error_message: error.message || JSON.stringify(error),
                processed_at: new Date().toISOString(),
              })
              .eq('id', webhookEventId);
          }
          // Return 500 so Stripe retries the webhook
          return res.status(500).json({ error: 'Failed to activate subscription' });
        } else {
          const purchaseType = isOneTimePurchase ? 'one-time purchase' : 'subscription';
          console.log(`✅ Activated ${tier} ${purchaseType} for user ${userId} with ${minutesLimit} minutes (expires: ${currentPeriodEnd.toISOString()})`);
          // Update webhook log as success
          if (webhookEventId) {
            await supabase
              .from('stripe_webhook_events')
              .update({
                processing_status: 'success',
                user_id: userId,
                stripe_customer_id: session.customer as string,
                processed_at: new Date().toISOString(),
              })
              .eq('id', webhookEventId);
          }
        }

        // ============================================================================
        // NEW: PROMO CODE TRACKING - Extend discount if user has active promo
        // ============================================================================
        try {
          // Check if user has an active promo code
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('promo_code, promo_discount_expires_at')
            .eq('id', userId)
            .single();

          // If user has a promo code and it hasn't expired yet
          if (userProfile?.promo_code && userProfile?.promo_discount_expires_at) {
            const expiryDate = new Date(userProfile.promo_discount_expires_at);
            const now = new Date();

            // Only extend if promo is still active (hasn't expired yet)
            if (expiryDate > now) {
              // Extend promo to end of first billing cycle (30 days from purchase)
              const firstBillingEnd = new Date();
              firstBillingEnd.setDate(firstBillingEnd.getDate() + 30);

              await supabase
                .from('user_profiles')
                .update({
                  promo_discount_expires_at: firstBillingEnd.toISOString()
                })
                .eq('id', userId);

              console.log(`🎉 Extended promo "${userProfile.promo_code}" for user ${userId} until ${firstBillingEnd.toISOString()}`);
            } else {
              console.log(`ℹ️ User ${userId} had promo "${userProfile.promo_code}" but it already expired`);
            }
          }
        } catch (promoError) {
          console.error('⚠️ Failed to process promo extension:', promoError);
          // Don't fail the webhook - promo is secondary to subscription activation
        }
        // ============================================================================

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;

        // Map Stripe status to our status
        let status = 'active';
        if (subscription.status === 'canceled') status = 'canceled';
        else if (subscription.status === 'past_due') status = 'past_due';
        else if (subscription.status === 'unpaid') status = 'expired';

        console.log('🔄 Updating subscription:', {
          stripeId: subscription.id,
          status: subscription.status,
          mappedStatus: status
        });

        // On subscription renewal, reset usage for recurring plans
        const updateData: any = {
          subscription_status: status,
          current_period_end: new Date(subscription.current_period_end * 1000),
          updated_at: new Date().toISOString()
        };

        // If the subscription just renewed (status is active and period changed)
        // Reset usage minutes for the new billing period
        if (status === 'active') {
          // Get current subscription to check if period changed
          const { data: currentSub } = await supabase
            .from('subscriptions')
            .select('current_period_end, plan_type, user_id')
            .eq('stripe_subscription_id', subscription.id)
            .single();

          if (currentSub?.plan_type === 'recurring') {
            const oldPeriodEnd = new Date(currentSub.current_period_end || 0);
            const newPeriodEnd = new Date(subscription.current_period_end * 1000);

            // If period end changed, it's a renewal - reset usage
            if (newPeriodEnd > oldPeriodEnd) {
              updateData.usage_minutes_used = 0;
              console.log('🔄 Subscription renewed - resetting usage minutes');

              // ============================================================================
              // NEW: PROMO CODE TRACKING - Clear promo on renewal (second billing cycle)
              // ============================================================================
              try {
                if (currentSub.user_id) {
                  // Check if user has an active promo
                  const { data: userProfile } = await supabase
                    .from('user_profiles')
                    .select('promo_code, promo_discount_expires_at')
                    .eq('id', currentSub.user_id)
                    .single();

                  if (userProfile?.promo_discount_expires_at) {
                    // Clear the promo expiry since they're now on full price
                    await supabase
                      .from('user_profiles')
                      .update({
                        promo_discount_expires_at: null
                      })
                      .eq('id', currentSub.user_id);

                    console.log(`✅ Cleared promo discount for user ${currentSub.user_id} after renewal - now paying full price`);
                  }
                }
              } catch (promoError) {
                console.error('⚠️ Failed to clear promo on renewal:', promoError);
                // Don't fail the webhook - promo is secondary to subscription update
              }
              // ============================================================================
            }
          }
        }

        const { error } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id);

        if (!error) {
          console.log(`✅ Updated subscription status to: ${status}`);
          // Update webhook log as success
          if (webhookEventId) {
            await supabase
              .from('stripe_webhook_events')
              .update({
                processing_status: 'success',
                stripe_customer_id: subscription.customer as string,
                processed_at: new Date().toISOString(),
              })
              .eq('id', webhookEventId);
          }
        } else {
          console.error('❌ Failed to update subscription:', error);
          // Update webhook log as failed
          if (webhookEventId) {
            await supabase
              .from('stripe_webhook_events')
              .update({
                processing_status: 'failed',
                error_message: error.message || JSON.stringify(error),
                processed_at: new Date().toISOString(),
              })
              .eq('id', webhookEventId);
          }
          // Return 500 so Stripe retries the webhook
          return res.status(500).json({ error: 'Failed to update subscription' });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        console.log('❌ Subscription canceled:', subscription.id);

        const { error } = await supabase
          .from('subscriptions')
          .update({
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id);

        if (!error) {
          console.log(`✅ Marked subscription as canceled`);
          // Update webhook log as success
          if (webhookEventId) {
            await supabase
              .from('stripe_webhook_events')
              .update({
                processing_status: 'success',
                stripe_customer_id: subscription.customer as string,
                processed_at: new Date().toISOString(),
              })
              .eq('id', webhookEventId);
          }
        } else {
          console.error('❌ Failed to mark subscription as canceled:', error);
          // Update webhook log as failed
          if (webhookEventId) {
            await supabase
              .from('stripe_webhook_events')
              .update({
                processing_status: 'failed',
                error_message: error.message || JSON.stringify(error),
                processed_at: new Date().toISOString(),
              })
              .eq('id', webhookEventId);
          }
          // Return 500 so Stripe retries the webhook
          return res.status(500).json({ error: 'Failed to mark subscription as canceled' });
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled webhook event: ${event.type}`);
        // Mark unhandled events as success (we don't process them)
        if (webhookEventId) {
          await supabase
            .from('stripe_webhook_events')
            .update({
              processing_status: 'success',
              processed_at: new Date().toISOString(),
            })
            .eq('id', webhookEventId);
        }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);

    // Update webhook log as failed if we have the ID
    if (webhookEventId) {
      try {
        await supabase
          .from('stripe_webhook_events')
          .update({
            processing_status: 'failed',
            error_message: error.message || String(error),
            processed_at: new Date().toISOString(),
          })
          .eq('id', webhookEventId);
      } catch (logError) {
        console.error('⚠️ Failed to update webhook log (non-fatal):', logError);
      }
    }

    // Return 500 so Stripe retries the webhook
    res.status(500).json({ error: error.message });
  }
});

export default router;