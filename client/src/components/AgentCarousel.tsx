import { useState, useEffect, useRef } from 'react';
import { THERAPEUTIC_AGENTS } from '../config/agent-configs';

export default function AgentCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const autoRotateInterval = useRef<NodeJS.Timeout | null>(null);

  // Auto-rotation logic
  useEffect(() => {
    if (!isPaused) {
      autoRotateInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % THERAPEUTIC_AGENTS.length);
      }, 5000);
    }

    return () => {
      if (autoRotateInterval.current) {
        clearInterval(autoRotateInterval.current);
      }
    };
  }, [isPaused]);

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      setCurrentIndex((prev) => (prev + 1) % THERAPEUTIC_AGENTS.length);
    }
    if (isRightSwipe) {
      setCurrentIndex((prev) => (prev - 1 + THERAPEUTIC_AGENTS.length) % THERAPEUTIC_AGENTS.length);
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  // Get card position class based on index
  const getCardPosition = (index: number) => {
    const diff = (index - currentIndex + THERAPEUTIC_AGENTS.length) % THERAPEUTIC_AGENTS.length;

    if (diff === 0) return 'carousel-card-active';
    if (diff === 1) return 'carousel-card-right';
    if (diff === THERAPEUTIC_AGENTS.length - 1) return 'carousel-card-left';
    return 'carousel-card-hidden';
  };

  // Navigate to specific agent
  const goToAgent = (index: number) => {
    setCurrentIndex(index);
  };

  // Handle card click (only when active)
  const handleCardClick = (index: number) => {
    if (index === currentIndex) {
      // Card is active - could navigate to agent page or show details
      console.log('Active card clicked:', THERAPEUTIC_AGENTS[index].name);
      // Future: navigate to agent page
    } else {
      // Card is not active - rotate to it
      setCurrentIndex(index);
    }
  };

  return (
    <div className="w-full">
      <div
        className="carousel-container"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="carousel-track">
          {THERAPEUTIC_AGENTS.map((agent, index) => (
            <div
              key={agent.id}
              className={`carousel-card ${getCardPosition(index)}`}
              style={{
                backgroundImage: `url(${agent.image})`,
              }}
              onClick={() => handleCardClick(index)}
              role="button"
              tabIndex={index === currentIndex ? 0 : -1}
              aria-label={`${agent.name} - ${agent.description}`}
            >
              <div className="carousel-card-content">
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ textShadow: '0 4px 8px rgba(0, 0, 0, 0.8)' }}>
                  {agent.name}
                </h3>
                <p className="text-base md:text-lg text-white/90" style={{ textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)' }}>
                  {agent.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Dots */}
      <div className="carousel-dots" role="tablist" aria-label="Agent selection">
        {THERAPEUTIC_AGENTS.map((agent, index) => (
          <button
            key={agent.id}
            className={`carousel-dot ${index === currentIndex ? 'carousel-dot-active' : ''}`}
            onClick={() => goToAgent(index)}
            aria-label={`Go to ${agent.name}`}
            aria-selected={index === currentIndex}
            role="tab"
          />
        ))}
      </div>
    </div>
  );
}
