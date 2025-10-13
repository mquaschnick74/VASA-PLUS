import { Router } from 'express';
import Stripe from 'stripe';

const router = Router();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session for therapist upgrades
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, userId, userEmail, tier, planType } = req.body;

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
      planType
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
      client_reference_id: userId, // THIS IS THE CRITICAL PART - passes user ID to webhook
      metadata: {
        userId,
        tier,
        planType,
        userType: 'therapist'
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

export default router;