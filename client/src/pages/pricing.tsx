import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Users, Clock, TrendingUp, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabaseClient';

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userType, setUserType] = useState<string>('individual');

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setUserEmail(user.email || '');

        // Query by EMAIL instead of ID (email is unique and indexed)
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, user_type')
          .eq('email', user.email)
          .single();

        if (profile) {
          setUserId(profile.id);  // Use the app user ID, not auth ID
          setUserType(profile.user_type || 'individual');
        }
      }
    };

    loadUser();
  }, []);

  // Redirect to Stripe checkout with user metadata
  const handleCheckout = (tier: string, planType: string, checkoutUrl: string) => {
    if (!userId) {
      setLocation('/');
      return;
    }

    // Add user metadata to checkout URL
    const url = new URL(checkoutUrl);
    url.searchParams.append('client_reference_id', userId);
    url.searchParams.append('prefilled_email', userEmail);

    // Redirect to Stripe checkout
    window.location.href = url.toString();
  };

  const therapistPlans = [
    {
      name: 'Basic',
      price: '$99',
      period: '/month',
      tier: 'basic',
      planType: 'recurring',
      checkoutUrl: 'https://buy.stripe.com/eVqdR290b6yy426dGA3sI01',
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
      checkoutUrl: 'https://buy.stripe.com/14A3co4JV7CC8imgSM3sI00',
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

  const individualPlans = [
    {
      name: 'Basic',
      price: '$24.99',
      period: 'one-time',
      tier: 'basic',
      planType: 'one-time',
      checkoutUrl: 'https://buy.stripe.com/4gM4gs7W77CC6aeeKE3sI02',
      description: 'Get started with iVASA',
      features: [
        '180 Minutes Voice Time',
        'Never Expires',
        'All Voice Agents',
        'Basic CSS Tracking',
        'Session History',
        'AI Therapeutic Support'
      ],
      popular: false
    },
    {
      name: 'Plus',
      price: '$19.99',
      period: '/month',
      tier: 'plus',
      planType: 'recurring',
      checkoutUrl: 'https://buy.stripe.com/5kQ28kccn6yy426auo3sI03',
      description: 'Best value for regular users',
      features: [
        '220 Minutes Voice Time/Month',
        'All Voice Agents',
        'Advanced CSS Tracking',
        'Session History',
        'Priority Support',
        'AI Therapeutic Support'
      ],
      popular: true
    }
  ];

  const plans = userType === 'therapist' ? therapistPlans : individualPlans;

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 glass-strong">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">Pricing</h1>
            <Button 
              variant="ghost" 
              onClick={() => {
                if (userType === 'therapist') setLocation('/therapist-dashboard');
                else if (userType === 'client') setLocation('/client-dashboard');
                else setLocation('/home');
              }}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </nav>

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

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
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

                {/* CTA Button */}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => handleCheckout(plan.tier, plan.planType, plan.checkoutUrl)}
                  variant={plan.popular ? 'default' : 'outline'}
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

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
                  Choose between Sarah (emotional support) and Mathew (analytical guidance) for personalized conversations.
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