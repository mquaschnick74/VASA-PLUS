import { createClient } from '@supabase/supabase-js';

async function testConnection() {
  console.log('Testing Supabase connection...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  console.log('Supabase URL:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET');
  console.log('Service Key:', supabaseKey ? 'SET (' + supabaseKey.length + ' chars)' : 'NOT SET');
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test basic connection
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error.message);
      console.error('Error details:', error);
    } else {
      console.log('✅ Supabase connection successful');
    }
  } catch (err) {
    console.error('Connection test failed:', err.message);
  }
}

testConnection();