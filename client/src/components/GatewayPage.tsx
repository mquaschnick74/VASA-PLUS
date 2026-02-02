// client/src/components/GatewayPage.tsx
// Full-screen gateway page for user path selection

import { Users, Brain, Building2, ExternalLink } from 'lucide-react';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';

interface GatewayPageProps {
  onSelectPath: (userType: 'individual' | 'therapist') => void;
  onTryDemo: () => void;
  onSignIn: () => void;
}

export default function GatewayPage({ onSelectPath, onTryDemo, onSignIn }: GatewayPageProps) {
  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Top bar */}
      <div className="flex justify-between items-center px-6 py-4">
        <img src={vasaLogo} alt="iVASA" className="h-10" />
        <button
          onClick={onSignIn}
          className="text-sm text-emerald-400 hover:underline transition-colors"
        >
          Sign In
        </button>
      </div>

      {/* Hero heading section */}
      <div className="text-center mt-12 md:mt-20 px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white">
          AI-Depth Therapy
        </h1>
        <p className="text-xl md:text-2xl italic text-emerald-400 mt-3">
          Get to the core of the problem.
        </p>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mt-4">
          A licensed clinician, AI that actually understands you, or both — you choose.
        </p>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mt-10 mb-6">
          Choose your path
        </p>
      </div>

      {/* Three pathway cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto px-4">
        {/* Card 1: AI-Assisted Therapy */}
        <div
          onClick={() => window.open('https://www.uptowntherapympls.com', '_blank')}
          className="glass rounded-2xl p-6 cursor-pointer transition-all duration-200 border border-emerald-400/30 hover:border-emerald-400/60 hover:scale-[1.02] relative"
        >
          <ExternalLink className="w-4 h-4 text-muted-foreground absolute top-4 right-4" />
          <Users className="w-8 h-8 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white mt-4">AI-Assisted Therapy</h3>
          <p className="text-sm text-muted-foreground mt-2">
            One-on-one with a licensed clinician, enhanced by AI that tracks your progress between sessions.
          </p>
        </div>

        {/* Card 2: AI Therapy */}
        <div
          onClick={() => onSelectPath('individual')}
          className="glass rounded-2xl p-6 cursor-pointer transition-all duration-200 border border-purple-400/30 hover:border-purple-400/60 hover:scale-[1.02]"
        >
          <Brain className="w-8 h-8 text-purple-400" />
          <h3 className="text-lg font-semibold text-white mt-4">AI Therapy</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Depth therapy powered by AI. Available anytime, built on 25+ years of clinical research.
          </p>
        </div>

        {/* Card 3: I'm a Therapist or Clinic */}
        <div
          onClick={() => onSelectPath('therapist')}
          className="glass rounded-2xl p-6 cursor-pointer transition-all duration-200 border border-amber-400/30 hover:border-amber-400/60 hover:scale-[1.02]"
        >
          <Building2 className="w-8 h-8 text-amber-400" />
          <h3 className="text-lg font-semibold text-white mt-4">I'm a Therapist or Clinic</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Augment your practice with AI. Generate leads, extend care between sessions, and track client progress.
          </p>
        </div>
      </div>

      {/* Try iVASA Free section */}
      <div className="text-center mt-12">
        <p className="text-sm text-muted-foreground">Want to try it first?</p>
        <button
          onClick={onTryDemo}
          className="mt-3 text-emerald-400 border border-emerald-400/30 rounded-xl px-6 py-2 hover:bg-emerald-400/10 transition-all"
        >
          Try a Free 5-Minute Demo
        </button>
      </div>

      {/* Footer tagline */}
      <div className="mt-auto pb-6 text-center px-4">
        <p className="text-xs text-muted-foreground">
          Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
        </p>
      </div>
    </div>
  );
}
