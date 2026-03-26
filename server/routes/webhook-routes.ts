// server/routes/webhook-routes.ts
// MERGED VERSION - Preserves all existing functionality + adds enhanced tracking
import { Router } from 'express';
import crypto from 'crypto';
import {
  initializeSession,
  processTranscript,
  processEndOfCall,
  ensureSession
} from '../services/orchestration-service';
import { safeLog } from '../utils/safeLog';
// NEW IMPORT - Enhanced therapeutic tracking
import { enhancedTherapeuticTracker } from '../services/enhanced-therapeutic-tracker';
// NEW IMPORT - Subscription tracking
import { subscriptionService } from '../services/subscription-service';

// NEW IMPORTS - User profile & therapist-client relationship
// ⬇️ Using existing supabase service instead of non-existent services
import { supabase } from '../services/supabase-service';

// MID-CALL CONTEXT IMPORTS
import { buildMemoryContext } from '../services/memory-service';
import { queryKnowledgeBase, buildRetrievedContext } from '../services/sensing-layer/knowledge-base';

// SENSING LAYER IMPORTS - Real-time therapeutic guidance
import { sensingLayer } from '../services/sensing-layer';
import { flushPendingGuidance, clearPendingGuidance } from '../services/sensing-layer/guidance-injector';
import {
  setControlUrl,
  clearControlUrl,
  addToConversationHistory,
  updateCallState,
  setAgentSpeakingState,
  trackVapiCall,
  isCallActive,
} from '../services/sensing-layer/call-state';
import { startSilenceMonitor, resetSilenceTimer, stopSilenceMonitor, suppressSilenceMonitor, clearPostInterventionSuppression } from '../services/sensing-layer/silence-monitor';
import { extractAndStoreFragments } from '../services/sensing-layer/fragment-extractor';
import { updateArcFromTranscript } from '../services/sensing-layer/arc-tracker';

const router = Router();

// ============================================================================
// INFLUENCER CONVERSION TRACKING
// ============================================================================
async function trackInfluencerConversion(userId: string, subscriptionAmount: number) {
  try {
    console.log(`💰 Tracking influencer conversion for user: ${userId}`);

    // Check if user has a promo code
    const { data: user } = await supabase
      .from('users')
      .select('referred_by_promo_code')
      .eq('id', userId)
      .single();

    if (!user || !user.referred_by_promo_code) {
      console.log('No promo code for this user');
      return;
    }

    const promoCode = user.referred_by_promo_code;
    console.log(`🎟️ User has promo code: ${promoCode}`);

    // Find the influencer
    const { data: influencer } = await supabase
      .from('influencer_profiles')
      .select('id, influencer_name, commission_percentage, total_conversions, total_earnings_cents, total_clicks')
      .eq('unique_promo_code', promoCode)
      .single();

    if (!influencer) {
      console.log('❌ Influencer not found for promo code');
      return;
    }

    console.log(`✅ Found influencer: ${influencer.influencer_name}`);

    // Check if conversion already exists
    const { data: existingConversion } = await supabase
      .from('influencer_conversions')
      .select('id, conversion_status')
      .eq('influencer_id', influencer.id)
      .eq('converted_user_id', userId)
      .single();

    if (existingConversion && existingConversion.conversion_status === 'active') {
      console.log('⚠️ Conversion already tracked as active');
      return;
    }

    // Calculate commission
    const subscriptionCents = Math.round(subscriptionAmount * 100);
    const commissionCents = Math.round(subscriptionCents * (influencer.commission_percentage / 100));

    console.log(`💵 Subscription: $${subscriptionAmount} | Commission: $${commissionCents / 100}`);

    if (existingConversion) {
      // Update existing conversion to active
      await supabase
        .from('influencer_conversions')
        .update({
          conversion_status: 'active',
          initial_revenue_cents: subscriptionCents,
          lifetime_value_cents: subscriptionCents,
          first_payment_date: new Date().toISOString()
        })
        .eq('id', existingConversion.id);

      console.log('✅ Updated conversion to active');
    } else {
      // Create new conversion record
      await supabase
        .from('influencer_conversions')
        .insert({
          influencer_id: influencer.id,
          converted_user_id: userId,
          conversion_type: 'subscription',
          promo_code_used: promoCode,
          commission_percentage_applied: influencer.commission_percentage,
          initial_revenue_cents: subscriptionCents,
          lifetime_value_cents: subscriptionCents,
          conversion_status: 'active',
          conversion_date: new Date().toISOString(),
          first_payment_date: new Date().toISOString()
        });

      console.log('✅ Created new active conversion');
    }

    // Create commission transaction
    await supabase
      .from('influencer_commission_transactions')
      .insert({
        influencer_id: influencer.id,
        transaction_type: 'initial_conversion',
        amount_cents: subscriptionCents,
        converted_user_id: userId,
        commission_cents: commissionCents,
        commission_percentage_applied: influencer.commission_percentage,
        paid_to_ivasa: true,
        paid_to_influencer: false,
        transaction_date: new Date().toISOString()
      });

    console.log('✅ Created commission transaction');

    // Update influencer totals
    const newTotalConversions = (influencer.total_conversions || 0) + 1;
    const newTotalEarnings = (influencer.total_earnings_cents || 0) + commissionCents;

    await supabase
      .from('influencer_profiles')
      .update({
        total_conversions: newTotalConversions,
        total_earnings_cents: newTotalEarnings,
        conversion_rate: newTotalConversions / (influencer.total_clicks || 1) * 100
      })
      .eq('id', influencer.id);

    console.log(`✅ Updated influencer stats: ${newTotalConversions} conversions, $${newTotalEarnings / 100} earned`);

  } catch (error) {
    console.error('❌ Error tracking influencer conversion:', error);
  }
}

