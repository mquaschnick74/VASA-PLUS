// test-css-pipeline.mjs
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testPipeline() {
  const userId = '7aa0bd0d-282a-4d7a-8bdd-67bd064a6b4c'; // Your user ID
  const callId = crypto.randomUUID();

  console.log('🧪 Starting CSS Pipeline Test...\n');
  console.log('Using user:', userId);
  console.log('Call ID:', callId);

  try {
    // 1. Create therapeutic session
    console.log('\n1️⃣ Creating session...');
    const { error: sessionError } = await supabase.from('therapeutic_sessions').insert({
      call_id: callId,
      user_id: userId,
      agent_name: 'Mathew',
      status: 'active'
    });
    if (sessionError) throw sessionError;

    // 2. Store transcript with CSS markers
    console.log('2️⃣ Storing transcript...');
    const { error: transcriptError } = await supabase.from('session_transcripts').insert({
      user_id: userId,
      call_id: callId,
      text: 'User: I want to be creative but I keep scrolling social media\nAI: I notice you want to be creative but you actually keep scrolling',
      role: 'complete'
    });
    if (transcriptError) throw transcriptError;

    // 3. Store CSS patterns
    console.log('3️⃣ Storing patterns...');
    const { error: patternError } = await supabase.from('css_patterns').insert({
      user_id: userId,
      call_id: callId,
      pattern_type: 'IBM',
      content: 'want creative but scroll social media',
      behavioral_gap: 'want creativity, do scrolling',
      css_stage: 'focus_bind',
      confidence: 0.9
    });
    if (patternError) throw patternError;

    // 4. Track progression
    console.log('4️⃣ Tracking progression...');
    const { error: progressError } = await supabase.from('css_progressions').insert({
      user_id: userId,
      call_id: callId,
      from_stage: 'pointed_origin',
      to_stage: 'focus_bind',
      trigger_content: 'IBM pattern identified',
      agent_name: 'Mathew'
    });
    if (progressError) throw progressError;

    // 5. Store context
    console.log('5️⃣ Storing context...');
    const { error: contextError } = await supabase.from('therapeutic_context').insert({
      user_id: userId,
      call_id: callId,
      context_type: 'session_insight',
      content: 'User shows imaginary dominance with procrastination pattern',
      css_stage: 'focus_bind',
      pattern_type: 'IBM',
      confidence: 0.8,
      importance: 7
    });
    if (contextError) throw contextError;

    // 6. Complete session
    console.log('6️⃣ Completing session...');
    const { error: updateError } = await supabase
      .from('therapeutic_sessions')
      .update({
        status: 'completed',
        end_time: new Date().toISOString(),
        duration_seconds: 240
      })
      .eq('call_id', callId);
    if (updateError) throw updateError;

    console.log('\n✅ ALL TABLES POPULATED! Check Supabase.');

  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

testPipeline();