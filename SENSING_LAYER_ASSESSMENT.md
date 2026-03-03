# Sensing Layer Comprehensive Assessment

**Branch under review:** `codex/implement-openai-streaming-proxy-in-custom-llm`
**Assessment date:** 2026-03-03
**Scope:** Full functionality assessment of the sensing layer as it exists on this branch, including the new custom LLM proxy integration.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Assessment](#2-architecture-assessment)
3. [Signal Detection Capabilities](#3-signal-detection-capabilities)
4. [State Vector & Coupling Engine](#4-state-vector--coupling-engine)
5. [RAG / Knowledge Base Integration](#5-rag--knowledge-base-integration)
6. [Silence Monitor](#6-silence-monitor)
7. [Guidance Generation & Injection](#7-guidance-generation--injection)
8. [Custom LLM Proxy Integration](#8-custom-llm-proxy-integration)
9. [Profile Persistence Pipeline](#9-profile-persistence-pipeline)
10. [Concurrency, Race Conditions & Edge Cases](#10-concurrency-race-conditions--edge-cases)
11. [Performance Characteristics](#11-performance-characteristics)
12. [Branch-Specific Changes Impact](#12-branch-specific-changes-impact)
13. [Identified Issues & Risks](#13-identified-issues--risks)
14. [Recommendations](#14-recommendations)

---

## 1. Executive Summary

The sensing layer is a sophisticated real-time therapeutic intelligence system that operates as a **sidecar pipeline** to VAPI voice calls. It does **not** sit in the audio or LLM path directly; instead, it processes user utterances asynchronously via webhooks and injects therapeutic guidance back into VAPI via the `controlUrl` mechanism.

### Overall Assessment: **Functionally Strong, Architecturally Sound**

**Strengths:**
- Well-decomposed into 13+ modules with clear separation of concerns
- Parallel sensing computation (`Promise.all` across 4 modules) keeps latency low
- State vector coupling engine adds genuine cross-module intelligence (not just bundling)
- Robust fallback chain: Claude + RAG → Claude only → Rule-based → Safe defaults
- Generation counter + stale detection in silence monitor prevents ghost injections
- Profile writer uses stemmed fuzzy deduplication to prevent database bloat
- In-memory session accumulation with end-of-call batch write is efficient

**Weaknesses:**
- Custom LLM proxy is currently a **pass-through** with no sensing layer integration
- Knowledge base type/tag alignment was corrected on this branch but still fragile
- RAG similarity threshold lowered to 0.35 may introduce low-quality retrievals
- No authentication or rate limiting on the custom LLM endpoint
- Silence monitor re-engagement uses `claude-3-haiku-20240307` (outdated model ID)

---

## 2. Architecture Assessment

### Data Flow

```
VAPI Call
  ├── call-started webhook
  │     ├── trackVapiCall() → stores controlUrl, marks call active
  │     ├── sensingLayer.initializeCallSession() → pre-caches profile
  │     └── startSilenceMonitor()
  │
  ├── conversation-update / speech-update webhooks (per user utterance)
  │     ├── addToConversationHistory()
  │     ├── resetSilenceTimer() → arms silence detection
  │     └── processSensingLayerAsync() [background, rate-limited]
  │           ├── Lock check → skip if already processing
  │           ├── Rate limit check → skip if <5s since last
  │           ├── Cache check → reuse if same utterance hash
  │           ├── setSensingProcessing(true)
  │           ├── sensingLayer.processUtterance()
  │           │     ├── Profile load (cached per-call)
  │           │     ├── Promise.all([
  │           │     │     detectPatterns(),
  │           │     │     analyzeRegister(),
  │           │     │     mapSymbolic(),
  │           │     │     assessMovement()
  │           │     │   ])
  │           │     ├── coupleStateVector() → cross-module dynamics
  │           │     ├── generateGuidance() → rule-based or Claude+RAG
  │           │     ├── Update session state (in-memory)
  │           │     └── Record structured profile data (in-memory)
  │           ├── injectGuidance() → VAPI controlUrl POST
  │           └── setSensingProcessing(false)
  │
  ├── [silence timeout fires]
  │     ├── Stale generation check
  │     ├── Agent quiet buffer check
  │     ├── Sensing layer deferral (if processing)
  │     ├── Deepening override check
  │     ├── Posture consultation (hold/silent → extend)
  │     └── injectSpokenReEngagement() → VAPI "say" command
  │
  └── end-of-call-report webhook
        ├── sensingLayer.finalizeSession()
        │     ├── storeSessionSummary() → DB write
        │     └── persistSessionProfile() → DB write (patterns, historical, mappings)
        ├── stopSilenceMonitor()
        ├── clearControlUrl()
        └── cleanupCallCaches()
```

### Module Dependency Graph

```
index.ts (orchestrator)
  ├── pattern-detection.ts    (no inter-module deps)
  ├── register-analysis.ts    (no inter-module deps)
  ├── symbolic-mapping.ts     (no inter-module deps)
  ├── movement-assessment.ts  (no inter-module deps)
  ├── state-vector.ts         (couples all 4 raw outputs)
  ├── guidance-generator.ts   (reads coupled OSR, calls knowledge-base)
  │     └── knowledge-base.ts (OpenAI embeddings + Supabase RPC)
  ├── guidance-injector.ts    (VAPI controlUrl injection)
  ├── session-state.ts        (in-memory accumulation)
  ├── call-state.ts           (per-call tracking)
  ├── silence-monitor.ts      (timer-based, reads session-state, calls guidance-injector)
  └── profile-writer.ts       (end-of-call DB persistence)
```

**Assessment:** The architecture is well-layered. The four sensing modules are genuinely independent (no cross-dependencies), enabling reliable parallel execution. The state vector coupling step adds value by modeling how register shifts affect movement scores, and how symbolic activation affects CSS stage progression. This is not a trivial bundling — the coupling rules implement clinically meaningful dynamics.

---

## 3. Signal Detection Capabilities

### 3.1 Pattern Detection (`pattern-detection.ts`)

| Capability | Method | Confidence |
|---|---|---|
| User-explicit patterns ("I always...") | 15+ regex markers | 0.75-0.95 |
| Existing pattern matching | Keyword (40%) + Example similarity (30%) + Thematic (30%) | Threshold: 0.4 |
| Emerging pattern detection | Theme regex across conversation history (2-3 occurrences) | 14 theme patterns |
| Pattern resonance | 4 dimensions: direct, thematic, emotional, structural | Threshold: 0.2 |

**Six pattern types detected:** behavioral, cognitive, relational, emotional, avoidance, protective.

**Assessment:** Pattern detection is comprehensive for its domain. The multi-method approach (explicit → known → emerging → resonance) provides graduated sensitivity. The 14 theme patterns cover core therapeutic territory (isolation, self-worth, control, trust, abandonment, anger, shame, perfectionism, helplessness, guilt, dissociation, dependency, identity, grief). Limitation: purely regex-based — no semantic/embedding similarity.

### 3.2 Register Analysis (`register-analysis.ts`)

Detects which Lacanian psychoanalytic register the user is operating in:

| Register | Marker Categories | Weight |
|---|---|---|
| **Real** | Body words (21), Sensation words (29), Present-moment phrases (8), Physiological phrases (7) | 1.0x |
| **Imaginary** | Storytelling (11), What-if (10), Identity statements (7), Elaboration (5), External focus (11) | 0.8x |
| **Symbolic** | Pattern recognition (10), Contradiction awareness (10), Abstraction (10), Intellectualization (8), Meta-cognition (8) | 1.2x |

Also computes:
- **Stuckness score:** `min(1, maxConsecutiveSameRegister / 6)` — how many turns stuck in one register
- **Fluidity score:** Based on transition rate between registers
- **Register movement:** toward_real, toward_imaginary, toward_symbolic, fluid, static

**Assessment:** The weighting scheme (Symbolic 1.2x > Real 1.0x > Imaginary 0.8x) is clinically intentional — therapeutic work in the Symbolic register (pattern recognition, metacognition) is more therapeutically significant than narrative elaboration. The marker lists are extensive enough for voice-therapy utterances.

### 3.3 Symbolic Mapping (`symbolic-mapping.ts`)

Maps present-moment patterns to historical/trauma material:

- **4 connection types:** figure_substitution, situation_echo, emotional_rhyme, behavioral_repetition
- **4 awareness levels:** unconscious → preconscious → emerging → conscious
- **Detection methods:** Activation assessment (keyword + figure + valence + type-specific), heuristic connection detection, Claude-enhanced analysis for complex situations
- **Awareness shift tracking:** Detects when user's awareness of a connection moves between levels

**Assessment:** The awareness-level system is the most clinically sophisticated feature. By tracking whether a connection is unconscious vs. conscious, the system prevents premature interpretation — a genuine therapeutic concern. The Claude-enhanced analysis adds depth for novel connections not in the database.

### 3.4 Movement Assessment (`movement-assessment.ts`)

Tracks therapeutic trajectory across multiple dimensions:

| Indicator | Marker Count | Measures |
|---|---|---|
| Deepening | 10 markers | Movement toward core material |
| Integration | 9 markers | Meaning-making, synthesis |
| Resistance | 10 markers | Avoidance, deflection |
| Flooding | 10 markers | Emotional overwhelm |
| Intellectualizing | 9 markers | Cognitive defense |
| Looping | 8 markers | Repetitive cycling |

Also computes:
- **Trajectory:** toward_mastery, away_from_mastery, holding, cycling
- **CSS stage:** pointed_origin → focus_bind → suspension → gesture_toward → completion → terminal
- **Session position:** opening (≤3) → developing (≤8) → working (≤18) → integrating (≤23) → closing
- **Anticipation state:** Strategic patience tracking with phase, wait reasons, ready indicators, and estimated turns to ready

**Assessment:** The anticipation tracking is the most strategically important feature. It prevents premature interpretation by modeling when a user is "building toward" something and estimating readiness. The CSS stage progression provides a therapeutic roadmap grounded in PCA methodology.

---

## 4. State Vector & Coupling Engine

**File:** `state-vector.ts`

This is the most mathematically sophisticated component. It implements four coupling rules:

### Coupling Rule 1: Register → Movement
- Moving toward Real = deepening boost (+0.15)
- Stuck in Imaginary = deepening penalty (-0.05 to -0.10)
- Fluid movement = looping reduction (-0.15)
- Static + high stuckness = looping increase (+0.12)

### Coupling Rule 2: Symbolic Activation → CSS Stage
- Phase transition proximity calculated from: symbolic activation, integration, deepening, awareness shift, inverse resistance
- **Hysteresis for forward bumps:** Requires high proximity for 2 consecutive exchanges (prevents CSS stage flapping)
- Backward pull from high resistance (no hysteresis — retreating should be immediate)

### Coupling Rule 3: Pattern Density → Register
- Multiple patterns firing = Symbolic register boost (even without "pattern recognition" keywords)
- Normalizes distribution to sum to 1

### Coupling Rule 4: Movement → Therapeutic Momentum
- momentum = (deepening + integration)/2 - (resistance + flooding + looping)/3
- Adjusted by trajectory (+0.1 toward mastery, -0.1 away, 0.5x cycling)
- Range: -1 (full retreat) to +1 (full progress)

### Velocity Computation
Compares CURRENT coupled values to PREVIOUS coupled values:
- `registerShiftRate`: Distribution delta / 2
- `deepeningAcceleration`: Deepening delta × 5
- `resistanceTrajectory`: Resistance delta × 5
- `symbolicActivationRate`: Symbolic activation delta × 5

**Assessment:** The coupling engine transforms the sensing layer from "four independent analyzers" into a genuine dynamical system. The hysteresis on CSS stage transitions is particularly important — it prevents noisy stage flapping that would confuse guidance. The velocity computation provides second-order information (rates of change) that the guidance generator uses for decisions like "resistance is dissolving → probe gently."

---

## 5. RAG / Knowledge Base Integration

**File:** `knowledge-base.ts`

### Architecture
- Uses `text-embedding-3-small` for query embedding
- Supabase RPC `match_knowledge_chunks` for vector similarity search
- 3-second embedding timeout, 5-second total query timeout

### Branch-Specific Changes (Critical)

The branch corrects a **type/tag alignment mismatch** between code and database:

| Aspect | Before (broken) | After (corrected) |
|---|---|---|
| Document types | `theory`, `example`, `technique`, `guideline` | `protocol`, `guideline`, `orientation` |
| CSS stage tags | Underscores: `pointed_origin` | Hyphens: `pointed-origin` (matches DB) |
| Pattern type tags | As-is: mixed case | Lowercase hyphenated (matches DB: `cvdc`, `ibm`, `thend`, `cyvc`) |
| Similarity threshold | 0.4 (guidance), 0.6 (silence, memory) | **0.35 everywhere** |
| Type interface | `'theory' \| 'example' \| 'technique' \| 'guideline'` | `string[]` (flexible) |

### Knowledge Base Composition
- **48 chunks total:** 37 protocol, 6 guideline, 5 orientation
- DB tags use lowercase hyphens throughout

### Query Construction
`buildRagQuery()` constructs from OSR state: pattern descriptions, register, CSS stage (Title Case), anticipation phase, symbolic connection insights, movement trajectory.

**Assessment:** The type/tag alignment fix on this branch is essential — prior to this, the RAG system was likely filtering out most of the 48 knowledge chunks due to type mismatches (`theory` → 0 matches when DB only has `protocol`). Lowering the threshold to 0.35 is a compensatory move, but may introduce low-relevance retrievals. The `userId` NULL-filtering fix (passing userId only when explicitly querying per-user chunks) is also critical — it previously caused `kc.user_id = NULL` which excluded all global knowledge rows.

---

## 6. Silence Monitor

**File:** `silence-monitor.ts`

### Tiered Re-engagement Strategy

| Tier | Method | Fallback |
|---|---|---|
| **1** (first silence) | Claude Haiku + RAG | Template |
| **2** (second silence) | Claude Haiku (no RAG) | Template |
| **3** (third silence) | Escalation templates only | — |
| **4** (fourth/final) | Final templates (deep vs normal) | — |

### Adaptive Silence Thresholds

| Context | Threshold |
|---|---|
| HSFB/somatic work (Real register + deepening > 0.3) | 42 seconds |
| Deep processing (deepening > 0.4) | 35 seconds |
| Toward mastery | 30 seconds |
| Hold/silent posture | 22 seconds |
| Short/confused messages | 10 seconds |
| High resistance | 12 seconds |
| Default | 18 seconds |

Each re-engagement adds 10 seconds (+10s, +20s, +30s, +40s).

### Race Condition Protections

1. **Generation counter:** Incremented on every `resetSilenceTimer()`. Every async handler captures the generation at start and checks after each `await`. If it changed → user spoke → abort.
2. **Sensing layer deferral:** If sensing layer is processing, defer up to 2 times (5s each) before firing anyway.
3. **Posture consultation:** If latest guidance says `hold`/`silent`/`wait_and_track`, extend by 15s on first trigger.
4. **Deepening override:** If deepening increased by >0.1 during silence, reset to Tier 1.
5. **Agent quiet buffer:** Don't re-engage if agent spoke <3s ago.
6. **Max duration:** 45 minutes auto-stop.
7. **Max re-engagements:** 4 total.

### Forbidden Phrases
Explicitly bans: "I'm right here," "Take your time," "Keep going," "I'm listening" — identified as phrases that break user's internal processing.

**Assessment:** The silence monitor is production-hardened. The generation counter pattern effectively prevents the most dangerous race condition (stale timeout firing after user has already spoken). The tiered strategy gracefully degrades from AI-generated contextual re-engagement to templates. The context-aware thresholds (42s for somatic work vs 10s for confusion) demonstrate clinical sophistication.

---

## 7. Guidance Generation & Injection

### Guidance Generator (`guidance-generator.ts`)

**Two modes:**

1. **Rule-based** (fast, ~1ms): Posture determination via priority chain:
   - Flooding > 0.4 → `support`
   - Resistance > 0.4 → `hold`
   - Looping > 0.4 in working phase → `challenge`
   - User explicit pattern → `reflect`
   - Deepening > 0.3 → `probe`
   - Integration > 0.3 → `hold`
   - Phase transition approaching → `hold`
   - Rapid deepening acceleration → `hold`
   - Resistance dissolving → `probe`

2. **Claude-enhanced** (complex situations, ~1-5s): Uses `claude-3-haiku-20240307` with:
   - Full OSR summary
   - Anticipation state
   - Generative symbolic insight
   - RAG-retrieved PCA/PCP methodology (fired as non-blocking promise)
   - 5-second timeout

**Complexity trigger** (tightened to ~15-25% of turns):
- Flooding > 0.5
- Active awareness shift
- Symbolic activation > 0.8
- Pivotal CSS stages (gesture_toward, completion, terminal) with confidence > 0.5
- Strong resistance + high stuckness
- Rich convergence (strong symbolic + 3+ patterns)
- Phase transition proximity > 0.7

**JSON repair logic:** Handles Claude's occasional truncated JSON by counting braces/brackets and closing them.

### Guidance Injector (`guidance-injector.ts`)

**Three injection methods:**
1. `injectGuidance()` — System message via `add-message` (standard guidance)
2. `injectImmediateIntervention()` — High-priority system message
3. `injectSpokenReEngagement()` — `say` command (forces exact speech, silence monitor only)

**Protection mechanisms:**
- Active-call gate (refuses injection to ended calls)
- Agent-speaking gate (queues guidance while agent is speaking, flushes when stopped)
- Deduplication (12-second window, hash-based)
- ControlUrl validation (must start with `https://`)
- `triggerResponseEnabled: false` prevents VAPI from auto-generating a response from guidance

**Assessment:** The dual-mode guidance generator (rule-based + Claude) with aggressive timeouts is the right architecture for real-time voice. The complexity trigger criteria are well-chosen — they fire only for genuinely pivotal therapeutic moments. The guidance injector's speaking-gate and deduplication prevent the most common injection problems (interrupting the agent, double-injecting).

---

## 8. Custom LLM Proxy Integration

**File:** `server/routes/custom-llm-routes.ts` (NEW on this branch)

### What it does
- Acts as an OpenAI-compatible streaming proxy at `/api/custom-llm/chat/completions`
- Receives VAPI's LLM requests, forwards them to OpenAI with SSE streaming
- Logs call metadata (callId, userId, agentName, turn counts)
- Handles mid-stream failures with a graceful recovery message

### What it does NOT do
- **Does not integrate with the sensing layer** — it's a pure pass-through
- Does not inject sensing layer guidance into the message stream
- Does not read the OSR or therapeutic state
- Does not call `processSensingLayerAsync()`

### Branch-specific changes
- `max_tokens` → `max_completion_tokens` (OpenAI API compatibility fix)
- Route mounted at `/api/custom-llm` in `server/routes.ts`
- Client (`use-vapi.ts`) updated to route through custom-llm

### Assessment

The custom LLM proxy is currently a **diagnostic/logging layer**, not a sensing integration point. It gives visibility into what VAPI is sending to the LLM (message counts, turn numbers, metadata). The graceful mid-stream error recovery (sends a "Could you repeat what you just said?" message instead of crashing) is a good resilience pattern.

However, this represents a **missed opportunity**: because the proxy sees the full message array VAPI sends to OpenAI, it could:
1. Inject sensing layer guidance directly into the messages array (currently done via controlUrl `add-message`)
2. Modify system prompts in real-time based on OSR state
3. Filter or augment messages before they reach OpenAI

The current architecture keeps these two systems (sensing/injection via webhooks + LLM proxy) completely separate. This is safer but means the custom LLM proxy adds cost (double API relay) without adding therapeutic value beyond logging.

---

## 9. Profile Persistence Pipeline

**File:** `profile-writer.ts`

### Pipeline Flow
1. During the call: structured data accumulates in-memory (`SessionPatternRecord[]`, `SessionHistoricalRecord[]`, `SessionSymbolicRecord[]`)
2. At end-of-call: `finalizeSession()` → `persistSessionProfile()` writes to:
   - `user_patterns` — behavioral/cognitive/relational patterns
   - `user_historical_material` — disclosed trauma/history
   - `symbolic_mappings` — pattern-to-history connections with awareness level

### Deduplication
- **Stemmed fuzzy matching:** Custom stemmer strips 26 suffixes, removes stop words, compares Dice coefficient
- **Threshold:** 0.6 similarity = same record (update, don't insert)
- **Pattern updates:** Increment occurrences, append examples (max 10), preserve user_explicitly_identified
- **Historical updates:** Merge related figures, keep longer context notes, preserve existing valence
- **Symbolic mapping updates:** Only update if confidence or awareness improved; set `recognized_at` on progression to recognized

### DB Constraint Mapping
- Internal `emotional` → DB `cognitive`
- Internal `avoidance`/`protective` → DB `behavioral`
- Internal `unconscious` → DB `unaware`
- Internal `preconscious` → DB `emerging`
- Internal `conscious` → DB `recognized`

**Assessment:** The profile persistence pipeline is well-designed. The stemmed fuzzy deduplication prevents database bloat from near-duplicate pattern descriptions across sessions. The constraint mapping is necessary and correctly handled. The foreign key resolution (pattern → UUID, historical → UUID) uses the same fuzzy matching, which is elegant.

---

## 10. Concurrency, Race Conditions & Edge Cases

### Protections in Place

| Risk | Protection | Location |
|---|---|---|
| Concurrent sensing for same call | `processingLock` Map | `webhook-routes.ts:218-222` |
| Rate-limiting sensing calls | `lastProcessingTime` Map, 5s minimum | `webhook-routes.ts:231-235` |
| Stale silence timeouts | `resetGeneration` counter, checked after every await | `silence-monitor.ts:125-129` |
| Silence firing during sensing | Deferral mechanism (max 2, 5s each) | `silence-monitor.ts:556-568` |
| Duplicate guidance injection | Hash-based dedup, 12s window | `guidance-injector.ts:77-82` |
| Injection to ended calls | `isCallActive()` gate | `guidance-injector.ts:46-49` |
| Injection during agent speech | Speaking gate + pending queue + flush | `guidance-injector.ts:59-64` |
| Memory leak from stale calls | 2-hour cleanup interval | `call-state.ts:231-232` |
| Sensing flag stuck on | `finally` block always clears | `webhook-routes.ts:319-327` |

### Remaining Risks

1. **No lock on `injectGuidance`**: If two paths (sensing completion + silence monitor) both call inject at the same moment, both could pass the dedup check before either records its hash. Unlikely but possible.

2. **Profile cache never invalidated during call**: Profile is cached per-call at initialization. If another system (e.g., admin dashboard) updates the user's profile mid-call, the sensing layer won't see it. This is intentional (profiles only change at session end) but worth noting.

3. **`callStates` Map has no size limit**: Under pathological conditions (many concurrent calls, all failing to clean up), this could grow unbounded. The 2-hour cleanup mitigates but doesn't cap.

4. **Custom LLM proxy has no rate limiting or authentication**: Any client that knows the endpoint URL can send requests.

---

## 11. Performance Characteristics

### Typical Processing Time Budget

| Stage | Time | Notes |
|---|---|---|
| Profile load | ~1ms (cached) / ~50-200ms (first load) | 5 parallel Supabase queries |
| 4 sensing modules (parallel) | ~5-15ms | Pure computation, no I/O |
| State vector coupling | ~1ms | Pure computation |
| Rule-based guidance | ~1ms | Deterministic |
| Claude-enhanced guidance | ~1-5s | Only for complex situations (~15-25%) |
| RAG retrieval | ~200-800ms | Embedding + Supabase RPC |
| VAPI injection | ~50-200ms | HTTP POST |
| **Total (rule-based)** | **~60-400ms** | |
| **Total (Claude+RAG)** | **~1-5s** | 5s hard timeout |

### Cost Model
- ~75-85% of turns use rule-based guidance (free, fast)
- ~15-25% use Claude Haiku + RAG (embedding + Haiku call + Supabase RPC)
- Rate limiting (5s minimum) prevents runaway costs
- Guidance caching (30s TTL) reuses identical utterance guidance

---

## 12. Branch-Specific Changes Impact

### Commit `37d3bf3`: Custom LLM Proxy
- **Impact on sensing layer:** None. The proxy is a separate code path.
- **Impact on VAPI integration:** The client now routes LLM calls through the proxy, but sensing layer guidance injection still uses the controlUrl webhook path. These are independent channels.

### Commit `0ab7c44`: Knowledge base + silence threshold fixes
- **RAG type alignment:** Critical fix. The DB has `protocol`/`guideline`/`orientation`, not `theory`/`example`/`technique`/`guideline`. Before this fix, `determineRelevantTypes()` was requesting types that don't exist in the DB, resulting in 0 RAG chunks retrieved.
- **Tag format conversion:** CSS stages now converted from underscores to hyphens (`pointed_origin` → `pointed-origin`). Pattern types lowercased and hyphenated. This matches DB format.
- **Threshold reduction to 0.35:** Applied to `getRelevantGuidance()`, `buildMemoryContext()`, and silence monitor RAG. Compensates for the fact that these are relatively short therapeutic queries against short knowledge chunks.
- **Session position tags added:** `session-opening` and `session-closing` tags now included for RAG context.
- **Memory service types aligned:** `types: ['theory', 'guideline', 'technique']` → `types: ['protocol', 'guideline', 'orientation']` in `buildMemoryContext()`.

**Net impact:** RAG retrieval should go from **effectively broken** (type mismatch → 0 chunks) to **functional** (correct types, correct tags, lower threshold). This is the most impactful change on the branch.

---

## 13. Identified Issues & Risks

### High Priority

1. **Custom LLM proxy has no authentication.** Endpoint at `/api/custom-llm/chat/completions` accepts unauthenticated requests and proxies them to OpenAI using the server's API key. Any client can make requests.

2. **Outdated Claude model ID.** Both `guidance-generator.ts` and `silence-monitor.ts` use `claude-3-haiku-20240307`. This model is deprecated. Should use `claude-haiku-4-5-20251001` or later.

3. **RAG threshold at 0.35 may be too low.** At 35% similarity, retrieved chunks may be topically irrelevant. The guidance generator sends these chunks to Claude as "Retrieved PCA/PCP Guidance," which could introduce noise into therapeutic guidance.

### Medium Priority

4. **Custom LLM proxy and sensing layer are disconnected.** The proxy sees the full VAPI message array but doesn't leverage sensing data. The sensing layer injects guidance via `add-message`, which VAPI then includes in subsequent LLM calls. This double-hop architecture works but means guidance appears as system messages in the conversation history rather than being surgically inserted.

5. **Silence monitor's `claude-3-haiku-20240307` model reference.** Even if the model still works, it should be updated to avoid deprecation surprises.

6. **No graceful degradation for OpenAI embedding failures in RAG.** If `text-embedding-3-small` is down, the 3-second timeout fires and RAG silently returns `[]`. The guidance generator proceeds without RAG context. This is correct behavior but not logged as a degradation event.

### Low Priority

7. **Type safety relaxed in knowledge-base.ts.** `KnowledgeChunk.metadata.type` was changed from a union type to `string`. This loses compile-time safety and could allow mismatched types to propagate.

8. **Duplicate JSDoc blocks** in `knowledge-base.ts` (`determineRelevantTypes` and `determineRelevantTags` each have two `/** */` blocks).

9. **`callStates` Map grows without bound** (mitigated by 2-hour cleanup but no hard cap).

---

## 14. Recommendations

### Immediate (before merge)

1. **Add basic auth/validation to the custom LLM proxy.** At minimum, validate that the request contains a valid `call.id` that matches an active VAPI call.

2. **Update Claude model IDs** from `claude-3-haiku-20240307` to `claude-haiku-4-5-20251001` in both `guidance-generator.ts` and `silence-monitor.ts`.

3. **Validate RAG retrieval quality** at threshold 0.35 by logging chunk content and similarity scores for a few real calls. Consider raising to 0.40 if noise is observed.

### Short-term

4. **Integrate sensing data into the custom LLM proxy.** When the proxy sees a request, it could:
   - Look up the latest OSR/guidance for the `call.id`
   - Inject a system message with current therapeutic guidance into the messages array
   - This would replace the current `add-message` → `controlUrl` path and give more control over guidance placement

5. **Add observability** to the RAG pipeline: log chunk similarity scores, track hit/miss rates, alert on sustained 0-chunk retrievals.

6. **Clean up duplicate JSDoc blocks** in `knowledge-base.ts`.

### Long-term

7. **Consider semantic pattern matching** (embedding-based) alongside regex for pattern detection. This would catch patterns expressed in non-standard phrasing.

8. **Implement cross-session state vector continuity.** The `getFieldSummary()` function exists but the summary is only stored in `analysis_notes` JSON. Retrieving and using it as a starting point for the next session would improve continuity.

9. **Add integration tests** for the sensing pipeline. A mock webhook → sensing → guidance → injection flow test would catch regressions in the data flow.

---

*Assessment generated from source code analysis of the `codex/implement-openai-streaming-proxy-in-custom-llm` branch.*
