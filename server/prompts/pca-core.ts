// server/prompts/pca-core.ts
// PCA system prompt assembly — reads layer content from text files at startup
import * as fs from 'fs';
import * as path from 'path';
import type { UserTherapeuticProfile } from '../services/sensing-layer/types';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ─── Resolve paths ────────────────────────────────────────────────────────────
function resolveLayerPath(filename: string): string {
  const candidates = [
    path.join(process.cwd(), 'server', 'prompts', 'layers', filename),
    path.join(process.cwd(), 'attached_assets', filename),
    path.join(__dirname, 'layers', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`[PCA-CORE] Layer file not found: ${filename}`);
}
function readLayer(filename: string): string {
  try {
    return fs.readFileSync(resolveLayerPath(filename), 'utf-8');
  } catch (err) {
    console.error(`[PCA-CORE] Failed to read layer file: ${filename}`, err);
    return `[Layer file not found: ${filename}]`;
  }
}
// ─── Layer 1: Theoretical Foundation ─────────────────────────────────────────
function readLayer1(): string {
  const candidates = [
    path.join(process.cwd(), 'The_Theoretical_Foundations_of_VASA.txt'),
    path.join(process.cwd(), 'attached_assets', 'The_Theoretical_Foundations_of_VASA.txt'),
    path.join(__dirname, '..', '..', 'The_Theoretical_Foundations_of_VASA.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return fs.readFileSync(p, 'utf-8'); } catch {}
    }
  }
  console.error('[PCA-CORE] Could not find The_Theoretical_Foundations_of_VASA.txt');
  return '[Layer 1: Theoretical Foundation — file not found]';
}
// ─── Load all layers at startup ───────────────────────────────────────────────
export const LAYER_2 = readLayer('layer-2.txt');
export const LAYER_3 = readLayer('layer-3.txt');
export const LAYER_4 = readLayer('layer-4.txt');
export const LAYER_6 = readLayer('layer-6.txt');
export const HSFB_PROTOCOL = readLayer('hsfb-protocol.txt');
// ─── Agent prefixes ───────────────────────────────────────────────────────────
let agentPrefixesRaw: Record<string, string> = {};
try {
  const prefixPath = resolveLayerPath('agent-prefixes.json');
  agentPrefixesRaw = JSON.parse(fs.readFileSync(prefixPath, 'utf-8'));
} catch (err) {
  console.error('[PCA-CORE] Failed to load agent-prefixes.json', err);
}
export const AGENT_PREFIXES: Record<string, string> = agentPrefixesRaw;
// ─── Footer state cache ───────────────────────────────────────────────────────
export interface FooterState {
  register: string;
  posture: string;
  css: string;
  movement: string;
  flag: string | null;
  cvdc: string | null;
}
const footerStateCache = new Map<string, FooterState>();
export function getLastFooterState(callId: string): FooterState | null {
  return footerStateCache.get(callId) ?? null;
}
export function setLastFooterState(callId: string, state: FooterState): void {
  footerStateCache.set(callId, state);
}
export function clearFooterState(callId: string): void {
  footerStateCache.delete(callId);
}
// ─── Profile block assembly ───────────────────────────────────────────────────
function assembleCSSStage(profile: UserTherapeuticProfile): string {
  if (!profile.cssHistory || profile.cssHistory.length === 0) {
    return 'Working stage: Pointed Origin — Prescripting underway.';
  }
  const stageLabels: Record<string, string> = {
    'pointed-origin': 'Pointed Origin',
    'focus-bind': 'Focus/Bind',
    'suspension': 'Suspension',
    'gesture-toward': 'Gesture Toward',
    'completion': 'Completion',
    'terminal': 'Terminal',
  };
  const latest = profile.cssHistory[0];
  const label = stageLabels[latest.stage] ?? latest.stage;
  return `Working stage: ${label} — in progress.`;
}
function assembleRegisterPattern(profile: UserTherapeuticProfile): string {
  if (!profile.registerHistory || profile.registerHistory.length === 0) {
    return 'Register pattern: No prior session register data.';
  }
  const count = profile.registerHistory.length;
  const latest = profile.registerHistory[0];
  const line1 = `Register pattern: ${latest.dominantRegister}-dominant across ${count} session${count !== 1 ? 's' : ''}.`;
  if (count >= 2) {
    const prev = profile.registerHistory[1];
    if (prev.dominantRegister !== latest.dominantRegister) {
      return `${line1} Shift from ${prev.dominantRegister} to ${latest.dominantRegister} detected last session.`;
    }
  }
  return line1;
}
function assemblePatterns(profile: UserTherapeuticProfile): string {
  if (!profile.patterns || profile.patterns.length === 0) {
    return 'Patterns: No patterns recorded.';
  }
  const lines = profile.patterns.slice(0, 3).map(p => p.description).join('\n');
  return `Patterns: ${lines}`;
}
export function assembleProfileBlock(
  firstName: string,
  profile: UserTherapeuticProfile | null,
  isFirstSession: boolean
): string {
  if (!profile || isFirstSession) {
    return `[CLIENT CONTEXT — ${firstName}]
Working stage: Pointed Origin — first session, Prescripting beginning.
Register pattern: No prior session data.
Known CVDC: CVDC not yet identified — in active Prescripting.
Patterns: No patterns recorded.
Prior significant moments: No prior sessions.`;
  }
  const lastSession = profile.lastSessionSummary
    ? `Last session: ${profile.lastSessionSummary}`
    : 'Last session: No prior session summary available.';

  const block = `[CLIENT CONTEXT — ${firstName}]
${assembleCSSStage(profile)}
${assembleRegisterPattern(profile)}
Known CVDC: CVDC not yet identified — in active Prescripting.
${assemblePatterns(profile)}
${lastSession}
Prior significant moments: Not yet available — session finalizer build pending.`;
  const approxTokens = Math.round(block.length / 4);
  if (approxTokens > 200) {
    console.warn(`[PCA-CORE] Profile block for ${firstName} is ~${approxTokens} tokens — exceeds soft cap.`);
  }
  return block;
}
// ─── Returning-session greeting instruction ───────────────────────────────────
function buildReturningSessionGreetingInstruction(
  firstName: string,
  lastSessionSummary: string | null
): string {
  const summaryRef = lastSessionSummary
    ? `The Last session field in the profile block below is your source. It reads:\n"${lastSessionSummary.slice(0, 400)}${lastSessionSummary.length > 400 ? '...' : ''}"`
    : 'The profile block below has what context is available from prior sessions.';

  return `RETURNING SESSION — GREETING INSTRUCTION:
This is NOT a first session. Do not use your first session opening line.

Your first utterance is 2–3 sentences maximum: one acknowledgment, ONE specific reference to the single most alive or unfinished thread from the last session, one invitation in.

Do NOT summarize. Do NOT list multiple topics or patterns. Pick one thread. One sentence about it. Invite them in.

${summaryRef}

CORRECT: "Hey ${firstName}. Last time something tightened up when we got near the idea of choosing — not just surviving. Where are you with that today?"
INCORRECT: "Hello ${firstName}. Last time we talked about your sense of obligation, how you manage things, and the pattern of checking whether I'm still here."

Pick one thread. Speak from there.`;
}

// ─── Full prompt assembly ─────────────────────────────────────────────────────
export function assembleSystemPrompt(
  agentId: string,
  firstName: string,
  profileBlock: string,
  isFirstSession: boolean = true,
  lastSessionSummary: string | null = null
): string {
  const prefix = AGENT_PREFIXES[agentId.toLowerCase()] ?? AGENT_PREFIXES['marcus'] ?? '';
  const personalizedPrefix = prefix.replace(/\{firstName\}/g, firstName);

  const parts: string[] = [];

  if (!isFirstSession) {
    parts.push(buildReturningSessionGreetingInstruction(firstName, lastSessionSummary));
    parts.push('');
  }

  parts.push(
    personalizedPrefix,
    '',
    profileBlock,
    '',
    LAYER_2,
    '',
    LAYER_3,
    '',
    LAYER_4,
    '',
    HSFB_PROTOCOL,
    '',
      LAYER_6,
  );

  return parts.join('\n');
}
