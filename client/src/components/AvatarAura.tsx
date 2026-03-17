import React from 'react';

export type AuraState =
  | 'idle'
  | 'connecting'
  | 'user-speaking'
  | 'agent-thinking'
  | 'agent-speaking';

interface AvatarAuraProps {
  state: AuraState;
  agentColor?: string;
}

// Inject keyframes once into <head>
const KEYFRAMES = `
@keyframes orb-blob-1 {
  0%   { transform: translate(0%, 0%)    scale(1.0); }
  25%  { transform: translate(18%, -12%) scale(1.08); }
  50%  { transform: translate(10%, 20%)  scale(0.95); }
  75%  { transform: translate(-15%, 8%)  scale(1.05); }
  100% { transform: translate(0%, 0%)    scale(1.0); }
}
@keyframes orb-blob-2 {
  0%   { transform: translate(0%, 0%)    scale(1.0); }
  33%  { transform: translate(-20%, 14%) scale(1.1); }
  66%  { transform: translate(14%, -18%) scale(0.92); }
  100% { transform: translate(0%, 0%)    scale(1.0); }
}
@keyframes orb-blob-3 {
  0%   { transform: translate(0%, 0%)    scale(1.0); }
  20%  { transform: translate(12%, 16%)  scale(0.94); }
  60%  { transform: translate(-10%, -14%)scale(1.06); }
  100% { transform: translate(0%, 0%)    scale(1.0); }
}
@keyframes orb-rotate {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes orb-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes orb-thinking-pulse {
  0%   { transform: scale(1.0); opacity: 0.75; }
  50%  { transform: scale(1.12); opacity: 1.0; }
  100% { transform: scale(1.0); opacity: 0.75; }
}
`;

const COLOR_MAP: Record<string, string> = {
  primary: '#7c3aed',
  violet:  '#7c3aed',
  purple:  '#9333ea',
  blue:    '#3b82f6',
  cyan:    '#06b6d4',
  teal:    '#14b8a6',
  green:   '#22c55e',
  amber:   '#f59e0b',
  orange:  '#f97316',
  rose:    '#f43f5e',
  red:     '#ef4444',
};

function resolveColor(agentColor?: string): string {
  if (!agentColor) return '#7c3aed';
  if (agentColor.startsWith('#')) return agentColor;
  return COLOR_MAP[agentColor.toLowerCase()] ?? '#7c3aed';
}

// Lighten a hex color by mixing with white
function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

// Darken a hex color
function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `rgb(${dr}, ${dg}, ${db})`;
}

interface StateConfig {
  speed: number;       // blob animation duration in seconds
  opacity: number;     // overall orb opacity
  scale: number;       // orb scale relative to container
  blur: number;        // px blur on individual blobs
  outerBlur: number;   // px blur on outer glow ring
  outerOpacity: number;
}

const STATE_CONFIG: Record<AuraState, StateConfig> = {
  'idle': {
    speed: 7,
    opacity: 0.82,
    scale: 1.0,
    blur: 18,
    outerBlur: 12,
    outerOpacity: 0.35,
  },
  'connecting': {
    speed: 2.5,
    opacity: 0.88,
    scale: 1.04,
    blur: 16,
    outerBlur: 16,
    outerOpacity: 0.55,
  },
  'user-speaking': {
    speed: 1.8,
    opacity: 0.90,
    scale: 1.06,
    blur: 14,
    outerBlur: 18,
    outerOpacity: 0.60,
  },
  'agent-thinking': {
    speed: 3.0,
    opacity: 0.92,
    scale: 1.05,
    blur: 20,
    outerBlur: 20,
    outerOpacity: 0.65,
  },
  'agent-speaking': {
    speed: 1.4,
    opacity: 0.95,
    scale: 1.08,
    blur: 12,
    outerBlur: 22,
    outerOpacity: 0.70,
  },
};

