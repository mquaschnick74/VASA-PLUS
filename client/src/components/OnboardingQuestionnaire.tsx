import { useState, useEffect } from 'react';
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

  // Synchronized question rotation
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Start visible
    setIsVisible(true);

    // After 4 seconds, fade out
    const fadeOutTimer = setTimeout(() => {
      setIsVisible(false);
    }, 4000);

    // After fade completes (4000ms + 1000ms fade), change question and fade in
    const changeQuestionTimer = setTimeout(() => {
      setCurrentQuestionIndex((prev) => (prev + 1) % voiceQuestions.length);
    }, 5000);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(changeQuestionTimer);
    };
  }, [currentQuestionIndex]);

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
    <div className="fixed inset-0 z-50 bg-[#0f0f1a] overflow-y-auto">
      {/* Close button */}
      <button
        onClick={handleSkip}
        disabled={isSubmitting}
        className="absolute top-4 right-4 text-white hover:text-purple-400 transition-colors duration-200 p-2 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Skip onboarding"
      >
        <X size={32} />
      </button>

      {/* Main content - centered */}
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-4xl w-full space-y-12">
          {/* Error display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-center">
              {error}
            </div>
          )}

          {/* Section 1: Your Voice */}
          <div className="space-y-6 text-center">
            <h2 className="text-purple-400 text-2xl md:text-3xl lg:text-4xl font-medium">
              Your Voice.
            </h2>

            <div className="flex justify-center">
              <div className="relative w-full max-w-2xl">
                {/* Rotating question overlay */}
                {!voiceResponse && (
                  <div className="absolute inset-0 pointer-events-none flex items-start justify-start p-4 z-10">
                    <p 
                      className={`text-purple-400 italic font-light text-lg md:text-xl transition-opacity duration-1000 ${
                        isVisible ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {voiceQuestions[currentQuestionIndex]}
                    </p>
                  </div>
                )}

                <textarea
                  value={voiceResponse}
                  onChange={(e) => setVoiceResponse(e.target.value)}
                  placeholder=""
                  disabled={isSubmitting}
                  className="w-full h-32 p-4 rounded-lg
                           text-purple-400 placeholder-transparent
                           bg-[#1a1a2e]
                           border border-purple-500/30
                           focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20
                           focus:outline-none transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed
                           resize-none
                           shadow-[0_0_20px_rgba(160,32,240,0.15)]
                           focus:shadow-[0_0_30px_rgba(160,32,240,0.25)]"
                  style={{
                    boxShadow: '0 0 20px rgba(160, 32, 240, 0.15), 0 0 40px rgba(160, 32, 240, 0.1)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Your Journey */}
          <div className="space-y-6 text-center">
            <h2 className="text-purple-400 text-4xl md:text-5xl lg:text-6xl font-semibold">
              Your Journey.
            </h2>

            <div className="flex justify-center">
              <div className="relative w-full max-w-2xl">
                {/* Rotating question overlay */}
                {!journeyResponse && (
                  <div className="absolute inset-0 pointer-events-none flex items-start justify-start p-4 z-10">
                    <p 
                      className={`text-purple-400 italic font-light text-lg md:text-xl transition-opacity duration-1000 ${
                        isVisible ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {journeyQuestions[currentQuestionIndex]}
                    </p>
                  </div>
                )}

                <textarea
                  value={journeyResponse}
                  onChange={(e) => setJourneyResponse(e.target.value)}
                  placeholder=""
                  disabled={isSubmitting}
                  className="w-full h-32 p-4 rounded-lg
                           text-purple-400 placeholder-transparent
                           bg-[#1a1a2e]
                           border border-purple-500/30
                           focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20
                           focus:outline-none transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed
                           resize-none
                           shadow-[0_0_20px_rgba(160,32,240,0.15)]
                           focus:shadow-[0_0_30px_rgba(160,32,240,0.25)]"
                  style={{
                    boxShadow: '0 0 20px rgba(160, 32, 240, 0.15), 0 0 40px rgba(160, 32, 240, 0.1)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Motivational Closer */}
          <div className="space-y-8 text-center">
            <h2 className="text-purple-400 text-4xl md:text-5xl lg:text-7xl font-bold leading-tight">
              Let's see what we can do to make this happen MORE or NEVER again!
            </h2>

            {/* Submit button */}
            <div className="flex justify-center">
              <Button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="bg-purple-500 hover:bg-purple-600 text-white font-bold
                         py-6 px-12 rounded-lg text-xl
                         transition-all duration-200 transform hover:scale-105
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                         shadow-[0_0_20px_rgba(160,32,240,0.3)]
                         hover:shadow-[0_0_30px_rgba(160,32,240,0.4)]"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>

            {/* Expert messaging - mirrors landing page */}
            <div className="mt-8 text-center">
              <p className="text-purple-400/80 text-lg md:text-xl italic font-light">
                You are becoming the <span className="font-semibold text-purple-400">EXPERT</span>… 
                you can choose to answer these questions or skip them by clicking on the "X"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}