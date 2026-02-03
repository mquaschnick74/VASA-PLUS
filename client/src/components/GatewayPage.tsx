// client/src/components/GatewayPage.tsx
// Full-screen gateway page for user path selection - Two-column layout

import { useLocation, Link } from 'wouter';
import { Mic, Headphones, PenLine, Play, Sparkles } from 'lucide-react';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';
import phoneMockup from '@root-assets/phone-mockup.png';

interface GatewayPageProps {
  onTryDemo: () => void;
}

export default function GatewayPage({ onTryDemo }: GatewayPageProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen gradient-bg">
      {/* Top bar */}
      <div className="sticky top-0 left-0 right-0 flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 z-50">
        <img src={vasaLogo} alt="iVASA" className="h-8 md:h-10" />
        <button
          onClick={() => setLocation('/login')}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
        >
          Log in
        </button>
      </div>

      {/* Main content area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] pt-8">
        {/* Full-width heading section */}
        <div className="text-center mb-12 mt-4">
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
            <img src={phoneMockup} alt="iVASA App" className="max-w-sm lg:max-w-md w-full h-auto drop-shadow-2xl" />
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
                  onClick={() => setLocation('/signup/individual')}
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
                  onClick={() => setLocation('/ai-assisted-therapy')}
                  className="w-full p-4 rounded-xl border border-emerald-400/40 hover:border-emerald-400 hover:bg-emerald-400/10 bg-white/5 text-left cursor-pointer transition-all duration-200 hover:scale-[1.01]"
                >
                  <div>
                    <p className="font-semibold text-white">AI-Assisted Therapy</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      One-on-one with a licensed clinician, enhanced by AI
                    </p>
                  </div>
                </button>

                {/* Button 3: Therapist or Clinic */}
                <button
                  onClick={() => setLocation('/signup/therapist')}
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

              {/* Demo link — inside the card, below the three buttons */}
              <div className="mt-6 pt-5 border-t border-white/10">
                <button
                  onClick={onTryDemo}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                >
                  <Mic className="w-4 h-4" />
                  <span className="font-medium text-sm">Try a Free 5-Minute Demo</span>
                </button>
                <p className="text-xs text-muted-foreground text-center mt-1">No account required</p>
              </div>
            </div>
          </div>
        </div>

        {/* Explore Resources card — below the main card */}
        <Link href="/learn-more">
          <div className="glass rounded-2xl border border-white/10 p-6 md:p-8 max-w-3xl mx-auto mt-8 cursor-pointer hover:border-white/20 transition-all duration-300 group">

            {/* Heading */}
            <h3 className="text-lg sm:text-xl font-semibold text-center mb-6">Explore Resources</h3>

            {/* Resource items — 2x2 grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Headphones className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Meditation Library</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Guided sessions for grounding and self-reflection</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <PenLine className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Blog</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Articles on depth psychology, growth, and the therapeutic process</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Play className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Video Library</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Talks and explainers on how depth therapy works</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Pricing</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Explore plans for individuals and therapists</p>
                </div>
              </div>

            </div>

            {/* Subtle arrow hint */}
            <p className="text-xs text-muted-foreground text-center mt-5 group-hover:text-white/60 transition-colors">
              Tap to explore →
            </p>

          </div>
        </Link>

        {/* Page footer */}
        <div className="mt-8 pb-6 text-center">
          <p className="text-xs text-muted-foreground">
            Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
          </p>
        </div>
      </div>
    </div>
  );
}
