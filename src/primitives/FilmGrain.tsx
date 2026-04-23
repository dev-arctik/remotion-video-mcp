// Film grain overlay — uses @remotion/noise for deterministic noise pattern.
// Adds analog/grunge texture that fights the "AI-perfect" sheen. Layer on top of
// any scene as a full-screen overlay (use as Overlay or AbsoluteFill child).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { noise2D } from '@remotion/noise';
import { AbsoluteFill } from 'remotion';

export interface FilmGrainProps {
  // 0..1 — how visible the grain is. 0.05–0.15 for subtle, 0.25+ for stylized.
  intensity?: number;
  // Frames per noise refresh — 1 = full motion grain, 5+ = static grain
  refreshRate?: number;
  // Grain monochrome (true) or color flecks (false)
  monochrome?: boolean;
  // Animate noise seed each frame for true motion grain
  animated?: boolean;
  // CSS blend mode
  blendMode?: React.CSSProperties['mixBlendMode'];
}

export const FilmGrain: React.FC<FilmGrainProps> = ({
  intensity = 0.1,
  refreshRate = 1,
  monochrome = true,
  animated = true,
  blendMode = 'overlay',
}) => {
  const frame = useCurrentFrame();
  // Use a deterministic noise seed per (refresh) tick
  const tick = animated ? Math.floor(frame / refreshRate) : 0;
  // Build a small repeating noise tile via inline SVG
  // (full-canvas pixel manipulation per frame would be too slow — pattern repeat is the trick)
  const TILE = 64;
  const cells: string[] = [];
  for (let y = 0; y < TILE; y += 4) {
    for (let x = 0; x < TILE; x += 4) {
      const n = noise2D('grain', x + tick * 13.7, y + tick * 7.3);
      const v = Math.round(((n + 1) / 2) * 255);
      const r = monochrome ? v : Math.round(((noise2D('r', x + tick * 11, y) + 1) / 2) * 255);
      const g = monochrome ? v : Math.round(((noise2D('g', x + tick * 5, y) + 1) / 2) * 255);
      const b = monochrome ? v : Math.round(((noise2D('b', x + tick * 3, y) + 1) / 2) * 255);
      cells.push(`<rect x="${x}" y="${y}" width="4" height="4" fill="rgb(${r},${g},${b})" />`);
    }
  }
  const svg = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">${cells.join('')}</svg>`
  )}`;

  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("${svg}")`,
        backgroundRepeat: 'repeat',
        opacity: intensity,
        mixBlendMode: blendMode,
        pointerEvents: 'none',
      }}
    />
  );
};
