import { useEffect } from 'react';

export type AuraState = 'idle' | 'connecting' | 'user-speaking' | 'agent-thinking' | 'agent-speaking';

interface AvatarAuraProps {
  state: AuraState;
  agentColor?: string;
}

const KEYFRAMES = `
@keyframes aura-idle {
  0%, 100% { transform: scale(1.0); opacity: 0.45; }
  50% { transform: scale(1.1); opacity: 0.65; }
}
@keyframes aura-connect {
  0%, 100% { transform: scale(1.0); opacity: 0.55; }
  50% { transform: scale(1.15); opacity: 0.8; }
}
@keyframes aura-listen {
  0%, 100% { transform: scale(1.13); opacity: 0.75; }
  50% { transform: scale(1.02); opacity: 0.55; }
}
@keyframes aura-think {
  0% { transform: rotate(0deg) scale(1.12); }
  100% { transform: rotate(360deg) scale(1.12); }
}
@keyframes aura-think-pulse {
  0%, 100% { opacity: 0.72; }
  50% { opacity: 0.92; }
}
@keyframes aura-speak {
  0%, 100% { transform: scale(1.03); opacity: 0.68; }
  50% { transform: scale(1.2); opacity: 0.88; }
}
`;

const COLOR_MAP: Record<string, string> = {
  primary:  '#7c3aed',
  violet:   '#7c3aed',
  purple:   '#9333ea',
  blue:     '#3b82f6',
  cyan:     '#06b6d4',
  teal:     '#14b8a6',
  green:    '#22c55e',
  amber:    '#f59e0b',
  orange:   '#f97316',
  rose:     '#f43f5e',
  red:      '#ef4444',
};

function resolveColor(agentColor?: string): string {
  if (!agentColor) return '#7c3aed';
  if (agentColor.startsWith('#')) return agentColor;
  return COLOR_MAP[agentColor.toLowerCase()] ?? '#7c3aed';
}

export default function AvatarAura({ state, agentColor }: AvatarAuraProps) {
  const color = resolveColor(agentColor);

  useEffect(() => {
    const styleId = 'avatar-aura-keyframes';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = KEYFRAMES;
      document.head.appendChild(el);
    }
  }, []);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: '-18px',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: 0,
  };

  const getStyle = (): React.CSSProperties => {
    switch (state) {
      case 'idle':
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color}60 0%, ${color}28 55%, transparent 75%)`,
          animation: 'aura-idle 3s ease-in-out infinite',
        };
      case 'connecting':
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color}80 0%, ${color}40 50%, transparent 72%)`,
          boxShadow: `0 0 20px 6px ${color}30`,
          animation: 'aura-connect 0.9s ease-in-out infinite',
        };
      case 'user-speaking':
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color}50 0%, ${color}90 38%, transparent 68%)`,
          boxShadow: `0 0 26px 10px ${color}40`,
          animation: 'aura-listen 0.75s ease-in-out infinite',
        };
      case 'agent-thinking':
        return {
          ...baseStyle,
          background: `conic-gradient(from 0deg, transparent 0%, ${color}aa 22%, transparent 44%, ${color}88 66%, transparent 88%, ${color}66 100%)`,
          boxShadow: `0 0 30px 12px ${color}35`,
          animation: 'aura-think 2s linear infinite, aura-think-pulse 1.4s ease-in-out infinite',
        };
      case 'agent-speaking':
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color}70 0%, ${color}a0 32%, ${color}30 62%, transparent 80%)`,
          boxShadow: `0 0 36px 14px ${color}45`,
          animation: 'aura-speak 0.65s ease-in-out infinite',
        };
      default:
        return baseStyle;
    }
  };

  return <div style={getStyle()} />;
}
