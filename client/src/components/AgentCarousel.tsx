import { useState, useEffect, useRef } from 'react';
import { THERAPEUTIC_AGENTS } from '../config/agent-configs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Agent bios for carousel display only
const AGENT_BIOS: Record<string, string> = {
  sarah: "With years of experience in emotional support, Sarah creates a warm, nurturing space for your therapeutic journey. Her gentle approach helps you explore feelings without judgment, building trust through compassionate listening. Sarah specializes in helping clients navigate life transitions, relationship challenges, and emotional overwhelm with wisdom and patience.",

  marcus: "Marcus brings high-energy motivation to performance-focused therapy. His dynamic coaching style helps you break through mental barriers and achieve your goals. With expertise in behavioral change and accountability, Marcus excels at helping driven individuals overcome self-sabotage, build confidence, and create sustainable success habits.",

  mathew: "Mathew specializes in deep therapeutic work, guiding clients through complex emotional patterns and unconscious blocks. His analytical approach uncovers root causes while maintaining emotional safety. Mathew helps clients understand the 'why' behind their struggles, facilitating profound insights that lead to lasting transformation and self-awareness.",

  zhanna: "Zhanna offers gentle, empathetic support for those navigating difficult emotions. Her calming presence creates safety for vulnerability and healing. With deep sensitivity to trauma and grief, Zhanna excels at helping clients process pain, rebuild self-compassion, and rediscover hope through patient, nurturing guidance."
};

export default function AgentCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<typeof THERAPEUTIC_AGENTS[0] | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const autoRotateInterval = useRef<NodeJS.Timeout | null>(null);

  // Auto-rotation logic (pauses when modal is open)
  useEffect(() => {
    if (!isPaused && !selectedAgent) {
      autoRotateInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % THERAPEUTIC_AGENTS.length);
      }, 5000);
    }

    return () => {
      if (autoRotateInterval.current) {
        clearInterval(autoRotateInterval.current);
      }
    };
  }, [isPaused, selectedAgent]);

  // Touch swipe handlers with preventDefault to avoid page scroll
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(0); // Reset touch end
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent page scrolling while swiping carousel
    e.preventDefault();
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

  // Navigate to previous agent
  const goToPrevious = () => {
    if (!isTransitioning) {
      setCurrentIndex((prev) => (prev - 1 + THERAPEUTIC_AGENTS.length) % THERAPEUTIC_AGENTS.length);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 600);
    }
  };

  // Navigate to next agent
  const goToNext = () => {
    if (!isTransitioning) {
      setCurrentIndex((prev) => (prev + 1) % THERAPEUTIC_AGENTS.length);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 600);
    }
  };

  // Navigate to specific agent
  const goToAgent = (index: number) => {
    if (!isTransitioning) {
      setCurrentIndex(index);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 600); // Match CSS transition time
    }
  };

  // Handle card click with debounce
  const handleCardClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();

    // Prevent clicks during transition
    if (isTransitioning) return;

    const position = getCardPosition(index);

    if (position === 'carousel-card-active') {
      // Active card - show modal
      setSelectedAgent(THERAPEUTIC_AGENTS[index]);
    } else if (position === 'carousel-card-left' || position === 'carousel-card-right') {
      // Side cards - rotate to them
      setCurrentIndex(index);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 600);
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
          {THERAPEUTIC_AGENTS.map((agent, index) => {
            const position = getCardPosition(index);
            const isClickable = position === 'carousel-card-active' || position === 'carousel-card-left' || position === 'carousel-card-right';

            return (
              <div
                key={agent.id}
                className={`carousel-card ${position}`}
                style={{
                  backgroundImage: `url(${agent.image})`,
                  pointerEvents: isClickable ? 'auto' : 'none',
                }}
                onClick={(e) => handleCardClick(e, index)}
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
            );
          })}

          {/* Left Click Zone - positioned where left card visually appears */}
          <div
            className="carousel-click-zone carousel-click-zone-left"
            onClick={goToPrevious}
            aria-label="Previous agent"
          />

          {/* Right Click Zone - positioned where right card visually appears */}
          <div
            className="carousel-click-zone carousel-click-zone-right"
            onClick={goToNext}
            aria-label="Next agent"
          />
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

      {/* Agent Bio Modal */}
      <Dialog open={selectedAgent !== null} onOpenChange={(open) => !open && setSelectedAgent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong border-2 border-emerald-500/30">
          {selectedAgent && (
            <div className="space-y-6">
              {/* Agent Header with Photo */}
              <div className="relative h-64 -m-6 mb-0 rounded-t-lg overflow-hidden">
                <img
                  src={selectedAgent.image}
                  alt={selectedAgent.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <h2 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
                    {selectedAgent.name}
                  </h2>
                  <p className="text-lg text-white/90 drop-shadow-md">
                    {selectedAgent.description}
                  </p>
                </div>
              </div>

              {/* Bio Content */}
              <div className="px-2">
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <span className="text-2xl">{selectedAgent.icon}</span>
                  About {selectedAgent.name}
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {AGENT_BIOS[selectedAgent.id]}
                </p>
              </div>

              {/* Call to Action */}
              <div className="flex items-center justify-between px-2 pt-4 border-t border-border/50">
                <p className="text-sm text-muted-foreground">
                  Ready to start your journey?
                </p>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-emerald-500 text-white font-medium hover:shadow-lg hover:shadow-emerald-500/30 transition-all"
                >
                  Begin Session
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