// Export for use in other routes
export { trackInfluencerConversion };

// ============================================================================
// SENSING LAYER - Async Processing Helper with RATE LIMITING
// ============================================================================

// Track processed message count per call to prevent duplicate history entries
const lastProcessedMessageIndex = new Map<string, number>();
// Turn-time therapeutic sensing injection authority lives in /api/custom-llm.
// Webhook route intentionally does not own per-turn guidance injection.
function cleanupCallCaches(callId: string) {
  void callId;
}

// ============================================================================
// MID-CALL TOOL HANDLER — Vapi function-tool calls (fetch_more_context)
// ============================================================================
router.post('/tools', async (req, res) => {
  console.log('🔧 [TOOLS] Vapi tool-call received');
  try {
    const body = req.body;
    const toolCallList = body?.message?.toolCallList || [];

    if (toolCallList.length === 0) {
      console.warn('🔧 [TOOLS] Empty toolCallList');
      return res.json({ results: [] });
    }

    const results: Array<{ toolCallId: string; result: string }> = [];

    for (const toolCall of toolCallList) {
      const toolCallId = toolCall.id || toolCall.toolCallId || `tool_${Date.now()}`;

      // ✅ Support BOTH shapes:
      // 1) { name, parameters }
      // 2) { function: { name, arguments } }
      const fnName =
        toolCall.name ||
        toolCall.toolName ||
        toolCall.function?.name;

      let args: any =
        toolCall.parameters ||
        toolCall.args ||
        toolCall.function?.arguments ||
        {};

      // Sometimes args can be a JSON string
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }

      console.log(`🔧 [TOOLS] Processing tool: ${fnName} (${toolCallId})`);

      if (fnName === 'fetch_more_context') {
        const { userId, query, limit, types, tags } = args;

        if (!userId || !query) {
          results.push({
            toolCallId,
            result: JSON.stringify({ error: 'Missing required args: userId, query' })
          });
          continue;
        }

        try {
          // 1. Build memory context (existing service)
          const memoryContext = await buildMemoryContext(userId);

          // 2. Query knowledge base / RAG (existing service)
          const ragChunks = await queryKnowledgeBase(query, {
            userId,
            limit: limit || 5,
            threshold: 0.6,
            types: types || undefined,
            tags: tags || undefined
          });
          const rag = buildRetrievedContext(ragChunks);

          // 3. Recent session summaries (lightweight query)
          let recentSummaries: string[] = [];
          try {
            const { data: summaries } = await supabase
              .from('therapeutic_context')
              .select('content, context_type, created_at')
              .eq('user_id', userId)
              .in('context_type', ['call_summary', 'session_insight', 'conversational_summary'])
              .order('created_at', { ascending: false })
              .limit(3);

            if (summaries && summaries.length > 0) {
              recentSummaries = summaries.map(
                (s: any) => `[${s.context_type} - ${new Date(s.created_at).toLocaleDateString()}] ${s.content}`
              );
            }
          } catch (summaryErr) {
            console.warn('🔧 [TOOLS] recentSummaries query failed (non-fatal):', summaryErr);
          }

          console.log(`🔧 [TOOLS] fetch_more_context success for ${userId} — memory: ${memoryContext.length} chars, rag: ${rag.length} chars, summaries: ${recentSummaries.length}`);

          results.push({
            toolCallId,
            result: JSON.stringify({ memoryContext, rag, recentSummaries })
          });
        } catch (err) {
          console.error(`🔧 [TOOLS] fetch_more_context error:`, err);
          results.push({
            toolCallId,
            result: JSON.stringify({ error: 'Failed to fetch context', memoryContext: '', rag: '', recentSummaries: [] })
          });
        }
      } else {
        console.warn(`🔧 [TOOLS] Unknown tool: ${fnName}`);
        results.push({
          toolCallId,
          result: JSON.stringify({ error: `Unknown tool: ${fnName}` })
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('🔧 [TOOLS] Fatal error:', error);
    if (!res.headersSent) {
      res.status(500).json({ results: [] });
    }
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const { message } = body;
    const eventType = message?.type;
    
    // EARLY EXIT: transcript events fire on every partial word from Deepgram.
    // They carry no actionable data and generate massive log noise.
    if (eventType === 'transcript') {
      return res.status(200).json({ received: true });
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('📥 VAPI WEBHOOK RECEIVED');
    console.log('═══════════════════════════════════════════');

    // PRESERVED: Signature validation
    if (process.env.VAPI_SECRET_KEY) {
      const signature = req.headers['x-vapi-signature'] as string;
      if (signature) {
        let payload: string;
        if (Buffer.isBuffer(req.body)) {
          payload = req.body.toString('utf8');
        } else {
          payload = JSON.stringify(req.body);
        }
        const expectedSignature = crypto
          .createHmac('sha256', process.env.VAPI_SECRET_KEY)
          .update(payload)
          .digest('hex');
        const expectedSignatureBase64 = crypto
          .createHmac('sha256', process.env.VAPI_SECRET_KEY)
          .update(payload)
          .digest('base64');
        if (signature !== expectedSignature && signature !== expectedSignatureBase64) {
          console.warn(`Signature mismatch. Received: ${signature?.substring(0, 20)}...`);
        }
      }
    }

    // EARLY EXIT: transcript events fire on every partial word from Deepgram.
    // They carry no actionable data for our pipeline and generate massive log noise.
    // Return 200 immediately with zero logging.
    if (eventType === 'transcript') {
      return res.status(200).json({ received: true });
    }

    // ACTIVE-CALL TRACKING: Track every event immediately
    const tracked = trackVapiCall(message);

    console.log('Event Type:', eventType);

    let userId = extractUserId(message);
    const callId = extractCallId(message);
    let agentName = extractAgentName(message);

    // FALLBACK: DB lookup for userId
    if (!userId && callId) {
      console.log(`🔄 userId not in webhook, attempting DB lookup for callId: ${callId}`);
      const lookedUpUserId = await lookupUserIdByCallId(callId);
      if (lookedUpUserId) {
        userId = lookedUpUserId;
        console.log(`✅ Retrieved userId from DB: ${userId}`);
      }
    }

    if (!userId || !callId) {
      console.error('❌ CRITICAL: Missing critical data in webhook', { eventType, hasUserId: !!userId, hasCallId: !!callId });
      return res.status(400).json({ error: 'Missing userId or callId', received: true });
    }

    // RESPOND 200 IMMEDIATELY so VAPI doesn't wait
    res.status(200).json({ received: true });

    console.log('✅ Webhook identifiers extracted', { hasUserId: !!userId, hasCallId: !!callId, agentName });

    // DEBUGGING: Log specific user
    switch (eventType) {
      case 'call-started':
      case 'assistant.started':
        console.log(`🚀 CALL-STARTED event received for call: ${callId}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Agent Name: ${agentName}`);

        // DEBUG: Log full call object structure to understand VAPI's format
        console.log(`🔍 [DEBUG] message.call keys: ${message?.call ? Object.keys(message.call).join(', ') : 'undefined'}`);
        console.log(`🔍 [DEBUG] monitor present: ${!!message?.call?.monitor}`);

        // PRESERVED: Monitor URL logging
        if (message?.call?.monitor) {
          console.log('🔍 MONITOR URLs FOR TESTING:');
          console.log(`TEST_LISTEN_URL="${message.call.monitor.listenUrl}"`);
          console.log(`TEST_CONTROL_URL="${message.call.monitor.controlUrl}"`);
        } else {
          console.warn(`⚠️ [DEBUG] No monitor object in call-started. Check VAPI assistant config.`);
          console.warn(`   VAPI requires serverMessages: ["call-started"] AND the assistant must be configured for monitoring`);
        }

        // SENSING LAYER: Store controlUrl for real-time guidance injection
        const controlUrl = message?.call?.monitor?.controlUrl;
        if (controlUrl) {
          setControlUrl(callId, controlUrl, userId);
          console.log(`🧠 [SENSING] Stored controlUrl for call ${callId}: ${controlUrl.substring(0, 50)}...`);
        } else {
          console.warn(`⚠️ [SENSING] No controlUrl in call-started for ${callId}`);
          console.warn(`   This usually means VAPI's monitor is not enabled for this assistant`);
        }

        // Initialize call state for conversation tracking
        updateCallState(callId, {
          userId,
          sessionId: callId,
          exchangeCount: 0,
          conversationHistory: []
        });

        // SENSING LAYER: Initialize session state for in-memory accumulation
        await sensingLayer.initializeCallSession(callId, userId, callId);
        console.log(`🧠 [SENSING] Initialized session state for call ${callId}`);

        // SILENCE MONITOR: Disabled — custom LLM endpoint now handles therapeutic
        // guidance injection pre-response. Proactive re-engagement during extended
        // silence will be rebuilt as an integrated part of the custom LLM pipeline.
        startSilenceMonitor(callId);

        console.log(`📞 Initializing session for call-started event...`);
        await initializeSession(userId, callId, agentName);
        console.log(`✅ call-started event processed successfully`);
        break;

      case 'conversation-update': {
      const session = await ensureSession(callId, userId, agentName);
      if (!session) {
          console.warn(`⚠️ Cannot process conversation-update: failed to ensure session for ${callId}`);
          break;
        }

        // NEW: Process therapeutic movement using either conversation or transcript format
        // Check both possible formats from VAPI
        const conversationData = message.conversation || message.transcript;

        if (conversationData && Array.isArray(conversationData)) {
          console.log(`🧠 Processing therapeutic movement for ${callId}...`);

          // Convert transcript format to conversation format if needed
          const formattedConversation = conversationData.map((item: any) => {
            if (item.role && (item.text || item.content)) {
              return {
                role: item.role,
                content: item.text || item.content,
                timestamp: item.timestamp
              };
            }
            return item;
          });

          await enhancedTherapeuticTracker.processConversationUpdate(
            callId,
            userId,
            formattedConversation
          );

          // SENSING LAYER: Process latest user utterance for real-time guidance
          // Find the latest user message in the conversation
          console.log(`🔍 [SENSING-PRE] Looking for latest user message in ${formattedConversation.length} conversation items`);
          const userMessages = formattedConversation.filter((m: any) => m.role === 'user');
          console.log(`🔍 [SENSING-PRE] Found ${userMessages.length} user messages in conversation`);

          const latestUserMessage = [...formattedConversation]
            .reverse()
            .find((m: any) => m.role === 'user');

          if (latestUserMessage) {
            console.log(`🔍 [SENSING-PRE] Latest user message found - content length: ${latestUserMessage.content?.length ?? 'undefined'}, trimmed: "${latestUserMessage.content?.trim()?.substring(0, 60) || 'EMPTY'}"`);
          } else {
            console.warn(`⚠️ [SENSING-PRE] No user message found in conversation - sensing layer will NOT run`);
          }

          if (latestUserMessage?.content && latestUserMessage.content.trim().length > 0) {
            // Update conversation history in call state (only process NEW messages)
            const lastIndex = lastProcessedMessageIndex.get(callId) || 0;
            const newMessages = formattedConversation.slice(lastIndex);
            for (const msg of newMessages) {
              if (msg.role && msg.content) {
                addToConversationHistory(callId, msg.role, msg.content);
              }
            }
            lastProcessedMessageIndex.set(callId, formattedConversation.length);

            // Clear post-intervention suppression immediately when user speaks
            clearPostInterventionSuppression(callId);

            // SILENCE MONITOR: Reset timer on each confirmed user utterance
            resetSilenceTimer(callId);

            // NOTE: Sensing layer processing is handled exclusively by the custom LLM
            // endpoint (server/routes/custom-llm-routes.ts). processSensingLayerAsync
            // was removed from here to prevent double-processing every utterance.
          }
        }

        // PRESERVED: Your original transcript processing
        if (message.transcript?.length > 0) {
          for (const item of message.transcript) {
            if (item.text && item.text.trim()) {
              await processTranscript(
                callId,
                item.text,
                item.role || 'user',
                userId,
                agentName
              );
            }
          }
        }
        // ALSO handle if it comes as conversation array
        else if (message.conversation?.length > 0) {
          // Process the last user message
          const lastUserMessage = message.conversation
            .filter((m: any) => m.role === 'user')
            .pop();

          if (lastUserMessage?.content) {
            await processTranscript(callId, lastUserMessage.content, 'user', userId, agentName);
          }

          // Also process the last assistant message for metadata
          const lastAssistantMessage = message.conversation
            .filter((m: any) => m.role === 'assistant')
            .pop();

          if (lastAssistantMessage?.content) {
            await processTranscript(callId, lastAssistantMessage.content, 'assistant', userId, agentName);
          }
        }
          break;
        }

      case 'end-of-call-report':
      console.log('📊 Full end-of-call-report received for:', callId);

      // SENSING LAYER: Finalize session and write summary to database
      const sensingSessionSummary = await sensingLayer.finalizeSession(callId);
      if (sensingSessionSummary) {
        console.log(`🧠 [SENSING] Session finalized for call ${callId}:`);
        console.log(`   📊 Exchanges: ${sensingSessionSummary.exchangeCount}`);
        console.log(`   📈 Dominant register: ${sensingSessionSummary.dominantRegister}`);
        console.log(`   ⭐ Significant moments: ${sensingSessionSummary.significantMoments.length}`);
        console.log(`   🔄 Patterns detected: ${sensingSessionSummary.patternsDetected.length}`);

        // PATTERN GATE: Check for explicit user self-recognition
        const explicitPattern = sensingSessionSummary.structuredPatterns.find(
          p => p.userExplicitlyIdentified === true
        );

        if (explicitPattern && userId) {
          console.log(`🔍 [PatternGate] Explicit pattern detected: "${explicitPattern.description}"`);

          // Count prior completed sessions for this user (excluding current call)
          const { count: sessionCount, error: countError } = await supabase
            .from('therapeutic_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .neq('call_id', callId);

          if (countError) {
            console.error(`❌ [PatternGate] Failed to count sessions for user ${userId}:`, countError);
          } else {
            const priorSessionCount = sessionCount ?? 0;
            console.log(`🔍 [PatternGate] Prior completed sessions for user ${userId}: ${priorSessionCount}`);

            if (priorSessionCount >= 1) {
              // At least 1 prior session means this is session 2 or later
              await subscriptionService.firePatternGate(userId, explicitPattern.description);
            } else {
              console.log(`⏭️ [PatternGate] Only ${priorSessionCount} prior session(s) — gate requires at least 1 prior. Skipping.`);
            }
          }
        }
      } else {
        console.warn(`⚠️ [SENSING] No session to finalize for call ${callId}`);
      }

      // FRAGMENT EXTRACTION: Extract narrative fragments from session transcript (fire-and-forget)
      const transcriptForFragments = message?.artifact?.messages || message?.transcript || message?.fullTranscript;
        const cssStageForFragments = sensingSessionSummary?.finalCSSStage ?? null;
      if (transcriptForFragments && userId) {
        extractAndStoreFragments(userId, callId, transcriptForFragments, cssStageForFragments)
          .then(result => {
            console.log(`📦 [FRAGMENTS] Extraction complete for ${callId}: ${result.fragmentCount} fragments, ${result.resonanceLinkCount} resonance links`);
          })
          .catch(err => {
            console.error(`📦 [FRAGMENTS] Extraction failed for ${callId}:`, err);
          });
      }

      // ARC TRACKER: Update therapeutic arc from session transcript (fire-and-forget)
      if (transcriptForFragments && userId) {
        const sessionIdForArc = message?.artifact?.call?.id || callId;
        updateArcFromTranscript(userId, sessionIdForArc, transcriptForFragments)
          .then(() => {
            console.log(`🎯 [ARC] Arc update complete for session ${sessionIdForArc}`);
          })
          .catch(err => {
            console.error(`🎯 [ARC] Arc update failed for ${callId}:`, err);
          });
      }

      // SILENCE MONITOR: Disabled — see call-started comment
      stopSilenceMonitor(callId);

      // GUIDANCE GATE: Clear any pending guidance
      clearPendingGuidance(callId);

      // DUPLICATE HISTORY: Clean up message index tracker
      lastProcessedMessageIndex.delete(callId);

      // SENSING LAYER: Clean up call state and caches
      clearControlUrl(callId);
      cleanupCallCaches(callId);
      console.log(`🧠 [SENSING] Cleared controlUrl and caches for call ${callId}`);

      // CRITICAL FIX: Ensure session exists before processing
      let session = await ensureSession(callId, userId, agentName);

      if (!session) {
        console.warn(`⚠️ No session found for ${callId}, attempting to create from end-of-call`);

        // Try to extract more metadata for session creation
        const callMetadata = message?.call || {};
        const startTime = callMetadata?.startedAt || message?.startedAt;
        const endTime = callMetadata?.endedAt || message?.endedAt;

        if (userId) {
          try {
            // Create session retroactively
            session = await initializeSession(userId, callId, agentName);
            console.log(`✅ Retroactive session created for ${callId}`);

            // Update with actual times if available
            if (startTime || endTime) {
              await supabase
                .from('therapeutic_sessions')
                .update({
                  start_time: startTime || new Date(Date.now() - (message?.durationSeconds * 1000 || 0)).toISOString(),
                  end_time: endTime || new Date().toISOString(),
                  duration_seconds: message?.durationSeconds || 0
                })
                .eq('call_id', callId);
              console.log(`✅ Updated session times for ${callId}`);
            }
          } catch (error) {
            safeLog('error', 'retroactive_session_create_failed', { callId, error });
          }
        }
      }

      // Duration tracking
      const durationSeconds = message?.durationSeconds || 0;
      const durationMinutes = Math.ceil(durationSeconds / 60);

      console.log('📊 Tracking usage:', { userId, durationMinutes, callId });

      if (durationMinutes > 0 && userId) {
        try {
          // Get the therapeutic_session_id to link usage_sessions to therapeutic_sessions
          const { data: therapeuticSession } = await supabase
            .from('therapeutic_sessions')
            .select('id')
            .eq('call_id', callId)
            .maybeSingle();

          const therapeuticSessionId = therapeuticSession?.id;

          await subscriptionService.trackUsageSession(userId, durationMinutes, therapeuticSessionId, callId);
          console.log('✅ Usage tracked successfully', therapeuticSessionId ? `(linked to session ${therapeuticSessionId})` : '(no therapeutic session found)');
        } catch (error) {
          console.error('❌ Failed to track usage:', error);
        }
      }
        
        // PRESERVED: Your transcript extraction logic
        const transcript = message.transcript || message.fullTranscript;
        const summary = message.summary;


        if (transcript) {

          // NEW: Process-based therapeutic assessment
          console.log(`📊 Creating process-based assessment for ${callId}...`);
          await enhancedTherapeuticTracker.processEndOfCall(
            callId,
            userId,
            transcript
          );

          // PRESERVED: Your original end-of-call processing
          await processEndOfCall(
            callId,
            transcript,
            summary,
            message.call
          );
        }
        break;

      case 'status-update': {
        // Extract and store controlUrl from status-update event
        // This is critical for Sensing Layer guidance injection
        console.log(`🔄 [STATUS-UPDATE] Processing status-update event for call: ${callId}`);

        const controlUrl = message?.call?.monitor?.controlUrl;

        if (controlUrl) {
          console.log(`✅ [STATUS-UPDATE] Found controlUrl for call ${callId}`);
          setControlUrl(callId, controlUrl, userId);
          console.log(`💾 [STATUS-UPDATE] Stored controlUrl: ${controlUrl.substring(0, 60)}...`);
        } else {
          console.warn(`⚠️ [STATUS-UPDATE] No controlUrl found in monitor object for call ${callId}`);
        }

        // Ensure session exists for this call
        await ensureSession(callId, userId, agentName);

        break;
      }

      case 'speech-update': {
        const speechStatus = message?.status;
        const speechRole = message?.role;
        if (speechRole === 'assistant') {
          const isSpeaking = speechStatus === 'started';
          setAgentSpeakingState(callId, isSpeaking);
          console.log(`🎙️ [SPEECH] Agent speaking state: ${speechStatus} for call ${callId}`);

          if (speechStatus === 'stopped') {
            flushPendingGuidance(callId);

            // Post-intervention suppression: if agent spoke, suppress silence monitor
            // to protect processing silence after a clinical move
            if (isCallActive(callId)) {
              suppressSilenceMonitor(callId, 45000);
              console.log(`🔇 [SILENCE] Agent speech ended — silence monitor suppressed for 45s (call ${callId})`);
            }
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    console.log('✅ Webhook processed successfully');
    console.log('═══════════════════════════════════════════');
    console.log('');
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    console.log('═══════════════════════════════════════════');
    console.log('');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// PRESERVED: Test endpoint for CSS pattern analysis
router.post('/test-css-patterns', async (req, res) => {
  try {
    const { transcript, userId, callId } = req.body;

    if (!transcript || !userId || !callId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { detectCSSPatterns, assessPatternConfidence } = await import('../services/css-pattern-service');

    const patterns = await detectCSSPatterns(transcript, true);
    const { confidence, reasoning } = assessPatternConfidence(patterns);

    res.json({
      success: true,
      patterns: {
        cvdc: patterns.cvdcPatterns.length,
        ibm: patterns.ibmPatterns.length,
        thend: patterns.thendIndicators.length,
        cyvc: patterns.cyvcPatterns.length
      },
      stage: patterns.currentStage,
      confidence: confidence,
      reasoning: reasoning,
      samples: {
        cvdc: patterns.cvdcPatterns[0] || null,
        ibm: patterns.ibmPatterns[0] || null,
        thend: patterns.thendIndicators[0] || null,
        cyvc: patterns.cyvcPatterns[0] || null
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Utility endpoint to recover orphaned transcripts
router.post('/recover-orphaned-sessions', async (req, res) => {
  try {
    console.log('🔧 Starting orphaned session recovery...');

    // Find all transcripts that don't have a corresponding session
    const { data: transcripts, error: transcriptError } = await supabase
      .from('session_transcripts')
      .select('call_id, user_id, timestamp')
      .eq('role', 'complete')
      .order('timestamp', { ascending: false });

    if (transcriptError) {
      throw transcriptError;
    }

    let recovered = 0;
    let skipped = 0;

    for (const transcript of transcripts || []) {
      // Check if session exists
      const { data: existingSession } = await supabase
        .from('therapeutic_sessions')
        .select('id')
        .eq('call_id', transcript.call_id)
        .single();

      if (existingSession) {
        skipped++;
        continue;
      }

      // Create missing session
      const { error: insertError } = await supabase
        .from('therapeutic_sessions')
        .insert({
          call_id: transcript.call_id,
          user_id: transcript.user_id,
          agent_name: 'Mathew', // Default, can be improved
          status: 'completed',
          start_time: transcript.timestamp,
          end_time: transcript.timestamp,
          duration_seconds: 60 // Placeholder
        });

      if (!insertError) {
        recovered++;
        console.log(`✅ Recovered session for call: ${transcript.call_id}`);
      } else {
        console.error(`❌ Failed to recover ${transcript.call_id}:`, insertError);
      }
    }

    res.json({
      success: true,
      message: `Recovery complete: ${recovered} sessions recovered, ${skipped} already existed`,
      recovered,
      skipped
    });

  } catch (error) {
    console.error('❌ Recovery failed:', error);
    res.status(500).json({ error: 'Recovery failed' });
  }
});

// PRESERVED: All your extraction functions with production debugging
function extractUserId(message: any): string | null {

  // Check each location individually for debugging
  const locations = {
    'call.metadata.userId': message?.call?.metadata?.userId,
    'metadata.userId': message?.metadata?.userId,
    'call.assistant.metadata.userId': message?.call?.assistant?.metadata?.userId,
    'assistant.metadata.userId': message?.assistant?.metadata?.userId,
    'call.assistantOverrides.metadata.userId': message?.call?.assistantOverrides?.metadata?.userId,
    'assistantOverrides.metadata.userId': message?.assistantOverrides?.metadata?.userId,
    'call.customer.userId': message?.call?.customer?.userId,
    'customer.userId': message?.customer?.userId,
  };

  // Try multiple locations for userId
  const userId = message?.call?.metadata?.userId ||
         message?.metadata?.userId ||
         message?.call?.assistant?.metadata?.userId ||
         message?.assistant?.metadata?.userId ||
         message?.call?.assistantOverrides?.metadata?.userId ||
         message?.assistantOverrides?.metadata?.userId ||
         message?.call?.customer?.userId ||
         message?.customer?.userId ||
         null;

  // If still not found, try to extract from call object deeply
  if (!userId && message?.call) {
    // Check if metadata is nested differently
    const callObj = message.call;
    if (callObj.customer?.userId) return callObj.customer.userId;
    if (callObj.user?.id) return callObj.user.id;

    // Check if metadata exists but userId is under a different key
    if (callObj.metadata) {
      console.log('🔍 [extractUserId] call.metadata present');
    }
  }

  // Also check assistant metadata at root level
  if (!userId && message?.assistant?.metadata) {
    console.log('🔍 [extractUserId] assistant.metadata present');
  }

  if (!userId) {
    console.log('⚠️ Could not extract userId directly from webhook message');
    console.log('Event type:', message?.type || 'unknown');
    console.log('Message top-level keys:', Object.keys(message || {}));
  } else {
    console.log('✅ Extracted userId from webhook metadata');
  }

  return userId;
}

/**
 * Lookup userId from therapeutic_sessions table by callId
 * Used as fallback when webhook doesn't include metadata (e.g., end-of-call-report)
 */
async function lookupUserIdByCallId(callId: string): Promise<string | null> {
  if (!callId) return null;

  try {
    console.log(`🔍 Looking up userId for callId: ${callId}`);

    const { data: session, error } = await supabase
      .from('therapeutic_sessions')
      .select('user_id, agent_name')
      .eq('call_id', callId)
      .maybeSingle();

    if (error) {
      console.error('❌ Error looking up session:', error);
      return null;
    }

    if (session?.user_id) {
      console.log(`✅ Found userId ${session.user_id} from therapeutic_sessions`);
      return session.user_id;
    }

    console.log(`⚠️ No session found for callId: ${callId}`);
    return null;
  } catch (error) {
    console.error('❌ Exception looking up userId by callId:', error);
    return null;
  }
}

function extractCallId(message: any): string | null {
  return message?.call?.id || 
         message?.callId || 
         message?.id ||  // PRESERVED: Some events might have id directly
         null;
}

function extractAgentName(message: any): string {
  return message?.call?.metadata?.agentName || 
         message?.metadata?.agentName ||
         message?.call?.assistant?.metadata?.agentName ||
         message?.assistant?.metadata?.agentName ||
         message?.call?.assistant?.name?.replace('VASA-', '') ||  // PRESERVED: Extract from assistant name
         'Sarah';
}

export default router;
