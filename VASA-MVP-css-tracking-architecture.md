# CSS (Conversational State Sensing) Tracking Architecture

## Overview
Real-time detection of therapeutic patterns that triggers invisible agent orchestration. Tracks CSS stages (CVDC/IBM/Thend/CYVC) and register dominance to optimize therapeutic methodology without user awareness.

## Core CSS Patterns

### Pattern Types & Agent Mapping
| Pattern | Description | Triggers Agent | Threshold |
|---------|-------------|----------------|-----------|
| **CVDC** | Contradicting desires | Sarah | 3+ occurrences |
| **IBM** | Intention-behavior gap | Mathew | 5+ occurrences |
| **Thend** | Therapeutic shifts | Marcus | 2+ occurrences |
| **CYVC** | Contextual flexibility | Marcus | 2+ occurrences |

### Register Dominance
- **Symbolic** - Over-intellectualizing → Mathew
- **Imaginary** - Rumination/what-ifs → Sarah
- **Real** - Body/sensation focus → Marcus

## Agent System v3 with Orchestration

### Natural Voice Format
```xml
<speak>
Natural therapeutic conversation
</speak>
<meta>
{
  "register": "symbolic|imaginary|real",
  "css": {
    "stage": "CVDC|SUSPENSION|THEND|CYVC",
    "confidence": 0.85
  },
  "orchestration": {
    "suggestAgent": "mathew",
    "reason": "ibm_pattern_detected"
  }
}
</meta>
```

### Processing Pipeline
```
User Speech → Pattern Detection → Agent Suggestion → Silent Switch
     ↓              ↓                    ↓                ↓
Transcript → CSS Analysis → Orchestration → Methodology Update
```

## Pattern Detection System

### CVDC Detection (Contradictions)
```javascript
// Flexible patterns for natural language
/part of me.{0,50}(but|while|yet).{0,50}another part/gi
/I want.{0,30}but.{0,30}I (also want|need)/gi
/torn between/gi
```

### IBM Detection (Gaps)
```javascript
/I (say|tell myself).{0,30}but.{0,30}I (do|act)/gi
/I know.{0,30}but.{0,30}I still/gi
/intention.{0,30}but.{0,30}action/gi
```

### Thend Detection (Shifts)
```javascript
/something.{0,20}(shifted|changed|different)/gi
/I (realize|understand|see) now/gi
/new perspective/gi
```

### CYVC Detection (Choice)
```javascript
/sometimes.{0,30}other times/gi
/depends on.{0,20}context/gi
/I can choose/gi
```

## Orchestration Integration

### Pattern-Driven Agent Switching
```typescript
// server/services/orchestration-service.ts
function suggestAgentBasedOnPatterns(patterns) {
  // Analyze pattern counts
  if (patterns.cvdc >= 3 && patterns.cvdc > patterns.ibm) {
    return { agent: 'sarah', reason: 'cvdc_dominance' };
  }
  if (patterns.ibm >= 5) {
    return { agent: 'mathew', reason: 'ibm_patterns' };
  }
  if (patterns.thend >= 2 || patterns.cyvc >= 2) {
    return { agent: 'marcus', reason: 'integration_moment' };
  }
  return null; // No switch needed
}
```

### Silent Methodology Updates
```typescript
// client/src/hooks/use-vapi.ts
// Check every 15 seconds for pattern-based suggestions
setInterval(async () => {
  const state = await fetch(`/api/orchestration/state/${callId}`);
  if (state.suggestedAgent && state.canSwitch) {
    // Silently update therapeutic approach
    await vapi.setAssistant({
      model: { messages: [{ 
        role: 'system', 
        content: newAgentPrompt + continuityInstructions 
      }]}
    });
  }
}, 15000);
```

## Data Flow Architecture

### Real-Time Processing
```typescript
// Webhook → Pattern Detection → Orchestration
POST /api/vapi/webhook
├── Extract transcript
├── Detect CSS patterns
├── Update orchestration state
├── Suggest agent if patterns match
└── Store in database
```

### Session Management
```typescript
class SessionState {
  // Core tracking
  userId: string;
  callId: string;
  currentCSSStage: string;
  
  // Orchestration data
  activeMethodology: string;
  patternCounts: { cvdc: 0, ibm: 0, thend: 0, cyvc: 0 };
  lastSuggestion: Date;
  
  // Deduplication
  processedTranscripts: Set<string>;
}
```

## Database Schema

