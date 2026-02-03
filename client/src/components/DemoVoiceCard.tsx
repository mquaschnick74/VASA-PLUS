import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Volume2 } from 'lucide-react';
import { THERAPEUTIC_AGENTS, getAgentById } from '../config/agent-configs';
import useDemoVapi from '@/hooks/use-demo-vapi';

// localStorage keys for abuse prevention
const DEMO_STORAGE_KEY = 'ivasa_demo_usage';
const MAX_DEMOS_PER_DAY = 3;

// Agent data with extended descriptions and audio
const agents = [
  {
    id: 'sarah',
    name: 'Sarah',
    tagline: 'Here for you.',
    description: "A wise and empathic guide who meets you exactly where you are. Sarah creates a warm, safe space and gently helps you see what you've been carrying — without pushing you further than you're ready to go.",
    image: '/agents/sarah.jpg',
    audioSrc: '/agents/sarah-intro.mp3',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    tagline: 'Energy+',
    description: "A grounded, steady presence who brings calm energy to even the most difficult conversations. Marcus helps you find your footing and build momentum through clarity and direct engagement.",
    image: '/agents/marcus.png',
    audioSrc: '/agents/marcus-intro.mp3',
  },
  {
    id: 'mathew',
    name: 'Mathew',
    tagline: 'No holding back',
    description: "Direct, perceptive, and unflinching. Mathew doesn't dance around the hard stuff — he helps you face what's real so you can stop avoiding and start changing. Built from 25+ years of actual clinical practice.",
    image: '/agents/mathew.jpg',
    audioSrc: '/agents/mathew-intro.mp3',
  },
  {
    id: 'una',
    name: 'UNA',
    tagline: 'Coherence Now',
    description: "UNA works at the level of narrative — helping you understand the deeper story that's shaping your life. She finds the patterns connecting past and present, weaving them into a coherent whole you can finally see clearly.",
    image: '/agents/una.jpg',
    audioSrc: '/agents/una-intro.mp3',
  },
];

