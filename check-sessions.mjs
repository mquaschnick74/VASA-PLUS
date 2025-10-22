// Quick inline diagnostic for therapeutic_sessions
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Quick Diagnostic: therapeutic_sessions\n');

(async () => {
  // 1. Count sessions
  const { data: sessions, error: sessErr } = await supabase
    .from('therapeutic_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('📊 therapeutic_sessions table:');
  console.log(`   Total rows: ${sessions?.length || 0}`);
  if (sessErr) console.error('   Error:', sessErr);

  // 2. Count other tables
  const { data: contexts } = await supabase
    .from('therapeutic_context')
    .select('call_id, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: patterns } = await supabase
    .from('css_patterns')
    .select('call_id, user_id')
    .order('detected_at', { ascending: false })
    .limit(5);

  console.log(`\n📊 therapeutic_context: ${contexts?.length || 0} recent rows`);
  console.log(`📊 css_patterns: ${patterns?.length || 0} recent rows`);

  // 3. Find orphaned call_ids
  if (contexts && contexts.length > 0) {
    console.log('\n🔍 Checking for orphaned sessions...');

    const callId = contexts[0].call_id;
    const userId = contexts[0].user_id;

    console.log(`\n   Latest call_id from therapeutic_context: ${callId}`);
    console.log(`   User ID: ${userId}`);

    // Check if session exists
    const { data: sessionExists } = await supabase
      .from('therapeutic_sessions')
      .select('id')
      .eq('call_id', callId)
      .single();

    if (!sessionExists) {
      console.log('   ❌ NO SESSION RECORD FOUND for this call!');

      // Check if user exists
      const { data: userExists, error: userErr } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', userId)
        .single();

      if (userErr || !userExists) {
        console.log(`\n   ⚠️  ROOT CAUSE FOUND!`);
        console.log(`   User ${userId} does NOT exist in users table`);
        console.log(`   This causes FOREIGN KEY constraint violations`);
        console.log(`\n   SOLUTION: Create user before session, or make user_id nullable`);
      } else {
        console.log(`\n   ✅ User exists: ${userExists.email}`);
        console.log(`   Issue is NOT foreign key. Check server logs for errors.`);
      }
    } else {
      console.log('   ✅ Session record exists');
    }
  }

  // 4. Check users table
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .limit(3);

  console.log(`\n📊 users table: ${users?.length || 0} rows`);
  if (users && users.length > 0) {
    console.log('   Sample users:');
    users.forEach(u => console.log(`   - ${u.email} (${u.id})`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Run this in your server logs to see real-time errors:');
  console.log('grep "Failed to save session" or grep "Session saved"');
  console.log('='.repeat(60));
})();
