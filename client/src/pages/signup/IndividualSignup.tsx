import { useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Authentication from '@/components/authentication';

interface IndividualSignupProps {
  setUserId: (id: string) => void;
}

export default function IndividualSignup({ setUserId }: IndividualSignupProps) {
  const [, setLocation] = useLocation();
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const individualPlans = [
    {
      name: 'Intro',
      monthlyPrice: '$7.99',
      oneTimePrice: '$10',
      description: 'Essential AI therapeutic support',
      features: [
        '45 min voice time',
        'Access to all 4 AI agents',
        'Basic analytics',
        'Email support',
        'Pattern tracking',
      ],
      popular: false,
    },
    {
      name: 'Plus',
      monthlyPrice: '$17.99',
      oneTimePrice: '$20',
      description: 'Enhanced support and features',
      features: [
        '180 min voice time',
        'Access to all 4 AI agents',
        'Advanced analytics',
        'Priority support',
        'Pattern tracking',
        'Session history & insights',
      ],
      popular: true,
    },
    {
      name: 'Complete',
      monthlyPrice: '$37.99',
      oneTimePrice: '$40',
      description: 'Maximum therapeutic support',
      features: [
        '420 min voice time',
        'Access to all 4 AI agents',
        'Premium analytics',
        'Priority support',
        'Advanced pattern tracking',
        'Custom agent configuration',
        'Detailed progress reports',
      ],
      popular: false,
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
          <h1 className="text-3xl md:text-4xl font-bold text-white">Start Your Journey</h1>
          <p className="text-muted-foreground mt-2">
            24/7 voice-first therapeutic support. 30-day free trial, no credit card required.
          </p>
        </div>

        {/* Pricing tiers */}
        <div className="mb-12">
          <div className="grid md:grid-cols-3 gap-6">
            {individualPlans.map((plan) => (
              <Card
                key={plan.name}
                className="glass relative cursor-pointer transition-transform hover:scale-[1.02]"
                style={plan.popular ? { border: '2px solid rgba(16, 185, 129, 0.6)' } : { border: '1px solid rgba(255, 255, 255, 0.1)' }}
                onClick={scrollToForm}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-emerald-500 text-white">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-sm">{plan.description}</CardDescription>
                  <div className="mt-3">
                    <span className="text-3xl font-bold text-white">{plan.monthlyPrice}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    or {plan.oneTimePrice} one-time
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start text-sm">
                        <Check className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
            All plans include a 30-day free trial with 180 minutes of voice time.
          </p>
        </div>

        {/* Signup form */}
        <div ref={formRef} className="max-w-md mx-auto mb-16">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Create your account to start your 30-day free trial
          </p>
          <Authentication
            setUserId={setUserId}
            preSelectedUserType="individual"
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
            Questions? <a href="mailto:mathew@ivasa.ai" className="text-emerald-400 hover:text-emerald-300 transition-colors">mathew@ivasa.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
}
