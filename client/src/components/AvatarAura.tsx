import { useEffect, useState } from 'react';

export type AuraState = 'idle' | 'connecting' | 'user-speaking' | 'agent-thinking' | 'agent-speaking';

interface AvatarAuraProps {
  state: AuraState;
  agentColor?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AvatarAura({ state, agentColor = 'primary', size = 'md' }: AvatarAuraProps) {
  // Size mappings for the aura (slightly larger than avatar)
  const sizeClasses = {
    sm: 'w-24 h-24',      // Avatar is w-20 h-20
    md: 'w-32 h-32',      // Avatar is w-24 h-24
    lg: 'w-40 h-40'
  };

  // Dynamic color based on agent - using CSS custom properties for flexibility
  const colorMap: Record<string, { primary: string; secondary: string }> = {
    primary: { primary: 'rgba(139, 92, 246, 0.4)', secondary: 'rgba(59, 130, 246, 0.3)' },
    purple: { primary: 'rgba(139, 92, 246, 0.4)', secondary: 'rgba(168, 85, 247, 0.3)' },
    blue: { primary: 'rgba(59, 130, 246, 0.4)', secondary: 'rgba(96, 165, 250, 0.3)' },
    green: { primary: 'rgba(34, 197, 94, 0.4)', secondary: 'rgba(74, 222, 128, 0.3)' },
    amber: { primary: 'rgba(245, 158, 11, 0.4)', secondary: 'rgba(251, 191, 36, 0.3)' },
    rose: { primary: 'rgba(244, 63, 94, 0.4)', secondary: 'rgba(251, 113, 133, 0.3)' },
    teal: { primary: 'rgba(20, 184, 166, 0.4)', secondary: 'rgba(45, 212, 191, 0.3)' },
  };

  const colors = colorMap[agentColor] || colorMap.primary;

  // Animation class based on state
  const getAnimationClass = () => {
    switch (state) {
      case 'idle':
        return 'animate-aura-breathe';
      case 'connecting':
        return 'animate-aura-pulse';
      case 'user-speaking':
        return 'animate-aura-listen';
      case 'agent-thinking':
        return 'animate-aura-think';
      case 'agent-speaking':
        return 'animate-aura-speak';
      default:
        return 'animate-aura-breathe';
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Outer organic blob */}
      <div
        className={`absolute ${sizeClasses[size]} ${getAnimationClass()} rounded-full blur-xl opacity-60`}
        style={{
          background: `radial-gradient(ellipse at 30% 30%, ${colors.primary}, ${colors.secondary}, transparent 70%)`,
          borderRadius: '60% 40% 50% 50% / 50% 60% 40% 50%',
        }}
      />

      {/* Inner glow layer */}
      <div
        className={`absolute ${sizeClasses[size]} ${getAnimationClass()} rounded-full blur-md opacity-40`}
        style={{
          background: `radial-gradient(circle, ${colors.primary}, transparent 60%)`,
          animationDelay: '-0.5s',
          transform: 'scale(0.85)',
        }}
      />

      {/* Subtle ring */}
      <div
        className={`absolute ${sizeClasses[size]} ${getAnimationClass()} rounded-full opacity-30`}
        style={{
          border: `2px solid ${colors.primary}`,
          borderRadius: '50% 50% 45% 55% / 55% 45% 55% 45%',
          animationDelay: '-1s',
        }}
      />
    </div>
  );
}
