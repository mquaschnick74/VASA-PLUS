import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Clock, CheckCircle, XCircle, HelpCircle, Mic, MessageSquare } from 'lucide-react';
import useVapi from '@/hooks/use-vapi';
import AvatarAura, { AuraState } from '@/components/AvatarAura';
import AgentSelector from './AgentSelector';
import { TechnicalSupportCard } from './TechnicalSupportCard';
import { getAgentById } from '../config/agent-configs';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';
import { getApiUrl, isNativeApp, API_BASE_URL } from '@/lib/platform';
import { useSubscription } from '@/hooks/use-subscription';
import { safeLog } from '@/lib/safeLog';
import { Link, useLocation } from 'wouter';

interface VoiceInterfaceProps {
  userId: string;
  setUserId: (id: string | null) => void;
  hideLogoutButton?: boolean;
}

interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
  displayMemoryContext?: string;
  lastSessionSummary?: string | null;
  shouldReferenceLastSession?: boolean;
  hasUnaddressedUpload?: boolean;
  uploadAddressed?: boolean;
  uploadContext?: string | null;
  uploadId?: string | null;
  sessions: any[];
  firstName: string;
  sessionCount: number;
  sessionDurationLimit?: number;
  onboarding?: OnboardingData | null;
}

const AGENT_COLOR_MAP: Record<string, string> = {
  primary: '#7c3aed', violet: '#7c3aed', purple: '#9333ea',
  indigo: '#4f8ef7',
  blue: '#3b82f6', cyan: '#06b6d4', teal: '#14b8a6',
  green: '#22c55e', amber: '#f59e0b', orange: '#f97316',
  rose: '#f43f5e', red: '#ef4444',
};
function resolveAgentColor(color?: string): string {
  if (!color) return '#7c3aed';
  if (color.startsWith('#')) return color;
  return AGENT_COLOR_MAP[color.toLowerCase()] ?? '#7c3aed';
}

