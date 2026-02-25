import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, staticFile } from 'remotion';

// Map easing names to Remotion Easing functions
const EASING_MAP: Record<string, ((t: number) => number) | undefined> = {
  'linear': undefined, // undefined = linear (interpolate default)
  'ease-in': Easing.in(Easing.ease),
  'ease-out': Easing.out(Easing.ease),
  'ease-in-out': Easing.inOut(Easing.ease),
};

interface Animation {
  property: 'opacity' | 'x' | 'y' | 'scale' | 'rotation' | 'width' | 'height';
  from: number;
  to: number;
  startFrame: number;
  endFrame: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
  springConfig?: { damping?: number; mass?: number; stiffness?: number };
}

interface ObjectConfig {
  id: string;
  type: 'text' | 'image' | 'shape' | 'svg';
  src?: string;
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  position?: { x: number | string; y: number | string };
  size?: { width: number | string; height: number | string };
  borderRadius?: number | string;
  animations?: Animation[];
  [key: string]: unknown;
}

interface AnimatedObjectProps {
  object: ObjectConfig;
}

export const AnimatedObject: React.FC<AnimatedObjectProps> = ({ object: config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Compute animated values for each property
  const animatedValues: Record<string, number> = {};

  for (const anim of config.animations ?? []) {
    let value: number;

    if (frame < anim.startFrame) {
      // Before animation starts — hold initial value
      value = anim.from;
    } else if (frame > anim.endFrame) {
      // After animation ends — hold final value
      value = anim.to;
    } else if (anim.easing === 'spring') {
      // Spring physics animation
      const springVal = spring({
        frame: frame - anim.startFrame,
        fps,
        config: {
          damping: anim.springConfig?.damping ?? 10,
          mass: anim.springConfig?.mass ?? 1,
          stiffness: anim.springConfig?.stiffness ?? 100,
        },
      });
      value = interpolate(springVal, [0, 1], [anim.from, anim.to]);
    } else {
      // Linear or eased interpolation
      const easingFn = EASING_MAP[anim.easing ?? 'linear'];
      value = interpolate(
        frame,
        [anim.startFrame, anim.endFrame],
        [anim.from, anim.to],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          ...(easingFn ? { easing: easingFn } : {}),
        }
      );
    }

    animatedValues[anim.property] = value;
  }

  // Resolve position — supports numeric (px) and string ("center") values
  const resolvePosition = (val: number | string | undefined, fallback: number): number => {
    if (val === undefined) return fallback;
    if (typeof val === 'number') return val;
    return fallback;
  };

  const x = animatedValues.x ?? resolvePosition(config.position?.x, 0);
  const y = animatedValues.y ?? resolvePosition(config.position?.y, 0);
  const opacity = animatedValues.opacity ?? 1;
  const scale = animatedValues.scale ?? 1;
  const rotation = animatedValues.rotation ?? 0;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: typeof config.position?.x === 'string' && config.position.x === 'center' ? '50%' : x,
    top: typeof config.position?.y === 'string' && config.position.y === 'center' ? '50%' : y,
    transform: `scale(${scale}) rotate(${rotation}deg)${
      config.position?.x === 'center' || config.position?.y === 'center' ? ' translate(-50%, -50%)' : ''
    }`,
    opacity,
  };

  // Render based on object type
  switch (config.type) {
    case 'text':
      return (
        <div
          style={{
            ...style,
            fontSize: config.fontSize ?? 48,
            fontWeight: (config.fontWeight as React.CSSProperties['fontWeight']) ?? 'normal',
            color: config.color ?? '#FFFFFF',
          }}
        >
          {config.content}
        </div>
      );

    case 'image':
      return (
        <Img
          src={staticFile(config.src ?? '')}
          style={{
            ...style,
            width: config.size?.width ?? 'auto',
            height: config.size?.height ?? 'auto',
          }}
        />
      );

    case 'shape':
      return (
        <div
          style={{
            ...style,
            width: config.size?.width ?? 100,
            height: config.size?.height ?? 100,
            backgroundColor: config.color ?? '#FFFFFF',
            borderRadius: typeof config.borderRadius === 'number' || typeof config.borderRadius === 'string'
              ? config.borderRadius : 0,
          }}
        />
      );

    default:
      return null;
  }
};
