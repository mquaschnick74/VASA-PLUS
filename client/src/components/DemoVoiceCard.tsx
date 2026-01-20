import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { THERAPEUTIC_AGENTS, getAgentById } from '../config/agent-configs';
import useDemoVapi from '@/hooks/use-demo-vapi';

// localStorage keys for abuse prevention
const DEMO_STORAGE_KEY = 'ivasa_demo_usage';
const MAX_DEMOS_PER_DAY = 3;

// Agent taglines for the demo card
const AGENT_TAGLINES: Record<string, string> = {
  sarah: 'Here for you.',
  marcus: 'Energy+',
  mathew: 'No holding back',
  una: 'Coherence Now'
};

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
  const [selectedAgentId, setSelectedAgentId] = useState<string>('sarah');
  const [demoUsage, setDemoUsageState] = useState<DemoUsage>({ count: 0, lastUsedDate: '' });
  const [demoEnded, setDemoEnded] = useState(false);

  const selectedAgent = getAgentById(selectedAgentId) || THERAPEUTIC_AGENTS[0];

  const {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus,
    error,
    clearError,
    elapsedSeconds
  } = useDemoVapi({ selectedAgent });

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
      // Session just ended (elapsed reset to 0)
      const prevConnected = connectionStatus === 'disconnected';
      if (prevConnected) {
        setDemoEnded(true);
      }
    }
  }, [isSessionActive, connectionStatus, elapsedSeconds, demoUsage.count]);

  const hasReachedLimit = demoUsage.count >= MAX_DEMOS_PER_DAY;
  const demosRemaining = MAX_DEMOS_PER_DAY - demoUsage.count;

  const handleStartDemo = () => {
    if (hasReachedLimit) return;

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

  // Filter to only show the 4 main agents (exclude any others if present)
  const displayAgents = THERAPEUTIC_AGENTS.slice(0, 4);

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
    <Card className="glass rounded-2xl border border-emerald-400/30 mt-6">
      <CardContent className="p-6">
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
                src={selectedAgent.image}
                alt={selectedAgent.name}
                className="w-24 h-24 rounded-full object-cover relative z-10 border-2 border-emerald-400/50"
              />
            </div>

            <h3 className="text-lg font-semibold">{selectedAgent.name}</h3>
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

        {/* Ready State - Agent Selection */}
        {!isSessionActive && !hasReachedLimit && !demoEnded && (
          <>
            {/* Agent Selection */}
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-3 text-center">Choose your guide:</p>
              <RadioGroup
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
                className="grid grid-cols-2 gap-3"
              >
                {displayAgents.map((agent) => (
                  <div key={agent.id} className="relative">
                    <RadioGroupItem
                      value={agent.id}
                      id={`demo-agent-${agent.id}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`demo-agent-${agent.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/50 cursor-pointer transition-all
                        hover:border-emerald-400/50 hover:bg-emerald-400/5
                        peer-data-[state=checked]:border-emerald-400 peer-data-[state=checked]:bg-emerald-400/10"
                    >
                      <div className="w-10 h-10 flex-shrink-0">
                        <img
                          src={agent.image}
                          alt={agent.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium">{agent.name}:</span>
                        <span className="text-xs text-muted-foreground truncate">{AGENT_TAGLINES[agent.id]}</span>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Start Button */}
            <Button
              onClick={handleStartDemo}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-3 rounded-xl text-lg"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Connecting...
                </>
              ) : (
                <>
                  <i className="fas fa-microphone mr-2"></i>
                  Try iVASA Free
                </>
              )}
            </Button>

            {/* Demo info */}
            <p className="text-center text-xs text-muted-foreground mt-3">
              5-minute demo &bull; No account required
              {demosRemaining < MAX_DEMOS_PER_DAY && (
                <span className="block mt-1">
                  {demosRemaining} demo{demosRemaining !== 1 ? 's' : ''} remaining today
                </span>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
