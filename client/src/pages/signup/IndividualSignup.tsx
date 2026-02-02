// client/src/pages/signup/IndividualSignup.tsx
// Dedicated signup page for individual AI therapy users

import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, Clock, Shield, Brain, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Authentication from '@/components/authentication';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';

interface IndividualSignupProps {
  setUserId: (id: string) => void;
}

export default function IndividualSignup({ setUserId }: IndividualSignupProps) {
  const [, setLocation] = useLocation();
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Individual pricing plans
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
        'CSS Pattern Tracking',
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
        'CSS Pattern Tracking',
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
        'Advanced CSS Tracking',
        'Custom agent configuration',
        'Detailed progress reports',
      ],
      popular: false,
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
          <img src={vasaLogo} alt="iVASA" className="h-8 md:h-10" />
        </div>
        <button
          onClick={() => setLocation('/')}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
        >
          Log in
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Section 1: Hero */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-purple-500/20 text-purple-400 border-purple-500/30">
            <Brain className="w-3 h-3 mr-1" />
            AI Therapy
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            AI-Depth Therapy
          </h1>
          <p className="text-xl md:text-2xl text-emerald-400 italic mb-4">
            Get to the core of the problem.
          </p>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Depth therapy powered by AI. Available anytime, built on 25+ years of clinical research.
          </p>

          {/* Trust signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Sparkles className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">25+ years of clinical research</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Brain className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">1,000+ therapeutic sessions</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Clock className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">Available 24/7</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Shield className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">Completely confidential</span>
            </div>
          </div>
        </div>

        {/* Section 2: Free trial callout */}
        <div className="max-w-2xl mx-auto mb-16">
          <Card className="glass border-2 border-emerald-500/50">
            <CardContent className="pt-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">
                Start Your 30-Day Free Trial
              </h2>
              <p className="text-muted-foreground mb-4">
                180 minutes of voice time — No credit card required
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
            <h2 className="text-3xl font-bold text-white mb-2">Choose Your Plan</h2>
            <p className="text-muted-foreground">After your free trial, continue with a plan that fits your needs</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {individualPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`glass relative ${plan.popular ? 'border-emerald-500 border-2' : 'border-white/10'}`}
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
        </div>

        {/* Section 4: Signup form */}
        <div ref={formRef} className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Create Your Free Account</h2>
            <p className="text-muted-foreground">Start your 30-day free trial today</p>
          </div>
          <Authentication
            setUserId={setUserId}
            preSelectedUserType="individual"
            onBack={() => setLocation('/')}
          />
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
