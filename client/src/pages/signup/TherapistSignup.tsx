import { useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Authentication from '@/components/authentication';

interface TherapistSignupProps {
  setUserId: (id: string) => void;
}

export default function TherapistSignup({ setUserId }: TherapistSignupProps) {
  const [, setLocation] = useLocation();
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const therapistPlans = [
    {
      name: 'Basic',
      price: '$99',
      description: 'Perfect for individual practitioners',
      features: [
        '3 client accounts',
        'Personal iVASA access',
        '540 min voice time/month',
        'Basic analytics',
        'Email support',
        'Pattern tracking',
      ],
      popular: false,
    },
    {
      name: 'Premium',
      price: '$199',
      description: 'For growing practices',
      features: [
        '10 client accounts',
        'Personal iVASA access',
        '1080 min voice time/month',
        'Advanced analytics',
        'Priority support',
        'Advanced pattern tracking',
        'Custom agent configuration',
      ],
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Contact for Pricing',
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
        'Custom BAA terms',
      ],
      popular: false,
      isEnterprise: true,
      badge: 'Custom Solutions',
    },
  ];

  const valueProps = [
    {
      icon: Users,
      title: 'Client Management',
      description: 'Invite clients, set session limits, monitor progress',
    },
    {
      icon: TrendingUp,
      title: 'Between-Session Support',
      description: 'Clients get 24/7 AI support that works alongside your treatment',
    },
    {
      icon: BarChart3,
      title: 'Clinical Intelligence',
      description: 'Pattern tracking, session analytics, progress reports',
    },
  ];

  return (
    <div className="min-h-screen gradient-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-50 w-full flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation('/ai-assisted-therapy')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <img src="/apple-touch-icon.png" alt="iVASA" className="h-8" />
        </div>
        <button
          onClick={() => setLocation('/login')}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Log in
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Brief header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white">Extend Your Practice</h1>
          <p className="text-muted-foreground mt-2">
            Give your clients 24/7 AI-guided support between sessions. 30-day free trial.
          </p>
        </div>

        {/* Compact value proposition cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {valueProps.map((prop, idx) => (
            <div key={idx} className="glass rounded-xl p-4 text-center" style={{ border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <prop.icon className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="font-semibold text-white text-sm mb-1">{prop.title}</h3>
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            </div>
          ))}
        </div>

        {/* Pricing tiers */}
        <div className="mb-12">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Therapist Plans</h2>
            <p className="text-sm text-muted-foreground mt-1">After your free trial, choose the plan that fits your practice</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {therapistPlans.map((plan) => (
              <Card
                key={plan.name}
                className="glass relative cursor-pointer transition-transform hover:scale-[1.02]"
                style={plan.popular ? { border: '2px solid rgba(245, 158, 11, 0.6)' } : plan.isEnterprise ? { border: '1px solid rgba(245, 158, 11, 0.3)' } : { border: '1px solid rgba(255, 255, 255, 0.1)' }}
                onClick={plan.isEnterprise ? undefined : scrollToForm}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-amber-500 text-white">Most Popular</Badge>
                  </div>
                )}
                {plan.isEnterprise && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-amber-500 text-white">{plan.badge}</Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-sm">{plan.description}</CardDescription>
                  <div className="mt-3">
                    {plan.isEnterprise ? (
                      <span className="text-xl font-bold text-white">Contact for Pricing</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-white">{plan.price}</span>
                        <span className="text-muted-foreground text-sm">/month</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start text-sm">
                        <Check className="w-4 h-4 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.isEnterprise && (
                    <div className="mt-4">
                      <Button
                        className="w-full"
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <a href="mailto:mathew@ivasa.ai?subject=Enterprise%20Plan%20Inquiry">
                          Contact Sales
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
            All plans include a 30-day free trial. No credit card required.
          </p>
        </div>

        {/* Signup form */}
        <div ref={formRef} className="max-w-md mx-auto mb-16">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Create your therapist account to start your 30-day free trial
          </p>
          <Authentication
            setUserId={setUserId}
            preSelectedUserType="therapist"
            formOnly={true}
            defaultMode="signup"
          />
        </div>

        {/* Footer */}
        <div className="text-center pt-8 border-t border-white/10">
          <p className="text-xs text-muted-foreground mb-3">
            Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
          </p>
          <p className="text-xs text-muted-foreground">
            Questions? <a href="mailto:mathew@ivasa.ai" className="text-amber-400 hover:text-amber-300 transition-colors">mathew@ivasa.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
}
