// client/src/pages/signup/ClientSignup.tsx
// Dedicated signup page for clients arriving via therapist invitation links

import { useLocation } from 'wouter';
import { ArrowLeft, Check, Shield, Clock, Brain, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Authentication from '@/components/authentication';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';

interface ClientSignupProps {
  setUserId: (id: string) => void;
}

export default function ClientSignup({ setUserId }: ClientSignupProps) {
  const [, setLocation] = useLocation();

  // What clients get - simple list
  const benefits = [
    {
      icon: Brain,
      text: 'Access to AI-powered therapeutic sessions',
    },
    {
      icon: UserPlus,
      text: 'Your therapist monitors your progress',
    },
    {
      icon: Shield,
      text: "Use your therapist's subscription — no cost to you",
    },
    {
      icon: Clock,
      text: 'Completely confidential and secure',
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
          onClick={() => setLocation('/login')}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
        >
          Log in
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Section 1: Hero */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-blue-500/20 text-blue-400 border-blue-500/30">
            <UserPlus className="w-3 h-3 mr-1" />
            Client Access
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Welcome to iVASA
          </h1>
          <p className="text-xl md:text-2xl text-blue-400 italic mb-4">
            Your therapist has invited you.
          </p>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Get started with AI-assisted therapy sessions — powered by your therapist's practice.
          </p>
        </div>

        {/* Section 2: What you get */}
        <div className="max-w-2xl mx-auto mb-12">
          <Card className="glass border-blue-400/20">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold text-white text-center mb-6">
                What You Get
              </h2>
              <ul className="space-y-4">
                {benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-muted-foreground">{benefit.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Signup form */}
        <div className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Create Your Client Account</h2>
            <p className="text-muted-foreground">Complete your registration to connect with your therapist</p>
          </div>
          {/*
            The Authentication component reads ?token and ?therapist from window.location.search
            These params are preserved in the URL when redirecting to /signup/client
          */}
          <div className="max-w-md mx-auto">
            <Authentication
              setUserId={setUserId}
              preSelectedUserType="client"
              formOnly={true}
              defaultMode="signup"
            />
          </div>
        </div>

        {/* Section 4: Footer */}
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