export default function AvatarAura({ state, agentColor }: AvatarAuraProps) {
  const color = resolveColor(agentColor);
  const light = lightenColor(color, 0.55);
  const lighter = lightenColor(color, 0.80);
  const dark = darkenColor(color, 0.35);
  const cfg = STATE_CONFIG[state];

  // Orb size: extends 28px beyond avatar on each side
  // Avatar is w-20 (80px) on mobile, w-24 (96px) on sm+
  // We use a fixed 160px orb that centers behind both sizes
  const orbSize = 160;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${orbSize}px`,
    height: `${orbSize}px`,
    borderRadius: '50%',
    overflow: 'hidden',
      WebkitMaskImage: 'radial-gradient(circle, black 42%, transparent 70%)',
      maskImage: 'radial-gradient(circle, black 42%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: 0,
    opacity: cfg.opacity,
    transform: `scale(${cfg.scale})`,
    transition: state === 'agent-thinking' ? 'none' : 'opacity 0.6s ease, transform 0.6s ease',
    animation: state === 'agent-thinking' ? 'orb-thinking-pulse 1.8s ease-in-out infinite' : 'none',
  };

  // Outer soft glow ring — sits outside the clipped container
  const glowStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${orbSize + 24}px`,
    height: `${orbSize + 24}px`,
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: 0,
    background: `radial-gradient(circle, ${color}00 40%, ${color} 65%, ${color}00 80%)`,
    opacity: cfg.outerOpacity,
    filter: `blur(${cfg.outerBlur}px)`,
    transition: 'opacity 0.6s ease',
  };

  const blobBase: React.CSSProperties = {
    position: 'absolute',
    borderRadius: '50%',
    willChange: 'transform',
  };

  // Blob 1 — primary color, large, center-left
  const blob1: React.CSSProperties = {
    ...blobBase,
    width: '110px',
    height: '110px',
    top: '5px',
    left: '18px',
    background: `radial-gradient(circle at 40% 40%, ${lighter} 0%, ${light} 40%, ${color} 100%)`,
    filter: `blur(${cfg.blur}px)`,
    animation: state === 'agent-thinking' ? 'none' : `orb-blob-1 5s ease-in-out infinite`,
    animationDelay: '0s',
  };

  // Blob 2 — dark variant, center-right
  const blob2: React.CSSProperties = {
    ...blobBase,
    width: '100px',
    height: '100px',
    top: '30px',
    left: '40px',
    background: `radial-gradient(circle at 60% 60%, ${color} 0%, ${dark} 100%)`,
    filter: `blur(${cfg.blur + 4}px)`,
    animation: state === 'agent-thinking' ? 'none' : `orb-blob-2 6.5s ease-in-out infinite`,
    animationDelay: '-2s',
  };

  // Blob 3 — lighter accent, bottom
  const blob3: React.CSSProperties = {
    ...blobBase,
    width: '90px',
    height: '90px',
    top: '50px',
    left: '35px',
    background: `radial-gradient(circle at 50% 30%, ${lighter} 0%, ${light} 60%, transparent 100%)`,
    filter: `blur(${cfg.blur - 4}px)`,
    animation: state === 'agent-thinking' ? 'none' : `orb-blob-3 4.25s ease-in-out infinite`,
    animationDelay: '-3s',
  };

  // Thinking state: add slow rotation on top of blob movement
  const thinkingRotateStyle: React.CSSProperties = state === 'agent-thinking'
    ? {
        position: 'absolute',
        inset: 0,
        animation: `orb-rotate 12s linear infinite`,
      }
    : { position: 'absolute', inset: 0 };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      {/* Outer glow ring — outside the clip boundary */}
      <div style={glowStyle} />

      {/* Segmented arc spinner — thinking state only */}
      <svg
        width={orbSize + 24}
        height={orbSize + 24}
        viewBox="0 0 184 184"
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 2,
          opacity: state === 'agent-thinking' ? 1 : 0,
          transition: 'opacity 0.5s ease',
          animation: state === 'agent-thinking' ? 'orb-rotate 2.8s linear infinite' : 'none',
        }}
      >
        {/* 6 equal segments: circumference of r=72 is ~452px. Each segment = 52px arc, 23.5px gap */}
        <circle
          cx="92"
          cy="92"
          r="72"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="52 23.5"
          opacity="0.95"
        />
      </svg>

      {/* Clipped fluid orb */}
      <div style={containerStyle}>
        <div style={thinkingRotateStyle}>
          <div style={blob1} />
          <div style={blob2} />
          <div style={blob3} />
        </div>
      </div>
    </>
  );
}