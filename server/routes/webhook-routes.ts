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
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Has VAPI_SECRET_KEY:', !!process.env.VAPI_SECRET_KEY);
  console.log('Has signature header:', !!req.headers['x-vapi-signature']);

  try {
    // Log webhook verification attempt
    if (process.env.NODE_ENV === 'production' && process.env.VAPI_SECRET_KEY) {
      const signature = req.headers['x-vapi-signature'] as string;
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('❌ Webhook signature verification failed');
        console.error('Expected:', expectedSignature.substring(0, 10) + '...');
        console.error('Received:', signature?.substring(0, 10) + '...');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      console.log('✅ Webhook signature verified');
    } else {
      console.log('⚠️ Skipping webhook verification (not in production or no secret key)');
    }

    const { message } = req.body;
    const eventType = message?.type;

    const userId = extractUserId(message);
    const callId = extractCallId(message);
    const agentName = extractAgentName(message);

    console.log('Extracted data:', { userId, callId, agentName, eventType });

    if (!userId || !callId) {
      console.warn('❌ Missing userId or callId');
      console.warn('Message structure:', JSON.stringify(message, null, 2).substring(0, 500));
      return res.status(200).json({ received: true });
    }

    switch (eventType) {
      case 'call-started':
        await initializeSession(userId, callId, agentName);
        break;

      case 'conversation-update':
        // Process conversation update
        
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

      case 'transcript':
        const transcript = message?.transcript?.text || message?.transcript || '';
        const role = message?.transcript?.role || 'user';

        if (transcript) {
          // Ensure session exists before processing
          await ensureSession(callId, userId, agentName);
          await processTranscript(callId, transcript, role, userId, agentName);
        }
        break;

      case 'end-of-call-report':
        const fullTranscript = message?.transcript;
        const summary = message?.summary;
        const callMetadata = message?.call;

        await processEndOfCall(callId, fullTranscript, summary, callMetadata);

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

      default:
        console.log(`Unhandled event: ${eventType}`);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Test database connection endpoint
router.get('/test-db', async (req, res) => {
  try {
    const { supabase } = await import('../services/supabase-service');
    
    // Test connection by fetching sessions count
    const { data, error, count } = await supabase
      .from('therapeutic_sessions')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Database test failed:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Database connection successful',
      sessionCount: count,
      supabaseUrl: process.env.SUPABASE_URL?.substring(0, 30) + '...',
      hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database test failed',
      details: error
    });
  }
});

// Debug webhook endpoint to see raw payload
router.post('/webhook-debug', async (req, res) => {
  console.log('🔍 RAW WEBHOOK DEBUG:');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  res.json({ received: true, body: req.body });
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
  return message?.call?.metadata?.userId || 
         message?.metadata?.userId ||
         message?.call?.assistant?.metadata?.userId ||
         message?.assistant?.metadata?.userId ||
         null;
}

function extractCallId(message: any): string | null {
  return message?.call?.id || 
         message?.callId || 
         null;
}

function extractAgentName(message: any): string {
  return message?.call?.metadata?.agentName || 
         message?.metadata?.agentName ||
         message?.call?.assistant?.metadata?.agentName ||
         message?.assistant?.metadata?.agentName ||
         'Sarah';
}

export default router;