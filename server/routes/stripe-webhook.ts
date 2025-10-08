import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/supabase-service';

const router = Router();

// Stripe webhook endpoint - processes payment events
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    // Verify webhook signature if secret is configured
    if (process.env.STRIPE_WEBHOOK_SECRET && signature) {
      const payload = Buffer.isBuffer(req.body) 
        ? req.body.toString('utf8') 
        : JSON.stringify(req.body);

      const expectedSignature = crypto
        .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      // Stripe sends signature as: t=timestamp,v1=signature
      const signatureParts = signature.split(',');
      const receivedSignature = signatureParts.find(part => part.startsWith('v1='))?.split('=')[1];

      if (receivedSignature !== expectedSignature) {
        console.warn('⚠️ Stripe webhook signature verification failed');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = Buffer.isBuffer(req.body) 
      ? JSON.parse(req.body.toString('utf8')) 
      : req.body;

    console.log('💳 Stripe webhook received:', event.type);

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

        console.log('📊 Activating subscription:', {
          userId,
          tier,
          planType,
          userType,
          minutesLimit,
          customerId: session.customer,
          subscriptionId: session.subscription
        });

        // Calculate client limit for therapists
        let clientLimit: number = 0;
        if (userType === 'therapist') {
          clientLimit = tier === 'premium' ? 10 : 3;
        }

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
            stripe_subscription_id: session.subscription as string || null,
            current_period_end: planType === 'recurring' 
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
              : null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (error) {
          console.error('❌ Failed to activate subscription:', error);
        } else {
          console.log(`✅ Activated ${tier} ${planType} subscription for user ${userId} with ${minutesLimit} minutes`);
        }
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
            .select('current_period_end, plan_type')
            .eq('stripe_subscription_id', subscription.id)
            .single();

          if (currentSub?.plan_type === 'recurring') {
            const oldPeriodEnd = new Date(currentSub.current_period_end || 0);
            const newPeriodEnd = new Date(subscription.current_period_end * 1000);

            // If period end changed, it's a renewal - reset usage
            if (newPeriodEnd > oldPeriodEnd) {
              updateData.usage_minutes_used = 0;
              console.log('🔄 Subscription renewed - resetting usage minutes');
            }
          }
        }

        const { error } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id);

        if (!error) {
          console.log(`✅ Updated subscription status to: ${status}`);
        } else {
          console.error('❌ Failed to update subscription:', error);
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
        } else {
          console.error('❌ Failed to mark subscription as canceled:', error);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled webhook event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;