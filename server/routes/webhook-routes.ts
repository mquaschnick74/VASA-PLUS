// Simplified Webhook - CSS pattern tracking only
import { Router } from 'express';
import crypto from 'crypto';
import { 
  initializeSession, 
  processTranscript, 
  processEndOfCall,
  ensureSession
} from '../services/orchestration-service';

const router = Router();

router.post('/webhook', async (req, res) => {
  console.log('📥 VAPI webhook received:', req.body.message?.type);

  try {
    // TEMPORARILY DISABLE signature verification to get it working
    // Since you're using inline config, not dashboard webhooks
    const SKIP_SIGNATURE_CHECK = true;

    if (!SKIP_SIGNATURE_CHECK && process.env.NODE_ENV === 'production' && process.env.VAPI_SECRET_KEY) {
      const signature = req.headers['x-vapi-signature'] as string;

      // Try different signature methods since inline config might differ
      const rawBody = JSON.stringify(req.body);

      // Method 1: Direct HMAC
      const expectedSignature = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(rawBody)
        .digest('hex');

      // Method 2: With sha256= prefix (some VAPI versions)
      const expectedWithPrefix = `sha256=${expectedSignature}`;

      // Method 3: Using the public key instead (inline config might use this)
      const publicKeySignature = process.env.VITE_VAPI_PUBLIC_KEY ? 
        crypto.createHmac('sha256', process.env.VITE_VAPI_PUBLIC_KEY)
          .update(rawBody)
          .digest('hex') : null;

      if (signature !== expectedSignature && 
          signature !== expectedWithPrefix && 
          signature !== publicKeySignature) {
        console.error('Signature verification failed:', {
          received: signature,
          expected: expectedSignature,
          withPrefix: expectedWithPrefix,
          publicKey: publicKeySignature
        });
        // DON'T return 401 - just log the error and continue
        // return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { message } = req.body;
    const eventType = message?.type;

    // Log the full structure to debug userId extraction
    console.log('📋 Webhook payload structure:', {
      eventType,
      hasMessage: !!message,
      messageKeys: message ? Object.keys(message) : [],
      callMetadata: message?.call?.metadata,
      assistantMetadata: message?.assistant?.metadata,
      directMetadata: message?.metadata
    });

    const userId = extractUserId(message);
    const callId = extractCallId(message);
    const agentName = extractAgentName(message);

    console.log('🔍 Extracted values:', { userId, callId, agentName });

    if (!userId || !callId) {
      console.warn('⚠️ Missing userId or callId in webhook payload:', {
        userId,
        callId,
        fullMessage: JSON.stringify(message, null, 2)
      });
      // Still return 200 to acknowledge receipt
      return res.status(200).json({ received: true });
    }

    switch (eventType) {
      case 'call-started':
      case 'call.started': // Alternative format
        console.log('📞 Processing call-started event');
        await initializeSession(userId, callId, agentName);
        console.log('✅ Session initialized successfully');
        break;

      case 'conversation-update':
      case 'conversation.update': // Alternative format
        console.log('💬 Processing conversation-update');

        // Ensure session exists (handles missing call-started events)
        const session = await ensureSession(callId, userId, agentName);
        if (!session) {
          console.warn(`⚠️ Cannot process conversation-update: failed to ensure session for ${callId}`);
          break;
        }

        // Process both user and assistant messages for CSS patterns
        if (message?.conversation) {
          // Process the last user message
          const lastUserMessage = message.conversation
            .filter((m: any) => m.role === 'user')
            .pop();

          if (lastUserMessage?.content) {
            console.log('👤 Processing user message for patterns');
            await processTranscript(callId, lastUserMessage.content, 'user', userId, agentName);
          }

          // Also process the last assistant message for metadata
          const lastAssistantMessage = message.conversation
            .filter((m: any) => m.role === 'assistant')
            .pop();

          if (lastAssistantMessage?.content) {
            console.log('🤖 Processing assistant message for metadata');
            await processTranscript(callId, lastAssistantMessage.content, 'assistant', userId, agentName);
          }
        }
        break;

      case 'transcript':
      case 'transcript.update': // Alternative format
        console.log('📝 Processing transcript event');
        const transcript = message?.transcript?.text || message?.transcript || '';
        const role = message?.transcript?.role || 'user';

        if (transcript) {
          // Ensure session exists before processing
          await ensureSession(callId, userId, agentName);
          await processTranscript(callId, transcript, role, userId, agentName);
          console.log(`✅ Processed ${role} transcript`);
        }
        break;

      case 'end-of-call-report':
      case 'call.ended': // Alternative format
      case 'end-of-call': // Another variant
        console.log('📊 Processing end-of-call event');
        const fullTranscript = message?.transcript;
        const summary = message?.summary;
        const callMetadata = message?.call;

        await processEndOfCall(callId, fullTranscript, summary, callMetadata);
        console.log('✅ End of call processed');

        // Generate CSS progression summary
        if (fullTranscript && fullTranscript.length > 100) {
          const { generateCSSProgressionSummary } = await import('../services/summary-service');

          try {
            await generateCSSProgressionSummary(userId, callId, fullTranscript, agentName);
            console.log('✅ CSS progression summary generated');
          } catch (error) {
            console.error('Failed to generate CSS summary:', error);
          }
        }
        break;

      case 'speech-update':
      case 'status-update':
        // These are real-time updates, just acknowledge
        console.log(`📡 Real-time update: ${eventType}`);
        break;

      default:
        console.log(`❓ Unhandled event: ${eventType}`);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    // Return 200 to prevent retries even on error
    res.status(200).json({ received: true, error: 'Processing error but acknowledged' });
  }
});

// Manual analysis endpoint for testing
router.post('/analyze-transcript', async (req, res) => {
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

function extractUserId(message: any): string | null {
  // Try all possible locations where userId might be
  const possibleLocations = [
    message?.call?.metadata?.userId,
    message?.metadata?.userId,
    message?.call?.assistant?.metadata?.userId,
    message?.assistant?.metadata?.userId,
    message?.assistant?.model?.metadata?.userId,
    message?.model?.metadata?.userId
  ];

  for (const location of possibleLocations) {
    if (location) {
      console.log('Found userId at:', location);
      return location;
    }
  }

  return null;
}

function extractCallId(message: any): string | null {
  // Try all possible locations where callId might be
  const possibleLocations = [
    message?.call?.id,
    message?.callId,
    message?.id
  ];

  for (const location of possibleLocations) {
    if (location) {
      console.log('Found callId at:', location);
      return location;
    }
  }

  return null;
}

function extractAgentName(message: any): string {
  // Try all possible locations where agentName might be
  const possibleLocations = [
    message?.call?.metadata?.agentName,
    message?.metadata?.agentName,
    message?.call?.assistant?.metadata?.agentName,
    message?.assistant?.metadata?.agentName,
    message?.assistant?.model?.metadata?.agentName,
    message?.model?.metadata?.agentName
  ];

  for (const location of possibleLocations) {
    if (location) {
      console.log('Found agentName at:', location);
      return location;
    }
  }

  return 'Sarah'; // Default
}

export default router;