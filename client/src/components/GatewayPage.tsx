// client/src/components/GatewayPage.tsx
// Premium landing page — dark, sophisticated, mobile-first design

import { useLocation, Link } from 'wouter';
import { Mic, Headphones, PenLine, Play, Sparkles, Brain, Users, Building2, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

          {/* Phone frame — visible on ALL screens */}
          {/* Mobile: appears first (order-first). Desktop: appears on the right (order-last) */}
          <div className="order-first md:order-last flex-shrink-0">
            <button
              onClick={onTryDemo}
              className="cursor-pointer group md:animate-float hover:glow-emerald transition-shadow duration-500 rounded-[2.5rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Phone outer shell */}
              <div className="relative w-[220px] h-[440px] sm:w-[260px] sm:h-[520px] rounded-[2.5rem] border-4 border-white/20 bg-gradient-to-b from-white/10 to-white/5 shadow-2xl p-2">
                {/* Notch */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 bg-black/60 rounded-full z-10" />
                {/* Inner screen */}
                <div className="w-full h-full rounded-[2rem] overflow-hidden bg-background flex flex-col items-center justify-center gap-6 px-4">
                  {/* Pulsing mic circle */}
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-slow scale-125" />
                    <div className="relative w-20 h-20 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                      <Mic className="w-8 h-8 text-primary" />
                    </div>
                  </div>
                  {/* Waveform bars */}
                  <div className="flex items-end gap-1.5 h-8">
                    <div className="w-1 h-3 rounded-full bg-primary/30 animate-pulse-slow" />
                    <div className="w-1 h-5 rounded-full bg-primary/25" />
                    <div className="w-1 h-8 rounded-full bg-primary/35 animate-pulse-slow" />
                    <div className="w-1 h-6 rounded-full bg-primary/25" />
                    <div className="w-1 h-4 rounded-full bg-primary/30 animate-pulse-slow" />
                  </div>
                  {/* Label */}
                  <p className="text-sm text-muted-foreground group-hover:text-primary transition-colors text-center">
                    Tap to experience a session
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Text + CTAs */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left max-w-xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight">
              Get to the Core of the Problem.
            </h1>
            <p className="text-lg text-muted-foreground mt-3 mb-8">
              Depth therapy, powered by AI. Finally.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setLocation('/signup/individual')}
              >
                <Brain className="w-5 h-5" />
                Connect with an AI Guide
              </Button>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setLocation('/ai-assisted-therapy')}
              >
                <Users className="w-5 h-5" />
                AI-Assisted Therapy with a Real Human
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto mt-1"
                onClick={() => setLocation('/signup/therapist')}
              >
                <Building2 className="w-5 h-5" />
                For Therapists &amp; Clinics
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center md:text-left mt-3 w-full">
              30-day free trial · 180 minutes · No credit card required
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
