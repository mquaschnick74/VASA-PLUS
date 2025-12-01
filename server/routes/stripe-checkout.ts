import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service'; // USE EXISTING SERVICE

const router = Router();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session for plan upgrades
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, userId, userEmail, tier, planType, userType } = req.body;

    if (!priceId || !userId || !userEmail) {
      return res.status(400).json({
        error: 'Missing required fields: priceId, userId, userEmail'
      });
    }

    console.log('🛒 Creating checkout session:', {
      priceId,
      userId,
      userEmail,
      tier,
      planType,
      userType
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL || 'https://beta.ivasa.ai'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'https://beta.ivasa.ai'}/pricing`,
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: {
        userId,
        tier,
        planType,
        userType: userType || 'individual'
      },
      allow_promotion_codes: true,
    });

    console.log('✅ Checkout session created:', session.id);

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });
  } catch (error: any) {
    console.error('❌ Error creating checkout session:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Create customer portal session for subscription management
router.post('/create-portal-session', requireAuth, async (req: AuthRequest, res) => {
  try {
    // Step 1: Get Supabase auth user ID
    const auth_user_id = req.user?.id;
    const auth_email = req.user?.email;

    if (!auth_user_id || !auth_email) {
      console.error('❌ No auth user ID or email in request');
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    console.log('🔧 Creating customer portal session for auth user:', auth_user_id);

    // Step 2: Look up the INTERNAL user profile ID
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', auth_email)
      .single();

    if (profileError || !userProfile) {
      console.error('❌ User profile not found for email:', auth_email, profileError);
      return res.status(404).json({ 
        error: 'User profile not found' 
      });
    }

    const internal_user_id = userProfile.id;
    console.log('✅ Found internal user ID:', internal_user_id);

    // Step 3: Get the user's Stripe customer ID using the INTERNAL ID
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', internal_user_id)  // ← NOW USING CORRECT ID
      .single();

    if (subError) {
      console.error('❌ Supabase error:', subError);
      return res.status(500).json({ 
        error: 'Database error while fetching subscription' 
      });
    }

    if (!subscription?.stripe_customer_id) {
      console.error('❌ No Stripe customer found for user:', internal_user_id);
      return res.status(404).json({ 
        error: 'No active subscription found. Please upgrade first.' 
      });
    }

    console.log('✅ Found Stripe customer:', subscription.stripe_customer_id);

    // Step 4: Create a Stripe customer portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.CLIENT_URL || 'https://beta.ivasa.ai'}/dashboard`,
    });

    console.log('✅ Customer portal session created');

    res.json({ 
      url: portalSession.url 
    });
  } catch (error: any) {
    console.error('❌ Error creating portal session:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Sync subscription from Stripe - fallback for when webhooks fail
router.post('/sync-subscription', requireAuth, async (req: AuthRequest, res) => {
  try {
    // Step 1: Get Supabase auth user ID
    const auth_user_id = req.user?.id;
    const auth_email = req.user?.email;

    if (!auth_user_id || !auth_email) {
      console.error('❌ No auth user ID or email in request');
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    console.log('🔄 Syncing subscription from Stripe for auth user:', auth_user_id);

    // Step 2: Look up the INTERNAL user profile ID
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, user_type')
      .eq('email', auth_email)
      .single();

    if (profileError || !userProfile) {
      console.error('❌ User profile not found for email:', auth_email, profileError);
      return res.status(404).json({
        error: 'User profile not found'
      });
    }

    const internal_user_id = userProfile.id;
    const userType = userProfile.user_type || 'individual';
    console.log('✅ Found internal user ID:', internal_user_id);

    // Step 3: Get current subscription to find stripe_customer_id
    const { data: currentSub, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', internal_user_id)
      .single();

    let stripeCustomerId = currentSub?.stripe_customer_id;

    // Step 3b: If no customer ID in database, look up by email in Stripe
    if (!stripeCustomerId) {
      console.log('🔍 No Stripe customer ID in database, searching Stripe by email:', auth_email);

      try {
        // First try regular customers
        const customers = await stripe.customers.list({
          email: auth_email,
          limit: 1
        });

        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
          console.log('✅ Found Stripe customer by email:', stripeCustomerId);
        } else {
          // No regular customer found - search checkout sessions for guest customers (gcus_)
          console.log('🔍 No regular customer found, searching checkout sessions...');

          const checkoutSessions = await stripe.checkout.sessions.list({
            customer_details: { email: auth_email },
            limit: 10,
            expand: ['data.customer']
          });

          // Find a completed session with a customer
          const completedSession = checkoutSessions.data.find(
            session => session.status === 'complete' && session.customer
          );

          if (completedSession?.customer) {
            // Handle both string ID and expanded Customer object
            stripeCustomerId = typeof completedSession.customer === 'string'
              ? completedSession.customer
              : completedSession.customer.id;
            console.log('✅ Found customer from checkout session:', stripeCustomerId);
          }
        }

        if (stripeCustomerId) {
          // Update the subscription record with the found customer ID
          if (currentSub) {
            await supabase
              .from('subscriptions')
              .update({
                stripe_customer_id: stripeCustomerId,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', internal_user_id);
          }
        } else {
          console.error('❌ No Stripe customer found for email:', auth_email);
          return res.status(404).json({
            error: 'No Stripe customer found for this email. Please contact support if you believe you have been charged.'
          });
        }
      } catch (stripeError: any) {
        console.error('❌ Error searching Stripe customers:', stripeError);
        return res.status(500).json({
          error: 'Failed to search Stripe for customer: ' + stripeError.message
        });
      }
    }

    console.log('✅ Using Stripe customer:', stripeCustomerId);

    // Step 4: Fetch subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });

    if (!subscriptions.data.length) {
      console.error('❌ No subscriptions found in Stripe for customer:', stripeCustomerId);
      return res.status(404).json({
        error: 'No subscriptions found in Stripe for this customer'
      });
    }

    // Find the active or most recent subscription
    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active')
      || subscriptions.data[0];

    console.log('📊 Found Stripe subscription:', {
      id: activeSubscription.id,
      status: activeSubscription.status,
      current_period_end: activeSubscription.current_period_end,
    });

    // Step 5: Get product metadata from the subscription
    let tier = 'intro';
    let minutesLimit = 45;
    let planType = 'recurring';

    try {
      const priceId = activeSubscription.items.data[0]?.price?.id;
      if (priceId) {
        const price = await stripe.prices.retrieve(priceId);
        if (price.product) {
          const product = await stripe.products.retrieve(price.product as string);
          const metadata = product.metadata || {};

          console.log('📦 Product metadata:', metadata);

          tier = metadata.tier || 'intro';
          minutesLimit = parseInt(metadata.minutes_limit) || 45;
          planType = metadata.plan_type || 'recurring';
        }
      }
    } catch (fetchError) {
      console.error('⚠️ Failed to fetch product metadata, using defaults:', fetchError);
    }

    // Apply therapist-specific limits if needed
    if (userType === 'therapist') {
      if (tier === 'premium') {
        minutesLimit = 600; // 10 hours
      } else if (tier === 'basic') {
        minutesLimit = 180; // 3 hours
      }
    }

    // Calculate client limit for therapists
    let clientLimit: number = 0;
    if (userType === 'therapist') {
      clientLimit = tier === 'premium' ? 10 : 3;
    }

    // Map Stripe status to our status
    let status = 'active';
    if (activeSubscription.status === 'canceled') status = 'canceled';
    else if (activeSubscription.status === 'past_due') status = 'past_due';
    else if (activeSubscription.status === 'unpaid') status = 'expired';

    console.log('💾 Updating subscription in database:', {
      tier,
      status,
      minutesLimit,
      planType,
    });

    // Step 6: Update subscription in database (include stripe_customer_id in case we found it by email)
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: activeSubscription.id,
        subscription_tier: tier,
        subscription_status: status,
        plan_type: planType,
        trial_ends_at: null,
        usage_minutes_limit: minutesLimit,
        usage_minutes_used: 0, // Reset usage on sync
        client_limit: clientLimit,
        current_period_end: new Date(activeSubscription.current_period_end * 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', internal_user_id);

    if (updateError) {
      console.error('❌ Failed to update subscription:', updateError);
      return res.status(500).json({
        error: 'Failed to update subscription in database'
      });
    }

    console.log('✅ Subscription synced successfully');

    res.json({
      success: true,
      message: 'Subscription synced successfully',
      subscription: {
        tier,
        status,
        stripe_subscription_id: activeSubscription.id,
        stripe_customer_id: stripeCustomerId,
        current_period_end: new Date(activeSubscription.current_period_end * 1000),
      }
    });
  } catch (error: any) {
    console.error('❌ Error syncing subscription:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

export default router;