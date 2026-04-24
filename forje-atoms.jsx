/* global React */
var { useState, useEffect, useRef, useMemo } = React;

// Shared atoms/icons for Forje
const Icon = {
  Arrow: (p) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}>
      <path d="M2 7h10m0 0L8 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ChevL: (p) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ChevR: (p) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Play: (p) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path d="M2 1.5v7l6-3.5-6-3.5z" fill="currentColor" />
    </svg>
  ),
  Spark: (p) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8L10 2z" fill="currentColor" />
    </svg>
  ),
  Eye: (p) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  Brain: (p) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <path d="M10 3c-1.5-1-4-1-5 1s0 3-1 4 1 3 2 3 1 2 3 2 3-1 3-3 2-1 2-3-1-3-2-4 0-2-2-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M10 3v14M6 9h3M11 7h3M7 13h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
  Hammer: (p) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" {...p}>
      <path d="M3 19l7-7M13 9l-2 2M7 5l10 4-2 2-10-4 2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Cpu: (p) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" {...p}>
      <rect x="6" y="6" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="9" width="4" height="4" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M9 3v3M13 3v3M9 16v3M13 16v3M3 9h3M3 13h3M16 9h3M16 13h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Infinity: (p) => (
    <svg width="24" height="22" viewBox="0 0 24 22" fill="none" {...p}>
      <path d="M7 7c-2.2 0-4 1.8-4 4s1.8 4 4 4c3 0 5-8 10-8 2.2 0 4 1.8 4 4s-1.8 4-4 4c-3 0-5-8-10-8z" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
};

// Shooting streaks background layer
const Streaks = () => {
  const streaks = [
    { top: '8%',  left: '-10%', width: 520, angle: 24,  delay: 0 },
    { top: '26%', left: '55%',  width: 340, angle: 12,  delay: 2 },
    { top: '48%', left: '-6%',  width: 460, angle: 18,  delay: 4.5 },
    { top: '64%', left: '62%',  width: 400, angle: 30,  delay: 1.2 },
  ];
  return (
    <div className="streaks" aria-hidden>
      {streaks.map((s, i) => (
        <div key={i} className="streak" style={{
          top: s.top, left: s.left, width: s.width,
          transform: `rotate(${s.angle}deg)`,
          animation: `streakFade 14s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes streakFade {
          0%, 100% { opacity: 0; transform: rotate(var(--a, 20deg)) translateX(-30%); }
          15% { opacity: 1; }
          55% { opacity: 0.9; }
          80% { opacity: 0; transform: rotate(var(--a, 20deg)) translateX(30%); }
        }
      `}</style>
    </div>
  );
};

// 4-point decorative star (inline)
const Sparkle = ({ size = 10, style, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" style={style} aria-hidden>
    <path d="M10 0 Q11 9 20 10 Q11 11 10 20 Q9 11 0 10 Q9 9 10 0Z" fill={color} />
  </svg>
);

// Rainbow vertical light pillars (Mario-Galaxy-style)
const Pillars = () => {
  const defs = [
    { left: '6%',  w: 3, color: '#6A5BFF', delay: 0.2 },
    { left: '11%', w: 2, color: '#3EC7FF', delay: 1.8 },
    { left: '15%', w: 4, color: '#7AE7FF', delay: 4.5 },
    { left: '22%', w: 2, color: '#F5F0CB', delay: 2.3 },
    { left: '28%', w: 3, color: '#FFE066', delay: 0.9 },
    { left: '34%', w: 2, color: '#FF9ED3', delay: 3.4 },
    { left: '41%', w: 3, color: '#C290FF', delay: 5.2 },
    { left: '47%', w: 2, color: '#6A5BFF', delay: 1.1 },
    { left: '54%', w: 4, color: '#3EC7FF', delay: 2.7 },
    { left: '60%', w: 2, color: '#F5F0CB', delay: 4.0 },
    { left: '66%', w: 3, color: '#FFB061', delay: 0.5 },
    { left: '72%', w: 2, color: '#FF9ED3', delay: 3.1 },
    { left: '79%', w: 3, color: '#C290FF', delay: 1.5 },
    { left: '85%', w: 2, color: '#3EC7FF', delay: 5.8 },
    { left: '91%', w: 3, color: '#6A5BFF', delay: 2.4 },
    { left: '96%', w: 2, color: '#FFE066', delay: 4.7 },
  ];
  return (
    <div className="pillars" aria-hidden>
      {defs.map((p, i) => (
        <div key={i} className="pillar" style={{
          left: p.left, width: p.w + 'px', color: p.color,
          animationDelay: p.delay + 's',
          animationDuration: (7 + (i % 5)) + 's',
        }} />
      ))}
    </div>
  );
};

Object.assign(window, { Icon, Streaks, Sparkle, Pillars });
