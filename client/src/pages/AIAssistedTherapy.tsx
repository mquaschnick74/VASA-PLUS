import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  Brain,
  TrendingUp,
  Clock,
  Shield,
  Lock,
  Heart,
  Stethoscope,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Users,
  MessageCircle,
  MapPin,
  ExternalLink,
} from 'lucide-react';

const therapists = [
  {
    name: 'Uptown Therapy MPLS',
    location: 'Minneapolis, MN',
    description: 'Uptown Therapy MPLS specializes in depth psychology and integrative therapeutic approaches. With over 25 years of clinical experience, our practice combines traditional one-on-one therapy with cutting-edge AI-assisted tools to help you get to the core of what\'s holding you back.',
    specialties: ['Depth Psychology', 'Trauma', 'Anxiety', 'Relationships', 'Personal Growth'],
    website: 'https://www.uptowntherapympls.com',
    featured: true
  }
];

export default function AIAssistedTherapy() {
  const [, setLocation] = useLocation();

  // SEO meta tags
  useEffect(() => {
    document.title = 'iVASA — AI-Depth Therapy | Clinical Depth at Your Fingertips';

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        if (name.startsWith('og:')) {
          el.setAttribute('property', name);
        } else {
          el.setAttribute('name', name);
        }
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('description', 'iVASA delivers clinical-depth AI therapy with 24/7 voice access. Pattern recognition across every conversation. Built on 25+ years of therapeutic methodology. 30-day free trial.');
    setMeta('og:title', 'iVASA — Clinical Depth at Your Fingertips');
    setMeta('og:description', 'AI-depth therapy that listens for what\'s beneath your words. Voice-first conversations with AI therapeutic guides, available 24/7. Start your free trial.');
    setMeta('og:type', 'website');
    setMeta('og:url', window.location.href);
  }, []);

  return (
    <div className="min-h-screen gradient-bg">
      {/* Sticky top bar — Back + Logo left, Log in right */}
      <div className="sticky top-0 z-50 w-full flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <img src="/apple-touch-icon.png" alt="iVASA" className="h-8" />
        </div>
        <button onClick={() => setLocation('/login')} className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          Log in
        </button>
      </div>

      {/* ============================================================
          SECTION 1: HERO — What iVASA Actually Does
          ============================================================ */}
      <section className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-6" variant="secondary">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Depth Therapy
          </Badge>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
            Clinical Depth.{' '}
            <span className="text-emerald-400">Always Available.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mt-6 max-w-2xl mx-auto">
            iVASA translates what you say into what you mean — revealing patterns you can't see alone.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Button
              size="lg"
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-6 text-lg"
              onClick={() => setLocation('/signup/individual')}
            >
              Start Your Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/20 hover:bg-white/5 px-8 py-6 text-lg"
              onClick={() => setLocation('/public-pricing')}
            >
              View Pricing
            </Button>
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            30 days free with 180 minutes — no credit card required
          </p>
        </div>
      </section>

      {/* Three concrete outcomes */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass border-white/10">
            <CardContent className="pt-6">
              <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mb-4">
                <Mic className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white text-lg mb-2">Speak, and Be Heard with Depth</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                iVASA listens for what's beneath your words, not just what's on the surface. Voice-first conversations with AI therapeutic guides available 24/7.
              </p>
            </CardContent>
          </Card>

          <Card className="glass border-white/10">
            <CardContent className="pt-6">
              <div className="w-12 h-12 rounded-full bg-purple-400/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="font-semibold text-white text-lg mb-2">Patterns Revealed Across Sessions</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                iVASA tracks contradictions between what you say and what you do, recurring themes you can't see yourself, and the moments where real shifts happen.
              </p>
            </CardContent>
          </Card>

          <Card className="glass border-white/10">
            <CardContent className="pt-6">
              <div className="w-12 h-12 rounded-full bg-blue-400/10 flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-semibold text-white text-lg mb-2">Your Story Remembered, Your Growth Tracked</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every session builds on the last. No starting over. No repeating yourself. A continuous therapeutic relationship that deepens over time.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ============================================================
          SECTION 2: HOW iVASA IS DIFFERENT — The Gap It Fills
          ============================================================ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              The Gap Between <span className="text-purple-400">Chatbots</span> and{' '}
              <span className="text-emerald-400">Therapy</span>
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Most people fall into a gap: apps are too shallow, therapy is too expensive or hard to access. iVASA fills that space.
            </p>
          </div>

          <div className="space-y-4">
            {/* Self-help apps */}
            <div className="glass rounded-2xl border border-white/10 p-6 flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-gray-500/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-gray-400" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                  <h3 className="font-semibold text-white">Self-Help Apps & Chatbots</h3>
                  <span className="text-sm text-muted-foreground">$0–15/month</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scripted exercises. No memory. Surface-level coping tips. Like a self-help book that talks back.
                </p>
              </div>
            </div>

            {/* Teletherapy */}
            <div className="glass rounded-2xl border border-white/10 p-6 flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                  <h3 className="font-semibold text-white">Teletherapy Platforms</h3>
                  <span className="text-sm text-muted-foreground">$260–400/month</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Real therapists, but scheduled appointments, weeks to start, limited between-session support.
                </p>
              </div>
            </div>

            {/* Traditional therapy */}
            <div className="glass rounded-2xl border border-white/10 p-6 flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-amber-400" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                  <h3 className="font-semibold text-white">Traditional Therapy</h3>
                  <span className="text-sm text-muted-foreground">$600–1,200/month</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Deep and effective, but expensive, limited hours, geographic barriers, long waitlists.
                </p>
              </div>
            </div>

            {/* iVASA — highlighted */}
            <div className="glass rounded-2xl border-2 border-emerald-400/40 p-6 flex flex-col sm:flex-row sm:items-start gap-4 relative">
              <div className="absolute -top-3 left-6">
                <Badge className="bg-emerald-500 text-white">iVASA</Badge>
              </div>
              <div className="flex-shrink-0 mt-1">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                  <h3 className="font-semibold text-white">iVASA AI-Depth Therapy</h3>
                  <span className="text-sm text-emerald-400 font-medium">$7.99–37.99/month</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Clinical depth meets 24/7 voice access. Pattern recognition across every conversation. Built on 25+ years of therapeutic methodology. 30-day free trial.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 3: OUR THERAPISTS — Clinical Credibility
          ============================================================ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">Our Therapists</h2>

          {therapists.map((therapist, index) => (
            <div key={index} className="glass rounded-2xl border border-emerald-400/30 p-6 md:p-8">
              {therapist.featured && (
                <span className="inline-block text-xs font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full mb-4">Featured</span>
              )}
              <h3 className="text-xl font-semibold text-white">{therapist.name}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{therapist.location}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{therapist.description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {therapist.specialties.map((specialty, i) => (
                  <span key={i} className="bg-white/10 text-xs px-3 py-1 rounded-full text-purple-300">
                    {specialty}
                  </span>
                ))}
              </div>
              <div className="mt-6">
                <a
                  href={therapist.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10 rounded-xl px-6 py-2.5 text-sm font-medium transition-colors"
                >
                  Visit Website
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}

          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              More AI-assisted therapy providers joining soon.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Are you a therapist?{' '}
              <button onClick={() => setLocation('/signup/therapist')} className="text-amber-400 hover:text-amber-300 transition-colors">
                Partner with iVASA →
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 4: WHO IT'S FOR — Two Audiences (brief CTAs)
          ============================================================ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* For Individuals */}
            <Card className="glass border-emerald-400/20">
              <CardContent className="pt-8 pb-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">For You</h3>
                </div>

                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  You want more than an app but can't access or afford weekly therapy. iVASA gives you clinical-depth support — available 24/7, starting with a free trial.
                </p>

                <Button
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  size="lg"
                  onClick={() => setLocation('/signup/individual')}
                >
                  Start Your Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* For Therapists */}
            <Card className="glass border-purple-400/20">
              <CardContent className="pt-8 pb-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">For Therapists</h3>
                </div>

                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  Extend your therapeutic reach without extending your hours. Your clients get 24/7 AI-guided support that builds on your clinical work.
                </p>

                <Button
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                  size="lg"
                  onClick={() => setLocation('/signup/therapist')}
                >
                  Learn About Therapist Plans
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 5: TRUST & PRIVACY
          ============================================================ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white">Built on Trust</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-3">
                <Stethoscope className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="font-semibold text-white text-sm mb-1">Clinician-Built</h4>
              <p className="text-xs text-muted-foreground">
                Built by a licensed therapist with 25+ years of clinical experience
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-purple-400/10 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="font-semibold text-white text-sm mb-1">Private & Encrypted</h4>
              <p className="text-xs text-muted-foreground">
                Conversations encrypted and private — never sold, never used to train AI
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-blue-400/10 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="font-semibold text-white text-sm mb-1">Safety-Aware</h4>
              <p className="text-xs text-muted-foreground">
                Not a replacement for crisis intervention — includes appropriate safety resources
              </p>
            </div>
          </div>

          {/* Final CTA */}
          <Card className="glass border-2 border-emerald-400/30">
            <CardContent className="py-10 text-center">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Start Your Free Trial — 30 Days Free
              </h3>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                180 minutes of voice time. Access to all AI therapeutic guides. No credit card required.
              </p>
              <Button
                size="lg"
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-6 text-lg"
                onClick={() => setLocation('/signup/individual')}
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer tagline */}
      <div className="text-center pb-8 px-4">
        <p className="text-xs text-muted-foreground">
          Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
        </p>
      </div>
    </div>
  );
}
