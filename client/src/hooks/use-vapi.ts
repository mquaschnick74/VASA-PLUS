import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent } from '../config/agent-configs';

// Types for live transcription
export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isFinal?: boolean;
  agentName?: string;
  mode?: 'voice' | 'text';  // Track which mode generated this message
}

// Chat modes
export type ChatMode = 'voice' | 'text';

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  lastSessionSummary?: string | null;  // PRESERVED: Session continuity
  shouldReferenceLastSession?: boolean; // PRESERVED: Session continuity  
  firstName: string;
  selectedAgent: TherapeuticAgent;
}

interface UseVapiReturn {
  // Session state
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';

  // NEW: Transcripts
  liveTranscripts: TranscriptMessage[];

  // NEW: Voice indicators
  isAssistantSpeaking: boolean;
  isUserSpeaking: boolean;

  // NEW: Text mode additions
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  sendTextMessage: (message: string) => Promise<void>;
  isTextLoading: boolean;
  textSessionId: string | null;
  switchMode: () => void;  // Convenience function to toggle modes
}

const MAX_TRANSCRIPT_MESSAGES = 30; // Limit to prevent memory bloat

const useVapi = ({ 
  userId, 
  memoryContext, 
  lastSessionSummary, 
  shouldReferenceLastSession,
  firstName, 
  selectedAgent 
}: UseVapiProps): UseVapiReturn => {
  // Voice state (existing)
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const vapiRef = useRef<any>(null);

  // NEW: Live transcription state
  const [liveTranscripts, setLiveTranscripts] = useState<TranscriptMessage[]>([]);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const partialTranscriptRef = useRef<string>('');

  // NEW: Text mode state
  const [chatMode, setChatMode] = useState<ChatMode>('voice');
  const [textSessionId, setTextSessionId] = useState<string | null>(null);
  const [isTextLoading, setIsTextLoading] = useState(false);

  // Helper function to add transcript with circular buffer
  const addTranscriptMessage = useCallback((message: Omit<TranscriptMessage, 'id' | 'timestamp'>) => {
    const newMessage: TranscriptMessage = {
      ...message,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      mode: message.mode || chatMode
    };

    setLiveTranscripts(prev => {
      const updated = [...prev, newMessage];
      if (updated.length > MAX_TRANSCRIPT_MESSAGES) {
        return updated.slice(-MAX_TRANSCRIPT_MESSAGES);
      }
      return updated;
    });
  }, [chatMode]);

  // Update the last message if it's partial
  const updateLastTranscript = useCallback((content: string, role: 'user' | 'assistant') => {
    setLiveTranscripts(prev => {
      if (prev.length === 0) {
        return [{
          id: `${Date.now()}-${Math.random()}`,
          role,
          content,
          timestamp: new Date(),
          isFinal: false,
          mode: chatMode
        }];
      }

      const lastMessage = prev[prev.length - 1];
      if (lastMessage.role === role && !lastMessage.isFinal) {
        return [
          ...prev.slice(0, -1),
          { ...lastMessage, content }
        ];
      } else {
        return [...prev, {
          id: `${Date.now()}-${Math.random()}`,
          role,
          content,
          timestamp: new Date(),
          isFinal: false,
          mode: chatMode
        }].slice(-MAX_TRANSCRIPT_MESSAGES);
      }
    });
  }, [chatMode]);

  // Finalize the last message
  const finalizeLastTranscript = useCallback((role: 'user' | 'assistant') => {
    setLiveTranscripts(prev => {
      if (prev.length === 0) return prev;

      const lastMessage = prev[prev.length - 1];
      if (lastMessage.role === role && !lastMessage.isFinal) {
        return [
          ...prev.slice(0, -1),
          { ...lastMessage, isFinal: true }
        ];
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      console.error('VAPI public key not found');
      return;
    }

    // Dynamically import VAPI when needed
    const initializeVapi = async () => {
      try {
        const { default: Vapi } = await import('@vapi-ai/web');
        const vapiInstance = new Vapi(publicKey);
        vapiRef.current = vapiInstance;
        setVapi(vapiInstance);

        // Set up event listeners for live transcription
        vapiInstance.on('call-start', () => {
          console.log('✅ Call started');
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);

          // Add initial system message
          addTranscriptMessage({
            role: 'system',
            content: `Voice call connected to ${selectedAgent.name}`,
            agentName: selectedAgent.name,
            mode: 'voice'
          });
        });

        vapiInstance.on('call-end', () => {
          console.log('📴 Call ended');
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
          setIsAssistantSpeaking(false);
          setIsUserSpeaking(false);

          // Add ending message
          addTranscriptMessage({
            role: 'system',
            content: 'Voice call ended',
            mode: 'voice'
          });
        });

        // NEW: Speech events for live transcription
        vapiInstance.on('speech-start', () => {
          console.log('🎤 User started speaking');
          setIsUserSpeaking(true);
          partialTranscriptRef.current = '';
        });

        vapiInstance.on('speech-end', () => {
          console.log('🔇 User stopped speaking');
          setIsUserSpeaking(false);
          finalizeLastTranscript('user');
        });

        // NEW: Live transcript events
        vapiInstance.on('transcript', (transcript: any) => {
          console.log('📝 Live transcript:', transcript);

          if (transcript?.text && transcript.text.trim()) {
            partialTranscriptRef.current = transcript.text;
            updateLastTranscript(transcript.text, 'user');
          }
        });

        // NEW: Message events for complete messages
        vapiInstance.on('message', (message: any) => {
          console.log('💬 Message event:', message);

          if (message?.role && message?.content) {
            const role = message.role === 'assistant' ? 'assistant' : 'user';

            // Clean content (no tags in voice mode due to system prompt)
            let content = message.content;

            addTranscriptMessage({
              role,
              content,
              isFinal: true,
              agentName: role === 'assistant' ? selectedAgent.name : undefined,
              mode: 'voice'
            });
          }
        });

        // NEW: Assistant message events
        vapiInstance.on('assistant-message', (message: any) => {
          console.log('🤖 Assistant message:', message);
          setIsAssistantSpeaking(true);

          let content = message?.content || message?.transcript || '';

          if (content) {
            addTranscriptMessage({
              role: 'assistant',
              content,
              isFinal: true,
              agentName: selectedAgent.name,
              mode: 'voice'
            });
          }

          setTimeout(() => setIsAssistantSpeaking(false), 500);
        });

        // PRESERVED: Original error handling
        vapiInstance.on('error', (error: any) => {
          console.error('VAPI error details:', {
            message: error?.error?.message || error?.message,
            status: error?.error?.status,
            fullError: error
          });
          setIsLoading(false);
          setConnectionStatus('disconnected');

          addTranscriptMessage({
            role: 'system',
            content: 'Voice connection error occurred',
            mode: 'voice'
          });
        });
      } catch (error) {
        console.error('Failed to initialize VAPI:', error);
        setConnectionStatus('disconnected');
      }
    };

    initializeVapi();

    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
    };
  }, [selectedAgent, addTranscriptMessage, updateLastTranscript, finalizeLastTranscript]);

  const startSession = useCallback(async () => {
    if (isLoading) return;

    // Clear previous transcripts
    setLiveTranscripts([]);

    if (chatMode === 'voice') {
      // Voice session start
      if (!vapi || !selectedAgent) return;

      setIsLoading(true);
      setConnectionStatus('connecting');

      try {
        const hasMemory = memoryContext && memoryContext.length > 50;
        let systemPrompt = selectedAgent.systemPrompt;

        // PRESERVED: Your greeting generation instructions
        systemPrompt = `GREETING GENERATION INSTRUCTION:
Your first message should be a warm, personalized greeting that:
1. References specific details from the session context below
2. Uses the user's actual words when available
3. Avoids generic phrases like "important parts of your story"
4. Shows continuity from previous sessions
5. Feels natural and conversational

VOICE SESSION MODE:
This is a voice conversation through VAPI. 
DO NOT include <speak>, </speak>, <meta>, or </meta> tags.
DO NOT output any JSON or metadata.
Just respond naturally with your therapeutic conversation.

` + systemPrompt;

        // PRESERVED: Session continuity context
        if (shouldReferenceLastSession && lastSessionSummary) {
          systemPrompt += `\n\n===== LAST SESSION CONTEXT =====
${lastSessionSummary}

IMPORTANT: You've already referenced this in your greeting. Build naturally from there.
Continue the therapeutic narrative without re-introducing the previous session.
===== END LAST SESSION =====\n`;
        }

        // PRESERVED: Memory context
        if (hasMemory) {
          systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====
${memoryContext}
===== END HISTORY =====

IMPORTANT: Reference the above context naturally in conversation when relevant.
Do not make up or hallucinate any details not explicitly mentioned above.`;
        } else if (!lastSessionSummary) {
          systemPrompt += '\n\nThis is your first session with this user. Get to know them gently.';
        }

        systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;

        const serverUrl = `${window.location.origin}/api/vapi/webhook`;

        // PRESERVED: All logging
        console.log('📍 Webhook URL:', serverUrl);
        console.log('📍 User ID:', userId);
        console.log('📍 Agent:', selectedAgent.name);
        console.log('📝 Session continuity:', shouldReferenceLastSession ? 'Enabled' : 'Disabled');

        const assistantConfig = {
          name: `VASA-${selectedAgent.name}`,
          model: {
            provider: 'openai',
            model: selectedAgent.model.model,
            temperature: selectedAgent.model.temperature,
            messages: [
              {
                role: 'system',
                content: systemPrompt
              }
            ],
            maxTokens: 150
          },
          voice: {
            provider: selectedAgent.voice.provider,
            voiceId: selectedAgent.voice.voiceId,
            stability: selectedAgent.voice.stability || 0.5,
            similarityBoost: 0.75,
            speed: selectedAgent.voice.speed || 1.0
          },
          serverUrl: serverUrl,
          server: {  // PRESERVED: Enhanced server config
            url: serverUrl,
            timeoutSeconds: 20,
            secret: import.meta.env.VITE_VAPI_SERVER_SECRET || undefined
          },
          firstMessage: null,  // PRESERVED: null for dynamic generation
          firstMessageMode: "assistant-speaks-first-with-model-generated-message", // PRESERVED
          transcriber: {
            provider: 'deepgram',
            model: 'nova-2',
            language: 'en'
          },
          recordingEnabled: true,
          metadata: {  // PRESERVED: All metadata
            userId: userId,
            agentName: selectedAgent.name,
            agentId: selectedAgent.id,
            hasSessionContinuity: shouldReferenceLastSession || false,
            timestamp: Date.now()
          }
        };

        console.log('🔍 Starting VAPI call with:', {
          assistant: assistantConfig,
          hasPublicKey: !!import.meta.env.VITE_VAPI_PUBLIC_KEY,
          hasSessionContinuity: shouldReferenceLastSession,
          metadata: { userId: userId, agentName: selectedAgent.name }
        });

        try {
          await vapi.start(assistantConfig);
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);
          // Note: First message will come through events, not hardcoded
        } catch (error) {
          console.error('❌ VAPI start failed:', error);
          throw error;
        }

      } catch (error) {
        console.error('Failed to start VAPI session:', error);
        setIsLoading(false);
        setConnectionStatus('disconnected');

        addTranscriptMessage({
          role: 'system',
          content: 'Failed to start voice session. Please try again.',
          mode: 'voice'
        });
      }
    } else {
      // NEW: Text mode session start
      setIsLoading(true);
      setConnectionStatus('connecting');

      try {
        // Build the same system prompt for text mode (but with text-specific instructions)
        const hasMemory = memoryContext && memoryContext.length > 50;
        let systemPrompt = selectedAgent.systemPrompt;

        // Text mode instructions
        systemPrompt = `TEXT CHAT MODE:
This is a text-based conversation. 
Provide warm, therapeutic responses without any tags or metadata.
Keep responses concise but meaningful for text chat.

GREETING GENERATION:
Your first message should reference specific details from the session context below when available.

` + systemPrompt;

        // Add session contexts (same as voice)
        if (shouldReferenceLastSession && lastSessionSummary) {
          systemPrompt += `\n\n===== LAST SESSION CONTEXT =====
${lastSessionSummary}
===== END LAST SESSION =====\n`;
        }

        if (hasMemory) {
          systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====
${memoryContext}
===== END HISTORY =====`;
        } else if (!lastSessionSummary) {
          systemPrompt += '\n\nThis is your first session with this user. Get to know them gently.';
        }

        systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;

        const response = await fetch('/api/text-chat/text-session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            agentConfig: {
              name: selectedAgent.name,
              systemPrompt: systemPrompt,
              model: selectedAgent.model.model,
              temperature: selectedAgent.model.temperature,
              maxTokens: 150
            },
            memoryContext,
            firstName
          })
        });

        if (!response.ok) throw new Error('Failed to start text session');

        const data = await response.json();
        setTextSessionId(data.sessionId);
        setIsSessionActive(true);
        setConnectionStatus('connected');
        setIsLoading(false);

        addTranscriptMessage({
          role: 'system',
          content: `Text chat started with ${selectedAgent.name}`,
          mode: 'text'
        });

        addTranscriptMessage({
          role: 'assistant',
          content: data.firstMessage,
          isFinal: true,
          agentName: selectedAgent.name,
          mode: 'text'
        });

      } catch (error) {
        console.error('Failed to start text session:', error);
        setIsLoading(false);
        setConnectionStatus('disconnected');

        addTranscriptMessage({
          role: 'system',
          content: 'Failed to start text session. Please try again.',
          mode: 'text'
        });
      }
    }
  }, [vapi, userId, memoryContext, lastSessionSummary, shouldReferenceLastSession, firstName, isLoading, selectedAgent, addTranscriptMessage, chatMode]);

  // NEW: Send text message
  const sendTextMessage = useCallback(async (message: string) => {
    if (!textSessionId || !message.trim() || isTextLoading) return;

    setIsTextLoading(true);

    // Add user message immediately
    addTranscriptMessage({
      role: 'user',
      content: message,
      isFinal: true,
      mode: 'text'
    });

    try {
      const response = await fetch('/api/text-chat/text-session/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: textSessionId,
          userId,
          message,
          agentConfig: {
            name: selectedAgent.name,
            model: selectedAgent.model.model,
            temperature: selectedAgent.model.temperature,
            maxTokens: 150
          }
        })
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();

      // Add assistant response
      addTranscriptMessage({
        role: 'assistant',
        content: data.response,
        isFinal: true,
        agentName: selectedAgent.name,
        mode: 'text'
      });

    } catch (error) {
      console.error('Failed to send text message:', error);

      addTranscriptMessage({
        role: 'system',
        content: 'Failed to send message. Please try again.',
        mode: 'text'
      });
    } finally {
      setIsTextLoading(false);
    }
  }, [textSessionId, userId, selectedAgent, addTranscriptMessage, isTextLoading]);

  const endSession = useCallback(async () => {
    if (chatMode === 'voice') {
      if (vapi && isSessionActive) {
        vapi.stop();
        setIsSessionActive(false);
        setConnectionStatus('disconnected');
        setIsAssistantSpeaking(false);
        setIsUserSpeaking(false);
      }
    } else {
      // NEW: End text session
      if (textSessionId && isSessionActive) {
        try {
          await fetch('/api/text-chat/text-session/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: textSessionId,
              userId
            })
          });

          setTextSessionId(null);
          setIsSessionActive(false);
          setConnectionStatus('disconnected');

          addTranscriptMessage({
            role: 'system',
            content: 'Text chat ended',
            mode: 'text'
          });
        } catch (error) {
          console.error('Failed to end text session:', error);
        }
      }
    }
  }, [vapi, isSessionActive, chatMode, textSessionId, userId, addTranscriptMessage]);

  // NEW: Switch between voice and text modes
  const switchMode = useCallback(() => {
    if (isSessionActive) {
      endSession();
    }

    const newMode = chatMode === 'voice' ? 'text' : 'voice';
    setChatMode(newMode);

    addTranscriptMessage({
      role: 'system',
      content: `Switched to ${newMode} mode`,
      mode: newMode
    });
  }, [chatMode, isSessionActive, endSession, addTranscriptMessage]);

  return {
    // Session state
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus,

    // NEW: Transcripts
    liveTranscripts,

    // NEW: Voice indicators
    isAssistantSpeaking,
    isUserSpeaking,

    // NEW: Text mode additions
    chatMode,
    setChatMode,
    sendTextMessage,
    isTextLoading,
    textSessionId,
    switchMode
  };
};

export default useVapi;