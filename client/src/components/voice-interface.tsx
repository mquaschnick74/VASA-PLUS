import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Clock, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import useVapi, { TranscriptMessage } from '@/hooks/use-vapi';
import AgentSelector from './AgentSelector';
import { DeleteAccount } from './DeleteAccount';
import { TechnicalSupportCard } from './TechnicalSupportCard';
import { getAgentById } from '../config/agent-configs';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';
import { useSubscription } from '@/hooks/use-subscription';
import vasaLogo from '@assets/VASA Favi Minimal_1758122988999.png';
import { Link } from 'wouter';

interface VoiceInterfaceProps {
  userId: string;
  setUserId: (id: string | null) => void;
  hideLogoutButton?: boolean;
}

interface ExtendedTranscriptMessage extends TranscriptMessage {
  id: string;
  source: 'voice' | 'text';
  agentId?: string;
}

interface OnboardingData {
  voice: string;
  journey: string;
  completedAt: string;
  wasSkipped: boolean;
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
  sessionDurationLimit?: number;
  onboarding?: OnboardingData | null;
}

export default function VoiceInterface({ userId, setUserId, hideLogoutButton }: VoiceInterfaceProps) {
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('sarah'); // Default to Sarah
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [showDurationWarning, setShowDurationWarning] = useState(false);
  const [sessionDurationLimit, setSessionDurationLimit] = useState(7200); // Default: 2 hours in seconds
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  // NEW: Transcript and text messaging state
  const [transcript, setTranscript] = useState<ExtendedTranscriptMessage[]>(() => {
    // Restore transcript from localStorage on mount
    const saved = localStorage.getItem('vasa_text_transcript');
    return saved ? JSON.parse(saved) : [];
  });
  const [textInput, setTextInput] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [activeTextSessionId, setActiveTextSessionId] = useState<string | null>(() => {
    // Restore active session ID from localStorage on mount
    return localStorage.getItem('vasa_text_session_id');
  });
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Persist text session state to localStorage
  useEffect(() => {
    if (activeTextSessionId) {
      localStorage.setItem('vasa_text_session_id', activeTextSessionId);
      localStorage.setItem('vasa_text_transcript', JSON.stringify(transcript));
    } else {
      localStorage.removeItem('vasa_text_session_id');
      localStorage.removeItem('vasa_text_transcript');
    }
  }, [activeTextSessionId, transcript]);

  // Auto-focus text input when component mounts with active session (after navigation)
  useEffect(() => {
    if (activeTextSessionId && textInputRef.current) {
      // Small delay to ensure component is fully rendered
      const timer = setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTextSessionId]);

  const selectedAgent = getAgentById(selectedAgentId);

  const {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus,
    onTranscript,
    error: vapiError,
    clearError
  } = useVapi({
    userId,
    memoryContext: userContext?.memoryContext || '',
    lastSessionSummary: userContext?.lastSessionSummary || null,
    shouldReferenceLastSession: userContext?.shouldReferenceLastSession || false,
    firstName: userContext?.firstName || 'there',
    selectedAgent: selectedAgent!,
    sessionDurationLimit: sessionDurationLimit,
    onboarding: userContext?.onboarding || null
  });

  // ADD subscription hook
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription(userId);

  // Add this to voice-interface.tsx right after useSubscription
  console.log('Full subscription data:', JSON.stringify(subscription, null, 2));

  // Debug logging for subscription
  console.log('Subscription data:', subscription, 'Loading:', subscriptionLoading);

  // NEW: Wire up transcript events from VAPI
  useEffect(() => {
    onTranscript((message: TranscriptMessage) => {
      console.log('📝 Transcript message received:', message);

      const extendedMessage: ExtendedTranscriptMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        source: 'voice',
        agentId: selectedAgentId
      };

      setTranscript(prev => [...prev, extendedMessage]);
    });
  }, [onTranscript, selectedAgentId]);

  // Auto-scroll to bottom when transcript updates
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Clear transcript when voice session ends
  useEffect(() => {
    if (!isSessionActive) {
      // Option: Clear transcript when session ends, or keep it for review
      // setTranscript([]);
    }
  }, [isSessionActive]);

  // Warn user before leaving with unsaved text session (browser close/refresh only)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only show warning if there's an active text session with messages
      // Don't prevent navigation or try to save here - that causes freezing
      if (activeTextSessionId && transcript.length > 0) {
        const message = 'You have an active text session. Click "Stop Text Session" to save your conversation.';
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeTextSessionId, transcript]);

  // NEW: Text session management
  const startTextSession = () => {
    const sessionId = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setActiveTextSessionId(sessionId);
    setTranscript([]); // Clear previous transcript
    console.log('📝 [TEXT] Started new text session:', sessionId);
  };

  const stopTextSession = async () => {
    if (!activeTextSessionId || transcript.length === 0) {
      console.log('⚠️ [TEXT] Cannot stop session - no active session or empty transcript');
      return;
    }

    if (isStoppingSession) {
      console.log('⚠️ [TEXT] Session stop already in progress, ignoring duplicate click');
      return;
    }

    setIsStoppingSession(true);
    console.log('📝 [TEXT] Stopping text session:', activeTextSessionId);
    console.log('📝 [TEXT] Saving', transcript.length, 'messages to database...');

    try {
      // Get authentication token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [TEXT] Failed to get session:', sessionError);
        alert('Failed to save session: Authentication error. Please refresh the page.');
        return;
      }

      const token = sessionData?.session?.access_token;

      if (!token) {
        console.error('❌ [TEXT] No authentication token available');
        alert('Failed to save session: Not authenticated. Please refresh the page.');
        return;
      }

      // Send transcript to backend for processing and storage
      console.log('🧠 [TEXT] Processing therapeutic analysis for session...');
      console.log('📤 [TEXT] Sending request to /api/chat/end-session');

      const response = await fetch('/api/chat/end-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: activeTextSessionId,
          agentName: selectedAgent?.name,
          transcript: transcript.filter(msg => msg.source === 'text').map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
          })),
        }),
      });

      console.log('📥 [TEXT] Response status:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ [TEXT] Session processing completed:', result);
        console.log(`📊 CSS Stage: ${result.cssStage}, Patterns: ${result.patternsDetected}`);
        alert(`Session saved successfully! CSS Stage: ${result.cssStage}, Patterns detected: ${result.patternsDetected}`);
      } else {
        const errorText = await response.text();
        console.error('❌ [TEXT] Failed to process session end:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        alert(`Failed to save session: ${response.status} - ${errorText}`);
      }
    } catch (error: any) {
      console.error('❌ [TEXT] Error stopping session:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      alert(`Failed to save session: ${error.message}`);
    } finally {
      setIsStoppingSession(false);
      // Always clear the session state
      setActiveTextSessionId(null);
      // Keep transcript visible for review
    }
  };

  // Load memory context
  // Load memory context and session duration limit
  useEffect(() => {
    const loadUserContext = async () => {
      if (!userId) return;

      setMemoryLoading(true);
      try {
        // Always get fresh session token
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.error('❌ [VOICE] No valid session, signing out');
          handleLogout(setUserId);
          return;
        }

        const authToken = session.access_token;
        const headers: Record<string, string> = {
          'Cache-Control': 'no-cache',
          'Authorization': `Bearer ${authToken}`
        };

        const response = await fetch(`/api/auth/user-context/${userId}`, {
          cache: 'no-store',
          headers
        });

        if (response.ok) {
          const data = await response.json();
          setUserContext(data);
          console.log(`✅ Loaded ${data.sessionCount} previous sessions`);

          // Log session continuity info if available
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
            setUserId(null);
            return;
          }
        }

        // Check if user is a therapist's client and get their session duration limit
        const relationshipResponse = await fetch(`/api/therapist/client-settings/${userId}`, {
          headers
        });

        console.log('⏱️ FETCH CLIENT SETTINGS - Status:', relationshipResponse.status);

        if (relationshipResponse.ok) {
          const relationshipData = await relationshipResponse.json();
          console.log('⏱️ FETCH CLIENT SETTINGS - Data:', relationshipData);

          if (relationshipData.session_duration_limit) {
            setSessionDurationLimit(relationshipData.session_duration_limit);
            console.log(`⏱️ SET CLIENT LIMIT: ${relationshipData.session_duration_limit} seconds`);
          }
        } else {
          console.log(`⏱️ NOT A CLIENT - Using default: 7200 seconds`);
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
  // Call timer effect with dynamic duration warning
  // Warning shows at 90% of session duration limit
  // For 2-hour default: warns at 110 minutes (6600 seconds)
  // For therapist-set limits: warns at 90% of that limit
  useEffect(() => {
    if (isSessionActive) {
      // Calculate warning threshold: 90% of duration limit for short sessions,
      // or 10 minutes before end for long sessions (whichever comes first)
      const tenMinutesBeforeEnd = sessionDurationLimit - 600;
      const ninetyPercent = Math.floor(sessionDurationLimit * 0.9);
      const warningThreshold = Math.min(tenMinutesBeforeEnd, ninetyPercent);

      const interval = setInterval(() => {
        setCallTimer(prev => {
          const newTimer = prev + 1;

          // Show warning at calculated threshold
          if (newTimer >= warningThreshold && !showDurationWarning) {
            setShowDurationWarning(true);
            console.log(`⚠️ Session duration warning: ${sessionDurationLimit - newTimer} seconds remaining`);
          }

          // Note: Vapi will automatically end the call at maxDurationSeconds
          // We don't need to manually end it here anymore

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
  }, [isSessionActive, showDurationWarning, sessionDurationLimit]);

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

      // Get fresh auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      
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

  // NEW: Handle sending text messages
  const handleSendTextMessage = async () => {
    if (!textInput.trim() || isSessionActive || !activeTextSessionId) return;

    const userMessage = textInput.trim();
    setTextInput(''); // Clear input immediately

    // Optimistic update - add user message to transcript
    const userMsgId = `msg-${Date.now()}-user`;
    setTranscript(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      source: 'text',
    }]);

    setIsSendingText(true);

    try {
      // Get fresh session with better error handling
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [TEXT] Session error:', sessionError);
        throw new Error('Failed to get authentication session');
      }

      const token = sessionData?.session?.access_token;
      const authenticatedUserId = sessionData?.session?.user?.id;

      console.log('🔐 [TEXT] Auth check:', {
        hasSession: !!sessionData?.session,
        hasToken: !!token,
        tokenLength: token?.length,
        tokenPrefix: token?.substring(0, 20) + '...',
        propUserId: userId,
        sessionUserId: authenticatedUserId,
        userIdMatch: userId === authenticatedUserId
      });

      if (!token || !authenticatedUserId) {
        throw new Error('Not authenticated - please refresh the page');
      }

      // Validate token format (should be JWT with 3 parts)
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        console.error('❌ [TEXT] Malformed token:', {
          parts: tokenParts.length,
          expected: 3
        });
        throw new Error('Invalid authentication token - please sign in again');
      }

      // Use the authenticated user ID from the session, not the prop
      const requestUserId = authenticatedUserId;

      // Call backend chat endpoint
      // Send conversation history to maintain context
      const conversationHistory = transcript
        .filter(msg => msg.source === 'text') // Only text messages, not voice
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: requestUserId,
          sessionId: activeTextSessionId,
          agentId: selectedAgentId,
          agentName: selectedAgent?.name,
          systemPrompt: selectedAgent?.systemPrompt,
          modelConfig: selectedAgent?.model,
          message: userMessage,
          conversationHistory, // Include previous messages for context
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [TEXT] Server error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });

        // Handle specific error types
        if (response.status === 401) {
          throw new Error('Authentication expired - please refresh the page and sign in again');
        } else if (response.status === 403) {
          throw new Error('Authentication error - please refresh the page');
        } else {
          throw new Error(errorText || 'Failed to send message');
        }
      }

      // Handle streaming response (Server-Sent Events)
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      let assistantContent = '';
      const assistantMsgId = `msg-${Date.now()}-assistant`;

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              assistantContent += parsed.content;

              // Update or add assistant message
              setTranscript(prev => {
                const existing = prev.find(m => m.id === assistantMsgId);
                if (existing) {
                  return prev.map(m =>
                    m.id === assistantMsgId
                      ? { ...m, content: assistantContent }
                      : m
                  );
                } else {
                  return [...prev, {
                    id: assistantMsgId,
                    role: 'assistant',
                    content: assistantContent,
                    timestamp: new Date(),
                    source: 'text',
                    agentId: selectedAgentId,
                  }];
                }
              });
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      console.log('✅ [TEXT] Message sent successfully');

    } catch (error: any) {
      console.error('❌ [TEXT] Failed to send message:', error);

      // Show detailed error message in transcript
      const errorMessage = error.message?.includes('OpenAI API key')
        ? '⚠️ Server configuration error: OpenAI API key not configured. Please contact support.'
        : error.message?.includes('not configured')
        ? '⚠️ Server configuration error. Please contact support.'
        : error.message?.includes('authenticated')
        ? '⚠️ Authentication error. Please refresh the page and try again.'
        : '⚠️ Sorry, I encountered an error sending your message. Please try again.';

      setTranscript(prev => [...prev, {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
        source: 'text',
      }]);
    } finally {
      setIsSendingText(false);
      // Refocus the textarea after sending message
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
    }
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
                onAccountDeleted={async () => {
                  console.log('🔓 Account deleted callback - clearing session...');

                  // Sign out from Supabase
                  try {
                    await supabase.auth.signOut();
                    console.log('✅ Supabase sign out complete');
                  } catch (error) {
                    console.error('Error signing out:', error);
                  }

                  // Clear all storage
                  localStorage.clear();
                  sessionStorage.clear();

                  // Update state
                  setUserId(null);

                  // Force hard reload to clear React state
                  window.location.href = '/';
                }}
              />
              <Link href="/faq">
                <Button 
                  variant="outline"
                  data-testid="button-faq"
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  FAQ
                </Button>
              </Link>
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
                          {subscription.limits.is_trial && (subscription.limits.trial_days_left ?? 0) > 0 && (
                            <span className="block">
                              {subscription.limits.trial_days_left} day{(subscription.limits.trial_days_left ?? 0) !== 1 ? 's' : ''} remaining
                            </span>
                          )}
                          <span className="block">{subscription.limits.minutes_remaining} minutes remaining</span>
                          <span className="block">{subscription.limits.minutes_remaining} minutes remaining</span>
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

            {/* Technical Support Card */}
            <TechnicalSupportCard />

            {/* Agent Selection */}
            <AgentSelector 
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              disabled={isSessionActive || isLoading}
            />

            {/* VAPI Error Alert */}
            {vapiError && (
              <Alert className="glass-strong border-red-500/50 rounded-xl sm:rounded-2xl">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-sm sm:text-base">
                  <div className="flex items-start justify-between">
                    <div>
                      <strong>Session Error:</strong> {vapiError}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearError}
                      className="ml-2 h-6 px-2"
                    >
                      Dismiss
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Session Duration Warning Alert - shows based on session limit */}
            {showDurationWarning && isSessionActive && (
              <Alert className="glass-strong border-yellow-500/50 rounded-xl sm:rounded-2xl">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-sm sm:text-base">
                  <strong>Session Time Limit:</strong> Your session will automatically end in {Math.floor((sessionDurationLimit - callTimer) / 60)} minutes ({sessionDurationLimit - callTimer} seconds).
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
                              Max duration: {Math.floor(sessionDurationLimit / 60)} minutes
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live Conversation Transcript - NOW FUNCTIONAL */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                  <i className="fas fa-comments text-accent text-sm sm:text-base"></i>
                  <h3 className="text-lg sm:text-xl font-semibold">Live Conversation</h3>
                </div>

                <div className="space-y-4 max-h-80 overflow-y-auto" data-testid="transcript-container">
                  {transcript.length === 0 ? (
                    // Placeholder when no messages
                    <>
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
                        <p className="text-sm text-muted-foreground italic">
                          {isSessionActive
                            ? "Listening... start speaking to see live transcription"
                            : "Start a voice session or send a text message to begin"}
                        </p>
                      </div>
                    </>
                  ) : (
                    // Real transcript messages
                    transcript.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg p-3 ${
                          msg.role === 'assistant'
                            ? 'bg-secondary/50'
                            : 'bg-primary/20 ml-8'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-xs">
                            {msg.source === 'voice' ? '🎤' : '💬'}
                          </span>
                          <span className="text-sm font-medium">
                            {msg.role === 'assistant'
                              ? (selectedAgent?.name || 'Sarah')
                              : 'You'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    ))
                  )}
                  {/* Auto-scroll anchor */}
                  <div ref={transcriptEndRef} />
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  {/* Text Session Management - NEW */}
                  {!isSessionActive && !activeTextSessionId && (
                    <div className="mb-4">
                      <Button
                        onClick={startTextSession}
                        className="w-full"
                      >
                        <div className="flex items-center space-x-2">
                          <span>💬</span>
                          <span>Start Text Session</span>
                        </div>
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Start a text conversation with {selectedAgent?.name}
                      </p>
                    </div>
                  )}

                  {/* Text Input Section - Active Session */}
                  {!isSessionActive && activeTextSessionId && (
                    <>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSendTextMessage();
                        }}
                        className="mb-4"
                      >
                        <div className="flex items-end space-x-2">
                          <textarea
                            ref={textInputRef}
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendTextMessage();
                              }
                            }}
                            placeholder={`Send a text message to ${selectedAgent?.name}...`}
                            className="flex-1 px-3 py-2 rounded-lg glass border border-white/10 resize-none text-sm"
                            rows={2}
                            disabled={isSendingText}
                            data-testid="input-text-message"
                            autoFocus={!!activeTextSessionId}
                          />
                          <Button
                            type="submit"
                            disabled={!textInput.trim() || isSendingText}
                            className="px-4 py-2 h-auto"
                          >
                            {isSendingText ? (
                              <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Sending...</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span>💬</span>
                                <span>Send</span>
                              </div>
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          💬 Text session active • Press Enter to send, Shift+Enter for new line
                        </p>
                      </form>
                      <Button
                        onClick={stopTextSession}
                        variant="outline"
                        className="w-full mb-4"
                        disabled={isStoppingSession}
                      >
                        {isStoppingSession ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span>Saving Session...</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span>⏹️</span>
                            <span>Stop Text Session</span>
                          </div>
                        )}
                      </Button>
                    </>
                  )}

                  {/* Mode indicator */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {isSessionActive
                        ? "🎤 Voice mode active - End session to use text"
                        : activeTextSessionId
                        ? "💬 Text session active"
                        : "💬 Text mode ready"}
                    </span>
                    <span className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${
                        isSessionActive || activeTextSessionId ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                      }`}></div>
                      <span>{isSessionActive ? 'Recording' : activeTextSessionId ? 'Chatting' : 'Ready'}</span>
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

                <Button
                  variant="ghost"
                  className="mt-4 text-sm text-accent hover:text-accent/80 transition-colors duration-200 p-0"
                  onClick={() => setShowHistoryDialog(true)}
                >
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

      {/* Full Session History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <i className="fas fa-brain text-accent"></i>
              <span>Full Session History</span>
            </DialogTitle>
            <DialogDescription>
              Complete memory context and session details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Memory Context Section */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center space-x-2">
                <i className="fas fa-lightbulb text-accent"></i>
                <span>Therapeutic Insights</span>
              </h4>
              <div className="space-y-2">
                {userContext?.memoryContext?.split('\n').filter(line => line.trim()).map((line, index) => (
                  <div key={index} className="bg-secondary/30 rounded-lg p-3">
                    <p className="text-sm">{line}</p>
                  </div>
                ))}
                {(!userContext?.memoryContext || userContext.memoryContext.trim() === '') && (
                  <div className="bg-secondary/30 rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">No insights yet. Start your therapeutic journey!</p>
                  </div>
                )}
              </div>
            </div>

            {/* All Sessions Section */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center space-x-2">
                <i className="fas fa-history text-accent"></i>
                <span>All Sessions ({userContext?.sessions?.length || 0})</span>
              </h4>
              <div className="space-y-3">
                {userContext?.sessions && userContext.sessions.length > 0 ? (
                  userContext.sessions.map((session, index) => (
                    <div key={session.id} className="bg-secondary/20 rounded-lg p-4 border border-border/50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <p className="text-sm font-medium">
                              Session {userContext.sessions.length - index}
                            </p>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <p>
                              <i className="fas fa-calendar mr-2"></i>
                              {new Date(session.created_at).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                            <p>
                              <i className="fas fa-clock mr-2"></i>
                              {new Date(session.created_at).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            <p>
                              <i className="fas fa-hourglass-half mr-2"></i>
                              Duration: {session.duration_seconds ? Math.floor(session.duration_seconds / 60) : 0} minutes
                            </p>
                            {session.agent_name && (
                              <p>
                                <i className="fas fa-user-md mr-2"></i>
                                Agent: {session.agent_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-1">
                          {session.has_transcript && (
                            <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
                              <i className="fas fa-file-alt mr-1"></i>Transcript
                            </span>
                          )}
                          {session.has_summary && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                              <i className="fas fa-file-text mr-1"></i>Summary
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-secondary/20 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No sessions yet. Start your first conversation!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Session Statistics */}
            {userContext?.sessions && userContext.sessions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center space-x-2">
                  <i className="fas fa-chart-line text-accent"></i>
                  <span>Statistics</span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-secondary/20 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Sessions</p>
                    <p className="text-2xl font-bold">{userContext.sessions.length}</p>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Time</p>
                    <p className="text-2xl font-bold">
                      {Math.round(userContext.sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / 60)} min
                    </p>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Average Duration</p>
                    <p className="text-2xl font-bold">
                      {userContext.sessions.length > 0
                        ? Math.round(userContext.sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / userContext.sessions.length / 60)
                        : 0} min
                    </p>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">This Week</p>
                    <p className="text-2xl font-bold">
                      {userContext.sessions.filter(s => {
                        const sessionDate = new Date(s.created_at);
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        return sessionDate >= weekAgo;
                      }).length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}