# Database Migrations

## Running Migrations

### For Development/Production (Supabase):

1. Log into your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the migration file: `001_add_onboarding_tables.sql`
4. Verify the tables were created successfully

### What the Migration Does:

The `001_add_onboarding_tables.sql` migration adds:

1. **New Column**: `last_onboarding_completed_at` on `user_profiles` table
   - Tracks when user last completed onboarding
   - Allows for future recurring onboarding feature

2. **New Table**: `user_onboarding_responses`
   - Stores user responses from the onboarding questionnaire
   - Includes "Your Voice" and "Your Journey" responses
   - Tracks if user skipped onboarding
   - Supports multiple onboarding sessions (session_number)

3. **Security**: Row Level Security (RLS) policies ensure users can only access their own data

4. **Index**: Created on `user_id` for fast lookups

### Verification:

After running the migration, verify with:

```sql
-- Check user_profiles column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'last_onboarding_completed_at';

-- Check new table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'user_onboarding_responses';

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'user_onboarding_responses';
```

## New User Onboarding Feature

### Overview
New users (with `user_type='individual'`) will see an onboarding questionnaire immediately after accepting the consent form. The questionnaire collects:

- **Your Voice**: What they want to discuss
- **Your Journey**: Their experiences and hopes

This data is then injected into the AI agent's first prompt to personalize the initial session.

### User Flow
1. User signs up → Email verification
2. User accepts consent form
3. **NEW**: Onboarding questionnaire appears
   - User can fill out responses or leave blank
   - User can click X button to skip
4. User proceeds to dashboard/voice interface
5. AI agent references onboarding responses in first session

### Features
- Typewriter effect for rotating questions
- No validation - empty submissions allowed
- X button to skip entirely
- Only shown to individual users (not therapists, partners, etc.)
- Currently shows once per user (easily configurable for recurring)
