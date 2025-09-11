# CSS (Conversational State Sensing) Tracking Architecture

## Overview
Real-time pattern detection system that drives invisible agent orchestration. Analyzes therapeutic patterns (CVDC/IBM/Thend/CYVC) and register dominance to silently optimize methodology without user awareness.

## Core CSS System

### Pattern → Agent Mapping
| Pattern | Description | Agent | Trigger |
|---------|-------------|--------|---------|
| **CVDC** | Contradicting desires ("want X but Y") | Sarah | 3+ instances |
| **IBM** | Intention-behavior gap ("say X, do Y") | Mathew | 5+ instances |
| **Thend** | Therapeutic shifts ("something changed") | Marcus | 2+ instances |
| **CYVC** | Contextual flexibility ("sometimes X") | Marcus | 2+ instances |

### Register → Methodology
- **Symbolic** (intellectualizing) → Mathew
- **Imaginary** (rumination) → Sarah  
- **Real** (body/sensation) → Marcus

## Detection Pipeline

### Flow Architecture
```
User Speech → Webhook → Pattern Detection → Orchestration → Silent Switch
                ↓             ↓                ↓               ↓
           Transcript → CSS Analysis → Agent Suggestion → Update Methodology
```

### Natural Voice Format (v3)
```xml
<speak>Natural conversation without tracking phrases</speak>
<meta>{
  "register": "symbolic|imaginary|real",
  "css": { "stage": "CVDC", "confidence": 0.85 },
  "orchestration": { "suggestAgent": "mathew", "reason": "ibm_patterns" }
}</meta>
```

## Pattern Detection Regex

### CVDC (Contradictions)
```javascript
/part of me.{0,50}(but|while|yet).{0,50}another part/gi
/I want.{0,30}but.{0,30}I (also want|need)/gi
/torn between/gi
```

### IBM (Behavioral Gaps)
```javascript
/I (say|tell myself).{0,30}but.{0,30}I (do|act)/gi
/I know.{0,30}but.{0,30}I still/gi
```

### Thend (Integration)
```javascript
/something.{0,20}(shifted|changed)/gi
/I (realize|see) now/gi
```

### CYVC (Choice)
```javascript
/sometimes.{0,30}other times/gi
/I can choose/gi
```

## Orchestration Logic

### Agent Selection Algorithm
```typescript
function suggestAgent(patterns) {
  if (patterns.cvdc >= 3 && patterns.cvdc > patterns.ibm) 
    return 'sarah';  // Emotional support
  if (patterns.ibm >= 5) 
    return 'mathew'; // Analytical approach
  if (patterns.thend >= 2 || patterns.cyvc >= 2) 
    return 'marcus'; // Integration
  return null;       // No switch
}
```

### Silent Switching (15-second checks)
```typescript
// client/src/hooks/use-vapi.ts
setInterval(async () => {
  const state = await getOrchestrationState(callId);
  if (state.suggestedAgent && state.canSwitch) {
    await vapi.setAssistant({
      model: { messages: [{ 
        role: 'system', 
        content: newPrompt + "Continue naturally without indicating change"
      }]}
    });
  }
}, 15000);
```

## Session Management

### State Tracking
```typescript
SessionState {
  // Core
  userId, callId, currentCSSStage
  
  // Orchestration
  activeMethodology: 'sarah|mathew|marcus'
  patternCounts: {cvdc: 0, ibm: 0, thend: 0, cyvc: 0}
  lastSwitch: Date
  
  // Optimization
  processedTranscripts: Set<string>  // Deduplication
}
```

### Two-Tier Cache
```typescript
activeSessions: Map<callId, SessionState>    // Memory
checkedSessions: Set<callId>                 // DB cache
initializationLocks: Map<callId, Promise>    // Race protection
```

## Database Schema

```sql
css_patterns:
  stage (CVDC|IBM|THEND|CYVC)
  register (symbolic|imaginary|real)
  suggested_agent, switch_triggered
  
therapeutic_context:
  context_type (pattern_analysis|methodology_switch)
  content (Sarah→Mathew: ibm_patterns)
  
session_transcripts:
  text (end-of-call only)
```

## Confidence Scoring

```typescript
function assessConfidence(patterns) {
  let score = 0;
  score += patterns.dominantPattern ? 0.4 : 0;     // Clarity
  score += totalPatterns >= 5 ? 0.3 : 0;          // Frequency
  score += patterns.registerConsistent ? 0.3 : 0;  // Consistency
  return score > 0.7 ? 'high' : 'low';
}
```

## API Endpoints

```
POST /api/vapi/webhook              # Pattern detection + orchestration
GET  /api/orchestration/state/:id   # Current state + suggestions
POST /api/orchestration/record-switch # Analytics tracking
```

## Real-World Examples

### CVDC → Sarah
```
User: "I want connection but need space"
→ CVDC detected (3rd instance)
→ Suggest Sarah
→ Silent switch to emotional support
```

### IBM → Mathew
```
User: "I know I should exercise but never do"
→ IBM detected (5th instance)
→ Suggest Mathew
→ Invisible shift to analytical approach
```

### Thend → Marcus
```
User: "Something clicked - I see it now"
→ THEND detected
→ Suggest Marcus
→ Seamless transition to integration
```

## Performance

### Optimization
- **Detection**: Real-time during conversation
- **Orchestration**: 15-second background checks
- **Storage**: End-of-call transcripts only
- **Deduplication**: Hash-based (60% reduction)
- **Cache cleanup**: 30-minute intervals

### Metrics
- Context build: <100ms
- Pattern detection: Real-time
- Switch execution: <500ms
- Cache hit rate: ~95%

## Key Files

```
Pattern Detection:
├── server/services/css-pattern-service.ts
└── server/utils/parseAssistantOutput.ts

Orchestration:
├── server/services/orchestration-service.ts
├── client/src/hooks/use-vapi.ts
└── server/routes/webhook-routes.ts

Configuration:
├── client/src/config/agent-configs.ts
└── server/services/memory-service.ts
```

## Benefits

1. **Invisible Adaptation** - Methodology changes without user awareness
2. **Pattern-Driven** - CSS patterns directly trigger agent switches
3. **Natural Voice** - No tracking phrases in conversation
4. **Real-Time** - Immediate pattern detection and response
5. **Continuous Flow** - Seamless therapeutic experience
6. **Crisis Ready** - Instant Sarah activation for safety