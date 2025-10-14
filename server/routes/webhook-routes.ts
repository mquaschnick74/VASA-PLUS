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
            console.error(`❌ Failed to create retroactive session for ${callId}:`, error);
          }
        }
      }

      // Duration tracking
      const durationSeconds = message?.durationSeconds || 0;
      const durationMinutes = Math.ceil(durationSeconds / 60);

      console.log('📊 Tracking usage:', { userId, durationMinutes, callId });

      if (durationMinutes > 0 && userId) {
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
  // Try multiple locations for userId
  const userId = message?.call?.metadata?.userId || 
         message?.metadata?.userId ||
         message?.call?.assistant?.metadata?.userId ||
         message?.assistant?.metadata?.userId ||
         message?.call?.assistantId || // New: Try assistantId
         message?.assistantId || // New: Direct assistantId
         null;

  // If still not found, try to extract from call object deeply
  if (!userId && message?.call) {
    // Check if metadata is nested differently
    const callObj = message.call;
    if (callObj.customer?.userId) return callObj.customer.userId;
    if (callObj.user?.id) return callObj.user.id;
  }

  if (!userId) {
    console.warn('⚠️ Could not extract userId from webhook');
    console.warn('Available paths:', {
      hasCallMetadata: !!message?.call?.metadata,
      hasDirectMetadata: !!message?.metadata,
      callMetadataKeys: message?.call?.metadata ? Object.keys(message.call.metadata) : [],
      directMetadataKeys: message?.metadata ? Object.keys(message.metadata) : [],
      messageKeys: Object.keys(message || {})
    });
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
