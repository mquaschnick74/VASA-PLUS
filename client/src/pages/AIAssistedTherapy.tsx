import { useLocation } from 'wouter';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';
import { ArrowLeft, UserCheck, Brain, TrendingUp, MapPin, ExternalLink } from 'lucide-react';

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

  return (
    <div className="min-h-screen gradient-bg">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-50 w-full flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <img src={vasaLogo} alt="iVASA" className="h-8" />
        </div>
        <button onClick={() => setLocation('/login')} className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          Log in
        </button>
      </div>

      {/* Section 1: Hero */}
      <section className="text-center pt-12 pb-8 px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white">AI-Assisted Therapy</h1>
        <p className="text-xl md:text-2xl text-emerald-400 italic mt-3">The best of both worlds.</p>
        <p className="text-base md:text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
          One-on-one with a licensed clinician, enhanced by AI that tracks your progress and supports you between sessions.
        </p>
      </section>

      {/* Section 2: How It Works */}
      <section className="max-w-4xl mx-auto px-4 mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass rounded-2xl border border-white/10 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
              <UserCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Meet Your Therapist</h3>
            <p className="text-sm text-muted-foreground">Work one-on-one with a licensed clinician who understands depth psychology.</p>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-purple-400/10 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">AI Between Sessions</h3>
            <p className="text-sm text-muted-foreground">iVASA tracks your patterns and supports your growth between appointments.</p>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Accelerated Progress</h3>
            <p className="text-sm text-muted-foreground">The combination of human insight and AI continuity drives deeper, faster results.</p>
          </div>
        </div>
      </section>

      {/* Section 3: Therapist Listings */}
      <section className="max-w-2xl mx-auto px-4 mb-8">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Our Therapists</h2>

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
      </section>

      {/* Section 4: More Coming Soon */}
      <div className="text-center mt-4 mb-12 px-4">
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

      {/* Section 5: AI-only CTA */}
      <section className="max-w-lg mx-auto px-4 mb-12">
        <div className="glass rounded-2xl border border-purple-400/20 p-6 text-center">
          <p className="text-white font-medium">Prefer AI-only therapy?</p>
          <p className="text-sm text-muted-foreground mt-2">
            Try iVASA's AI therapy — available anytime, no appointment needed.
          </p>
          <button
            onClick={() => setLocation('/signup/individual')}
            className="mt-4 px-6 py-2.5 border border-purple-400/40 text-purple-400 hover:bg-purple-400/10 rounded-xl text-sm font-medium transition-colors"
          >
            Explore AI Therapy
          </button>
        </div>
      </section>

      {/* Section 6: Footer */}
      <div className="text-center pb-8 px-4">
        <p className="text-xs text-muted-foreground">
          Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.™
        </p>
      </div>
    </div>
  );
}
