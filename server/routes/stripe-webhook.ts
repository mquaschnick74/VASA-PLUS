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

        // Get metadata from session
        const metadata = session.metadata || {};
        const tier = metadata.tier || 'basic';
        const planType = metadata.plan_type || 'recurring';
        const userType = metadata.user_type || 'individual';

        console.log('📊 Activating subscription:', {
          userId,
          tier,
          planType,
          userType,
          customerId: session.customer,
          subscriptionId: session.subscription
        });

        // Calculate limits based on plan tier
        let minutesLimit: number;
        let clientLimit: number = 0;

        if (userType === 'therapist') {
          minutesLimit = tier === 'premium' ? 600 : 180; // 10 hours or 3 hours
          clientLimit = tier === 'premium' ? 10 : 3;
        } else {
          // Individual plans
          minutesLimit = tier === 'plus' ? 220 : 180;
        }

        // Update or create subscription record
        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            subscription_tier: tier,
            subscription_status: 'active',
            plan_type: planType,
            trial_ends_at: null, // Clear trial since they paid
            usage_minutes_limit: minutesLimit,
            usage_minutes_used: 0, // Reset usage for new subscription
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
          console.log(`✅ Activated ${tier} ${planType} subscription for user ${userId}`);
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

        const { error } = await supabase
          .from('subscriptions')
          .update({
            subscription_status: status,
            current_period_end: new Date(subscription.current_period_end * 1000),
            updated_at: new Date().toISOString()
          })
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