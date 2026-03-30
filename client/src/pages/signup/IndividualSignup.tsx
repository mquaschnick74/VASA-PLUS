// client/src/pages/signup/IndividualSignup.tsx
// Individual user signup page — experience-focused, commitment architecture

import { useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Clock, Shield, Brain, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Here's where you find it.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            A guide that holds the full thread of your story. Available the moment something surfaces.
          </p>

          {/* Experience outcomes */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Sparkles className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">
                Your guide finds the thread running through everything you bring
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Brain className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">
                Each session picks up exactly where the last one ended
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Clock className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">
                The moment something surfaces, you have somewhere to take it
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
              <Shield className="w-5 h-5 text-purple-400 mb-2" />
              <span className="text-xs text-muted-foreground text-center">
                What you say stays between you and your guide
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Commitment callout */}
        <div className="max-w-2xl mx-auto mb-10">
          <Card className="glass border-2 border-emerald-500/50">
            <CardContent className="pt-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">
                Show up three times. We find you something.
              </h2>
              <p className="text-muted-foreground mb-4">
                No credit card required · Start free. Stay when it matters.
              </p>
              <Button
                size="lg"
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
                onClick={scrollToForm}
              >
                Begin your first session
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Pricing link */}
        <div className="text-center mb-16">
          <p className="text-sm text-muted-foreground">
            Curious about what it costs?{' '}
            <button
              onClick={() => setLocation('/pricing')}
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
            >
              View pricing
            </button>
          </p>
        </div>

        {/* Section 4: Signup form */}
        <div ref={formRef} className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Create your account</h2>
            <p className="text-muted-foreground">
              No credit card required · Start free. Stay when it matters.
            </p>
          </div>
          <div className="max-w-md mx-auto">
            <Authentication
              setUserId={setUserId}
              preSelectedUserType="individual"
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
