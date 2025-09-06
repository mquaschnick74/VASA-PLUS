const fetch = require('node-fetch');

async function testCascadeDelete() {
  const baseUrl = 'http://localhost:3000/api/auth';
  
  try {
    // 1. Create a test user
    console.log('1. Creating test user...');
    const createResponse = await fetch(`${baseUrl}/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test-delete@example.com',
        firstName: 'Test Delete User'
      })
    });
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create user: ${await createResponse.text()}`);
    }
    
    const { user } = await createResponse.json();
    console.log('✅ Created user:', user.id, user.email);
    
    // 2. Wait a moment
    console.log('2. Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Delete the user
    console.log('3. Deleting user...');
    const deleteResponse = await fetch(`${baseUrl}/user/${user.id}`, {
      method: 'DELETE'
    });
    
    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete user: ${await deleteResponse.text()}`);
    }
    
    const deleteResult = await deleteResponse.json();
    console.log('✅ Delete result:', deleteResult);
    
    // 4. Verify user is gone
    console.log('4. Verifying deletion...');
    const verifyResponse = await fetch(`${baseUrl}/user-context/${user.id}`);
    
    if (verifyResponse.status === 404) {
      console.log('✅ SUCCESS: User successfully deleted!');
    } else {
      console.log('❌ FAILED: User still exists!');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
console.log('Starting cascade delete test...\n');
testCascadeDelete();