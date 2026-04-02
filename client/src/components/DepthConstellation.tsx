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

const STAGE_TRACK_WIDTH: Record<string, number> = {
  pointed_origin: 83,
  focus_bind: 167,
  suspension: 250,
  gesture_toward: 333,
  completion: 417,
  terminal: 500,
};

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

  const trackWidth = depthStage ? (STAGE_TRACK_WIDTH[depthStage] ?? 0) : 0;

  const LIT_RING = '#9d8aed';
  const LIT_CORE = '#e9d5ff';
  const DIM_RING = '#3d3660';
  const DIM_CORE = '#6b60a8';
  const LIT_LABEL = '#b8abf0';
  const DIM_LABEL = '#4a4270';

  const star = (lit: boolean) => ({
    ring: lit ? LIT_RING : DIM_RING,
    core: lit ? LIT_CORE : DIM_CORE,
    label: lit ? LIT_LABEL : DIM_LABEL,
    labelOpacity: lit ? 0.9 : 0.3,
  });

  const s1 = star(m1);
  const s2 = star(m2);
  const s3 = star(m3);
  const s5 = star(m5);

  const copyColor = m4 && patternDescription ? '#c4b5fd' : 'var(--color-text-primary)';
  const lineOp = (show: boolean) => (show ? 0.5 : 0);

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

        <svg width="100%" viewBox="0 0 580 110" style={{ display: 'block' }}>
          {/* Background field dust */}
          <g opacity={0.12} fill="#a78bfa">
            <circle cx={20} cy={18} r={1} />
            <circle cx={90} cy={88} r={1} />
            <circle cx={155} cy={12} r={1.2} />
            <circle cx={230} cy={95} r={1} />
            <circle cx={310} cy={8} r={1} />
            <circle cx={400} cy={98} r={1} />
            <circle cx={470} cy={15} r={1.2} />
            <circle cx={545} cy={82} r={1} />
            <circle cx={560} cy={30} r={1} />
            <circle cx={35} cy={60} r={0.8} />
            <circle cx={500} cy={50} r={0.8} />
          </g>

          {/* Connector lines */}
          <g fill="none" stroke="#a78bfa" strokeWidth={0.5}>
            <line x1={88} y1={52} x2={178} y2={34} strokeDasharray="3,4" opacity={lineOp(m1 && m2)} />
            <line x1={186} y1={34} x2={298} y2={62} strokeDasharray="3,4" opacity={lineOp(m2 && m3)} />
            <line x1={306} y1={60} x2={400} y2={38} strokeDasharray="3,4" opacity={lineOp(m3 && m4)} />
            <line x1={410} y1={38} x2={498} y2={68} strokeDasharray="3,4" opacity={lineOp(m4 && m5)} />
          </g>

          {/* Star 1 — first session */}
          <circle cx={90} cy={52} r={3.5} fill={s1.ring} />
          <circle cx={90} cy={52} r={1.8} fill={s1.core} />
          <text x={90} y={76} textAnchor="middle" fontSize={8} fill={s1.label} opacity={s1.labelOpacity}>first session</text>

          {/* Star 2 — returning */}
          <circle cx={182} cy={34} r={3.5} fill={s2.ring} />
          <circle cx={182} cy={34} r={1.8} fill={s2.core} />
          <text x={182} y={58} textAnchor="middle" fontSize={8} fill={s2.label} opacity={s2.labelOpacity}>returning</text>

          {/* Star 3 — deepening */}
          <circle cx={302} cy={64} r={3.5} fill={s3.ring} />
          <circle cx={302} cy={64} r={1.8} fill={s3.core} />
          <text x={302} y={88} textAnchor="middle" fontSize={8} fill={s3.label} opacity={s3.labelOpacity}>deepening</text>

          {/* Star 4 — pattern found (special, larger, pulsing halo) */}
          {m4 && (
            <circle cx={405} cy={38} r={28} fill="#1a0a3e">
              <animate attributeName="opacity" values="0.2;0.45;0.2" dur="2.8s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx={405} cy={38} r={m4 ? 8 : 5} fill={m4 ? '#5b3fcf' : '#3d2882'} />
          <circle cx={405} cy={38} r={m4 ? 4 : 2.5} fill={m4 ? '#c4b5fd' : '#9d8aed'} />
          {m4 && <circle cx={405} cy={38} r={1.5} fill="#ede9fe" />}
          <text x={405} y={62} textAnchor="middle" fontSize={8} fill={m4 ? '#c4b5fd' : '#7c6bd4'} opacity={m4 ? 1 : 0.4}>
            pattern found
          </text>

          {/* Star 5 — committed */}
          <circle cx={500} cy={68} r={3.5} fill={s5.ring} />
          <circle cx={500} cy={68} r={1.8} fill={s5.core} />
          <text x={500} y={92} textAnchor="middle" fontSize={8} fill={s5.label} opacity={s5.labelOpacity}>committed</text>

          {/* Depth track — CSS stage */}
          <rect x={40} y={102} width={500} height={1.5} rx={1} fill="#2a2040" />
          <rect x={40} y={102} width={trackWidth} height={1.5} rx={1} fill="#7c6bd4" />
        </svg>
      </CardContent>
    </Card>
  );
}
