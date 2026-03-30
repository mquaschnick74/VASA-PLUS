import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Users, Clock, TrendingUp, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';
import Header from '@/components/shared/Header';
import SmartBackButton from '@/components/SmartBackButton';

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
          .select('id, user_type')
          .eq('email', user.email)
          .single();

        if (profile) {
          setUserId(profile.id);
          setUserType(profile.user_type || 'individual');
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
    },
    {
      name: 'Enterprise',
      price: 'Contact for Pricing',
      period: '',
      tier: 'enterprise',
      planType: 'custom',
      priceId: '',
      description: 'For organizations & health systems',
      features: [
        'Unlimited client accounts',
        'Unlimited voice time/month',
        'Insurance & EAP integration',
        'White-label options',
        'Dedicated account manager',
        'Custom agent development',
        'API access',
        'Advanced reporting & analytics',
        'SSO/SAML integration',
        'Priority 24/7 support',
        'Custom BAA terms'
      ],
      popular: false,
      isEnterprise: true,
      badge: 'Custom Solutions'
    }
  ];

  // Individual/Personal plans for non-logged-in users (static display)
  const individualPlans = [
    {
      name: 'Intro',
      oneTimePrice: '$10',
      monthlyPrice: '$7.99',
      annualPrice: '$79.90',
      description: 'Begin finding the thread',
      features: [
        'Depth sessions with your guide',
        'Your guide holds your full story',
        'Conversation history',
        'Email support'
      ]
    },
    {
      name: 'Plus',
      oneTimePrice: '$20',
      monthlyPrice: '$17.99',
      annualPrice: '$179.90',
      description: 'For the story that keeps unfolding',
      features: [
        'Extended depth sessions with your guide',
        'Access to all four guides',
        'Full conversation history',
        'Priority support',
        'Pattern recognition across your story'
      ],
      popular: true
    },
    {
      name: 'Complete',
      oneTimePrice: '$40',
      monthlyPrice: '$37.99',
      annualPrice: '$379.90',
      description: 'For those doing the real work',
      features: [
        'Full access to your guide — no limits',
        'Access to all four guides',
        'Full conversation history',
        'Priority support',
        'Deep pattern recognition across your story',
        'Custom guide preferences'
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
    },
    {
      name: 'Enterprise',
      monthlyPrice: 'Contact for Pricing',
      annualPrice: 'Contact for Pricing',
      description: 'For organizations & health systems',
      features: [
        'Unlimited client accounts',
        'Unlimited voice time/month',
        'Insurance & EAP integration',
        'White-label options',
        'Dedicated account manager',
        'Custom agent development',
        'API access',
        'Advanced reporting & analytics',
        'SSO/SAML integration',
        'Priority 24/7 support',
        'Custom BAA terms'
      ],
      popular: false,
      isEnterprise: true,
      badge: 'Custom Solutions'
    }
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Header userId={userId} showDashboardLink={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <SmartBackButton className="mb-6 text-purple-200 hover:text-white hover:bg-emerald-500/10" />
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4" variant="secondary">
            <Sparkles className="w-3 h-3 mr-1" />
            {userType === 'therapist' ? 'Therapist Plans' : 'Personal Plans'}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            The price of a space where depth becomes possible.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {userType === 'therapist'
              ? 'Give your clients somewhere to continue the work between sessions. Hold more of their story.'
              : "Your story doesn't fit in a month. Here's how to keep it unfolding."}
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
                  <>
                    {/* Billing Period Toggle for logged-in Individual users */}
                    <div className="flex justify-center mb-8">
                      <div className="inline-flex items-center gap-4">
                        <span
                          className={`text-sm cursor-pointer ${billingPeriod === 'monthly' ? 'text-white font-semibold' : 'text-purple-300 hover:text-purple-200'}`}
                          onClick={() => setBillingPeriod('monthly')}
                        >
                          Monthly
                        </span>
                        <button
                          onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
                          className="relative w-12 h-6 rounded-full transition-colors bg-gray-600 hover:bg-gray-500"
                          aria-label="Toggle billing period"
                        >
                          <span
                            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 ease-in-out ${
                              billingPeriod === 'annual' ? 'left-7' : 'left-1'
                            }`}
                          />
                        </button>
                        <span
                          className={`text-sm cursor-pointer ${billingPeriod === 'annual' ? 'text-white font-semibold' : 'text-purple-300 hover:text-purple-200'}`}
                          onClick={() => setBillingPeriod('annual')}
                        >
                          Annual
                        </span>
                        {billingPeriod === 'annual' && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5">
                            Save up to 33%
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Stripe Pricing Table - switches based on billing period */}
                    {billingPeriod === 'monthly' ? (
                      <stripe-pricing-table
                        pricing-table-id="prctbl_1SG0XO4gtJy4JzhOOyw7zQu0"
                        publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                        client-reference-id={userId}
                        customer-email={userEmail}
                      />
                    ) : (
                      <stripe-pricing-table
                        pricing-table-id="prctbl_1Ssqyg4gtJy4JzhOFpyTio2j"
                        publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                        client-reference-id={userId}
                        customer-email={userEmail}
                      />
                    )}
                  </>
                ) : scriptLoaded && (!userId || !userEmail) ? (
                  // NON-LOGGED-IN USERS: Show static pricing cards with signup redirect
                  <div>
                    {/* Account Required Banner */}
                    <Card className="mb-8 glass border-amber-500/50 border">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center flex-shrink-0">
                            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold mb-2">Account Required to Subscribe</h3>
                            <p className="text-sm text-muted-foreground">
                              You'll need to create a free account before purchasing a subscription.
                              Sign up takes less than a minute — no credit card required to get started.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

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
                      <div className="inline-flex items-center gap-4">
                        <span
                          className={`text-sm cursor-pointer ${billingPeriod === 'monthly' ? 'text-white font-semibold' : 'text-purple-300 hover:text-purple-200'}`}
                          onClick={() => setBillingPeriod('monthly')}
                        >
                          Monthly
                        </span>
                        <button
                          onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
                          className="relative w-12 h-6 rounded-full transition-colors bg-gray-600 hover:bg-gray-500"
                          aria-label="Toggle billing period"
                        >
                          <span
                            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 ease-in-out ${
                              billingPeriod === 'annual' ? 'left-7' : 'left-1'
                            }`}
                          />
                        </button>
                        <span
                          className={`text-sm cursor-pointer ${billingPeriod === 'annual' ? 'text-white font-semibold' : 'text-purple-300 hover:text-purple-200'}`}
                          onClick={() => setBillingPeriod('annual')}
                        >
                          Annual
                        </span>
                        {billingPeriod === 'annual' && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5">
                            Save up to 33%
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Pricing Cards Grid */}
                    <div className={`grid gap-6 ${planCategory === 'individual' ? 'md:grid-cols-3' : 'md:grid-cols-3 max-w-6xl mx-auto'}`}>
                      {(planCategory === 'individual' ? individualPlans : therapistPlansStatic).map((plan) => (
                        <Card
                          key={plan.name}
                          className={`glass relative ${plan.popular ? 'border-emerald-500 border-2' : ''}`}
                        >
                          {plan.popular && (
                            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                              <Badge className="bg-emerald-500 text-white">
                                Most Popular
                              </Badge>
                            </div>
                          )}
                          {plan.isEnterprise && (
                            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                              <Badge className="bg-emerald-500 text-white">
                                {plan.badge}
                              </Badge>
                            </div>
                          )}

                          <CardHeader>
                            <CardTitle className="text-2xl">{plan.name}</CardTitle>
                            <CardDescription>{plan.description}</CardDescription>
                            <div className="mt-4">
                              {plan.isEnterprise ? (
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold">Contact for Pricing</span>
                                </div>
                              ) : billingPeriod === 'monthly' ? (
                                // Monthly view
                                planCategory === 'individual' ? (
                                  // Individual: Show one-time price + monthly recurring option
                                  <>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-4xl font-bold">{plan.oneTimePrice}</span>
                                      <span className="text-muted-foreground">one-time</span>
                                    </div>
                                    <p className="text-sm text-emerald-400 mt-2">
                                      or {plan.monthlyPrice}/mo recurring
                                    </p>
                                  </>
                                ) : (
                                  // Therapist: Just show monthly recurring
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-bold">{plan.monthlyPrice}</span>
                                    <span className="text-muted-foreground">/month</span>
                                  </div>
                                )
                              ) : (
                                // Annual view
                                <>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-bold">{plan.annualPrice}</span>
                                    <span className="text-muted-foreground">/year</span>
                                  </div>
                                  <p className="text-sm text-emerald-400 mt-1">
                                    {planCategory === 'individual' ? 'Save 2+ months' : 'Save over 15%'}
                                  </p>
                                </>
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

                            {plan.isEnterprise ? (
                              <Button
                                className="w-full"
                                size="lg"
                                variant="outline"
                                asChild
                              >
                                <a href="mailto:mathew@ivasa.ai?subject=Enterprise%20Plan%20Inquiry">
                                  Contact Sales
                                </a>
                              </Button>
                            ) : (
                              <Button
                                className="w-full"
                                size="lg"
                                onClick={() => setLocation(`/?mode=signup&redirect=/pricing&type=${planCategory}`)}
                                variant={plan.popular ? 'default' : 'outline'}
                              >
                                Start your story
                              </Button>
                            )}
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
            <div className="max-w-7xl mx-auto mb-16">
              <div className="glass rounded-2xl p-8">
                {/* Billing Period Toggle for logged-in Therapist users */}
                <div className="flex justify-center mb-8">
                  <div className="inline-flex items-center gap-4">
                    <span
                      className={`text-sm cursor-pointer ${billingPeriod === 'monthly' ? 'text-white font-semibold' : 'text-purple-300 hover:text-purple-200'}`}
                      onClick={() => setBillingPeriod('monthly')}
                    >
                      Monthly
                    </span>
                    <button
                      onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
                      className="relative w-12 h-6 rounded-full transition-colors bg-gray-600 hover:bg-gray-500"
                      aria-label="Toggle billing period"
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 ease-in-out ${
                          billingPeriod === 'annual' ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                    <span
                      className={`text-sm cursor-pointer ${billingPeriod === 'annual' ? 'text-white font-semibold' : 'text-purple-300 hover:text-purple-200'}`}
                      onClick={() => setBillingPeriod('annual')}
                    >
                      Annual
                    </span>
                    {billingPeriod === 'annual' && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5">
                        Save over 15%
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Monthly: Custom cards | Annual: Stripe pricing table */}
                {billingPeriod === 'monthly' ? (
                  <div className="grid md:grid-cols-3 gap-8">
                    {therapistPlans.map((plan) => (
                      <Card
                        key={plan.name}
                        className={`glass relative ${plan.popular ? 'border-emerald-500 border-2' : ''}`}
                      >
                        {plan.popular && (
                          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                            <Badge className="bg-emerald-500 text-white">
                              Most Popular
                            </Badge>
                          </div>
                        )}
                        {plan.isEnterprise && (
                          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                            <Badge className="bg-emerald-500 text-white">
                              {plan.badge}
                            </Badge>
                          </div>
                        )}

                        <CardHeader>
                          <CardTitle className="text-2xl">{plan.name}</CardTitle>
                          <CardDescription>{plan.description}</CardDescription>
                          <div className="mt-4">
                            {plan.isEnterprise ? (
                              <span className="text-2xl font-bold">Contact for Pricing</span>
                            ) : (
                              <>
                                <span className="text-4xl font-bold">{plan.price}</span>
                                <span className="text-muted-foreground ml-1">{plan.period}</span>
                              </>
                            )}
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

                          {/* CTA Button */}
                          {plan.isEnterprise ? (
                            <Button
                              className="w-full"
                              size="lg"
                              variant="outline"
                              asChild
                            >
                              <a href="mailto:mathew@ivasa.ai?subject=Enterprise%20Plan%20Inquiry">
                                Contact Sales
                              </a>
                            </Button>
                          ) : (
                            <Button
                              className="w-full"
                              size="lg"
                              onClick={() => handleCheckout(plan.tier, plan.planType, plan.priceId)}
                              variant={plan.popular ? 'default' : 'outline'}
                              disabled={isCheckoutLoading}
                            >
                              {isCheckoutLoading ? 'Loading...' : 'Get Started'}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  /* Annual: Stripe pricing table for therapists */
                  scriptLoaded ? (
                    <stripe-pricing-table
                      pricing-table-id="prctbl_1Ssqve4gtJy4JzhOogCNHYDR"
                      publishable-key="pk_live_51Rng6m4gtJy4JzhOgdbmZOoUUZ9LNWn6Vc4aNY5FsB5hZ5s8iI06kj496y8K4h9Xs72EBSNJicgVdGuaiP2JmrAx00cOEWDBqW"
                      client-reference-id={userId}
                      customer-email={userEmail}
                    />
                  ) : (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading pricing options...</p>
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {/* Feature Highlights */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            What happens in the space
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="font-semibold mb-2">A guide who holds your full story</h3>
                <p className="text-sm text-muted-foreground">
                  Choose from four specialized guides. Each one picks up exactly where the last session ended — nothing is lost between conversations.
                </p>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold mb-2">Finds the thread in your story</h3>
                <p className="text-sm text-muted-foreground">
                  Your guide surfaces the patterns you keep returning to — the ones you've been living inside of without realizing it.
                </p>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold mb-2">What you say stays here</h3>
                <p className="text-sm text-muted-foreground">
                  Your conversations are encrypted and stored securely. What you bring to this space stays between you and your guide.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Commitment architecture */}
        <div className="mt-16 text-center">
          <Card className="glass max-w-2xl mx-auto border-emerald-500/30 border">
            <CardContent className="pt-6">
              <Clock className="w-10 h-10 mx-auto mb-4 text-emerald-400" />
              <h3 className="text-xl font-semibold mb-2">
                Show up three times. We find you something.
              </h3>
              <p className="text-muted-foreground">
                No credit card required · Start free. Stay when it matters.
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