interface DemoUsage {
  count: number;
  lastUsedDate: string; // ISO date string (YYYY-MM-DD)
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function getDemoUsage(): DemoUsage {
  try {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[DemoVoiceCard] Failed to parse demo usage:', e);
  }
  return { count: 0, lastUsedDate: '' };
}

function setDemoUsage(usage: DemoUsage): void {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(usage));
  } catch (e) {
    console.error('[DemoVoiceCard] Failed to save demo usage:', e);
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function DemoVoiceCard() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [demoUsage, setDemoUsageState] = useState<DemoUsage>({ count: 0, lastUsedDate: '' });
  const [demoEnded, setDemoEnded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get the selected agent from our local agents array
  const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) : null;

  // Get the therapeutic agent config for the demo session
  const therapeuticAgent = getAgentById(selectedAgentId || 'sarah') || THERAPEUTIC_AGENTS[0];

  const {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus,
    error,
    clearError,
    elapsedSeconds
  } = useDemoVapi({ selectedAgent: therapeuticAgent });

  // Load demo usage on mount
  useEffect(() => {
    const usage = getDemoUsage();
    const today = getTodayDateString();

    // Reset count if it's a new day
    if (usage.lastUsedDate !== today) {
      const resetUsage = { count: 0, lastUsedDate: today };
      setDemoUsage(resetUsage);
      setDemoUsageState(resetUsage);
    } else {
      setDemoUsageState(usage);
    }
  }, []);

  // Track when session ends
  useEffect(() => {
    if (!isSessionActive && connectionStatus === 'disconnected' && elapsedSeconds === 0 && demoUsage.count > 0) {
      setDemoEnded(true);
    }
  }, [isSessionActive, connectionStatus, elapsedSeconds, demoUsage.count]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const hasReachedLimit = demoUsage.count >= MAX_DEMOS_PER_DAY;
  const demosRemaining = MAX_DEMOS_PER_DAY - demoUsage.count;

  const playAudio = (agent: typeof agents[0]) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(agent.audioSrc);
    audioRef.current = audio;
    setIsPlaying(true);

    audio.play().catch((err) => {
      // Audio play failed (browser autoplay policy) — fail silently
      console.log('Audio autoplay blocked:', err);
      setIsPlaying(false);
    });

    audio.onended = () => {
      setIsPlaying(false);
    };
  };

  const handleSelectAgent = (agent: typeof agents[0]) => {
    setSelectedAgentId(agent.id);
    playAudio(agent);
  };

  const handleStartDemo = () => {
    if (hasReachedLimit) return;

    // Stop audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
    }

    clearError();
    setDemoEnded(false);

    // Increment demo count
    const today = getTodayDateString();
    const newUsage = {
      count: demoUsage.count + 1,
      lastUsedDate: today
    };
    setDemoUsage(newUsage);
    setDemoUsageState(newUsage);

    startSession();
  };

  const handleEndDemo = () => {
    endSession();
    setDemoEnded(true);
  };

  // Get status text
  const getStatusText = (): string => {
    if (error) return 'Error';
    if (connectionStatus === 'connecting' || isLoading) return 'Connecting...';
    if (connectionStatus === 'connected') return 'Connected';
    return 'Ready';
  };

  const getStatusColor = (): string => {
    if (error) return 'text-red-400';
    if (connectionStatus === 'connecting' || isLoading) return 'text-amber-400';
    if (connectionStatus === 'connected') return 'text-emerald-400';
    return 'text-muted-foreground';
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-6 md:p-8 max-w-3xl mx-auto">
      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-red-400 text-sm">
          <div className="flex items-start gap-2">
            <i className="fas fa-exclamation-circle mt-0.5"></i>
            <div>
              <p>{error}</p>
              <button
                onClick={clearError}
                className="text-xs underline mt-1 hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Limit Reached State */}
      {hasReachedLimit && !isSessionActive && (
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-clock text-2xl text-amber-400"></i>
          </div>
          <h3 className="text-lg font-semibold mb-2">Daily Demo Limit Reached</h3>
          <p className="text-muted-foreground text-sm mb-4">
            You've used all {MAX_DEMOS_PER_DAY} demos today.<br />
            Sign up for unlimited access!
          </p>
          <p className="text-xs text-muted-foreground">
            Demo count resets at midnight
          </p>
        </div>
      )}

      {/* Demo Completed State */}
      {demoEnded && !isSessionActive && !hasReachedLimit && (
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-check-circle text-2xl text-emerald-400"></i>
          </div>
          <h3 className="text-lg font-semibold mb-2">Demo Complete!</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Ready to continue your journey?<br />
            Sign up for full sessions with memory and deeper exploration.
          </p>
          <Button
            onClick={() => setDemoEnded(false)}
            variant="outline"
            className="text-sm"
          >
            Try Another Demo ({demosRemaining} remaining)
          </Button>
        </div>
      )}

      {/* Active Session State */}
      {isSessionActive && (
        <div className="text-center">
          {/* Agent Avatar with pulse */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full bg-emerald-400/30 animate-pulse"></div>
            <img
              src={therapeuticAgent.image}
              alt={therapeuticAgent.name}
              className="w-24 h-24 rounded-full object-cover relative z-10 border-2 border-emerald-400/50"
            />
          </div>

          <h3 className="text-lg font-semibold">{therapeuticAgent.name}</h3>
          <p className={`text-sm mb-4 ${getStatusColor()}`}>
            <span className="inline-block w-2 h-2 rounded-full bg-current mr-2 animate-pulse"></span>
            {getStatusText()}
          </p>

          {/* Timer */}
          <div className="text-3xl font-mono text-emerald-400 mb-4">
            {formatTime(elapsedSeconds)} / 05:00
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-background/50 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000"
              style={{ width: `${(elapsedSeconds / 300) * 100}%` }}
            />
          </div>

          {/* End Demo Button */}
          <Button
            onClick={handleEndDemo}
            variant="outline"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500"
          >
            <i className="fas fa-stop-circle mr-2"></i>
            End Demo
          </Button>

          {/* Sign up nudge */}
          <p className="text-xs text-muted-foreground mt-4">
            Enjoying your conversation? Sign up for full<br />
            sessions with memory and deeper exploration.
          </p>
        </div>
      )}

      {/* Ready State - Agent Selection Grid */}
      {!isSessionActive && !hasReachedLimit && !demoEnded && (
        <>
          <h3 className="text-center text-lg font-semibold text-white mb-6">Choose your guide:</h3>

          {/* Agent grid — 2x2 on mobile, 4 across on desktop */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                className={`glass rounded-xl border p-4 text-center transition-all group cursor-pointer ${
                  selectedAgent?.id === agent.id
                    ? 'border-purple-400/60 bg-purple-400/10'
                    : 'border-white/10 hover:border-purple-400/40'
                }`}
              >
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden mx-auto mb-3 border-2 border-white/20 group-hover:border-purple-400/40 transition-colors">
                  <img src={agent.image} alt={agent.name} className="w-full h-full object-cover" />
                </div>
                <p className="font-semibold text-white text-sm">{agent.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{agent.tagline}</p>
              </button>
            ))}
          </div>

          {/* Selected agent expanded section */}
          {selectedAgent && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex flex-col items-center text-center">
                {/* Larger avatar */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-3 border-purple-400/60">
                    <img src={selectedAgent.image} alt={selectedAgent.name} className="w-full h-full object-cover" />
                  </div>
                  {/* Audio playing indicator — shows when audio is playing */}
                  {isPlaying && (
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1.5 animate-pulse">
                      <Volume2 className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Name and tagline */}
                <h4 className="text-xl font-semibold text-white mt-3">{selectedAgent.name}</h4>
                <p className="text-sm text-purple-400 italic">{selectedAgent.tagline}</p>

                {/* Longer description */}
                <p className="text-sm text-muted-foreground mt-3 max-w-md leading-relaxed">
                  {selectedAgent.description}
                </p>

                {/* Audio replay button — in case user wants to hear it again */}
                <button
                  onClick={() => playAudio(selectedAgent)}
                  className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  {isPlaying ? 'Playing...' : 'Listen again'}
                </button>
              </div>
            </div>
          )}

          {/* Try iVASA Free button — always visible */}
          <button
            onClick={handleStartDemo}
            disabled={isLoading}
            className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Connecting...
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Try iVASA Free
              </>
            )}
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            5-minute demo • No account required
            {demosRemaining < MAX_DEMOS_PER_DAY && (
              <span className="block mt-1">
                {demosRemaining} demo{demosRemaining !== 1 ? 's' : ''} remaining today
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
