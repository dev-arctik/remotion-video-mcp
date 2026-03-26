// Barrel export — import everything from 'src/primitives'
// Content primitives
export { AnimatedText } from './AnimatedText';
export type { AnimatedTextProps } from './AnimatedText';

export { AnimatedImage } from './AnimatedImage';
export type { AnimatedImageProps } from './AnimatedImage';

export { AnimatedShape } from './AnimatedShape';
export type { AnimatedShapeProps, ShapeType } from './AnimatedShape';

// Background
export { Background } from './Background';
export type { BackgroundProps } from './Background';

// Layout primitives
export { LayoutStack } from './LayoutStack';
export type { LayoutStackProps } from './LayoutStack';

export { LayoutSplit } from './LayoutSplit';
export type { LayoutSplitProps } from './LayoutSplit';

// Animation primitives
export { Stagger } from './Stagger';
export type { StaggerProps } from './Stagger';

// Audio-reactive primitive — real-time frequency data from audio playback
export { AudioReactive, useAudioReactive } from './AudioReactive';
export type { AudioReactiveProps, AudioReactiveContextValue } from './AudioReactive';

/** @deprecated Use AudioReactive and useAudioReactive instead */
export { BeatSync, useBeat } from './BeatSync';
export type { BeatSyncProps, BeatData } from './BeatSync';

// Animation engine (for advanced use — custom animations beyond presets)
export { useAnimation } from './useAnimation';
export type { AnimationConfig, AnimationValues, EntranceType, ExitType } from './useAnimation';
