// client/src/components/GatewayPage.tsx
// Premium landing page — dark, sophisticated, mobile-first design

import { useLocation, Link } from 'wouter';
import { Headphones, PenLine, Play, Sparkles, Brain, Users, Building2, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import phoneMockup from '../../../assets/phone-mockup.png';

interface GatewayPageProps {
  onTryDemo: () => void;
}

export default function GatewayPage({ onTryDemo }: GatewayPageProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen gradient-bg">
      {/* Top bar */}
      <nav className="sticky top-0 left-0 right-0 flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 z-50">
        <img src="/apple-touch-icon.png" alt="iVASA" className="h-8 md:h-10" />
        <Button
          variant="ghost"
          onClick={() => setLocation('/login')}
        >
          Log in
        </Button>
      </nav>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Hero section */}
        <section className="min-h-[calc(100vh-80px)] flex flex-col md:flex-row items-center justify-center gap-10 lg:gap-16 pt-8 pb-16">

          {/* Phone mockup — visible on ALL screens */}
          {/* Mobile: appears first (order-first). Desktop: appears on the right (order-last) */}
          <div className="order-first md:order-last flex-shrink-0 md:animate-float">
            <div className="relative origin-top scale-[0.65] sm:scale-[0.80] md:scale-100 -mb-52 sm:-mb-28 md:mb-0">
              {/* Arrow affordance — outside the phone, upper-left (desktop only) */}
              <div className="hidden md:block absolute -top-8 -left-36 pointer-events-none select-none z-10">
                <img
                  src="/try-live-session.png"
                  alt="Try a live session"
                  className="w-48 opacity-90"
                />
              </div>
              <p className="md:hidden text-xs text-muted-foreground text-center mt-3 tracking-wide">
                Tap to try a live session ↑
              </p>
              {/* Phone button */}
              <button
                onClick={onTryDemo}
                className="cursor-pointer group relative"
              >
                <img
                  src={phoneMockup}
                  alt="iVASA App"
                  className="max-w-sm lg:max-w-md w-full h-auto drop-shadow-2xl transition-all duration-300 group-hover:brightness-110 group-hover:scale-[1.02]"
                />
              </button>
            </div>
          </div>

          {/* Text + CTAs */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left max-w-xl -mt-8 md:mt-0">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight mb-3">
              You already know something's there.
            </h1>

            {/* CTA buttons */}
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto justify-start px-6 bg-emerald-500 hover:bg-emerald-600 border border-white/60"
                onClick={() => setLocation('/signup/individual')}
              >
                <Brain className="w-5 h-5" />
                Connect with an AI Guide
              </Button>
            </div>

            <p className="text-lg text-muted-foreground mt-3">
              We help you find it.
            </p>

            <p className="text-xs text-muted-foreground text-center md:text-left mt-3 w-full">
              No credit card required · The story unfolding before your eyes will show you its value.
            </p>
          </div>
        </section>

        {/* Testimonials section — auto-scrolling carousel */}
        <div
          className="w-full max-w-5xl mx-auto mt-12 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          }}
        >
          <p className="text-sm text-muted-foreground text-center mb-5 tracking-wide uppercase">
            Trusted by real people
          </p>
          <style>{`
            @keyframes testimonial-scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .testimonial-track {
              animation: testimonial-scroll 35s linear infinite;
            }
            .testimonial-track:hover {
              animation-play-state: paused;
            }
          `}</style>
          <div className="testimonial-track flex gap-4" style={{ width: 'max-content' }}>
            {/* Two identical sets for seamless infinite loop */}
            {[0, 1].map((setIndex) => (
              <div key={setIndex} className="flex gap-4">
                {/* Daniel — individual user */}
                <div className="glass-card rounded-2xl border border-white/10 border-t-2 border-t-primary p-5 flex flex-col w-[320px] flex-shrink-0">
                  <Quote className="w-5 h-5 text-emerald-400/60 mb-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed italic flex-1">
                    "I went in skeptical — another chatbot, right? But within the first session it asked me something no one had ever asked before. I actually sat there in silence for a minute. That's when I knew this was different."
                  </p>
                  <p className="text-sm font-semibold text-white mt-4">Daniel</p>
                </div>

                {/* Mathew — therapist perspective */}
                <div className="glass-card rounded-2xl border border-white/10 border-t-2 border-t-primary p-5 flex flex-col w-[320px] flex-shrink-0">
                  <Quote className="w-5 h-5 text-emerald-400/60 mb-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed italic flex-1">
                    "Some of my clients used to spiral between sessions with nowhere to turn. Now they have iVASA as a bridge — it picks up where we left off and holds the thread until our next appointment. It's extended my practice in ways I couldn't have imagined."
                  </p>
                  <p className="text-sm font-semibold text-white mt-4">Mathew</p>
                </div>

                {/* Chris — technical/professional user */}
                <div className="glass-card rounded-2xl border border-white/10 border-t-2 border-t-primary p-5 flex flex-col w-[320px] flex-shrink-0">
                  <Quote className="w-5 h-5 text-emerald-400/60 mb-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed italic flex-1">
                    "I've built AI products. I know what's out there. iVASA isn't just pattern matching on keywords — there's a real therapeutic framework underneath. The way it tracks themes across conversations and surfaces connections is genuinely sophisticated."
                  </p>
                  <p className="text-sm font-semibold text-white mt-4">Chris</p>
                </div>

                {/* Terri — personal user perspective */}
                <div className="glass-card rounded-2xl border border-white/10 border-t-2 border-t-primary p-5 flex flex-col w-[320px] flex-shrink-0">
                  <Quote className="w-5 h-5 text-emerald-400/60 mb-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed italic flex-1">
                    "I never thought I'd open up to an AI, but iVASA doesn't feel like talking to a machine. It remembered something I mentioned three weeks ago and connected it to what I was struggling with today. That kind of continuity changed everything for me."
                  </p>
                  <p className="text-sm font-semibold text-white mt-4">Terri</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary paths — high contrast against deep purple background */}
        <div className="flex items-center gap-4 mt-14 mb-5 max-w-xl mx-auto px-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/30" />
          <p className="text-xs font-semibold text-white/80 tracking-[0.2em] uppercase whitespace-nowrap">
            Other Options
          </p>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/30" />
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="lg"
            className="w-full sm:w-auto justify-center px-7 bg-amber-500/25 border border-amber-400/70 text-amber-100 hover:bg-amber-500/40 hover:border-amber-300 hover:text-white shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:shadow-[0_0_30px_rgba(251,191,36,0.5)]"
            onClick={() => setLocation('/ai-assisted-therapy')}
          >
            <Users className="w-5 h-5 mr-2" />
            AI-Assisted Therapy with a Real Human
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full sm:w-auto justify-center px-7 bg-sky-500/25 border border-sky-400/70 text-sky-100 hover:bg-sky-500/40 hover:border-sky-300 hover:text-white shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_30px_rgba(56,189,248,0.5)]"
            onClick={() => setLocation('/signup/therapist')}
          >
            <Building2 className="w-5 h-5 mr-2" />
            For Therapists &amp; Clinics
          </Button>
        </div>

        {/* Explore Resources card */}
        <Link href="/learn-more">
          <div className="glass-card rounded-2xl border border-white/10 p-6 md:p-8 max-w-3xl mx-auto mt-8 cursor-pointer hover:border-white/20 transition-all duration-300 group">

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
                  <p className="text-xs text-muted-foreground mt-0.5">The price of a space where depth becomes possible</p>
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
