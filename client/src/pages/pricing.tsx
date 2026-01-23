import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Users, Clock, TrendingUp, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';
import Header from '@/components/shared/Header';

// Declare the custom Stripe element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-pricing-table': any;
    }
  }
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userType, setUserType] = useState<string>('individual');
  const [isPromoActive, setIsPromoActive] = useState<boolean>(false);
  const [promoCode, setPromoCode] = useState<string>('');
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [planCategory, setPlanCategory] = useState<'individual' | 'therapist'>('individual');

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setUserEmail(user.email || '');

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, user_type, promo_code, promo_discount_expires_at')
          .eq('email', user.email)
          .single();

        if (profile) {
          setUserId(profile.id);
          setUserType(profile.user_type || 'individual');
          setPromoCode(profile.promo_code || '');

          // Check if promo is still active
          if (profile.promo_discount_expires_at) {
            const expiryDate = new Date(profile.promo_discount_expires_at);
            const now = new Date();
            setIsPromoActive(expiryDate > now);
          }
        }
      }
    };

    loadUser();
  }, []);

  // Load Stripe pricing table script
  useEffect(() => {
    // Check if script already exists
    const existingScript = document.querySelector('script[src="https://js.stripe.com/v3/pricing-table.js"]');

    if (existingScript) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/pricing-table.js';
    script.async = true;
    script.onload = () => {
      console.log('✅ Stripe pricing table script loaded');
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.error('❌ Failed to load Stripe pricing table script');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup: remove script when component unmounts
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Server-side checkout handler for plan upgrades
  const handleCheckout = async (tier: string, planType: string, priceId: string) => {
    if (!userId) {
      setLocation('/');
      return;
    }

    setIsCheckoutLoading(true);

    try {
      console.log('🛒 Starting checkout:', { tier, planType, userId, userEmail, userType });

      // Call backend to create checkout session
      const response = await fetch(getApiUrl('/api/stripe/create-checkout-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          priceId,
          userId,
          userEmail,
          tier,
          planType,
          userType
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Checkout error:', error);
        alert('Failed to start checkout. Please try again.');
        setIsCheckoutLoading(false);
        return;
      }

      const { url } = await response.json();

      console.log('✅ Redirecting to Stripe checkout');
      // Redirect to Stripe checkout
      window.location.href = url;
    } catch (error) {
      console.error('❌ Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
      setIsCheckoutLoading(false);
    }
  };

  // UPDATED: Therapist plans with Stripe Price IDs instead of checkout URLs
  const therapistPlans = [
    {
      name: 'Basic',
      price: '$99',
      period: '/month',
      tier: 'basic',
      planType: 'recurring',
      // IMPORTANT: Replace this with your actual Stripe Price ID from Stripe Dashboard
      // Go to: Stripe Dashboard → Products → Basic Therapist Plan → Copy the Price ID
      priceId: 'price_1RuZLh4gtJy4JzhOgk6gagd2', // Replace with your actual price_id
      description: 'Perfect for individual practitioners',
      features: [
        '3 Client Accounts',
        'Personal iVASA Access',
        '3 Hours Voice Time/Month',
        'Basic Analytics',
        'Email Support',
        'CSS Pattern Tracking'
      ],
      popular: false
    },
    {
      name: 'Premium',
      price: '$199',
      period: '/month',
      tier: 'premium',
      planType: 'recurring',
      // IMPORTANT: Replace this with your actual Stripe Price ID from Stripe Dashboard
      // Go to: Stripe Dashboard → Products → Premium Therapist Plan → Copy the Price ID
      priceId: 'price_1RuZOp4gtJy4JzhOvd4VNxys', // Replace with your actual price_id
      description: 'For growing practices',
      features: [
        '10 Client Accounts',
        'Personal iVASA Access',
        '10 Hours Voice Time/Month',
        'Advanced Analytics',
        'Priority Support',
        'Advanced CSS Tracking',
        'Custom Agent Configuration'
      ],
      popular: true
    }
  ];

  // Individual/Personal plans for non-logged-in users (static display)
  const individualPlans = [
    {
      name: 'Intro',
      monthlyPrice: '$10',
      annualPrice: '$79.90',
      description: 'Perfect for getting started',
      features: [
        '45 minutes voice time/month',
        'Access to AI therapeutic agents',
        'Conversation history',
        'Email support'
      ]
    },
    {
      name: 'Plus',
      monthlyPrice: '$20',
      annualPrice: '$179.90',
      description: 'Most popular choice',
      features: [
        '180 minutes voice time/month',
        'Access to all AI agents',
        'Full conversation history',
        'Priority support',
        'CSS Pattern Tracking'
      ],
      popular: true
    },
    {
      name: 'Complete',
      monthlyPrice: '$40',
      annualPrice: '$379.90',
      description: 'For dedicated users',
      features: [
        '420 minutes voice time/month',
        'Access to all AI agents',
        'Full conversation history',
        'Priority support',
        'Advanced CSS Tracking',
        'Custom agent preferences'
      ]
    }
  ];

  // Therapist plans for non-logged-in users (static display)
  const therapistPlansStatic = [
    {
      name: 'Basic',
      monthlyPrice: '$99',
      annualPrice: '$999',
      description: 'Perfect for individual practitioners',
      features: [
        '3 Client Accounts',
        'Personal iVASA Access',
        '3 Hours Voice Time/Month',
        'Basic Analytics',
        'Email Support',
        'CSS Pattern Tracking'
      ],
      popular: false
    },
    {
      name: 'Premium',
      monthlyPrice: '$199',
      annualPrice: '$1,999',
      description: 'For growing practices',
      features: [
        '10 Client Accounts',
        'Personal iVASA Access',
        '10 Hours Voice Time/Month',
        'Advanced Analytics',
        'Priority Support',
        'Advanced CSS Tracking',
        'Custom Agent Configuration'
      ],
      popular: true
    }
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Header userId={userId} showDashboardLink={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4" variant="secondary">
            <Sparkles className="w-3 h-3 mr-1" />
            {userType === 'therapist' ? 'Therapist Plans' : 'Personal Plans'}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {userType === 'therapist' 
              ? 'Empower your practice with AI-assisted therapeutic support for you and your clients.'
              : 'Get started with AI-powered therapeutic conversations tailored to your needs.'}
          </p>
        </div>

        {/* Conditional Rendering: Individual Plans (Stripe Table) OR Therapist Plans (Cards) */}
        {userType === 'individual' || userType === 'client' ? (
          <>
            {/* Individual Plans - Stripe Pricing Table */}
            <div className="max-w-6xl mx-auto mb-16">
              <div className="glass rounded-2xl p-8">
                <style>{`
                  /* Force Stripe pricing table to display horizontally */
                  stripe-pricing-table {
                    --pricing-table-column-count: 3;
                  }

                  /* Ensure plans display side-by-side on larger screens */
                  @media (min-width: 768px) {
                    stripe-pricing-table::part(container) {
                      display: grid;
                      grid-template-columns: repeat(3, 1fr);
                      gap: 1.5rem;
                    }
                  }
                `}</style>
                {!scriptLoaded && (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading pricing options...</p>
                  </div>
                )}

                {scriptLoaded && userId && userEmail ? (
                  promoCode === 'TESTA2025' ? (
                    // PROMO A: 30 days free + 50% off for 1 month
                    <div>
                      <div className="text-center mb-4">
                        <Badge className="bg-green-500">
                          🎉 30 Days FREE + 50% Off Next Month - Code: {promoCode}
                        </Badge>
                      </div>
                      <stripe-pricing-table
                        pricing-table-id="prctbl_1SG3sP4gtJy4JzhOKL4JWBqj"
                        publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                        client-reference-id={userId}
                        customer-email={userEmail}
                        customer-promo-code="TESTA2025"
                      >
                      </stripe-pricing-table>
                    </div>
                  ) : promoCode === 'TESTB2025' ? (
                    // PROMO B: 30 days free + 50% off for 2 months
                    <div>
                      <div className="text-center mb-4">
                        <Badge className="bg-green-500">
                          🎉 30 Days FREE + 50% Off Next 2 Months - Code: {promoCode}
                        </Badge>
                      </div>
                      <stripe-pricing-table
                        pricing-table-id="prctbl_1SG3sP4gtJy4JzhOKL4JWBqj"
                        publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                        client-reference-id={userId}
                        customer-email={userEmail}
                        customer-promo-code="TESTB2025"
                      >
                      </stripe-pricing-table>
                    </div>
                  ) : isPromoActive ? (
                    // EXISTING GENERIC PROMO (keep as fallback for old INFLUENCER50 code)
                    <div>
                      <div className="text-center mb-4">
                        <Badge className="bg-green-500">
                          🎉 50% OFF First Month - Code: INFLUENCER50
                        </Badge>
                      </div>
                      <stripe-pricing-table
                        pricing-table-id="prctbl_1SG3sP4gtJy4JzhOKL4JWBqj"
                        publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                        client-reference-id={userId}
                        customer-email={userEmail}
                        customer-promo-code="INFLUENCER50"
                      >
                      </stripe-pricing-table>
                    </div>
                  ) : (
                    // NORMAL PRICING - No promo code applied
                    <stripe-pricing-table
                      pricing-table-id="prctbl_1SG0XO4gtJy4JzhOOyw7zQu0"
                      publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                      client-reference-id={userId}
                      customer-email={userEmail}
                    >
                    </stripe-pricing-table>
                  )
                ) : scriptLoaded && (!userId || !userEmail) ? (
                  // NON-LOGGED-IN USERS: Show static pricing cards with signup redirect
                  <div>
                    {/* Banner */}
                    <div className="text-center mb-8 p-4 glass rounded-xl">
                      <p className="text-lg text-purple-200 mb-2">
                        Create a free account to subscribe
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Sign up takes less than a minute
                      </p>
                    </div>

                    {/* Category Tabs: Individual / Therapist */}
                    <div className="flex justify-center mb-6">
                      <div className="inline-flex rounded-lg p-1 glass">
                        <button
                          onClick={() => setPlanCategory('individual')}
                          className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                            planCategory === 'individual'
                              ? 'bg-emerald-500 text-white shadow-lg'
                              : 'text-purple-200 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          Individual
                        </button>
                        <button
                          onClick={() => setPlanCategory('therapist')}
                          className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                            planCategory === 'therapist'
                              ? 'bg-emerald-500 text-white shadow-lg'
                              : 'text-purple-200 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          Therapist
                        </button>
                      </div>
                    </div>

                    {/* Billing Period Toggle: Monthly / Annual */}
                    <div className="flex justify-center mb-8">
                      <div className="inline-flex items-center gap-3">
                        <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-white font-medium' : 'text-purple-300'}`}>
                          Monthly
                        </span>
                        <button
                          onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
                          className={`relative w-14 h-7 rounded-full transition-colors ${
                            billingPeriod === 'annual' ? 'bg-emerald-500' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                              billingPeriod === 'annual' ? 'translate-x-8' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className={`text-sm ${billingPeriod === 'annual' ? 'text-white font-medium' : 'text-purple-300'}`}>
                          Annual
                        </span>
                        {billingPeriod === 'annual' && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">
                            Save up to 33%
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Pricing Cards Grid */}
                    <div className={`grid gap-6 ${planCategory === 'individual' ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-4xl mx-auto'}`}>
                      {(planCategory === 'individual' ? individualPlans : therapistPlansStatic).map((plan) => (
                        <Card
                          key={plan.name}
                          className={`glass relative ${plan.popular ? 'border-purple-500 border-2' : ''}`}
                        >
                          {plan.popular && (
                            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                              <Badge className="bg-purple-500 text-white">
                                Most Popular
                              </Badge>
                            </div>
                          )}

                          <CardHeader>
                            <CardTitle className="text-2xl">{plan.name}</CardTitle>
                            <CardDescription>{plan.description}</CardDescription>
                            <div className="mt-4">
                              <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold">
                                  {billingPeriod === 'monthly' ? plan.monthlyPrice : plan.annualPrice}
                                </span>
                                <span className="text-muted-foreground">
                                  {billingPeriod === 'monthly' ? '/month' : '/year'}
                                </span>
                              </div>
                              {billingPeriod === 'annual' && (
                                <p className="text-sm text-emerald-400 mt-1">
                                  {planCategory === 'individual' ? 'Save 2+ months' : 'Save over 15%'}
                                </p>
                              )}
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-6">
                            <ul className="space-y-3">
                              {plan.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start">
                                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                                  <span className="text-sm">{feature}</span>
                                </li>
                              ))}
                            </ul>

                            <Button
                              className="w-full"
                              size="lg"
                              onClick={() => setLocation(`/?mode=signup&redirect=/pricing&type=${planCategory}`)}
                              variant={plan.popular ? 'default' : 'outline'}
                            >
                              Get Started
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Therapist Plans - Cards with Server-Side Checkout */}
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
              {therapistPlans.map((plan) => (
                <Card 
                  key={plan.name}
                  className={`glass relative ${plan.popular ? 'border-purple-500 border-2' : ''}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-purple-500 text-white">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground ml-1">{plan.period}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    {/* Features List */}
                    <ul className="space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button - UPDATED to use new checkout handler */}
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => handleCheckout(plan.tier, plan.planType, plan.priceId)}
                      variant={plan.popular ? 'default' : 'outline'}
                      disabled={isCheckoutLoading}
                    >
                      {isCheckoutLoading ? 'Loading...' : 'Get Started'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Feature Highlights */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            What You Get
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold mb-2">AI Voice Agents</h3>
                <p className="text-sm text-muted-foreground">
                  Choose from four specialized AI agents, each with unique voice characteristics and therapeutic approaches for personalized conversations.
                </p>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold mb-2">CSS Pattern Tracking</h3>
                <p className="text-sm text-muted-foreground">
                  Advanced conversational state sensing to identify therapeutic patterns and progress over time.
                </p>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold mb-2">Privacy First</h3>
                <p className="text-sm text-muted-foreground">
                  Your conversations are encrypted and stored securely. Cancel anytime with full data control.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trial Info */}
        <div className="mt-16 text-center">
          <Card className="glass max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <Clock className="w-10 h-10 mx-auto mb-4 text-purple-500" />
              <h3 className="text-xl font-semibold mb-2">
                Start with a Free Trial
              </h3>
              <p className="text-muted-foreground">
                All new users get 7 days free with 45 minutes of voice time to try iVASA.
                No credit card required to start.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>Have questions? Contact us at support@ivasa.com</p>
        </div>
      </div>
    </div>
  );
}