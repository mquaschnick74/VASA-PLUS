// Diagnostic script for therapeutic_sessions not saving
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 DIAGNOSTIC: Investigating therapeutic_sessions issue\n');

async function diagnose() {
  // 1. Check if therapeutic_sessions table exists and is accessible
  console.log('📊 Step 1: Checking therapeutic_sessions table...');
  const { data: sessionsData, error: sessionsError } = await supabase
    .from('therapeutic_sessions')
    .select('*')
    .limit(5);

  if (sessionsError) {
    console.error('❌ Error accessing therapeutic_sessions:', sessionsError);
  } else {
    console.log(`✅ therapeutic_sessions accessible. Row count: ${sessionsData?.length || 0}`);
    if (sessionsData && sessionsData.length > 0) {
      console.log('   Latest session:', JSON.stringify(sessionsData[0], null, 2));
    }
  }

  // 2. Check other tables that ARE being populated
  console.log('\n📊 Step 2: Checking other tables...');

  const { data: contextsData } = await supabase
    .from('therapeutic_context')
    .select('call_id, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`   therapeutic_context: ${contextsData?.length || 0} recent rows`);

  const { data: patternsData } = await supabase
    .from('css_patterns')
    .select('call_id, user_id, detected_at')
    .order('detected_at', { ascending: false })
    .limit(5);

  console.log(`   css_patterns: ${patternsData?.length || 0} recent rows`);

  const { data: transcriptsData } = await supabase
    .from('session_transcripts')
    .select('call_id, user_id, timestamp')
    .order('timestamp', { ascending: false })
    .limit(5);

  console.log(`   session_transcripts: ${transcriptsData?.length || 0} recent rows`);

  // 3. Find call_ids that exist in other tables but NOT in therapeutic_sessions
  console.log('\n📊 Step 3: Finding orphaned call_ids...');

  if (contextsData && contextsData.length > 0) {
    const recentCallIds = [...new Set(contextsData.map(c => c.call_id))];
    console.log(`   Checking ${recentCallIds.length} recent call_ids from therapeutic_context`);

    for (const callId of recentCallIds.slice(0, 3)) {
      const { data: sessionExists } = await supabase
        .from('therapeutic_sessions')
        .select('id')
        .eq('call_id', callId)
        .single();

      if (!sessionExists) {
        console.log(`   ⚠️  ORPHAN FOUND: call_id ${callId} has data but NO session record`);

        // Get the userId for this call
        const contextRow = contextsData.find(c => c.call_id === callId);
        const userId = contextRow?.user_id;

        if (userId) {
          // Check if this userId exists in users table
          const { data: userExists } = await supabase
            .from('users')
            .select('id, email')
            .eq('id', userId)
            .single();

          if (!userExists) {
            console.log(`   ❌ FOREIGN KEY ISSUE: user_id ${userId} does NOT exist in users table!`);
            console.log(`      This would cause foreign key constraint violations.`);
          } else {
            console.log(`   ✅ User exists: ${userExists.email}`);
            console.log(`      Session insert should work. Check server logs for errors.`);
          }
        }
      } else {
        console.log(`   ✅ call_id ${callId} has session record`);
      }
    }
  }

  // 4. Check recent users
  console.log('\n📊 Step 4: Checking recent users...');
  const { data: usersData } = await supabase
    .from('users')
    .select('id, email, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`   Recent users count: ${usersData?.length || 0}`);
  if (usersData && usersData.length > 0) {
    usersData.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.email} (${user.id})`);
    });
  }

  // 5. Test insert with a dummy session
  console.log('\n📊 Step 5: Testing session insert...');

  if (usersData && usersData.length > 0) {
    const testUserId = usersData[0].id;
    const testCallId = `test-diagnostic-${Date.now()}`;

    console.log(`   Attempting to insert test session with user_id: ${testUserId}`);

    const { data: insertData, error: insertError } = await supabase
      .from('therapeutic_sessions')
      .insert({
        call_id: testCallId,
        user_id: testUserId,
        agent_name: 'TestAgent',
        status: 'active',
        start_time: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.error('   ❌ TEST INSERT FAILED:', insertError);
      console.error('   Error details:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('   ✅ TEST INSERT SUCCEEDED!');
      console.log('   Inserted data:', insertData);

      // Clean up test record
      await supabase
        .from('therapeutic_sessions')
        .delete()
        .eq('call_id', testCallId);
      console.log('   Test record cleaned up');
    }
  } else {
    console.log('   ⚠️  No users found to test with');
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Check your server logs for "❌ Failed to save session" messages');
  console.log('2. If you see foreign key errors, the userId from VAPI doesn\'t exist in users table');
  console.log('3. If test insert succeeded, check webhook event flow');
  console.log('4. Verify VAPI is sending userId in metadata');
}

diagnose().catch(console.error);
