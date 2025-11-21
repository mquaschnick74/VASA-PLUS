#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const USER_ID = '64a60006-1cea-44c3-bdce-0ce01ecc6536';
const USER_EMAIL = 'arttay1090@gmail.com';

console.log('\n🔍 VASA Diagnostic Report for User:', USER_EMAIL);
console.log('=' .repeat(80));

async function checkUserData() {
  console.log('\n📊 1. User Account Data');
  console.log('-'.repeat(80));

  // Check user exists
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', USER_ID)
    .single();

  if (userError) {
    console.error('❌ Error fetching user:', userError.message);
    return false;
  }

  if (!user) {
    console.error('❌ User not found in database!');
    return false;
  }

  console.log('✅ User found:');
  console.log('   - ID:', user.id);
  console.log('   - Email:', user.email);
  console.log('   - Name:', user.first_name);
  console.log('   - Role:', user.role);
  console.log('   - Subscription:', user.subscription_type, '/', user.subscription_status);
  console.log('   - Created:', user.created_at);

  return true;
}

async function checkUserProfile() {
  console.log('\n📊 2. User Profile Data');
  console.log('-'.repeat(80));

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', USER_ID)
    .single();

  if (error) {
    console.error('❌ Error fetching profile:', error.message);
    return;
  }

  if (!profile) {
    console.warn('⚠️ No user profile found (this might be normal)');
    return;
  }

  console.log('✅ Profile found:');
  console.log('   - User Type:', profile.user_type);
  console.log('   - Phone:', profile.phone);
  console.log('   - Created:', profile.created_at);
}

async function checkSessions() {
  console.log('\n📊 3. Therapeutic Sessions');
  console.log('-'.repeat(80));

  const { data: sessions, error } = await supabase
    .from('therapeutic_sessions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error fetching sessions:', error.message);
    return;
  }

  if (!sessions || sessions.length === 0) {
    console.warn('⚠️ No sessions found for this user!');
    console.log('   This confirms the reported issue - sessions are not being saved.');
    return;
  }

  console.log(`✅ Found ${sessions.length} session(s):`);
  sessions.forEach((session, idx) => {
    console.log(`\n   Session ${idx + 1}:`);
    console.log('   - ID:', session.id);
    console.log('   - Call ID:', session.call_id);
    console.log('   - Agent:', session.agent_name);
    console.log('   - Status:', session.status);
    console.log('   - Start:', session.start_time);
    console.log('   - End:', session.end_time);
    console.log('   - Created:', session.created_at);
  });
}

async function checkTranscripts() {
  console.log('\n📊 4. Session Transcripts');
  console.log('-'.repeat(80));

  const { data: transcripts, error } = await supabase
    .from('session_transcripts')
    .select('*')
    .eq('user_id', USER_ID)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Error fetching transcripts:', error.message);
    return;
  }

  if (!transcripts || transcripts.length === 0) {
    console.warn('⚠️ No transcripts found for this user!');
    return;
  }

  console.log(`✅ Found ${transcripts.length} transcript(s):`);

  // Group by call_id
  const byCall = {};
  transcripts.forEach(t => {
    if (!byCall[t.call_id]) byCall[t.call_id] = [];
    byCall[t.call_id].push(t);
  });

  Object.entries(byCall).forEach(([callId, trans]) => {
    console.log(`\n   Call ID: ${callId} (${trans.length} messages)`);
    trans.slice(0, 3).forEach(t => {
      console.log(`   - [${t.role}]: ${t.transcript.substring(0, 60)}...`);
    });
  });
}

async function checkOrphanedTranscripts() {
  console.log('\n📊 5. Orphaned Transcripts (transcripts without sessions)');
  console.log('-'.repeat(80));

  // This query checks for transcripts that don't have matching sessions
  const { data: transcripts, error: transError } = await supabase
    .from('session_transcripts')
    .select('call_id, timestamp, role, transcript')
    .eq('user_id', USER_ID);

  if (transError) {
    console.error('❌ Error fetching transcripts:', transError.message);
    return;
  }

  if (!transcripts || transcripts.length === 0) {
    console.log('✅ No transcripts found (nothing to check)');
    return;
  }

  const { data: sessions, error: sessError } = await supabase
    .from('therapeutic_sessions')
    .select('call_id')
    .eq('user_id', USER_ID);

  if (sessError) {
    console.error('❌ Error fetching sessions:', sessError.message);
    return;
  }

  const sessionCallIds = new Set((sessions || []).map(s => s.call_id));
  const transcriptCallIds = new Set(transcripts.map(t => t.call_id));

  const orphanedCallIds = [...transcriptCallIds].filter(id => !sessionCallIds.has(id));

  if (orphanedCallIds.length === 0) {
    console.log('✅ No orphaned transcripts found');
  } else {
    console.warn(`⚠️ Found ${orphanedCallIds.length} orphaned call(s):`);
    orphanedCallIds.forEach(callId => {
      const count = transcripts.filter(t => t.call_id === callId).length;
      console.log(`   - Call ID: ${callId} (${count} transcripts without session)`);
    });
    console.log('\n   💡 This indicates sessions failed to save but transcripts were recorded!');
  }
}

