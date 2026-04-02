import { Card, CardContent } from '@/components/ui/card';

interface DepthConstellationProps {
  sessionCount: number;
  isPatternGated: boolean;
  patternDescription: string | null;
  isSubscribed: boolean;
  depthStage: string | null;
  firstName: string;
}

const STAGE_NAMES: Record<string, string> = {
  pointed_origin: 'Arriving',
  focus_bind: 'Circling',
  suspension: 'At the edge',
  gesture_toward: 'Breaking through',
  completion: 'Landing',
  terminal: 'Witnessing',
};

const STAGE_COPY: Record<string, (name: string) => string> = {
  pointed_origin: (n) => `${n}, something is beginning.`,
  focus_bind: (n) => `${n}, you're circling something real.`,
  suspension: (n) => `The shape is becoming visible, ${n}.`,
  gesture_toward: (n) => `${n}, something is breaking open.`,
  completion: (n) => `You're finding ground, ${n}.`,
  terminal: (n) => `You're seeing it whole, ${n}.`,
};

// Evenly spaced across 500px track (x=40 to x=540).
// fill = distance from track start to this stage's tick mark.
const STAGES = [
  { key: 'pointed_origin', label: 'Arriving',   x: 40,  fill: 0   },
  { key: 'focus_bind',     label: 'Circling',   x: 140, fill: 100 },
  { key: 'suspension',     label: 'At the edge',x: 240, fill: 200 },
  { key: 'gesture_toward', label: 'Breaking',   x: 340, fill: 300 },
  { key: 'completion',     label: 'Landing',    x: 440, fill: 400 },
  { key: 'terminal',       label: 'Witnessing', x: 540, fill: 500 },
];

