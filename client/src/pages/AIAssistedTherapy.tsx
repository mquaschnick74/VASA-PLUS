import { useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  Mic,
  Brain,
  TrendingUp,
  MapPin,
  ExternalLink,
  BookOpen,
  Shield,
  Heart,
  MessageCircle,
  Building2,
  Sparkles,
  Phone,
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

  useEffect(() => {
    document.title = 'AI-Assisted Therapy | iVASA — Clinical Depth, 24/7 Access';

    const metaDescription = document.querySelector('meta[name="description"]');
    const descriptionContent = 'iVASA translates what you say into what you mean — revealing patterns you can\'t see alone. Voice-first AI therapeutic support built by licensed therapists. $7.99–$37.99/month. 30-day free trial.';
    if (metaDescription) {
      metaDescription.setAttribute('content', descriptionContent);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = descriptionContent;
      document.head.appendChild(meta);
    }

    const ogTags = [
      { property: 'og:title', content: 'AI-Assisted Therapy | iVASA — Clinical Depth, 24/7 Access' },
      { property: 'og:description', content: descriptionContent },
      { property: 'og:type', content: 'website' },
    ];
    ogTags.forEach(({ property, content }) => {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (tag) {
        tag.setAttribute('content', content);
      } else {
        tag = document.createElement('meta');
        tag.setAttribute('property', property);
        tag.setAttribute('content', content);
        document.head.appendChild(tag);
      }
    });
  }, []);

  return (
    <div className="min-h-screen gradient-bg">
      {/* Sticky top bar */}
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

      {/* SECTION 1: HERO */}
      <section className="text-center pt-16 pb-12 px-4">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white max-w-4xl mx-auto leading-tight">
          The therapeutic support that didn't exist until now
        </h1>
        <p className="text-lg md:text-xl text-emerald-400 italic mt-4 max-w-2xl mx-auto">
          iVASA translates what you say into what you mean — revealing patterns you can't see alone.
        </p>

        {/* Three concrete outcome cards */}
        <div className="max-w-5xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass rounded-2xl border border-white/10 p-6 text-left">
            <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mb-4">
              <Mic className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white text-lg mb-2">Speak, and be heard with depth</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              iVASA listens for what's beneath your words, not just what's on the surface. Voice-first conversations with AI therapeutic guides, available 24/7.
            </p>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-6 text-left">
            <div className="w-12 h-12 rounded-full bg-purple-400/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="font-semibold text-white text-lg mb-2">Patterns revealed across sessions</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              iVASA tracks contradictions between what you say and what you do, recurring themes you can't see yourself, and the moments where real shifts happen.
            </p>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-6 text-left">
            <div className="w-12 h-12 rounded-full bg-blue-400/10 flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="font-semibold text-white text-lg mb-2">Your story remembered, your growth tracked</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every session builds on the last. No starting over. No repeating yourself. A continuous therapeutic relationship that deepens over time.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: OUR THERAPISTS (moved up — credibility before positioning) */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-3">Our Therapists</h2>
        <p className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
          Real licensed clinicians built iVASA's therapeutic methodology. This isn't chatbot therapy — it's grounded in decades of clinical practice.
        </p>

        {therapists.map((therapist, index) => (
          <div key={index} className="glass rounded-2xl p-6 md:p-8" style={{ border: '2px solid rgba(245, 158, 11, 0.7)', boxShadow: '0 0 25px rgba(245, 158, 11, 0.25), 0 0 50px rgba(245, 158, 11, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)' }}>
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

        <p className="text-sm text-muted-foreground text-center mt-6">
          More AI-assisted therapy providers joining soon.
        </p>
      </section>

      {/* SECTION 3: HOW iVASA IS DIFFERENT — "The Gap Between Chatbots and Therapy" */}
      <section className="relative py-20 mt-4 mb-4">
        {/* Subtle background shift for the entire section */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-white/[0.04] to-white/[0.02] pointer-events-none"></div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

        <div className="relative max-w-5xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-3">
            The Gap Between Chatbots and Therapy
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Most people fall into a gap: apps are too shallow, therapy is too expensive or inaccessible. iVASA fills that space.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Self-help apps — muted competitor card */}
            <div className="rounded-2xl border border-white/[0.08] bg-slate-800/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-500/20 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white/70 text-[15px]">Self-help apps & chatbots</h3>
                  <span className="text-xs text-muted-foreground/70">$0–15/month</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/70 leading-relaxed">
                Scripted exercises. No memory. Surface-level coping tips. Like a self-help book that talks back.
              </p>
            </div>

            {/* Teletherapy — muted competitor card */}
            <div className="rounded-2xl border border-white/[0.08] bg-slate-800/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-blue-400/60" />
                </div>
                <div>
                  <h3 className="font-semibold text-white/70 text-[15px]">Teletherapy platforms</h3>
                  <span className="text-xs text-muted-foreground/70">$260–400/month</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/70 leading-relaxed">
                Real therapists, but scheduled appointments, weeks to start, limited between-session support.
              </p>
            </div>

            {/* Traditional therapy — muted competitor card */}
            <div className="rounded-2xl border border-white/[0.08] bg-slate-800/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-purple-400/60" />
                </div>
                <div>
                  <h3 className="font-semibold text-white/70 text-[15px]">Traditional therapy</h3>
                  <span className="text-xs text-muted-foreground/70">$600–1,200/month</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/70 leading-relaxed">
                Deep and effective, but expensive, limited hours, geographic barriers, long waitlists.
              </p>
            </div>

            {/* iVASA — standout winner card */}
            <div
              className="rounded-2xl border-2 border-emerald-400 p-7 relative"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.04) 100%)',
                boxShadow: '0 0 25px rgba(52, 211, 153, 0.3), 0 0 50px rgba(52, 211, 153, 0.1)',
              }}
            >
              <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 z-10">
                <div className="absolute -inset-0 bg-[hsl(240,15%,6%)] rounded-full -z-10"></div>
                <span className="text-xs font-semibold text-emerald-300 bg-emerald-400/15 border border-emerald-400/40 px-4 py-1.5 rounded-full whitespace-nowrap">
                  Clinical Depth + 24/7 Access
                </span>
              </div>
              <div className="flex items-center gap-3 mb-3 mt-1">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-emerald-400">iVASA</h3>
                  <span className="text-xs text-emerald-400/70">$7.99–37.99/month</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Clinical depth meets 24/7 voice access. Pattern recognition across every conversation. Built on 25+ years of therapeutic methodology. 30-day free trial.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: WHO IT'S FOR */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-10">Who is iVASA for?</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* For Individuals */}
          <div className="glass rounded-2xl border border-emerald-400/30 p-6 md:p-8">
            <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mb-4">
              <Brain className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-emerald-400 mb-3">For Individuals</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              For people who want more than an app but can't access weekly therapy. For those between sessions who need support now. For anyone curious about therapy but not ready for a human therapist. iVASA meets you where you are.
            </p>
            <button
              onClick={() => setLocation('/signup/individual')}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors"
            >
              Start Your Free Trial
            </button>
          </div>

          {/* For Therapists */}
          <div className="glass rounded-2xl border border-amber-400/30 p-6 md:p-8">
            <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold text-amber-400 mb-3">For Therapists</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Your EHR handles your notes. iVASA handles your clients' growth between sessions. Extend your therapeutic reach without extending your hours. Give clients 24/7 AI support that works alongside your treatment plan.
            </p>
            <button
              onClick={() => setLocation('/signup/therapist')}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
            >
              Explore Therapist Plans
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 5: TRUST & PRIVACY */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <div className="glass rounded-2xl border border-white/10 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Trust & Privacy</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Built by a licensed therapist with 25+ years of clinical experience.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your conversations are encrypted and private — never sold, never used to train AI models.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                iVASA is not a replacement for human therapy — it fills the gap where human therapy isn't available or accessible.
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <p className="text-xs text-red-400/80 leading-relaxed">
              <strong>Important:</strong> iVASA is not a crisis service. If you are in immediate danger or experiencing a mental health crisis, please call 988 (Suicide & Crisis Lifeline) or text HOME to 741741 (Crisis Text Line), or call 911.
            </p>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => setLocation('/signup/individual')}
              className="px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors"
            >
              Start Your Free Trial — 30 Days Free
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <div className="text-center pb-8 px-4">
        <p className="text-xs text-muted-foreground">
          Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
        </p>
      </div>
    </div>
  );
}
