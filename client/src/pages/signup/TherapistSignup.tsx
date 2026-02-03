// client/src/pages/signup/TherapistSignup.tsx
// Dedicated signup page for therapists and clinics

import { useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, Users, TrendingUp, Brain, Building2, Shield, BarChart3 } from 'lucide-react';
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

  // Therapist pricing plans
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
        'CSS Pattern Tracking',
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
        'Advanced CSS Tracking',
        'Custom agent configuration',
      ],
      popular: true,
    },
  ];

  // Value proposition cards
  const valueProps = [
    {
      icon: Users,
      title: 'Client Management',
      description: 'Invite clients, set session limits, monitor progress',
    },
    {
      icon: TrendingUp,
      title: 'Revenue Growth',
      description: 'Generate leads, extend your reach, scale your practice',
    },
    {
      icon: BarChart3,
      title: 'Clinical Intelligence',
      description: 'CSS pattern tracking, session analytics, progress reports',
    },
  ];

  return (
    <div className="min-h-screen gradient-bg">
      {/* Top bar */}
      <div className="sticky top-0 left-0 right-0 flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 z-50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <img src="/apple-touch-icon.png" alt="iVASA" className="h-8 md:h-10" />
        </div>
        <button
          onClick={() => setLocation('/login')}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
        >
          Log in
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Section 1: Hero */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Building2 className="w-3 h-3 mr-1" />
            Therapist Portal
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Augment Your Practice with AI
          </h1>
          <p className="text-xl md:text-2xl text-amber-400 italic mb-4">
            Extend care between sessions. Track client progress. Generate leads.
          </p>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            iVASA gives your clients 24/7 access to AI-powered depth therapy that works alongside your treatment.
          </p>

          {/* Trust signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Brain className="w-5 h-5 text-amber-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">25+ years of clinical research</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Shield className="w-5 h-5 text-amber-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">HIPAA-compliant audit logging</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Users className="w-5 h-5 text-amber-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">Extend care between sessions</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <BarChart3 className="w-5 h-5 text-amber-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">Track client CSS patterns</span>
            </div>
          </div>
        </div>

        {/* Section 2: Value proposition cards */}
        <div className="mb-16">
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {valueProps.map((prop, idx) => (
              <Card key={idx} className="glass border-amber-400/20">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <prop.icon className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{prop.title}</h3>
                  <p className="text-sm text-muted-foreground">{prop.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Free trial callout */}
        <div className="max-w-2xl mx-auto mb-16">
          <Card className="glass border-2 border-emerald-500/50">
            <CardContent className="pt-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">
                Start Your 30-Day Free Trial
              </h2>
              <p className="text-muted-foreground mb-4">
                Full access to all features — No credit card required
              </p>
              <Button
                size="lg"
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
                onClick={scrollToForm}
              >
                Get Started Free
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Pricing preview */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Therapist Plans</h2>
            <p className="text-muted-foreground">After your free trial, choose the plan that fits your practice</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {therapistPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`glass relative ${plan.popular ? 'border-amber-500 border-2' : 'border-white/10'}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-amber-500 text-white">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-sm">{plan.description}</CardDescription>
                  <div className="mt-3">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
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
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 4: Signup form */}
        <div ref={formRef} className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Start Your Therapist Account</h2>
            <p className="text-muted-foreground">Begin your 30-day free trial today</p>
          </div>
          <div className="max-w-md mx-auto">
            <Authentication
              setUserId={setUserId}
              preSelectedUserType="therapist"
              formOnly={true}
              defaultMode="signup"
            />
          </div>
        </div>

        {/* Section 5: Footer */}
        <div className="text-center pt-8 border-t border-white/10">
          <p className="text-xs text-muted-foreground mb-4">
            Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
          </p>
          <div className="flex justify-center gap-4 text-xs text-muted-foreground">
            <button onClick={() => setLocation('/faq')} className="hover:text-white transition-colors">
              FAQ
            </button>
            <span>•</span>
            <button className="hover:text-white transition-colors">
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
