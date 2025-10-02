import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';
import useVapi from '@/hooks/use-vapi';
import AgentSelector from './AgentSelector';
import { DeleteAccount } from './DeleteAccount';
import { getAgentById } from '../config/agent-configs';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';
import { useSubscription } from '@/hooks/use-subscription';
import vasaLogo from '@assets/VASA Favi Minimal_1758122988999.png';

interface VoiceInterfaceProps {
  userId: string;
  setUserId: (id: string | null) => void;
  hideLogoutButton?: boolean;
}

interface UserContext {
  profile: any;
  memoryContext: string;
  displayMemoryContext?: string;  // NEW: Optional field for cleaner UI display
  lastSessionSummary?: string | null;  // ADD: Session continuity
  shouldReferenceLastSession?: boolean; // ADD: Session continuity
  sessions: any[];
  firstName: string;
  sessionCount: number;
}

export default function VoiceInterface({ userId, setUserId, hideLogoutButton = false }: VoiceInterfaceProps) {
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('sarah'); // Default to Sarah
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [showDurationWarning, setShowDurationWarning] = useState(false);

  const selectedAgent = getAgentById(selectedAgentId);

  const {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus
  } = useVapi({
    userId,
    memoryContext: userContext?.memoryContext || '',
    lastSessionSummary: userContext?.lastSessionSummary || null, // ADD: Pass session summary
    shouldReferenceLastSession: userContext?.shouldReferenceLastSession || false, // ADD: Pass reference flag
    firstName: userContext?.firstName || 'there',
    selectedAgent: selectedAgent!
  });

  // ADD subscription hook
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription(userId);

  // Add this to voice-interface.tsx right after useSubscription
  console.log('Full subscription data:', JSON.stringify(subscription, null, 2));
  
  // Debug logging for subscription
  console.log('Subscription data:', subscription, 'Loading:', subscriptionLoading);

  // Load memory context
  useEffect(() => {
    const loadUserContext = async () => {
      if (!userId) return;

      setMemoryLoading(true);
      try {
        const authToken = localStorage.getItem('authToken');
        const headers: Record<string, string> = {
          'Cache-Control': 'no-cache'
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`/api/auth/user-context/${userId}`, {
          cache: 'no-store',
          headers
        });

        if (response.ok) {
          const data = await response.json();
          setUserContext(data);
          console.log(`✅ Loaded ${data.sessionCount} previous sessions`);

          // ADD: Log session continuity info if available
          if (data.shouldReferenceLastSession && data.lastSessionSummary) {
            console.log('📝 Session continuity enabled - will reference previous session');
          }
        } else {
          console.error('Failed to fetch user context');
          
          // If user not found (deleted from database), clear local storage and reload
          if (response.status === 404) {
            console.log('User not found, clearing session...');
            localStorage.removeItem('userId');
            localStorage.removeItem('authToken');
            setUserId(null);  // This will trigger return to login screen
            return;
          }
        }
      } catch (error) {
        console.error('Error loading user context:', error);
      } finally {
        setMemoryLoading(false);
      }
    };

    loadUserContext();
  }, [userId]);

  // Call timer effect with VAPI 10-minute limitation warning
  // VAPI Platform Limitation: Calls automatically disconnect after 10 minutes (600 seconds)
  // We show a warning at 9 minutes (540 seconds) and auto-end at 10 minutes
  useEffect(() => {
    if (isSessionActive) {
      const interval = setInterval(() => {
        setCallTimer(prev => {
          const newTimer = prev + 1;

          // Show warning at 9 minutes (540 seconds) - VAPI has a 10-minute limitation
          if (newTimer === 540 && !showDurationWarning) {
            setShowDurationWarning(true);
          }

          // Auto-end call at 10 minutes (600 seconds) due to VAPI limitation
          if (newTimer >= 600) {
            console.log('⏰ Call duration limit reached (10 minutes) - ending call');
            handleEndCall();
            return prev;
          }

          return newTimer;
        });
      }, 1000);
      setTimerInterval(interval);
    } else {
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      setCallTimer(0);
      setShowDurationWarning(false);
    }

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isSessionActive, showDurationWarning]);

  const handleStartSession = () => {
    // DEBUG: Log exactly what we're checking
    console.log('=== START SESSION CLICKED ===');
    console.log('1. subscription object:', subscription);
    console.log('2. subscription.limits:', subscription?.limits);
    console.log('3. can_use_voice value:', subscription?.limits?.can_use_voice);
    console.log('4. !can_use_voice (what we check):', !subscription?.limits?.can_use_voice);

    if (subscription && subscription.limits?.can_use_voice === false) {
      console.error('❌ Cannot start session:', {
        minutes_remaining: subscription.limits.minutes_remaining,
        is_using_therapist_subscription: subscription.limits.is_using_therapist_subscription
      });

      alert(
        subscription.limits.is_using_therapist_subscription
          ? `Your therapist's subscription has no minutes remaining. They need to upgrade.`
          : `You have used all your available minutes. Please upgrade your subscription.`
      );
      return;
    }

    console.log('6. PASSED subscription check');
    console.log('7. memoryLoading:', memoryLoading);
    console.log('8. userContext exists:', !!userContext);
    console.log('9. selectedAgent:', selectedAgent);

    if (!memoryLoading && userContext && selectedAgent) {
      console.log('10. STARTING SESSION');
      const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setCurrentCallId(callId);
      startSession();
    } else {
      console.log('10. BLOCKED by other conditions');
    }
  };

  const handleEndCall = async () => {
    if (!currentCallId) {
      // If no call ID, just use regular endSession
      endSession();
      return;
    }

    try {
      // Stop the vapi session
      endSession();

      // Send end session request with auth token
      const authToken = localStorage.getItem('authToken');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      await fetch('/api/vapi/webhook', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: {
            type: 'end-of-call-report',
            call: { id: currentCallId },
            endedReason: 'user-ended'
          }
        })
      });

      console.log('📴 Call ended by user');
      setCurrentCallId(null);
    } catch (error) {
      console.error('Error ending call:', error);
      endSession();
      setCurrentCallId(null);
    }
  };


  const handleSignOut = () => {
    handleLogout(setUserId);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper function to get display insights
  const getDisplayInsights = () => {
    // Use displayMemoryContext if available, otherwise fall back to memoryContext
    const contextToDisplay = userContext?.displayMemoryContext || userContext?.memoryContext || '';

    // If the displayMemoryContext is a simple paragraph (not multi-line structured data), return it directly
    if (contextToDisplay && !contextToDisplay.includes('\n\n') && contextToDisplay.length > 50) {
      return [contextToDisplay];
    }

    // Otherwise, filter out technical/JSON content and empty lines
    const lines = contextToDisplay.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;

      // Skip lines that look like technical metadata
      const lowerLine = trimmed.toLowerCase();
      return !lowerLine.includes('exchangecount') && 
             !lowerLine.includes('narrativedepth') &&
             !lowerLine.includes('therapeuticarc') &&
             !lowerLine.includes('dominantmovement') &&
             !lowerLine.includes('"processinsights"') &&
             !lowerLine.includes('"emotionalrange"') &&
             !trimmed.startsWith('{') &&
             !trimmed.startsWith('}');
    });

    // Return filtered lines if they exist, otherwise return the fallback
    return lines.length > 0 ? lines : ['Starting your therapeutic journey'];
  };

  if (memoryLoading || !userContext) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your therapeutic space...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 glass-strong">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full glass flex items-center justify-center p-1">
                  <img 
                    src={vasaLogo} 
                    alt="iVASA Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-lg sm:text-xl font-semibold">iVASA</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden sm:block glass rounded-full px-3 sm:px-4 py-1 sm:py-2">
                <span className="text-xs sm:text-sm text-muted-foreground">Welcome, {userContext.firstName}</span>
              </div>
              <DeleteAccount 
                userId={userId}
                userEmail={userContext.profile?.email}
                sessionCount={userContext.sessionCount}
                onAccountDeleted={() => {
                  setUserId(null);
                  window.location.href = '/';
                }}
              />
              {!hideLogoutButton && (
                <Button 
                  onClick={handleSignOut}
                  data-testid="button-signOut"
                >
                  Log Out
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">

          {/* Voice Assistant Interface - Main Column */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">

            {/* ADD Subscription Status Card */}
            {subscriptionLoading && (
              <Card className="glass-strong rounded-xl sm:rounded-2xl border-0">
                <CardContent className="p-4">
                  <p>Loading subscription...</p>
                </CardContent>
              </Card>
            )}

            {!subscriptionLoading && !subscription && (
              <Card className="glass-strong rounded-xl sm:rounded-2xl border-0">
                <CardContent className="p-4">
                  <p className="text-red-500">Failed to load subscription data</p>
                </CardContent>
              </Card>
            )}

            {subscription && (
              <Card className="glass-strong rounded-xl sm:rounded-2xl border-0">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full ${
                        subscription.limits.minutes_remaining > 10 ? 'bg-green-500/20' : 
                        subscription.limits.minutes_remaining > 0 ? 'bg-yellow-500/20' : 'bg-red-500/20'
                      } flex items-center justify-center`}>
                        {subscription.limits.minutes_remaining > 10 ? 
                          <CheckCircle className="w-5 h-5 text-green-500" /> :
                          subscription.limits.minutes_remaining > 0 ?
                          <Clock className="w-5 h-5 text-yellow-500" /> :
                          <XCircle className="w-5 h-5 text-red-500" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {subscription.limits.subscription_tier === 'trial' ? 'Trial Account' : 
                           subscription.limits.subscription_tier === 'pro' ? 'Pro Account' : 'Premium Account'}
                          {subscription.limits.is_using_therapist_subscription && (
                            <span className="ml-2 text-xs text-muted-foreground">(via therapist)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {subscription.limits.minutes_remaining} minutes remaining
                          {subscription.limits.is_using_therapist_subscription && subscription.limits.subscription_owner_email && (
                            <span className="block mt-1">Therapist: {subscription.limits.subscription_owner_email}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {subscription.limits.subscription_tier === 'trial' && !subscription.limits.is_using_therapist_subscription && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-xs"
                        onClick={() => window.location.href = '/pricing'}
                      >
                        Upgrade
                      </Button>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="bg-secondary/20 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          ((subscription.limits.minutes_used / subscription.limits.minutes_limit) * 100) > 80 ? 'bg-red-500' :
                          ((subscription.limits.minutes_used / subscription.limits.minutes_limit) * 100) > 50 ? 'bg-yellow-500' : 
                          'bg-green-500'
                        }`}
                        style={{ width: `${(subscription.limits.minutes_used / subscription.limits.minutes_limit) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>
                        {subscription.limits.minutes_used} used
                        {subscription.limits.is_using_therapist_subscription && ' by ALL clients'}
                      </span>
                      <span>{subscription.limits.minutes_limit} total</span>
                    </div>
                  </div>

                  {subscription.limits.minutes_remaining <= 5 && subscription.limits.minutes_remaining > 0 && (
                    <Alert className="mt-3 bg-yellow-500/10 border-yellow-500/50">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <AlertDescription className="text-xs">
                        {subscription.limits.is_using_therapist_subscription
                          ? `Your therapist has ${subscription.limits.minutes_remaining} minutes left.`
                          : `You have ${subscription.limits.minutes_remaining} minutes left. Upgrade to continue after your limit.`
                        }
                      </AlertDescription>
                    </Alert>
                  )}

                  {subscription.limits.minutes_remaining === 0 && (
                    <Alert className="mt-3 bg-red-500/10 border-red-500/50">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription className="text-xs">
                        {subscription.limits.is_using_therapist_subscription
                          ? `Your therapist's subscription has no minutes remaining. They need to purchase more minutes or upgrade their plan.`
                          : `Your subscription has no minutes remaining. Please upgrade to continue using iVASA.`}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Agent Selection */}
            <AgentSelector 
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              disabled={isSessionActive || isLoading}
            />

            {/* VAPI Duration Warning Alert - shows at 9 minutes */}
            {showDurationWarning && isSessionActive && (
              <Alert className="glass-strong border-yellow-500/50 rounded-xl sm:rounded-2xl">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-sm sm:text-base">
                  <strong>Session Time Limit:</strong> Your call will automatically end in {600 - callTimer} seconds due to VAPI platform limitations. 
                  Please wrap up your conversation or start a new session after this one ends.
                </AlertDescription>
              </Alert>
            )}

            {/* Voice Call Interface */}
            <Card className="glass-strong rounded-2xl sm:rounded-3xl border-0">
              <CardContent className="p-4 sm:p-6 lg:p-8">
                <div className="text-center space-y-4 sm:space-y-6">
                  {/* Agent Avatar and Status */}
                  <div className="relative inline-block">
                    <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full shadow-lg border-4 border-${selectedAgent?.color || 'primary'}/30 bg-gradient-to-br from-${selectedAgent?.color || 'primary'}/20 to-${selectedAgent?.color || 'primary'}/10 flex items-center justify-center text-4xl sm:text-6xl`}>
                      {selectedAgent?.icon || '💜'}
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-full border-4 border-background flex items-center justify-center">
                      <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                  </div>

                  <div className="space-y-1 sm:space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-bold">{selectedAgent?.name || 'Sarah'}</h2>
                    <p className="text-sm sm:text-base text-muted-foreground px-4 sm:px-0">{selectedAgent?.description || 'Your Therapeutic Voice Assistant'}</p>
                    <div className="inline-flex items-center space-x-2 text-sm text-accent">
                      <div className={`w-2 h-2 rounded-full animate-pulse ${
                        isSessionActive ? 'bg-red-500' : 'bg-accent'
                      }`}></div>
                      <span data-testid="status-call">
                        {isSessionActive ? `Connected with ${selectedAgent?.name}` : 'Ready to chat'}
                      </span>
                    </div>
                  </div>

                  {/* UPDATE Voice Call Controls to disable when no minutes */}
                  <div className="flex justify-center">
                    <Button
                      onClick={isSessionActive ? handleEndCall : handleStartSession}
                      disabled={isLoading || memoryLoading || (subscription?.limits.minutes_remaining === 0)}
                      className={`group relative px-8 py-3 sm:px-10 sm:py-4 rounded-full hover:shadow-xl transition-all duration-300 flex items-center justify-center font-medium text-white ${
                        isSessionActive 
                          ? 'bg-gradient-to-r from-red-500 to-red-600 hover:shadow-red-500/25' 
                          : subscription && subscription.limits.minutes_remaining === 0  // ✅ Fixed typo
                          ? 'bg-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-primary to-accent hover:shadow-primary/25'
                      }`}
                      data-testid="button-call"
                    >
                      <span className="text-sm sm:text-base group-hover:scale-105 transition-transform duration-200">
                        {isLoading ? 'Connecting...' : 
                         isSessionActive ? 'End Session' : 
                          subscription && subscription.limits.minutes_remaining === 0 ? 'Upgrade Required' :
                         'Start Session'}
                      </span>
                    </Button>
                  </div>

                  {/* Call Duration Display with Warning Color */}
                  {isSessionActive && (
                    <Card className={`glass rounded-xl border-0 ${showDurationWarning ? 'border-2 border-yellow-500/50' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col items-center space-y-2">
                          <div className="flex items-center justify-center space-x-2">
                            <div className={`w-3 h-3 ${showDurationWarning ? 'bg-yellow-500' : 'bg-red-500'} rounded-full animate-pulse`}></div>
                            <span className={`text-xl font-mono ${showDurationWarning ? 'text-yellow-500' : ''}`} data-testid="text-callTimer">
                              {formatTime(callTimer)}
                            </span>
                          </div>
                          {showDurationWarning && (
                            <span className="text-xs text-yellow-500 text-center">
                              Max duration: 10 minutes (VAPI limit)
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live Conversation Transcript */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                  <i className="fas fa-comments text-accent text-sm sm:text-base"></i>
                  <h3 className="text-lg sm:text-xl font-semibold">Live Conversation</h3>
                </div>

                <div className="space-y-4 max-h-80 overflow-y-auto" data-testid="transcript-container">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-medium text-accent">{selectedAgent?.name || 'Sarah'}</span>
                      <span className="text-xs text-muted-foreground">AI Therapist</span>
                    </div>
                    <p className="text-sm">
                      {userContext.shouldReferenceLastSession && userContext.lastSessionSummary
                        ? `Continuing from our last session...`
                        : `Hello! I'm ${selectedAgent?.name || 'Sarah'}, your therapeutic voice assistant. How are you feeling today?`}
                    </p>
                  </div>

                  <div className="bg-primary/20 rounded-lg p-3 ml-8">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-medium text-primary-foreground">You</span>
                    </div>
                    <p className="text-sm text-muted-foreground italic">Start a conversation to see live transcription here...</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Real-time transcription enabled</span>
                    <span className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Active</span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Session History and Insights */}
          <div className="space-y-4 sm:space-y-6">

            {/* Session Stats */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-chart-bar text-accent text-sm sm:text-base"></i>
                  <span>Your Progress</span>
                </h3>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Sessions</span>
                    <span className="text-2xl font-bold text-accent" data-testid="text-sessionCount">
                      {userContext.sessionCount}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">This Week</span>
                    <span className="text-lg font-semibold">
                      {userContext.sessions.filter(s => {
                        const sessionDate = new Date(s.created_at);
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        return sessionDate > weekAgo;
                      }).length}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Duration</span>
                    <span className="text-lg font-semibold">
                      {userContext.sessions.length > 0 
                        ? Math.round(userContext.sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / userContext.sessions.length / 60)
                        : 0} min
                    </span>
                  </div>

                  <div className="w-full bg-muted rounded-full h-2 mt-4">
                    <div className="bg-gradient-to-r from-primary to-accent h-2 rounded-full w-3/4"></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Weekly goal: 4 sessions</p>
                </div>
              </CardContent>
            </Card>

            {/* Memory Context - MODIFIED to use cleaner display */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-brain text-accent text-sm sm:text-base"></i>
                  <span>Session Memory</span>
                </h3>

                <div className="space-y-3">
                  {getDisplayInsights().map((line, index) => (
                    <div key={index} className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-sm">{line}</p>
                    </div>
                  ))}
                </div>

                <Button variant="ghost" className="mt-4 text-sm text-accent hover:text-accent/80 transition-colors duration-200 p-0">
                  View full session history →
                </Button>
              </CardContent>
            </Card>

            {/* Recent Sessions */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-history text-accent text-sm sm:text-base"></i>
                  <span>Recent Sessions</span>
                </h3>

                <div className="space-y-3">
                  {userContext.sessions.slice(0, 3).map((session, index) => (
                    <div key={session.id} className="flex items-center justify-between py-2 border-b border-border/50">
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(session.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.duration_seconds ? Math.floor(session.duration_seconds / 60) : 0} minutes
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      </div>
                    </div>
                  ))}

                  {userContext.sessions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No sessions yet. Start your first conversation with {selectedAgent?.name || 'Sarah'}!
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}