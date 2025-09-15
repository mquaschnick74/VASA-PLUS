# Server Routes Documentation

## Overview
The server routes directory contains the API endpoint definitions for the therapeutic voice assistant application. These routes handle authentication, VAPI webhook integrations, and testing functionalities.

## Main Routes File (`server/routes.ts`)

The main routes file acts as the central router that organizes and mounts all route modules under appropriate API paths.

### Route Structure:
- **Base Path**: `/api`
- **Mounted Routes**:
  - `/api/auth` - Authentication and user management routes
  - `/api/vapi` - VAPI webhook integration routes  
  - `/api/test` - Testing and debugging routes
  - `/api/health` - Health check endpoint

## Route Modules

### 1. Authentication Routes (`server/routes/auth-routes.ts`)

Handles user authentication, context retrieval, and user management.

#### Key Endpoints:

- **POST `/api/auth/user`**
  - Creates new users or retrieves existing users by email
  - Initializes user profiles with first name
  - Tests database connectivity before operations

- **GET `/api/auth/user-context/:userId`**
  - Retrieves enhanced memory context for returning users
  - Generates personalized, agent-specific greetings based on CSS progression
  - Integrates session history and therapeutic patterns
  - Query params: `agentName` (Sarah, Mathew, Marcus, or Zhanna)

- **DELETE `/api/auth/user/:email`**
  - Cascading delete of user and all associated data
  - Removes: sessions, transcripts, CSS progressions, therapeutic context

- **POST `/api/auth/generate-missing-css-summaries`**
  - Backfills missing CSS summaries for existing sessions
  - Analyzes past transcripts for CSS patterns
  - Used for data migration and recovery

- **GET `/api/auth/check-supabase`**
  - Tests Supabase database connectivity
  - Returns connection status and configuration details

### 2. VAPI Webhook Routes (`server/routes/webhook-routes.ts`)

Processes real-time voice conversation events from VAPI.

#### Key Endpoints:

- **POST `/api/vapi/webhook`**
  - Main webhook endpoint for VAPI events
  - Handles multiple event types:
    - `call-started`: Initializes new therapy sessions
    - `transcript`: Processes real-time conversation snippets
    - `end-of-call-report`: Generates session summaries and CSS analysis
    - `speech-update`: Tracks conversation flow
  - Features:
    - Optional signature verification for security
    - User/agent metadata extraction
    - Real-time CSS pattern detection
    - Session context management

#### Event Processing Flow:
1. Extract user ID, call ID, and agent name from webhook payload
2. Initialize or retrieve session context
3. Process transcript for CSS patterns (CVDC, IBM, Thend)
4. Store therapeutic insights and progressions
5. Generate summaries on call completion

### 3. Test CSS Generation Routes (`server/routes/test-css-generation.ts`)

Development and testing endpoints for CSS pattern analysis.

#### Key Endpoints:

- **POST `/api/test/generate-css-summary`**
  - Tests CSS summary generation from sample transcripts
  - Validates pattern detection algorithms
  - Returns detailed CSS analysis including:
    - Contradictions (CVDC)
    - Intention-behavior mismatches (IBM)
    - Integration indicators (Thend)
    - Stage progressions

- **GET `/api/test/css-patterns`**
  - Returns example CSS patterns for testing
  - Useful for validating detection logic

## Data Flow

```
User Voice Input → VAPI → Webhook Routes → Orchestration Service
                                         ↓
                                    CSS Analysis
                                         ↓
                              Database Storage (Supabase)
                                         ↓
                              Memory Service → Context Generation
                                         ↓
                                 Agent Response with Context
```

## Security Features

1. **Signature Verification**: VAPI webhooks can be verified using HMAC-SHA256
2. **User Authentication**: Email-based user identification
3. **Cascading Deletes**: Proper data cleanup on user deletion
4. **Error Handling**: Comprehensive error logging and graceful failures

## Integration Points

- **Supabase**: All database operations
- **VAPI**: Voice conversation platform
- **Memory Service**: Context building and personalization
- **Summary Service**: CSS pattern analysis and session summaries
- **Orchestration Service**: Coordinates webhook event processing

## Environment Variables

Required environment variables for route operations:
- `VAPI_SECRET_KEY`: For webhook signature verification
- `VITE_VAPI_PUBLIC_KEY`: Alternative signature verification
- `DATABASE_URL`: Supabase connection string
- `NODE_ENV`: Environment setting (development/production)

## Error Handling

All routes implement:
- Try-catch blocks for async operations
- Detailed console logging for debugging
- Appropriate HTTP status codes
- Client-friendly error messages
- Fallback behaviors for missing data

## Testing

The test routes provide endpoints to:
- Validate CSS pattern detection
- Test summary generation
- Debug webhook processing
- Verify database connectivity
- Simulate conversation flows

## Best Practices

1. Always validate input data before processing
2. Use TypeScript types for request/response objects
3. Log important operations for debugging
4. Handle missing or malformed data gracefully
5. Keep routes thin - delegate logic to services
6. Return consistent response formats
7. Include appropriate status codes