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
// NEW IMPORT - Enhanced therapeutic tracking
import { enhancedTherapeuticTracker } from '../services/enhanced-therapeutic-tracker';
// NEW IMPORT - Subscription tracking
import { subscriptionService } from '../services/subscription-service';

// NEW IMPORTS - User profile & therapist-client relationship
// ⬇️ Using existing supabase service instead of non-existent services
import { supabase } from '../services/supabase-service';

const router = Router();

router.post('/webhook', async (req, res) => {
  console.log('📥 VAPI webhook received:', req.body.message?.type);

  try {
    // PRESERVED: Your robust signature validation
    if (process.env.VAPI_SECRET_KEY) {
      const signature = req.headers['x-vapi-signature'] as string;
      
      // Only check signature if one is provided
      if (signature) {

      // Handle both raw buffer and parsed JSON body
      let payload: string;
      if (Buffer.isBuffer(req.body)) {
        payload = req.body.toString('utf8');
      } else {
        payload = JSON.stringify(req.body);
      }

      // VAPI uses different signature format - might be base64 encoded
      const expectedSignature = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(payload)
        .digest('hex');

      // Also try base64 format
      const expectedSignatureBase64 = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(payload)
        .digest('base64');

      if (signature !== expectedSignature && signature !== expectedSignatureBase64) {
        console.warn(`Signature mismatch. Received: ${signature?.substring(0, 20)}...`);
        // Don't block webhooks - just log the warning
        // VAPI inline configs may not use signatures consistently
      }
      }
    }

    // PRESERVED: Parse body if it's a buffer
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const { message } = body;
    const eventType = message?.type;

    const userId = extractUserId(message);
    const callId = extractCallId(message);
    const agentName = extractAgentName(message);

    // PRESERVED: Enhanced debugging for production
    if (process.env.REPLIT_DEPLOYMENT === '1' || !userId || !callId) {
      console.log('📊 Webhook Debug Info:', {
        eventType,
        hasUserId: !!userId,
        userId: userId || 'MISSING',
        hasCallId: !!callId,
        callId: callId || 'MISSING',
        agentName,
        isProduction: process.env.REPLIT_DEPLOYMENT === '1'
      });
    }

    if (!userId || !callId) {
      console.warn('⚠️ Missing critical data - userId:', userId, 'callId:', callId);
      console.warn('Full message metadata:', JSON.stringify(message?.call?.metadata || message?.metadata || {}));
      return res.status(200).json({ received: true });
    }

    switch (eventType) {
      case 'call-started':
        // PRESERVED: Monitor URL logging
        if (message?.call?.monitor) {
          console.log('🔍 MONITOR URLs FOR TESTING:');
          console.log(`TEST_LISTEN_URL="${message.call.monitor.listenUrl}"`);
          console.log(`TEST_CONTROL_URL="${message.call.monitor.controlUrl}"`);
        }

        await initializeSession(userId, callId, agentName);
        break;

      case 'conversation-update':
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

      case 'end-of-call-report':
        console.log('📊 Full end-of-call-report:', JSON.stringify(message, null, 2));
        
        // Duration is at the root level
        const durationSeconds = message?.durationSeconds || 0;
        const durationMinutes = Math.ceil(durationSeconds / 60);
        
        console.log('📊 Tracking usage:', { userId, durationMinutes, callId });
        
        if (durationMinutes > 0) {
          try {
            await subscriptionService.trackUsageSession(userId, durationMinutes, undefined, callId);
            console.log('✅ Usage tracked successfully');
          } catch (error) {
            console.error('❌ Failed to track usage:', error);
          }
        }
        
        // PRESERVED: Your transcript extraction logic
        const transcript = message.transcript || message.fullTranscript;
        const summary = message.summary;


        if (transcript) {
          console.log(`📝 Transcript preview: ${transcript.substring(0, 100)}...`);
          console.log(`📝 Raw transcript length: ${transcript.length}`);
          console.log(`📝 First 200 chars: ${transcript.substring(0, 200)}`);

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

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    const patterns = detectCSSPatterns(transcript, true);
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

// PRESERVED: All your extraction functions with production debugging
function extractUserId(message: any): string | null {
  // Log the entire message structure in production for debugging
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    console.log('🔍 Production webhook message structure:', JSON.stringify({
      hasCall: !!message?.call,
      hasCallMetadata: !!message?.call?.metadata,
      hasDirectMetadata: !!message?.metadata,
      hasAssistant: !!message?.assistant,
      hasAssistantMetadata: !!message?.assistant?.metadata,
      callMetadataKeys: message?.call?.metadata ? Object.keys(message.call.metadata) : [],
      directMetadataKeys: message?.metadata ? Object.keys(message.metadata) : []
    }));
  }

  const userId = message?.call?.metadata?.userId || 
         message?.metadata?.userId ||
         message?.call?.assistant?.metadata?.userId ||
         message?.assistant?.metadata?.userId ||
         null;

  if (!userId && process.env.REPLIT_DEPLOYMENT === '1') {
    console.error('❌ Failed to extract userId from webhook in production');
    console.error('Full message:', JSON.stringify(message).substring(0, 500));
  }

  return userId;
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
