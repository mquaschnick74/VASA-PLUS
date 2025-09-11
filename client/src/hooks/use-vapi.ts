import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent, getAgentById } from '../config/agent-configs';
import { determineNarrativePhase } from '../../../shared/narrative';

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  firstName: string;
  selectedAgent: TherapeuticAgent;
}

interface UseVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

const useVapi = ({ userId, memoryContext, firstName, selectedAgent }: UseVapiProps): UseVapiReturn => {
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const vapiRef = useRef<any>(null);

  // Track active methodology internally (invisible to user)
  const [activeMethodology, setActiveMethodology] = useState<string>(selectedAgent.id);
  const [callId, setCallId] = useState<string>('');
  const checkIntervalRef = useRef<NodeJS.Timeout>();

  // Use refs for pattern guidance to avoid re-render issues
  const appliedGuidanceRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<number>(15000);

  // Initialize VAPI
  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      console.error('VAPI public key not found');
      return;
    }

    const initializeVapi = async () => {
      try {
        const { default: Vapi } = await import('@vapi-ai/web');
        const vapiInstance = new Vapi(publicKey);
        vapiRef.current = vapiInstance;
        setVapi(vapiInstance);

        // Track if we've captured call ID
        let capturedCallId = false;

        // COMPREHENSIVE EVENT LOGGING
        const allEvents = [
          'call-start', 'call-end', 'conversation-update', 'message', 
          'speech-start', 'speech-end', 'volume-level', 'error',
          'message-update', 'transcript', 'function-call',
          'metadata', 'assistant-message', 'user-message'
        ];

        allEvents.forEach(eventName => {
          vapiInstance.on(eventName, (event: any) => {
            console.log(`📡 VAPI Event [${eventName}]:`, event);

            // Try to extract call ID from ANY event
            const possibleIds = [
              event?.call?.id,
              event?.callId,
              event?.id,
              event?.data?.call?.id,
              event?.conversation?.id,
              event?.metadata?.callId
            ].filter(Boolean);

            if (possibleIds.length > 0 && !capturedCallId) {
              console.log(`🔍 Found potential call IDs in ${eventName}:`, possibleIds);
              setCallId(possibleIds[0]);
              capturedCallId = true;
            }
          });
        });

        // Specific handlers for state management
        vapiInstance.on('call-start', () => {
          console.log('✅ Call session started');
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);
          capturedCallId = false; // Reset for new call
        });

        vapiInstance.on('call-end', () => {
          console.log('📴 Call session ended');
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
          setCallId('');
          setActiveMethodology(selectedAgent.id);
          appliedGuidanceRef.current.clear();
          capturedCallId = false;
        });

        vapiInstance.on('error', (error: any) => {
          console.error('❌ VAPI error details:', error);
          setIsLoading(false);
          setConnectionStatus('disconnected');
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
  }, [selectedAgent.id]);

  // DIAGNOSTIC: Check why polling doesn't start
  console.log('DIAGNOSTIC:', {
    callId,
    isSessionActive, 
    vapi: !!vapi,
    willPoll: !(!callId || !isSessionActive || !vapi)
  });

  // Enhanced orchestration with server-side call ID retrieval
  useEffect(() => {
    if (!isSessionActive || !vapi) return;

    let isActive = true;
    let pollingCallId: string | null = null;

    const fetchCallIdAndStartPolling = async () => {
      // Try to get call ID from server
      let attempts = 0;
      const maxAttempts = 10;

      while (isActive && !pollingCallId && attempts < maxAttempts) {
        try {
          const response = await fetch(`/api/vapi/orchestration/active-call/${userId}`);
          const data = await response.json();

          if (data.success) {
            console.log(`✅ Got call ID from server: ${data.callId}`);
            pollingCallId = data.callId;
            setCallId(data.callId); // Update state for diagnostics
            break;
          } else {
            console.log(`⏳ Waiting for server session... (attempt ${attempts + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          }
        } catch (error) {
          console.error('Failed to fetch call ID:', error);
        }
        attempts++;
      }

      if (!pollingCallId) {
        console.error('❌ Could not retrieve call ID after', maxAttempts, 'attempts');
        return;
      }

      // Now start polling with the retrieved call ID
      const checkPatternsAndOrchestration = async () => {
        if (!isActive || !pollingCallId) return;

        try {
          const response = await fetch(`/api/vapi/orchestration/state/${pollingCallId}`);
          if (!response.ok) {
            console.error('Failed to fetch orchestration state');
            return;
          }

          const state = await response.json();
          console.log('📊 Orchestration state received:', state);
          
          // Log narrative metrics if available
          if (state.narrativeMetrics) {
            console.log(`📖 Narrative state: Fragmentation=${state.narrativeMetrics.fragmentation}, Orientation=${state.narrativeMetrics.temporalOrientation}`);
            
            // Determine narrative phase
            const sessionCount = state.agentSwitches?.length || 1;
            const narrativePhase = determineNarrativePhase(sessionCount, state.narrativeMetrics.patternsDetected || []);
            console.log(`📚 Narrative journey phase: ${narrativePhase}`);
          }

          // Log current patterns
          const totalPatterns = Object.values(state.patternCounts || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
          if (totalPatterns > 0) {
            console.log(`📊 Active patterns: CVDC=${state.patternCounts.cvdc}, IBM=${state.patternCounts.ibm}, Thend=${state.patternCounts.thend}`);
          }

          // Determine polling interval based on pattern activity
          if (state.patternGuidance?.some((g: any) => g.priority === 'high')) {
            pollIntervalRef.current = 3000; // 3 seconds for high priority
          } else if (totalPatterns > 0) {
            pollIntervalRef.current = 5000; // 5 seconds for active patterns
          } else {
            pollIntervalRef.current = 15000; // 15 seconds default
          }

          // Apply pattern guidance if available
          if (state.needsGuidanceUpdate && state.patternGuidance?.length > 0) {
            const newGuidance = state.patternGuidance.filter((g: any) => 
              !appliedGuidanceRef.current.has(`${g.pattern}_${g.count}`)
            );

            if (newGuidance.length > 0) {
              console.log(`🎯 Injecting ${newGuidance.length} pattern guidance items`);

              // Build enhanced prompt
              let enhancedPrompt = selectedAgent.systemPrompt;

              if (memoryContext && memoryContext.length > 50) {
                console.log('💉 Injecting memory into pattern guidance update');
                enhancedPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====\n${memoryContext}\n===== END CONTEXT =====`;
              } else {
                console.log('⚠️ No memory context for pattern guidance (length:', memoryContext?.length, ')');
              }

              enhancedPrompt += `\n\nThe user's name is ${firstName}.`;
              
              // Add narrative phase awareness if available
              if (state.narrativeMetrics) {
                const sessionCount = state.agentSwitches?.length || 1;
                const narrativePhase = determineNarrativePhase(sessionCount, state.narrativeMetrics.patternsDetected || []);
                enhancedPrompt += `\n\nCurrent therapeutic journey phase: ${narrativePhase}.`;
                if (narrativePhase === 'building') {
                  enhancedPrompt += ' Focus on establishing narrative rapport and exploration.';
                } else if (narrativePhase === 'deepening') {
                  enhancedPrompt += ' Support deeper narrative exploration and pattern recognition.';
                } else if (narrativePhase === 'integrating') {
                  enhancedPrompt += ' Facilitate narrative integration and synthesis.';
                }
              }
              enhancedPrompt += '\n\n===== ACTIVE PATTERNS REQUIRING ATTENTION =====\n';
              enhancedPrompt += 'Address these patterns naturally in the conversation:\n\n';

              newGuidance.forEach((g: any) => {
                enhancedPrompt += `• [${g.priority.toUpperCase()}] ${g.suggestion}\n`;
              });

              enhancedPrompt += '\n===== END PATTERNS =====\n';
              enhancedPrompt += 'IMPORTANT: Address these patterns gently and naturally.';

              try {
                // Update assistant with pattern awareness
                await vapi.setAssistant({
                  model: {
                    provider: 'openai',
                    model: selectedAgent.model.model,
                    temperature: selectedAgent.model.temperature,
                    messages: [{
                      role: 'system',
                      content: enhancedPrompt
                    }]
                  }
                });

                // Mark as applied using ref
                newGuidance.forEach((g: any) => {
                  appliedGuidanceRef.current.add(`${g.pattern}_${g.count}`);
                });

                // Notify backend
                await fetch('/api/vapi/orchestration/guidance-applied', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    callId: pollingCallId,
                    userId,
                    guidanceKeys: newGuidance.map((g: any) => `${g.pattern}_${g.count}`)
                  })
                });

                console.log('✅ Pattern guidance successfully injected');
              } catch (error) {
                console.error('Failed to inject pattern guidance:', error);
              }
            }
          }

          // Handle agent switching (existing logic)
          if (state.suggestedAgent && state.suggestedAgent !== activeMethodology && state.canSwitch) {
            console.log(`🔄 Switching methodology: ${activeMethodology} → ${state.suggestedAgent}`);
            await updateMethodology(state.suggestedAgent);
          }

        } catch (error) {
          console.error('Orchestration check error:', error);
        }

        // Schedule next check if still active
        if (isActive) {
          setTimeout(() => {
            if (isActive) {
              checkPatternsAndOrchestration();
            }
          }, pollIntervalRef.current);
        }
      };

      // Start polling once we have the call ID
      console.log('🚀 Starting orchestration polling with call ID:', pollingCallId);
      checkPatternsAndOrchestration();
    };

    // Start the process
    fetchCallIdAndStartPolling();

    return () => {
      isActive = false;
      console.log('🛑 Stopping orchestration polling');
    };
  }, [isSessionActive, vapi, userId, selectedAgent, memoryContext, firstName, activeMethodology]);

  // Silently update the therapeutic methodology
  const updateMethodology = async (newMethodology: string) => {
    if (!vapi || !isSessionActive) return;

    const newAgent = getAgentById(newMethodology);
    if (!newAgent) return;

    try {
      // Build updated system prompt for new methodology
      let systemPrompt = newAgent.systemPrompt;

      if (memoryContext && memoryContext.length > 50) {
        console.log('🔄 Maintaining memory context during agent switch');
        systemPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====
${memoryContext}
===== END CONTEXT =====`;
      } else {
        console.log('⚠️ No memory context during agent switch');
      }

      systemPrompt += `\n\nThe user's name is ${firstName}.`;
      
      // Add narrative phase context if switching agents
      // (Note: We don't have state here but can infer from memory context)
      if (memoryContext && memoryContext.includes('Session')) {
        const sessionMatch = memoryContext.match(/Session (\d+)/);
        if (sessionMatch) {
          const sessionCount = parseInt(sessionMatch[1]);
          const narrativePhase = sessionCount <= 2 ? 'building' : sessionCount <= 5 ? 'deepening' : 'integrating';
          systemPrompt += `\n\nCurrent narrative journey phase: ${narrativePhase}.`;
        }
      }

      // Critical: Add seamless continuation instruction
      systemPrompt += `\n\nIMPORTANT: You are continuing an ongoing conversation. 
Do not reintroduce yourself or indicate any change has occurred.
Continue naturally from where the conversation is at this moment.
Maintain the same warm, consistent presence throughout.
Never mention switching approaches or changing methods.`;

      // Silently update the assistant configuration
      await vapi.setAssistant({
        model: {
          provider: 'openai',
          model: newAgent.model.model,
          temperature: newAgent.model.temperature,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            }
          ]
        }
        // Keep same voice - no change in how they sound
      });

      setActiveMethodology(newMethodology);

      // Record the switch in backend (for analytics only)
      try {
        await fetch('/api/vapi/orchestration/record-switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            userId,
            fromMethodology: activeMethodology,
            toMethodology: newMethodology,
            reason: 'pattern_detected'
          })
        });
      } catch (error) {
        // Analytics failure shouldn't break the switch
        console.debug('Failed to record switch:', error);
      }

    } catch (error) {
      console.error('Failed to update methodology:', error);
    }
  };

  // Generate dynamic greeting via server API
  const generateDynamicGreeting = async (): Promise<string | null> => {
    if (!memoryContext || memoryContext.length < 50) {
      return null;
    }

    try {
      const response = await fetch('/api/vapi/generate-greeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentName: selectedAgent.name,
          memoryContext: memoryContext.substring(0, 1000),
          firstName
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.greeting;
      }
      return null;
    } catch (error) {
      console.log('Dynamic greeting failed, using template');
      return null;
    }
  };

  const startSession = useCallback(async () => {
    if (!vapi || isLoading || !selectedAgent) return;

    // Memory Debug Logging
    console.log('🧠 Memory Debug at Session Start:', {
      contextLength: memoryContext?.length,
      contextPreview: memoryContext?.substring(0, 200),
      hasMemory: memoryContext && memoryContext.length > 50,
      firstName,
      selectedAgentId: selectedAgent.id,
      timestamp: new Date().toISOString()
    });

    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      const hasMemory = memoryContext && memoryContext.length > 50;
      
      console.log(`📝 Memory Status: ${hasMemory ? 'FOUND' : 'MISSING'} (${memoryContext?.length || 0} chars)`);

      let systemPrompt = selectedAgent.systemPrompt;

      if (hasMemory) {
        console.log('✅ Injecting memory context into system prompt');
        systemPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====
${memoryContext}
===== END CONTEXT =====

IMPORTANT: Reference the above context naturally in conversation when relevant.
Do not make up or hallucinate any details not explicitly mentioned above.`;
        console.log('📊 System prompt with memory length:', systemPrompt.length);
      } else {
        console.log('⚠️ No memory context - starting fresh session');
        systemPrompt += '\n\nThis is your first session with this user. Get to know them gently.';
      }

      systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;

      // Get personalized first message
      const dynamicGreeting = await generateDynamicGreeting();
      const firstMessage = dynamicGreeting || selectedAgent.firstMessageTemplate(firstName, !!hasMemory);
      if (dynamicGreeting) {
        console.log('✨ Using dynamic greeting');
      }
      console.log('🎯 First message generated:', {
        hasMemory: !!hasMemory,
        messagePreview: firstMessage.substring(0, 100)
      });
      const serverUrl = `${window.location.origin}/api/vapi/webhook`;

      const assistantConfig = {
        name: 'VASA-Therapist', // Generic name - no agent identification
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
        server: {
          url: serverUrl
        },
        firstMessage: firstMessage,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        recordingEnabled: true,
        metadata: {
          userId: userId,
          initialMethodology: selectedAgent.id,
          agentName: selectedAgent.name // For backend tracking only
        }
      };

      await vapi.start(assistantConfig);
      setIsSessionActive(true);
      setConnectionStatus('connected');
      setIsLoading(false);
      setActiveMethodology(selectedAgent.id);

    } catch (error) {
      console.error('Failed to start VAPI session:', error);
      setIsLoading(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, userId, memoryContext, firstName, isLoading, isSessionActive, selectedAgent]);

  const endSession = useCallback(() => {
    if (vapi && isSessionActive) {
      vapi.stop();
      setIsSessionActive(false);
      setConnectionStatus('disconnected');

      // Clear orchestration interval
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    }
  }, [vapi, isSessionActive]);

  return {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus
    // Note: activeMethodology is intentionally not exposed
  };
};

export default useVapi;