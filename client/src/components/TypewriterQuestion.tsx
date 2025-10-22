import { useState, useEffect } from 'react';

interface TypewriterQuestionProps {
  questions: string[];
  intervalMs?: number;
  className?: string;
}

export function TypewriterQuestion({
  questions,
  intervalMs = 2000,
  className = ''
}: TypewriterQuestionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  // Typewriter effect - types out one character at a time
  useEffect(() => {
    const currentQuestion = questions[currentIndex];
    let charIndex = 0;
    setDisplayedText('');
    setIsTyping(true);

    const typingInterval = setInterval(() => {
      if (charIndex < currentQuestion.length) {
        setDisplayedText(currentQuestion.slice(0, charIndex + 1));
        charIndex++;
      } else {
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, 50); // 50ms per character for smooth typing

    return () => clearInterval(typingInterval);
  }, [currentIndex, questions]);

  // Rotate to next question after interval
  useEffect(() => {
    if (!isTyping) {
      const rotationTimer = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % questions.length);
      }, intervalMs);

      return () => clearTimeout(rotationTimer);
    }
  }, [isTyping, intervalMs, questions.length]);

  return (
    <p className={`text-emerald-300 italic font-light ${className}`}>
      {displayedText}
      <span className="animate-pulse ml-1">|</span>
    </p>
  );
}
