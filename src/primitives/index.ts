// Barrel export — import everything from 'src/primitives'
// Content primitives
export { AnimatedText } from './AnimatedText';
export type { AnimatedTextProps } from './AnimatedText';

export { AnimatedImage } from './AnimatedImage';
export type { AnimatedImageProps } from './AnimatedImage';

export { AnimatedShape } from './AnimatedShape';
export type { AnimatedShapeProps, ShapeType } from './AnimatedShape';

// Per-character and per-word text reveals — for kinetic typography
export { AnimatedTextChars } from './AnimatedTextChars';
export type { AnimatedTextCharsProps, CharEntranceType, StaggerPattern } from './AnimatedTextChars';

export { AnimatedTextWords } from './AnimatedTextWords';
export type { AnimatedTextWordsProps, WordEntranceType } from './AnimatedTextWords';

// Captions — TikTok-style word-level highlighted captions via @remotion/captions
export { Captions } from './Captions';
export type { CaptionsProps } from './Captions';

// Background + decorative
export { Background } from './Background';
export type { BackgroundProps } from './Background';

export { Gradient } from './Gradient';
export type { GradientProps, GradientType } from './Gradient';

export { FilmGrain } from './FilmGrain';
export type { FilmGrainProps } from './FilmGrain';

// Effects (wrap any child)
export { Glow } from './Glow';
export type { GlowProps } from './Glow';

export { MotionBlur } from './MotionBlur';
export type { MotionBlurProps } from './MotionBlur';

// Image effects
export { KenBurns } from './KenBurns';
export type { KenBurnsProps, PanDirection } from './KenBurns';

// SVG path morphing — logo reveals, shape transforms
export { MorphPath } from './MorphPath';
export type { MorphPathProps } from './MorphPath';

// Lottie animation player
export { LottiePlayer } from './LottiePlayer';
export type { LottiePlayerProps } from './LottiePlayer';

// Layout primitives
export { LayoutStack } from './LayoutStack';
export type { LayoutStackProps } from './LayoutStack';

export { LayoutSplit } from './LayoutSplit';
export type { LayoutSplitProps } from './LayoutSplit';

// SafeArea — content container that reserves chrome zones (top header, bottom footer,
// side margins) to prevent content from overflowing into persistent UI bands.
// Use as the wrapper for scene content; render SectionHeader/Footer outside it.
export { SafeArea, useSafeAreaDimensions } from './SafeArea';
export type { SafeAreaProps, SafeAreaChrome } from './SafeArea';

// Animation primitives
export { Stagger } from './Stagger';
export type { StaggerProps } from './Stagger';

// Audio-reactive primitive — real-time frequency data from audio playback
export { AudioReactive, useAudioReactive } from './AudioReactive';
export type { AudioReactiveProps, AudioReactiveContextValue } from './AudioReactive';

// Beat-driven reactivity — pairs with analyze_beats v2 sidecar JSON.
// Wrap a scene in <BeatSync data={beatData}>, then call useBeat() / useBeatGrid()
// in any descendant for tier-aware pulse + isOnBeat + isDownbeat etc.
//   const { pulse, isOnBeat, isDownbeat } = useBeat({ tier: 'downbeat', tolerance: 2 });
//   const { pulse: subPulse } = useBeat({ tier: 'beat', decayFrames: 4 });
export { BeatSync, useBeat, useBeatGrid } from './BeatSync';
export type {
  BeatSyncProps,
  BeatData,
  BeatDataV1,
  BeatDataV2,
  BeatV2,
  PhraseRange,
  BeatTier,
  UseBeatOptions,
  UseBeatResult,
} from './BeatSync';

// Animation engine (for advanced use — custom animations beyond presets)
export { useAnimation } from './useAnimation';
export type { AnimationConfig, AnimationValues, EntranceType, ExitType } from './useAnimation';

// Design token system — useTheme(), Theme, color/type/motion/spacing tokens
// Pull tokens in any primitive: const { color, type, springs } = useTheme()
export * from './tokens';