export function DepthConstellation({
  sessionCount,
  isPatternGated,
  patternDescription,
  isSubscribed,
  depthStage,
  firstName,
}: DepthConstellationProps) {
  const m1 = sessionCount >= 1;
  const m2 = sessionCount >= 3;
  const m3 = sessionCount >= 5;
  const m4 = isPatternGated;
  const m5 = isSubscribed;

  const stageName = depthStage ? (STAGE_NAMES[depthStage] ?? '—') : '—';

  const stageCopy = (): string => {
    if (m4 && patternDescription) {
      const truncated =
        patternDescription.length > 62
          ? patternDescription.slice(0, 62) + '…'
          : patternDescription;
      return `You named it: "${truncated}"`;
    }
    if (depthStage && STAGE_COPY[depthStage]) return STAGE_COPY[depthStage](firstName);
    if (sessionCount === 0) return 'Your constellation is forming.';
    return `${firstName}, something is beginning.`;
  };

  const currentStageIndex = depthStage
    ? STAGES.findIndex((s) => s.key === depthStage)
    : -1;

  const trackFill = currentStageIndex >= 0 ? STAGES[currentStageIndex].fill : 0;
  const indicatorX = 40 + trackFill;

  // Stars: lit = earned milestone, dim = not yet reached.
  // Dim colours are grey-purple — enough contrast against the purple background.
  const LIT_RING = '#9d8aed';
  const LIT_CORE = '#e9d5ff';
  const DIM_RING = '#7e7a98';   // was #3d3660 — now clearly visible on purple bg
  const DIM_CORE = '#b0accc';   // was #6b60a8 — lighter, clearly distinct

  const star = (lit: boolean) => ({
    ring: lit ? LIT_RING : DIM_RING,
    core: lit ? LIT_CORE : DIM_CORE,
  });

  const s1 = star(m1);
  const s2 = star(m2);
  const s3 = star(m3);
  const s5 = star(m5);

  const copyColor = m4 && patternDescription ? '#c4b5fd' : 'var(--color-text-primary)';
  const lineOp = (show: boolean) => (show ? 0.5 : 0);

  // Stage label colour: past = medium, current = bright, future = very dim
  const labelColor = (idx: number): string => {
    if (idx < currentStageIndex) return '#7c6bd4';
    if (idx === currentStageIndex) return '#c4b5fd';
    return '#3a3458';
  };

  const labelWeight = (idx: number): string =>
    idx === currentStageIndex ? '500' : '400';

  return (
    <Card className="glass rounded-xl sm:rounded-2xl border-0">
      <CardContent className="p-4 sm:p-5">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
            Your depth
          </span>
          <span style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a78bfa' }}>
            {stageName}
          </span>
        </div>

        <div style={{ fontSize: '13px', color: copyColor, marginBottom: '0.4rem', minHeight: '20px' }}>
          {stageCopy()}
        </div>

        {/* viewBox height 138 = track at y=88, ticks to y=96, labels at y=114, + 24px bottom buffer */}
        <svg width="100%" viewBox="0 0 580 138" style={{ display: 'block' }}>

          {/* Background field dust */}
          <g opacity={0.15} fill="#a78bfa">
            <circle cx={20}  cy={18} r={1}   />
            <circle cx={90}  cy={72} r={1}   />
            <circle cx={155} cy={12} r={1.2} />
            <circle cx={230} cy={78} r={1}   />
            <circle cx={310} cy={8}  r={1}   />
            <circle cx={470} cy={15} r={1.2} />
            <circle cx={545} cy={65} r={1}   />
            <circle cx={560} cy={30} r={1}   />
            <circle cx={35}  cy={50} r={0.8} />
            <circle cx={500} cy={40} r={0.8} />
          </g>

          {/* Connector lines between earned milestones */}
          <g fill="none" stroke="#a78bfa" strokeWidth={0.5}>
            <line x1={88}  y1={42} x2={178} y2={26} strokeDasharray="3,4" opacity={lineOp(m1 && m2)} />
            <line x1={186} y1={26} x2={298} y2={52} strokeDasharray="3,4" opacity={lineOp(m2 && m3)} />
            <line x1={306} y1={50} x2={400} y2={28} strokeDasharray="3,4" opacity={lineOp(m3 && m4)} />
            <line x1={410} y1={28} x2={498} y2={58} strokeDasharray="3,4" opacity={lineOp(m4 && m5)} />
          </g>

          {/* Star 1 — first session */}
          <circle cx={90}  cy={42} r={3.5} fill={s1.ring} />
          <circle cx={90}  cy={42} r={1.8} fill={s1.core} />
          <text x={90} y={56} textAnchor="middle" fontSize={7} fill={s1.ring} opacity={m1 ? 0.85 : 0.35}>first session</text>

          {/* Star 2 — returning */}
          <circle cx={182} cy={26} r={3.5} fill={s2.ring} />
          <circle cx={182} cy={26} r={1.8} fill={s2.core} />
          <text x={182} y={40} textAnchor="middle" fontSize={7} fill={s2.ring} opacity={m2 ? 0.85 : 0.35}>returning</text>

          {/* Star 3 — deepening */}
          <circle cx={302} cy={52} r={3.5} fill={s3.ring} />
          <circle cx={302} cy={52} r={1.8} fill={s3.core} />
          <text x={302} y={66} textAnchor="middle" fontSize={7} fill={s3.ring} opacity={m3 ? 0.85 : 0.35}>deepening</text>

          {/* Star 4 — pattern found (pulsing halo when earned) */}
          {m4 && (
            <circle cx={405} cy={28} r={28} fill="#1a0a3e">
              <animate attributeName="opacity" values="0.2;0.45;0.2" dur="2.8s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx={405} cy={28} r={m4 ? 8 : 5}   fill={m4 ? '#5b3fcf' : '#4a3880'} />
          <circle cx={405} cy={28} r={m4 ? 4 : 2.5} fill={m4 ? '#c4b5fd' : '#9d8aed'} />
          {m4 && <circle cx={405} cy={28} r={1.5} fill="#ede9fe" />}
          <text x={405} y={50} textAnchor="middle" fontSize={7} fill={m4 ? '#c4b5fd' : '#7c6bd4'} opacity={m4 ? 0.9 : 0.35}>pattern found</text>

          {/* Star 5 — committed */}
          <circle cx={500} cy={58} r={3.5} fill={s5.ring} />
          <circle cx={500} cy={58} r={1.8} fill={s5.core} />
          <text x={500} y={72} textAnchor="middle" fontSize={7} fill={s5.ring} opacity={m5 ? 0.85 : 0.35}>committed</text>

          {/* ── Depth stage track ── */}

          {/* Track background */}
          <rect x={40} y={80} width={500} height={1.5} rx={1} fill="#2a2040" />

          {/* Track fill up to current stage */}
          <rect x={40} y={80} width={trackFill} height={1.5} rx={1} fill="#7c6bd4" />

          {/* Indicator dot at current stage position */}
          {currentStageIndex >= 0 && (
            <circle cx={indicatorX} cy={80.75} r={3} fill="#c4b5fd" />
          )}

          {/* Stage tick marks */}
          {STAGES.map((stage, idx) => (
            <line
              key={stage.key}
              x1={stage.x}
              y1={83}
              x2={stage.x}
              y2={90}
              stroke={idx === currentStageIndex ? '#c4b5fd' : '#3a3458'}
              strokeWidth={idx === currentStageIndex ? 1.5 : 0.75}
            />
          ))}

          {/* Stage labels below ticks */}
          {STAGES.map((stage, idx) => (
            <text
              key={stage.key}
              x={stage.x}
              y={104}
              textAnchor="middle"
              fontSize={7}
              fill={labelColor(idx)}
              fontWeight={labelWeight(idx)}
            >
              {stage.label}
            </text>
          ))}

        </svg>
      </CardContent>
    </Card>
  );
}
