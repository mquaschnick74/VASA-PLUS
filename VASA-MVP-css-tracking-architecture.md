# CSS (Conversational State Sensing) Tracking Architecture

## Overview
Real-time detection of therapeutic patterns in voice conversations, tracking CSS stages (CVDC/IBM/Thend/CYVC) and register dominance (Symbolic/Imaginary/Real) through natural language processing and metadata extraction.

## Core CSS Stages

### Pattern Types
- **CVDC** (Contradiction) - Two opposing desires/pulls
- **IBM** (Intention-Behavior Mismatch) - Gap between saying and doing  
- **Thend** (Therapeutic End) - Shift or integration moment
- **CYVC** (Contextual Variation) - Flexible choice/agency

### Register Dominance
- **Symbolic** - Over-intellectualizing, abstract thinking
- **Imaginary** - What-if scenarios, rumination
- **Real** - Immediate sensation/affect, low symbolization

## Agent System v3 Architecture

### Natural Voice Separation
```xml
<speak>
Natural therapeutic conversation without tracking codes
</speak>
<meta>
{
  "register": "symbolic|imaginary|real|mixed|undetermined",
  "css": {
    "stage": "CVDC|SUSPENSION|THEND|CYVC|NONE",
    "evidence": ["user quotes"],
    "confidence": 0.0-1.0
  },
  "safety": {
    "flag": boolean,
    "crisis": boolean,
    "reason": "self_harm|harm_to_others|medical"
  }
}
</meta>
```

### Processing Pipeline
```javascript
// server/utils/parseAssistantOutput.ts
parseAssistantOutput(text) {
  const speak = extractSpeak(text);    // For TTS
  const meta = extractMeta(text);      // For tracking
  return { speak, meta };
}
```

## Pattern Detection System

### CVDC Detection
```javascript
// Flexible regex patterns
const cvdcPatterns = [
  /part of me.{0,50}(but|while|yet).{0,50}another part/gi,
  /I want.{0,30}but.{0,30}I (also want|need)/gi,
  /torn between/gi,
  /contradiction between/gi
];
```

### IBM Detection  
```javascript
const ibmPatterns = [
  /I (say|tell myself).{0,30}but.{0,30}I (do|act|behave)/gi,
  /I know.{0,30}but.{0,30}I still/gi,
  /intention.{0,30}but.{0,30}action/gi
];
```

### Thend Indicators
```javascript
const thendPatterns = [
  /something.{0,20}(shifted|changed|different)/gi,
  /I (realize|understand|see) now/gi,
  /new perspective/gi
];
```

### CYVC Patterns
```javascript
const cyvcPatterns = [
  /sometimes.{0,30}other times/gi,
  /depends on.{0,20}context/gi,
  /I can choose/gi
];
```

## Data Flow Architecture

```
User Speech → VAPI → Webhook → Pattern Detection → Database → Memory Context
     ↑                                                              ↓
     ←──────────────── Agent Response ←─────────────────────────────
```

### 1. Webhook Processing
```typescript
// server/routes/webhook-routes.ts
POST /api/vapi/webhook
├── conversation-update event
├── Extract user transcript
├── Extract assistant metadata
├── Process CSS patterns
└── Store in database
```

### 2. Pattern Analysis
```typescript
// server/services/css-pattern-service.ts
detectCSSPatterns(transcript, isFullTranscript) {
  // Run pattern detection
  const cvdcMatches = detectCVDC(text);
  const ibmMatches = detectIBM(text);
  const thendIndicators = detectThend(text);
  const cyvcPatterns = detectCYVC(text);
  
  // Determine stage and confidence
  return {
    currentStage,
    cvdcPatterns,
    ibmPatterns,
    confidence,
    reasoning
  };
}
```

### 3. Session Management
```typescript
// server/services/orchestration-service.ts
class SessionState {
  userId: string;
  callId: string;
  currentCSSStage: string;
  processedTranscripts: Set<string>;  // Deduplication
}

// Two-tier cache system
const activeSessions = new Map();     // In-memory cache
const checkedSessions = new Set();    // DB lookup cache
```

## Database Schema

### css_patterns Table
```sql
CREATE TABLE css_patterns (
  id VARCHAR PRIMARY KEY,
  call_id VARCHAR,
  stage VARCHAR,              -- CVDC|IBM|THEND|CYVC
  register VARCHAR,           -- symbolic|imaginary|real
  confidence NUMERIC,         -- 0.0 to 1.0
  safety_flag BOOLEAN,        -- Crisis detection
  crisis_flag BOOLEAN,        -- Active crisis
  hsfb_invoked BOOLEAN,       -- HSFB process used
  detected_at TIMESTAMP
);
```

