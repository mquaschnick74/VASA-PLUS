// client/src/components/GatewayPage.tsx
// Full-screen gateway page for user path selection - Two-column layout

import { ExternalLink } from 'lucide-react';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';
// import phoneMockup from '@assets/phone-mockup.png'; // Uncomment when image is added

interface GatewayPageProps {
  onSelectPath: (userType: 'individual' | 'therapist') => void;
  onTryDemo: () => void;
  onSignIn: () => void;
}

export default function GatewayPage({ onSelectPath, onTryDemo, onSignIn }: GatewayPageProps) {
  return (
    <div className="min-h-screen gradient-bg">
      {/* Top bar */}
      <div className="sticky top-0 left-0 right-0 flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 z-50">
        <img src={vasaLogo} alt="iVASA" className="h-8 md:h-10" />
        <button
          onClick={onSignIn}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
        >
          Log in
        </button>
      </div>

      {/* Main content area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        {/* Full-width heading section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">
            AI-Depth Therapy
          </h1>
          <p className="text-xl md:text-2xl text-emerald-400 italic mt-3">
            Get to the core of the problem.
          </p>
          <p className="text-base md:text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
            A licensed clinician, AI that actually understands you, or both — you choose.
          </p>
        </div>

        {/* Two-column section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center w-full max-w-6xl">
          {/* Left column - Phone mockup (hidden on mobile) */}
          <div className="hidden md:flex items-center justify-center">
            {/* Placeholder for phone mockup - uncomment when image is added */}
            {/* <img src={phoneMockup} alt="iVASA App" className="max-w-sm lg:max-w-md w-full h-auto drop-shadow-2xl" /> */}
            <div className="max-w-sm lg:max-w-md w-full h-[500px] rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Phone mockup placeholder</p>
            </div>
          </div>

          {/* Right column - Glass card with options */}
          <div className="flex justify-center">
            <div className="glass rounded-2xl border border-white/10 p-6 md:p-8 w-full max-w-md">
              {/* Free trial banner */}
              <div className="text-center bg-amber-500/10 border border-amber-500/30 rounded-lg py-2 px-3 mb-6">
                <p className="text-sm font-semibold text-amber-400">
                  30-Day Free Trial with 180 Minutes — No Credit Card Required
                </p>
              </div>

              {/* Question heading */}
              <h2 className="text-xl font-semibold text-white text-center mb-6">
                What are you looking for?
              </h2>

              {/* Three stacked option buttons */}
              <div className="flex flex-col gap-3">
                {/* Button 1: AI Therapy */}
                <button
                  onClick={() => onSelectPath('individual')}
                  className="w-full p-4 rounded-xl border border-purple-400/40 hover:border-purple-400 hover:bg-purple-400/10 bg-white/5 text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-white">AI Therapy</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Depth therapy powered by AI, available anytime
                      </p>
                    </div>
                  </div>
                </button>

                {/* Button 2: AI-Assisted Therapy */}
                <button
                  onClick={() => window.open('https://www.uptowntherapympls.com', '_blank')}
                  className="w-full p-4 rounded-xl border border-emerald-400/40 hover:border-emerald-400 hover:bg-emerald-400/10 bg-white/5 text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-white">AI-Assisted Therapy</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        One-on-one with a licensed clinician, enhanced by AI
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </button>

                {/* Button 3: Therapist or Clinic */}
                <button
                  onClick={() => onSelectPath('therapist')}
                  className="w-full p-4 rounded-xl border border-amber-400/40 hover:border-amber-400 hover:bg-amber-400/10 bg-white/5 text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-white">I'm a Therapist or Clinic</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Augment your practice with AI, generate leads, track progress
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Divider and demo section */}
              <div className="mt-6 pt-6 border-t border-white/10 text-center">
                <p className="text-sm text-muted-foreground">Want to try it first?</p>
                <button
                  onClick={onTryDemo}
                  className="text-emerald-400 hover:text-emerald-300 text-sm font-medium cursor-pointer transition-colors mt-1 inline-block"
                >
                  Try a Free 5-Minute Demo
                </button>
              </div>

              {/* Footer text inside card */}
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Your conversations are private and secure
              </p>
            </div>
          </div>
        </div>

        {/* Page footer */}
        <div className="mt-12 pb-6 text-center">
          <p className="text-xs text-muted-foreground">
            Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
          </p>
        </div>
      </div>
    </div>
  );
}