### css_patterns Table
```sql
CREATE TABLE css_patterns (
  id VARCHAR PRIMARY KEY,
  call_id VARCHAR,
  stage VARCHAR,              -- CVDC|IBM|THEND|CYVC
  register VARCHAR,           -- symbolic|imaginary|real
  confidence NUMERIC,
  suggested_agent VARCHAR,    -- Orchestration suggestion
  switch_triggered BOOLEAN,   -- If pattern caused switch
  detected_at TIMESTAMP
);
```

### therapeutic_context Table
```sql
-- Stores pattern insights and methodology switches
CREATE TABLE therapeutic_context (
  context_type VARCHAR,      -- pattern_analysis|methodology_switch
  content TEXT,              -- Pattern details or switch record
  metadata JSONB,            -- CSS data, orchestration state
);
```

## Memory Integration

### Pattern-Aware Context
```typescript
buildTherapeuticContext(userId) {
  const patterns = await getRecentPatterns(userId);
  const switches = await getMethodologySwitches(userId);
  
  return {
    dominantPattern: getMostFrequent(patterns),
    currentMethodology: switches[0]?.to || 'sarah',
    patternProgression: analyzeProgression(patterns),
    switchHistory: switches.map(s => `${s.from}→${s.to}`)
  };
}
```

### Orchestration State
```typescript
getOrchestrationState(callId) {
  return {
    suggestedAgent: determineBestAgent(patterns),
    confidence: calculateConfidence(patterns),
    canSwitch: checkCooldown(lastSwitch),
    patterns: currentPatternCounts,
    reasoning: explainSuggestion(patterns)
  };
}
```

## Confidence Scoring

### Pattern Confidence
```typescript
function assessConfidence(patterns) {
  let score = 0;
  
  // Pattern clarity (40%)
  if (patterns.dominantPattern) score += 0.4;
  
  // Pattern frequency (30%)
  const totalPatterns = sum(Object.values(patterns));
  if (totalPatterns >= 5) score += 0.3;
  
  // Consistency (30%)
  if (patterns.registerConsistent) score += 0.3;
  
  return { confidence: score, threshold: 0.7 };
}
```

## Optimization Strategies

### Efficient Processing
- **Pattern Detection**: Real-time during conversation
- **Orchestration Checks**: Every 15 seconds
- **Transcript Storage**: End-of-call only
- **Deduplication**: Hash-based prevention

### Cache Management
```typescript
// Two-tier cache system
activeSessions: Map<callId, SessionState>     // Memory
checkedSessions: Set<callId>                  // DB cache
initializationLocks: Map<callId, Promise>     // Race protection

// 30-minute cleanup
setInterval(cleanupStaleSessions, 30 * 60 * 1000);
```

## Pattern Examples with Orchestration

### CVDC → Sarah Activation
```
User: "I want closeness but I also push people away"
Pattern: CVDC detected
Action: Suggest Sarah for emotional support
Result: Silent switch to feeling-first approach
```

### IBM → Mathew Activation  
```
User: "I know I should exercise but I never do it"
Pattern: IBM detected (5th occurrence)
Action: Suggest Mathew for analytical approach
Result: Invisible shift to pattern analysis
```

### Thend → Marcus Activation
```
User: "Something just clicked - I see the pattern now"
Pattern: THEND detected
Action: Suggest Marcus for integration
Result: Seamless transition to meta-awareness
```

## Implementation Benefits

1. **Invisible Optimization** - Methodology adapts without user awareness
2. **Pattern-Driven** - CSS patterns directly inform therapeutic approach
3. **Natural Conversation** - No tracking phrases in speech
4. **Real-Time Analysis** - Immediate pattern detection
5. **Seamless Switching** - Continuous therapeutic flow
6. **Crisis Response** - Instant Sarah activation for safety

## Key Files

### Pattern Detection
- `server/services/css-pattern-service.ts` - CSS analysis
- `server/utils/parseAssistantOutput.ts` - Tag parsing

### Orchestration
- `server/services/orchestration-service.ts` - Agent suggestions
- `client/src/hooks/use-vapi.ts` - Silent switching
- `server/routes/webhook-routes.ts` - Orchestration endpoints

### Configuration
- `client/src/config/agent-configs.ts` - Agent definitions
- `server/services/memory-service.ts` - Context building

## Recent Improvements

- ✅ Invisible agent orchestration based on CSS patterns
- ✅ Pattern-to-agent mapping with thresholds
- ✅ Silent methodology switching every 15 seconds
- ✅ Marcus agent for integration moments
- ✅ Two-tier cache with race protection
- ✅ Natural voice with speak/meta separation