async function checkSubscription() {
  console.log('\n📊 6. Subscription Details');
  console.log('-'.repeat(80));

  const { data: subscription, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', USER_ID)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
    console.error('❌ Error fetching subscription:', error.message);
    return;
  }

  if (!subscription) {
    console.warn('⚠️ No subscription record found');
    console.log('   This user might be relying on default free tier');
    return;
  }

  console.log('✅ Subscription found:');
  console.log('   - Type:', subscription.subscription_type);
  console.log('   - Status:', subscription.status);
  console.log('   - Minutes Limit:', subscription.minutes_limit);
  console.log('   - Minutes Used:', subscription.minutes_used);
  console.log('   - Minutes Remaining:', subscription.minutes_limit - subscription.minutes_used);
  console.log('   - Resets:', subscription.reset_date);

  if (subscription.minutes_used >= subscription.minutes_limit) {
    console.warn('   ⚠️ User has exhausted their minutes!');
  }
}

async function checkClientTherapistRelationship() {
  console.log('\n📊 7. Client-Therapist Relationship');
  console.log('-'.repeat(80));

  const { data: relationships, error } = await supabase
    .from('client_therapist_relationships')
    .select('*')
    .or(`client_id.eq.${USER_ID},therapist_id.eq.${USER_ID}`);

  if (error) {
    console.error('❌ Error fetching relationships:', error.message);
    return;
  }

  if (!relationships || relationships.length === 0) {
    console.log('✅ No client-therapist relationships (user is independent)');
    return;
  }

  console.log(`✅ Found ${relationships.length} relationship(s):`);
  relationships.forEach((rel, idx) => {
    console.log(`\n   Relationship ${idx + 1}:`);
    console.log('   - Client ID:', rel.client_id);
    console.log('   - Therapist ID:', rel.therapist_id);
    console.log('   - Status:', rel.status);
    console.log('   - Created:', rel.created_at);
  });
}

async function checkRecentActivity() {
  console.log('\n📊 8. Recent Activity Check');
  console.log('-'.repeat(80));

  // Check for any activity in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentSessions, error } = await supabase
    .from('therapeutic_sessions')
    .select('created_at, status, agent_name')
    .eq('user_id', USER_ID)
    .gte('created_at', sevenDaysAgo.toISOString());

  if (error) {
    console.error('❌ Error checking recent activity:', error.message);
    return;
  }

  if (!recentSessions || recentSessions.length === 0) {
    console.warn('⚠️ No recent activity in the last 7 days');
  } else {
    console.log(`✅ User has been active (${recentSessions.length} session(s) in last 7 days)`);
  }
}

// Main execution
async function runDiagnostics() {
  try {
    const userExists = await checkUserData();
    if (!userExists) {
      console.log('\n❌ Cannot continue diagnostics - user not found!\n');
      return;
    }

    await checkUserProfile();
    await checkSessions();
    await checkTranscripts();
    await checkOrphanedTranscripts();
    await checkSubscription();
    await checkClientTherapistRelationship();
    await checkRecentActivity();

    console.log('\n' + '='.repeat(80));
    console.log('🏁 Diagnostic Complete\n');

    console.log('💡 RECOMMENDATIONS:');
    console.log('   1. Check server logs for webhook events with call_id patterns');
    console.log('   2. Test VAPI integration with this user\'s metadata');
    console.log('   3. Verify userId is being passed correctly in VAPI start() call');
    console.log('   4. Check for database constraint violations in server logs');
    console.log('   5. Monitor network requests in browser DevTools during session');
    console.log('');

  } catch (error) {
    console.error('\n❌ Diagnostic script error:', error);
  }
}

runDiagnostics();
