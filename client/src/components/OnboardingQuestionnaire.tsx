import { useState } from 'react';
import { TypewriterQuestion } from './TypewriterQuestion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface OnboardingQuestionnaireProps {
  userId: string;
  onComplete: () => void;
}

const voiceQuestions = [
  "What would you like to talk about today...",
  "What do you need to 'scream about' right now?",
  "What makes you happy/unhappy the most?"
];

const journeyQuestions = [
  "What of significance has happened...?",
  "In the distant past...",
  "Just yesterday...",
  "I am very excited for..."
];

export default function OnboardingQuestionnaire({ userId, onComplete }: OnboardingQuestionnaireProps) {
  const [voiceResponse, setVoiceResponse] = useState('');
  const [journeyResponse, setJourneyResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (wasSkipped: boolean = false) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/auth/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId,
          voiceResponse: wasSkipped ? '' : voiceResponse,
          journeyResponse: wasSkipped ? '' : journeyResponse,
          wasSkipped
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save onboarding responses');
      }

      onComplete();
    } catch (err) {
      console.error('Error submitting onboarding:', err);
      setError('Unable to save. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    handleSubmit(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-purple-900 via-blue-900 to-teal-900 overflow-y-auto">
      {/* Close button */}
      <button
        onClick={handleSkip}
        disabled={isSubmitting}
        className="absolute top-4 right-4 text-white hover:text-emerald-300 transition-colors duration-200 p-2 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Skip onboarding"
      >
        <X size={32} />
      </button>

      {/* Main content */}
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-4xl w-full space-y-12">
          {/* Error display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-center">
              {error}
            </div>
          )}

          {/* Section 1: Your Voice */}
          <div className="space-y-6">
            <h2 className="text-emerald-500 text-2xl md:text-3xl lg:text-4xl font-medium">
              Your Voice.
            </h2>

            <TypewriterQuestion
              questions={voiceQuestions}
              intervalMs={2000}
              className="text-lg md:text-xl min-h-[40px]"
            />

            <textarea
              value={voiceResponse}
              onChange={(e) => setVoiceResponse(e.target.value)}
              placeholder="Type your thoughts here... or leave blank"
              disabled={isSubmitting}
              className="w-full h-32 p-4 bg-white/10 border-2 border-emerald-500/50
                       rounded-lg text-white placeholder-emerald-200/50
                       focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/50
                       focus:outline-none transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed
                       resize-none"
            />
          </div>

          {/* Section 2: Your Journey */}
          <div className="space-y-6">
            <h2 className="text-emerald-500 text-4xl md:text-5xl lg:text-6xl font-semibold">
              Your Journey.
            </h2>

            <TypewriterQuestion
              questions={journeyQuestions}
              intervalMs={2000}
              className="text-lg md:text-xl min-h-[40px]"
            />

            <textarea
              value={journeyResponse}
              onChange={(e) => setJourneyResponse(e.target.value)}
              placeholder="Share your journey... or leave blank"
              disabled={isSubmitting}
              className="w-full h-32 p-4 bg-white/10 border-2 border-emerald-500/50
                       rounded-lg text-white placeholder-emerald-200/50
                       focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/50
                       focus:outline-none transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed
                       resize-none"
            />
          </div>

          {/* Section 3: Motivational Closer */}
          <div className="space-y-8">
            <h2 className="text-emerald-500 text-5xl md:text-6xl lg:text-8xl font-bold leading-tight">
              Let's see what we can do to make this happen more or NEVER again!
            </h2>

            {/* Submit button */}
            <div className="flex justify-center">
              <Button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold
                         py-6 px-12 rounded-lg text-xl
                         transition-all duration-200 transform hover:scale-105
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