export default function VoiceInterface({ userId, setUserId, hideLogoutButton: _hideLogoutButton }: VoiceInterfaceProps) {
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('sarah');
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [showDurationWarning, setShowDurationWarning] = useState(false);
  const [sessionDurationLimit, setSessionDurationLimit] = useState(7200);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  // Tracks whether the agent is actively processing a user turn.
  // Set true when a user transcript arrives (agent now processing),
  // set false when the agent transcript arrives (response complete).
  // Driven by transcript events — stable and event-driven, not derived
  // from speakingRole which re-evaluates on every render and causes flickering.
  const [showTranscript, setShowTranscript] = useState(false);

  const [, setLocation] = useLocation();

  const [transcript, setTranscript] = useState<ExtendedTranscriptMessage[]>(() => {
    const saved = localStorage.getItem('vasa_text_transcript');
    return saved ? JSON.parse(saved) : [];
  });
  const [textInput, setTextInput] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [activeTextSessionId, setActiveTextSessionId] = useState<string | null>(() => {
    return localStorage.getItem('vasa_text_session_id');
  });
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const [typewriterMessageId, setTypewriterMessageId] = useState<string | null>(null);
  const [displayedContent, setDisplayedContent] = useState<Record<string, string>>({});
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typewriterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (activeTextSessionId) {
      localStorage.setItem('vasa_text_session_id', activeTextSessionId);
      localStorage.setItem('vasa_text_transcript', JSON.stringify(transcript));
    } else {
      localStorage.removeItem('vasa_text_session_id');
      localStorage.removeItem('vasa_text_transcript');
    }
  }, [activeTextSessionId, transcript]);

  useEffect(() => {
    if (activeTextSessionId && textInputRef.current) {
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
    speakingRole,
    isAgentThinking,
    isAgentSpeakingActive,
    error: vapiError,
    clearError
  } = useVapi({
    userId,
    memoryContext: userContext?.memoryContext || '',
    lastSessionSummary: userContext?.lastSessionSummary || null,
    shouldReferenceLastSession: userContext?.shouldReferenceLastSession || false,
    hasUnaddressedUpload: userContext?.hasUnaddressedUpload || false,
    uploadAddressed: userContext?.uploadAddressed || false,
    uploadContext: userContext?.uploadContext || null,
    uploadId: userContext?.uploadId || null,
    firstName: userContext?.firstName || 'there',
    selectedAgent: selectedAgent!,
    sessionDurationLimit: sessionDurationLimit,
    onboarding: userContext?.onboarding || null
  });

  // Wire voice transcript events to the transcript state.
  // Also drives isAgentThinking:
  //   user turn arrives   → agent is now processing   → true
  //   assistant turn arrives → agent responded         → false
  useEffect(() => {
    onTranscript((message: TranscriptMessage) => {
      const msgId = `voice-${Date.now()}-${message.role}-${Math.random().toString(36).substr(2, 6)}`;
      setTranscript(prev => [...prev, {
        id: msgId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        source: 'voice' as const,
        agentId: message.role === 'assistant' ? selectedAgentId : undefined,
      }]);
    });
  }, [onTranscript]);

  const { data: subscription, isLoading: subscriptionLoading } = useSubscription(userId);

  safeLog('subscription_status', { tier: subscription?.limits?.subscription_tier, loading: subscriptionLoading });

  const prevSessionActive = useRef(isSessionActive);
  useEffect(() => {
    if (prevSessionActive.current && !isSessionActive) {
      console.log('📴 [VOICE] Voice session ended - preserving transcript for post-call display');
      setActiveTextSessionId(null);
      setTypewriterMessageId(null);
      setDisplayedContent({});
      setShowTranscript(true);
      localStorage.removeItem('vasa_text_session_id');
      localStorage.removeItem('vasa_text_transcript');
    }
    prevSessionActive.current = isSessionActive;
  }, [isSessionActive]);

  const lastTranscriptLengthRef = useRef(0);
  useEffect(() => {
    if (transcript.length > lastTranscriptLengthRef.current) {
      lastTranscriptLengthRef.current = transcript.length;
      requestAnimationFrame(() => {
        if (transcriptContainerRef.current) {
          transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
        }
      });
    }
  }, [transcript.length]);

  useEffect(() => {
    if (!typewriterMessageId) {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
      return;
    }
    const message = transcript.find(m => m.id === typewriterMessageId);
    if (!message) return;
    const fullContent = message.content;
    const currentDisplayed = displayedContent[typewriterMessageId] || '';
    if (currentDisplayed.length >= fullContent.length) {
      setTypewriterMessageId(null);
      return;
    }

    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
    }
    if (typewriterTimeoutRef.current) {
      clearTimeout(typewriterTimeoutRef.current);
    }

    const charsPerInterval = 2;
    const intervalDelay = 30;
    const expectedDuration = (fullContent.length / charsPerInterval) * intervalDelay;
    const safetyTimeout = Math.max(expectedDuration * 2, 15000);

    typewriterTimeoutRef.current = setTimeout(() => {
      console.warn('⚠️ [TYPEWRITER] Safety timeout reached - force-completing animation');
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      setDisplayedContent(prev => ({ ...prev, [typewriterMessageId]: fullContent }));
      setTypewriterMessageId(null);
    }, safetyTimeout);

    typewriterIntervalRef.current = setInterval(() => {
      setDisplayedContent(prev => {
        const current = prev[typewriterMessageId] || '';
        if (current.length >= fullContent.length) {
          if (typewriterIntervalRef.current) {
            clearInterval(typewriterIntervalRef.current);
            typewriterIntervalRef.current = null;
          }
          if (typewriterTimeoutRef.current) {
            clearTimeout(typewriterTimeoutRef.current);
            typewriterTimeoutRef.current = null;
          }
          setTypewriterMessageId(null);
          return prev;
        }
        const nextLength = Math.min(current.length + charsPerInterval, fullContent.length);
        return { ...prev, [typewriterMessageId]: fullContent.substring(0, nextLength) };
      });
    }, intervalDelay);

    return () => {
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
      if (typewriterTimeoutRef.current) clearTimeout(typewriterTimeoutRef.current);
    };
  }, [typewriterMessageId, transcript, displayedContent]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeTextSessionId && transcript.length > 0) {
        const message = 'You have an active text session. Click "Stop Text Session" to save your conversation.';
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeTextSessionId, transcript]);

  const startTextSession = () => {
    const sessionId = crypto.randomUUID();
    setActiveTextSessionId(sessionId);
    setTranscript([]);
    setShowTranscript(true); // ADD THIS LINE
    console.log('📝 [TEXT] Started new text session:', sessionId);
  };

  const stopTextSession = async () => {
    if (!activeTextSessionId) return;
    const textMessages = transcript.filter(msg => msg.source === 'text');
    if (textMessages.length === 0) {
      setActiveTextSessionId(null);
      setTranscript([]);
      return;
    }
    if (isStoppingSession) return;

    setIsStoppingSession(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('Authentication error. Please refresh the page.');
      }
      const token = sessionData.session.access_token;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(getApiUrl('/api/chat/end-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        ...(isNativeApp ? {} : { credentials: 'include' as RequestCredentials }),
        body: JSON.stringify({
          sessionId: activeTextSessionId,
          agentName: selectedAgent?.name,
          transcript: textMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
          })),
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json();
          console.log('✅ [TEXT] Session processing completed:', result);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('❌ [TEXT] Request timed out after 30 seconds');
      } else {
        console.error('❌ [TEXT] Error stopping session:', error.message);
      }
    } finally {
      setIsStoppingSession(false);
      setActiveTextSessionId(null);
      setTranscript([]);
    }
  };

  useEffect(() => {
    const loadUserContext = async () => {
      if (!userId) return;
      setMemoryLoading(true);
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          handleLogout(setUserId);
          return;
        }
        const authToken = session.access_token;
        const headers: Record<string, string> = { 'Authorization': `Bearer ${authToken}` };
        const timestamp = Date.now();
        const response = await fetch(getApiUrl(`/api/auth/user-context/${userId}?_t=${timestamp}`), {
          method: 'GET',
          headers
        });

        if (response.ok) {
          const data = await response.json();
          setUserContext(data);
        } else if (response.status === 404) {
          localStorage.removeItem('userId');
          setUserId(null);
          return;
        }

        const relationshipResponse = await fetch(getApiUrl(`/api/therapist/client-settings/${userId}`), { headers });
        if (relationshipResponse.ok) {
          const relationshipData = await relationshipResponse.json();
          if (relationshipData.session_duration_limit) {
            setSessionDurationLimit(relationshipData.session_duration_limit);
          }
        }
      } catch (error: any) {
        console.error('❌ [VOICE-INTERFACE] Fetch error:', error?.message);
      } finally {
        setMemoryLoading(false);
      }
    };
    loadUserContext();
  }, [userId]);

  useEffect(() => {
    if (isSessionActive) {
      const tenMinutesBeforeEnd = sessionDurationLimit - 600;
      const ninetyPercent = Math.floor(sessionDurationLimit * 0.9);
      const warningThreshold = Math.min(tenMinutesBeforeEnd, ninetyPercent);

      const interval = setInterval(() => {
        setCallTimer(prev => {
          const newTimer = prev + 1;
          if (newTimer >= warningThreshold && !showDurationWarning) {
            setShowDurationWarning(true);
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
    return () => { if (timerInterval) clearInterval(timerInterval); };
  }, [isSessionActive, showDurationWarning, sessionDurationLimit]);

  const handleStartSession = () => {
    if (subscription && subscription.limits?.can_use_voice === false) {
      alert(
        subscription.limits.is_using_therapist_subscription
          ? `Your therapist's subscription has no minutes remaining. They need to upgrade.`
          : `You have used all your available minutes. Please upgrade your subscription.`
      );
      return;
    }
    if (!memoryLoading && userContext && selectedAgent) {
      console.log('10. STARTING SESSION');
      const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setCurrentCallId(callId);
      setTranscript([]);
      setShowTranscript(false);
      startSession();
    }
  };

  const handleEndCall = async () => {
    if (!currentCallId) { endSession(); return; }
    try {
      endSession();
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      await fetch(getApiUrl('/api/vapi/webhook'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          message: {
            type: 'end-of-call-report',
            call: { id: currentCallId },
            endedReason: 'user-ended'
          }
        })
      });
      setCurrentCallId(null);
    } catch (error) {
      endSession();
      setCurrentCallId(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) { setLocation('/pricing'); return; }
      const token = sessionData.session.access_token;
      const response = await fetch(getApiUrl('/api/stripe/create-portal-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        if (response.status === 404) { setLocation('/pricing'); return; }
        alert(error.error || 'Failed to open subscription management. Please try again.');
        return;
      }
      const { url } = await response.json();
      window.location.href = url;
    } catch { setLocation('/pricing'); }
  };

  const handleSendTextMessage = async () => {
    if (!textInput.trim() || isSessionActive || !activeTextSessionId) return;
    const userMessage = textInput.trim();
    setTextInput('');
    const userMsgId = `msg-${Date.now()}-user`;
    setTranscript(prev => [...prev, {
      id: userMsgId, role: 'user', content: userMessage,
      timestamp: new Date(), source: 'text',
    }]);
    setIsSendingText(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Failed to get authentication session');
      const token = sessionData?.session?.access_token;
      const authenticatedUserId = sessionData?.session?.user?.id;
      if (!token || !authenticatedUserId) throw new Error('Not authenticated - please refresh the page');
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) throw new Error('Invalid authentication token - please sign in again');

      const conversationHistory = transcript
        .filter(msg => msg.source === 'text')
        .map(msg => ({ role: msg.role, content: msg.content }));

      const response = await fetch(getApiUrl('/api/chat/send-message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({
          userId: authenticatedUserId,
          sessionId: activeTextSessionId,
          agentId: selectedAgentId,
          agentName: selectedAgent?.name,
          systemPrompt: selectedAgent?.systemPrompt,
          modelConfig: selectedAgent?.model,
          message: userMessage,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) throw new Error('Authentication expired - please refresh the page and sign in again');
        if (response.status === 403) throw new Error('Authentication error - please refresh the page');
        throw new Error(errorText || 'Failed to send message');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMsgId = `msg-${Date.now()}-assistant`;

      // Buffer to accumulate partial SSE data across read boundaries
      // SSE chunks can be split at arbitrary byte boundaries by the network,
      // so we must buffer until we see the \n\n event terminator
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        let eventEnd;
        while ((eventEnd = sseBuffer.indexOf('\n\n')) !== -1) {
          const event = sseBuffer.slice(0, eventEnd);
          sseBuffer = sseBuffer.slice(eventEnd + 2);

          for (const line of event.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  assistantContent += parsed.content;
                }
              } catch (e) {
                console.error('❌ [TEXT] Failed to parse SSE data:', data, e);
              }
            }
          }
        }
      }

      sseBuffer += decoder.decode();
      console.log('🏁 [SSE] Final assistantContent:', assistantContent.length, 'chars, content:', assistantContent);

      setTranscript(prev => [...prev, {
        id: assistantMsgId, role: 'assistant', content: assistantContent,
        timestamp: new Date(), source: 'text', agentId: selectedAgentId,
      }]);
      setDisplayedContent(prev => ({ ...prev, [assistantMsgId]: '' }));
      setTypewriterMessageId(assistantMsgId);
    } catch (error: any) {
      const errorMessage = error.message?.includes('authenticated')
        ? '⚠️ Authentication error. Please refresh the page and try again.'
        : '⚠️ Sorry, I encountered an error sending your message. Please try again.';
      setTranscript(prev => [...prev, {
        id: `msg-${Date.now()}-error`, role: 'assistant', content: errorMessage,
        timestamp: new Date(), source: 'text',
      }]);
    } finally {
      setIsSendingText(false);
      setTimeout(() => { textInputRef.current?.focus(); }, 100);
    }
  };

  const getAuraState = (): AuraState => {
    if (connectionStatus === 'connecting' || isLoading) return 'connecting';
    if (!isSessionActive) return 'idle';
    if (speakingRole === 'user') return 'user-speaking';
    if (speakingRole === 'assistant' || isAgentSpeakingActive) return 'agent-speaking';
    if (isAgentThinking) return 'agent-thinking';
    return 'idle';
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDisplayInsights = () => {
    const contextToDisplay = userContext?.displayMemoryContext || userContext?.memoryContext || '';
    if (contextToDisplay && !contextToDisplay.includes('\n\n') && contextToDisplay.length > 50) {
      return [contextToDisplay];
    }
    const lines = contextToDisplay.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const lowerLine = trimmed.toLowerCase();
      return !lowerLine.includes('exchangecount') && !lowerLine.includes('narrativedepth') &&
             !lowerLine.includes('therapeuticarc') && !lowerLine.includes('dominantmovement') &&
             !lowerLine.includes('"processinsights"') && !lowerLine.includes('"emotionalrange"') &&
             !trimmed.startsWith('{') && !trimmed.startsWith('}');
    });
    return lines.length > 0 ? lines : ['Starting your therapeutic journey'];
  };

  if (memoryLoading || !userContext || !selectedAgent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {!selectedAgent ? 'Loading agent configuration...' : 'Loading your therapeutic space...'}
          </p>
        </div>
      </div>
    );
  }

  const auraState = getAuraState();

  return (
    <div>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:gap-4 glass rounded-lg p-3 sm:p-4">
          <div className="glass rounded-full px-3 sm:px-4 py-1 sm:py-2">
            <span className="text-xs sm:text-sm text-muted-foreground">Welcome, {userContext.firstName}</span>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">

          <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">

            {subscriptionLoading && (
              <Card className="glass-strong rounded-xl sm:rounded-2xl border-0">
                <CardContent className="p-4"><p>Loading subscription...</p></CardContent>
              </Card>
            )}

            {!subscriptionLoading && !subscription && (
              <Card className="glass-strong rounded-xl sm:rounded-2xl border-0">
                <CardContent className="p-4"><p className="text-red-500">Failed to load subscription data</p></CardContent>
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
                          {subscription.limits.is_using_therapist_subscription && subscription.limits.subscription_owner_email && (
                            <span className="block mt-1">Therapist: {subscription.limits.subscription_owner_email}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {!subscription.limits.is_using_therapist_subscription && (
                      subscription.limits.subscription_tier === 'trial' ? (
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => setLocation('/pricing')}>Upgrade</Button>
                      ) : (
                        <Button variant="outline" size="sm" className="text-xs" onClick={handleManageSubscription}>Manage</Button>
                      )
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="bg-secondary/20 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          ((subscription.limits.minutes_used / subscription.limits.minutes_limit) * 100) > 80 ? 'bg-red-500' :
                          ((subscription.limits.minutes_used / subscription.limits.minutes_limit) * 100) > 50 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${(subscription.limits.minutes_used / subscription.limits.minutes_limit) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>{subscription.limits.minutes_used} used{subscription.limits.is_using_therapist_subscription && ' by ALL clients'}</span>
                      <span>{subscription.limits.minutes_limit} total</span>
                    </div>
                  </div>
                  {subscription.limits.minutes_remaining <= 5 && subscription.limits.minutes_remaining > 0 && (
                    <Alert className="mt-3 bg-yellow-500/10 border-yellow-500/50">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <AlertDescription className="text-xs">
                        {subscription.limits.is_using_therapist_subscription
                          ? `Your therapist has ${subscription.limits.minutes_remaining} minutes left.`
                          : `You have ${subscription.limits.minutes_remaining} minutes left. Upgrade to continue after your limit.`}
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

            <TechnicalSupportCard />

            <AgentSelector
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              disabled={isSessionActive || isLoading}
            />

            {vapiError && (
              <Alert className="glass-strong border-red-500/50 rounded-xl sm:rounded-2xl">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-sm sm:text-base">
                  <div className="flex items-start justify-between">
                    <div><strong>Session Error:</strong> {vapiError}</div>
                    <Button variant="ghost" size="sm" onClick={clearError} className="ml-2 h-6 px-2">Dismiss</Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {showDurationWarning && isSessionActive && (
              <Alert className="glass-strong border-yellow-500/50 rounded-xl sm:rounded-2xl">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-sm sm:text-base">
                  <strong>Session Time Limit:</strong> Your session will automatically end in {Math.floor((sessionDurationLimit - callTimer) / 60)} minutes ({sessionDurationLimit - callTimer} seconds).
                </AlertDescription>
              </Alert>
            )}

            <Card className="glass-strong rounded-2xl sm:rounded-3xl border-0">
              <CardContent className="p-4 sm:p-6 lg:p-8">
                <div className="text-center space-y-4 mb-6">
                  <div className="relative inline-flex items-center justify-center" style={{ padding: '18px' }}>
                    <AvatarAura state={auraState} agentColor={selectedAgent?.color} />
                    <div
                      className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-lg border-4 border-${selectedAgent?.color || 'primary'}/30 overflow-hidden`}
                      style={{ position: 'relative', zIndex: 1 }}
                    >
                      <img
                        src={selectedAgent?.image || '/agents/sarah.jpg'}
                        alt={selectedAgent?.name || 'Sarah'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      className="absolute -bottom-0 -right-0 w-6 h-6 sm:w-7 sm:h-7 bg-green-500 rounded-full border-4 border-background flex items-center justify-center"
                      style={{ zIndex: 2 }}
                    >
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-bold">{selectedAgent?.name || 'Sarah'}</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">{selectedAgent?.description || 'Your Therapeutic Voice Assistant'}</p>
                  </div>
                </div>

                {/* Session Mode Status
                  isAgentThinking is driven by transcript events — stable, no flickering.
                  true  = user turn arrived, waiting for agent response
                  false = agent turn arrived, response complete
                */}
                <div className="flex items-center justify-center mb-4">
                  {(isSessionActive || activeTextSessionId) ? (
                    <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${
                      isSessionActive
                        ? 'bg-red-500/20 border border-red-500/50'
                        : 'bg-blue-500/20 border border-blue-500/50'
                    }`}>
                      <div className={`w-2 h-2 rounded-full animate-pulse ${
                        isSessionActive
                          ? isAgentThinking ? 'bg-amber-400' : 'bg-red-500'
                          : 'bg-blue-500'
                      }`}></div>
                      <span className="text-xs sm:text-sm font-medium" data-testid="status-call">
                        {isSessionActive
                          ? isAgentThinking
                            ? `${selectedAgent?.name} is with you...`
                            : `Voice: Connected with ${selectedAgent?.name}`
                          : `Text: Chatting with ${selectedAgent?.name}`}
                      </span>
                    </div>
    ) : (
      <span data-testid="status-call" />
    )}
                </div>

                <div className="space-y-3 mb-6">
                  {!activeTextSessionId && (
                    <div className="flex justify-center">
                      {isSessionActive ? (
                        <button
                          onClick={handleEndCall}
                          className="group relative flex items-center gap-2 px-8 py-3 rounded-full font-medium text-sm text-white transition-all duration-300 hover:scale-105 active:scale-95"
                          style={{
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            boxShadow: '0 0 24px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                          }}
                          data-testid="button-call"
                        >
                          <Mic className="w-4 h-4" />
                          <span>End Session</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleStartSession}
                          disabled={isLoading || memoryLoading || (subscription?.limits.minutes_remaining === 0)}
                          className="group relative flex items-center gap-3 px-8 py-3 rounded-full font-medium text-sm text-white transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          style={{
                            background: subscription?.limits.minutes_remaining === 0
                              ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                              : `linear-gradient(135deg, ${resolveAgentColor(selectedAgent?.color)}, ${resolveAgentColor(selectedAgent?.color)}cc)`,
                            boxShadow: subscription?.limits.minutes_remaining === 0
                              ? 'none'
                              : `0 0 28px ${resolveAgentColor(selectedAgent?.color)}55, inset 0 1px 0 rgba(255,255,255,0.2)`,
                            border: `1px solid ${resolveAgentColor(selectedAgent?.color)}44`,
                          }}
                          data-testid="button-call"
                        >
                          <Mic className="w-4 h-4 shrink-0" />
                          <span>
                            {isLoading ? 'Connecting...' :
                             subscription?.limits.minutes_remaining === 0 ? 'Upgrade Required' :
                             'Start Voice Session'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {!isSessionActive && !activeTextSessionId && (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={startTextSession}
                        className="group flex items-center gap-3 px-8 py-2.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105 active:scale-95"
                        style={{
                          background: 'transparent',
                          border: `1px solid ${resolveAgentColor(selectedAgent?.color)}66`,
                          color: resolveAgentColor(selectedAgent?.color),
                          boxShadow: `inset 0 0 12px ${resolveAgentColor(selectedAgent?.color)}11`,
                        }}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span>Start Text Session</span>
                      </button>
                      <p className="text-xs text-emerald-500/80 text-center">✨ Text conversations are unlimited and free</p>
                    </div>
                  )}

                  {activeTextSessionId && (
                    <div className="flex justify-center">
                      <Button
                        onClick={stopTextSession}
                        disabled={isStoppingSession}
                        className="group relative px-6 py-2 sm:px-8 sm:py-3 rounded-full hover:shadow-xl transition-all duration-300 flex items-center justify-center font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:shadow-red-500/25"
                        data-testid="button-stop-text"
                      >
                        <span className="text-xs sm:text-sm group-hover:scale-105 transition-transform duration-200">
                          {isStoppingSession ? (
                            <span className="flex items-center space-x-2">
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Saving...</span>
                            </span>
                          ) : '⏹️ Stop Text Session'}
                        </span>
                      </Button>
                    </div>
                  )}

                  {isSessionActive && (
                    <div className="flex justify-center">
                      <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg glass ${showDurationWarning ? 'border-2 border-yellow-500/50' : ''}`}>
                        <div className={`w-2 h-2 ${showDurationWarning ? 'bg-yellow-500' : 'bg-red-500'} rounded-full animate-pulse`}></div>
                        <span className={`text-sm sm:text-base font-mono ${showDurationWarning ? 'text-yellow-500' : ''}`} data-testid="text-callTimer">
                          {formatTime(callTimer)}
                        </span>
                        {showDurationWarning && (
                          <span className="text-xs text-yellow-500">(Max: {Math.floor(sessionDurationLimit / 60)}m)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <i className="fas fa-comments text-accent text-sm"></i>
                    <h3 className="text-base sm:text-lg font-semibold">
                      {isSessionActive ? 'Voice Session Active' : 'Text Conversation'}
                    </h3>
                  </div>

                  <div ref={transcriptContainerRef} className="space-y-3 max-h-96 overflow-y-auto mb-4" data-testid="transcript-container">
                    {!showTranscript || transcript.length === 0 ? (
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
                              ? "Voice session active - speak naturally with your assistant"
                              : "Start a voice session or send a text message to begin"}
                          </p>
                        </div>
                      </>
                    ) : (
                      transcript.map((msg) => {
                        const isTyping = msg.id === typewriterMessageId;
                        const shouldAnimate = msg.role === 'assistant';
                        const displayContent = shouldAnimate && displayedContent[msg.id] !== undefined
                          ? displayedContent[msg.id]
                          : msg.content;
                        return (
                          <div
                            key={msg.id}
                            className={`rounded-lg p-3 ${msg.role === 'assistant' ? 'bg-secondary/50' : 'bg-primary/20 ml-8'}`}
                          >
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-sm font-medium">
                                {msg.role === 'assistant' ? (selectedAgent?.name || 'Sarah') : 'You'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </span>
                              {isTyping && <span className="text-xs text-muted-foreground italic ml-auto">typing...</span>}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">
                              {displayContent}
                              {isTyping && <span className="inline-block w-1 h-4 bg-accent ml-0.5 animate-pulse" />}
                            </p>
                          </div>
                        );
                      })
                    )}
                    {/* Typing indicator — shown while agent is formulating a text reply */}
                    {isSendingText && activeTextSessionId && (
                      <div className="rounded-lg p-3 bg-secondary/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-xs">💬</span>
                          <span className="text-sm font-medium">{selectedAgent?.name || 'Sarah'}</span>
                        </div>
                        <div className="flex items-center space-x-1 py-1">
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      </div>
                    )}
                      <div ref={transcriptEndRef} />
                    </div>

                  {!isSessionActive && activeTextSessionId && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <form onSubmit={(e) => { e.preventDefault(); handleSendTextMessage(); }} className="space-y-3">
                        <div className="flex items-end space-x-2">
                          <textarea
                            ref={textInputRef}
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTextMessage(); } }}
                            placeholder={`Send a text message to ${selectedAgent?.name}...`}
                            className="flex-1 px-3 py-2 rounded-lg glass border border-white/10 resize-none text-sm"
                            rows={2}
                            disabled={isSendingText}
                            data-testid="input-text-message"
                            autoFocus={!!activeTextSessionId}
                          />
                          <Button type="submit" disabled={!textInput.trim() || isSendingText} className="px-4 py-2 h-auto">
                            {isSendingText
                              ? <div className="flex items-center space-x-1"><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>
                              : <span>💬</span>}
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground text-center">Press Enter to send, Shift+Enter for new line</div>
                      </form>
                    </div>
                  )}

                  {isSessionActive && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                        <div className="flex items-center justify-center space-x-2 mb-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium text-red-400">Voice Session In Progress</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Speak naturally with {selectedAgent?.name || 'your assistant'}. End the voice session to use text chat.
                        </p>
                      </div>
                    </div>
                  )}

                  {!isSessionActive && !activeTextSessionId && transcript.length === 0 && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="text-xs text-center text-muted-foreground">Choose voice or text session to begin your conversation</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-chart-bar text-accent text-sm sm:text-base"></i>
                  <span>Your Progress</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Sessions</span>
                    <span className="text-2xl font-bold text-accent" data-testid="text-sessionCount">{userContext.sessionCount}</span>
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
                  className="mt-4 text-sm text-accent hover:text-accent hover:bg-accent/10 transition-colors duration-200 p-0"
                  onClick={() => setShowHistoryDialog(true)}
                >
                  View session history →
                </Button>
              </CardContent>
            </Card>

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
                        <p className="text-sm font-medium">{new Date(session.created_at).toLocaleDateString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.duration_seconds ? Math.floor(session.duration_seconds / 60) : 0} minutes
                        </p>
                      </div>
                      <div className="text-right"><div className="w-2 h-2 bg-green-500 rounded-full"></div></div>
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

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <i className="fas fa-brain text-accent"></i>
              <span>Session History</span>
            </DialogTitle>
            <DialogDescription>Complete memory context and session details</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center space-x-2">
                <i className="fas fa-lightbulb text-accent"></i>
                <span>Therapeutic Insights</span>
              </h4>
              <div className="space-y-2">
                {userContext?.memoryContext?.split('\n').filter(line => line.trim()).map((line, index) => (
                  <div key={index} className="bg-secondary/30 rounded-lg p-3"><p className="text-sm">{line}</p></div>
                ))}
                {(!userContext?.memoryContext || userContext.memoryContext.trim() === '') && (
                  <div className="bg-secondary/30 rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">No insights yet. Start your therapeutic journey!</p>
                  </div>
                )}
              </div>
            </div>
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
                            <p className="text-sm font-medium">Session {userContext.sessions.length - index}</p>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <p><i className="fas fa-calendar mr-2"></i>{new Date(session.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p><i className="fas fa-clock mr-2"></i>{new Date(session.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                            <p><i className="fas fa-hourglass-half mr-2"></i>Duration: {session.duration_seconds ? Math.floor(session.duration_seconds / 60) : 0} minutes</p>
                            {session.agent_name && <p><i className="fas fa-user-md mr-2"></i>Agent: {session.agent_name}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-1">
                          {session.has_transcript && <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded"><i className="fas fa-file-alt mr-1"></i>Transcript</span>}
                          {session.has_summary && <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded"><i className="fas fa-file-text mr-1"></i>Summary</span>}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-secondary/20 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">No sessions yet. Start your first conversation!</p>
                  </div>
                )}
              </div>
            </div>
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
                    <p className="text-2xl font-bold">{Math.round(userContext.sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / 60)} min</p>
                  </div>
                  <div className="bg-secondary/20 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Average Duration</p>
                    <p className="text-2xl font-bold">
                      {userContext.sessions.length > 0 ? Math.round(userContext.sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / userContext.sessions.length / 60) : 0} min
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