import { useState, useEffect } from 'react';

interface TypewriterQuestionProps {
  questions: string[];
  intervalMs?: number;
  className?: string;
}

export function TypewriterQuestion({
  questions,
  intervalMs = 4000,
  className = ''
}: TypewriterQuestionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Start visible
    setIsVisible(true);

    // After displaying for intervalMs, fade out
    const fadeOutTimer = setTimeout(() => {
      setIsVisible(false);
    }, intervalMs);

    // After fade out completes, change to next question
    const changeQuestionTimer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % questions.length);
    }, intervalMs + 500); // 500ms is the fade duration

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(changeQuestionTimer);
    };
  }, [currentIndex, intervalMs, questions.length]);

  return (
    <p 
      className={`text-emerald-300 italic font-light transition-opacity duration-500 ${className} ${
        isVisible ? 'opacity-90' : 'opacity-0'
      }`}
    >
      {questions[currentIndex]}
    </p>
  );
}