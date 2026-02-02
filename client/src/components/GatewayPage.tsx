// client/src/components/GatewayPage.tsx
// Full-screen gateway page for user path selection - BetterHelp-style stacked layout

import { ExternalLink } from 'lucide-react';
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
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-6 py-4 z-10">
        <img src={vasaLogo} alt="iVASA" className="h-8" />
        <button
          onClick={onSignIn}
          className="text-sm text-muted-foreground hover:text-white transition-colors"
        >
          Log in
        </button>
      </div>

      {/* Centered content area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-xl">
          {/* Heading */}
          <h1 className="text-3xl md:text-4xl font-bold text-white text-center">
            AI-Depth Therapy
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-emerald-400 italic text-center mt-2">
            Get to the core of the problem.
          </p>

          {/* Description */}
          <p className="text-sm md:text-base text-muted-foreground text-center mt-3 max-w-md mx-auto">
            A licensed clinician, AI that actually understands you, or both — you choose.
          </p>

          {/* Question prompt */}
          <p className="text-lg font-medium text-white text-center mt-10 mb-4">
            What are you looking for?
          </p>

          {/* Three stacked selection buttons */}
          <div className="flex flex-col gap-3 w-full max-w-md mx-auto">
            {/* Button 1: AI Therapy */}
            <button
              onClick={() => onSelectPath('individual')}
              className="w-full p-4 rounded-xl border border-purple-400/30 hover:border-purple-400/60 hover:bg-purple-400/10 bg-white/5 backdrop-blur-sm text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]"
            >
              <span className="font-medium text-white">AI Therapy</span>
              <span className="text-muted-foreground text-sm"> — depth therapy powered by AI, available anytime</span>
            </button>

            {/* Button 2: AI-Assisted Therapy */}
            <button
              onClick={() => window.open('https://www.uptowntherapympls.com', '_blank')}
              className="w-full p-4 rounded-xl border border-emerald-400/30 hover:border-emerald-400/60 hover:bg-emerald-400/10 bg-white/5 backdrop-blur-sm text-left cursor-pointer transition-all duration-200 hover:scale-[1.01] flex items-center justify-between"
            >
              <div>
                <span className="font-medium text-white">AI-Assisted Therapy</span>
                <span className="text-muted-foreground text-sm"> — one-on-one with a licensed clinician, enhanced by AI</span>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-2" />
            </button>

            {/* Button 3: Therapist or Clinic */}
            <button
              onClick={() => onSelectPath('therapist')}
              className="w-full p-4 rounded-xl border border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-400/10 bg-white/5 backdrop-blur-sm text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]"
            >
              <span className="font-medium text-white">I'm a Therapist or Clinic</span>
              <span className="text-muted-foreground text-sm"> — augment your practice with AI, generate leads, track client progress</span>
            </button>
          </div>

          {/* Try free section */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">Want to try it first?</p>
            <button
              onClick={onTryDemo}
              className="text-sm text-emerald-400 hover:text-emerald-300 cursor-pointer transition-colors mt-1"
            >
              Try a Free 5-Minute Demo
            </button>
          </div>
        </div>
      </div>

      {/* Footer tagline */}
      <div className="pb-6 text-center px-4">
        <p className="text-xs text-muted-foreground">
          Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
        </p>
      </div>
    </div>
  );
}
