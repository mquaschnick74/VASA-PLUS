import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Users, Clock, TrendingUp, Shield, Info } from 'lucide-react';
import { useLocation } from 'wouter';
import Header from '@/components/shared/Header';

export default function PublicPricing() {
  const [, setLocation] = useLocation();

  // Individual plans for marketing display
  const individualPlans = [
    {
      name: 'Intro',
      monthlyPrice: '$7.99',
      oneTimePrice: '$10.00',
      period: '/month',
      description: 'Essential AI therapeutic support',
      features: [
        '45 Minutes Voice Time',
        'No rollover - resets each period',
        'Access to All 4 AI Agents',
        'Basic Analytics',
        'Email Support',
        'CSS Pattern Tracking',
        '7-Day Free Trial'
      ],
      popular: false
    },
    {
      name: 'Plus',
      monthlyPrice: '$17.99',
      oneTimePrice: '$20.00',
      period: '/month',
      description: 'Enhanced support and features',
      features: [
        '180 Minutes Voice Time',
        'No rollover - resets each period',
        'Access to All 4 AI Agents',
        'Advanced Analytics',
        'Priority Support',
        'CSS Pattern Tracking',
        'Session History & Insights',
        '7-Day Free Trial'
      ],
      popular: true
    },
    {
      name: 'Complete',
      monthlyPrice: '$37.99',
      oneTimePrice: '$40.00',
      period: '/month',
      description: 'Maximum therapeutic support',
      features: [
        '420 Minutes Voice Time',
        'No rollover - resets each period',
        'Access to All 4 AI Agents',
        'Premium Analytics',
        'Priority Support',
        'Advanced CSS Tracking',
        'Custom Agent Configuration',
        'Detailed Progress Reports',
        '7-Day Free Trial'
      ],
      popular: false
    }
  ];

  // Therapist plans for marketing display
  const therapistPlans = [
    {
      name: 'Basic',
      price: '$99',
      period: '/month',
      description: 'Perfect for individual practitioners',
      features: [
        '3 Client Accounts',
        'Personal iVASA Access',
        '540 Minutes Voice Time/Month',
        'Basic Analytics',
        'Email Support',
        'CSS Pattern Tracking',
        '7-Day Free Trial'
      ],
      popular: false
    },
    {
      name: 'Premium',
      price: '$199',
      period: '/month',
      description: 'For growing practices',
      features: [
        '10 Client Accounts',
        'Personal iVASA Access',
        '1080 Minutes Voice Time/Month',
        'Advanced Analytics',
        'Priority Support',
        'Advanced CSS Tracking',
        'Custom Agent Configuration',
        '7-Day Free Trial'
      ],
      popular: true
    }
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Header userId={null} showDashboardLink={false} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4" variant="secondary">
            <Sparkles className="w-3 h-3 mr-1" />
            Transparent Pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg max-w-2xl mx-auto text-emerald-400 font-medium">
            AI-powered therapeutic conversations tailored to your needs. Start with a 7-day free trial.
          </p>
        </div>

        {/* Client Notice */}
        <div className="max-w-4xl mx-auto mb-12">
          <Card className="glass border-blue-500 border-2">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">For Clients</h3>
                  <p className="text-sm text-muted-foreground">
                    If you're working with a therapist who uses iVASA, you don't need a subscription!
                    You'll automatically get access to iVASA through your therapist's account at no additional cost.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Individual Plans */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Individual Plans</h2>
            <p className="text-muted-foreground">For personal therapeutic support</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {individualPlans.map((plan) => (
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
                  <div className="mt-4 space-y-1">
                    <div>
                      <span className="text-3xl font-bold">{plan.monthlyPrice}</span>
                      <span className="text-muted-foreground ml-1">/month</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      or <span className="font-semibold text-white">{plan.oneTimePrice}</span> one-time purchase
                    </div>
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
                    onClick={() => setLocation('/')}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Therapist Plans */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Therapist Plans</h2>
            <p className="text-muted-foreground">Empower your practice with AI-assisted support</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
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
                    onClick={() => setLocation('/')}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
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