### session_transcripts Table
```sql
CREATE TABLE session_transcripts (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  call_id VARCHAR,
  text TEXT,
  role VARCHAR,              -- 'complete' (end-of-call only)
  created_at TIMESTAMP
);
```

### therapeutic_context Table
```sql
CREATE TABLE therapeutic_context (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  call_id VARCHAR,
  context_type VARCHAR,      -- pattern_analysis|stage_transition
  content TEXT,
  metadata JSONB,
  confidence NUMERIC,
  created_at TIMESTAMP
);
```

## Memory Integration

### Context Building
```typescript
// server/services/memory-service.ts
buildTherapeuticContext(userId) {
  // Get recent patterns
  const patterns = await getRecentPatterns(userId);
  
  // Build memory context
  return {
    dominantStage: getMostFrequentStage(patterns),
    registerDominance: getRegisterPattern(patterns),
    recentContradictions: extractContradictions(patterns),
    therapeuticProgress: assessProgress(patterns)
  };
}
```

### Agent Context Injection
```javascript
// Context sent to VAPI agent
{
  memoryContext: `
    Previous sessions detected:
    - CVDC pattern: "want connection but need space"
    - Register: Imaginary dominance
    - Stage: Moving from CVDC to suspension
  `
}
```

## Confidence Scoring

### Assessment Factors
```typescript
assessPatternConfidence(patterns) {
  let confidence = 0;
  
  // Pattern presence (40%)
  if (patterns.cvdcPatterns.length > 0) confidence += 0.4;
  if (patterns.ibmPatterns.length > 0) confidence += 0.4;
  
  // Stage indicators (30%)
  if (patterns.thendIndicators.length > 0) confidence += 0.3;
  
  // Multiple confirmations (30%)
  const totalPatterns = countAllPatterns(patterns);
  if (totalPatterns >= 3) confidence += 0.3;
  
  return { confidence, reasoning };
}
```

## Processing Optimizations

### Duplicate Prevention
```typescript
// Hash-based deduplication
const transcriptHash = Buffer.from(transcript)
  .toString('base64')
  .substring(0, 50);
  
if (session.processedTranscripts.has(transcriptHash)) {
  return; // Skip duplicate
}
```

### Efficient Storage
- Individual transcripts: Pattern detection only (not stored)
- End-of-call: Complete transcript stored once
- Patterns: Stored immediately when detected

### Race Condition Protection
```typescript
// Promise-based initialization locks
const initializationLocks = new Map<string, Promise<SessionState>>();

async function ensureSession(callId) {
  if (initializationLocks.has(callId)) {
    return await initializationLocks.get(callId);
  }
  // Initialize with lock...
}
```

## Real-time Pattern Examples

### CVDC Detection
```
User: "I want to connect with people but I also need my space"
→ Pattern: CVDC
→ Register: Imaginary
→ Evidence: ["want to connect", "need my space"]
```

### IBM Detection
```
User: "I tell myself I'll wake up early but I always hit snooze"
→ Pattern: IBM
→ Register: Symbolic
→ Evidence: ["tell myself", "always hit snooze"]
```

### Thend Detection
```
User: "Something shifted when you said that - I see it differently now"
→ Pattern: THEND
→ Register: Real
→ Evidence: ["something shifted", "see it differently"]
```

## Implementation Benefits

1. **Natural Conversations** - Agents speak naturally without forced tracking phrases
2. **Precise Detection** - Metadata tracking separate from speech
3. **Session Resilience** - Two-tier cache survives server restarts
4. **Efficient Storage** - Deduplication and end-of-call optimization
5. **Real-time Analysis** - Patterns detected during conversation
6. **Crisis Detection** - Automatic safety flag triggering

## Files & Locations

- **Pattern Detection**: `server/services/css-pattern-service.ts`
- **Session Management**: `server/services/orchestration-service.ts`
- **Memory Building**: `server/services/memory-service.ts`
- **Output Parsing**: `server/utils/parseAssistantOutput.ts`
- **Webhook Handler**: `server/routes/webhook-routes.ts`
- **Agent Configs**: `client/src/config/agent-configs.ts`

## Recent Improvements

- ✅ Speak/meta tag separation for natural voice
- ✅ Flexible regex patterns for better detection
- ✅ Two-tier cache with race protection
- ✅ End-of-call transcript optimization
- ✅ Register dominance tracking
- ✅ Safety/crisis flag integration