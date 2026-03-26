---
name: audio-events-and-reactivity
description: Using analyze_audio events and AudioReactive primitive for music-driven videos
metadata:
  tags: audio, beats, bass-drop, swoosh, impact, music, reactive, frequency
---

# Audio-Driven Video Creation

This skill covers two systems that work together for music-driven videos:
1. **analyze_audio** (MCP tool) — detects dramatic moments in audio for scene planning
2. **AudioReactive** (Remotion primitive) — real-time frequency reactivity during playback

## Part 1: Using analyze_audio Output

Call `analyze_audio` with an audio file to get named events and scene cut suggestions.

### Event Types

| Event | What It Detects | Visual Suggestion |
|-------|----------------|-------------------|
| `bass-drop` | Sudden low-frequency spike (kick, sub-bass) | Scene cut, zoom-in, scale pulse, camera shake |
| `impact` | All frequencies spike simultaneously (orchestral hit, explosion) | Hard cut, flash white, title reveal |
| `transient` | High-frequency spike with fast decay (swoosh, cymbal, clap) | Fly-in text, quick wipe transition, element entrance |
| `build-start` | Energy gradually rising over 1+ seconds | Start animating elements in, increase particle count |
| `build-peak` | Energy peaks after a build | Climax reveal, full-screen element, burst animation |
| `silence-break` | Audio returns after a silent pause | Dramatic scene change, reveal after blackout |
| `energy-shift` | Large sudden change in overall energy | Transition between video sections, mood change |

### Planning Scenes from Events

Use `suggestedSceneCuts` to set scene boundaries:

```
analyze_audio returns:
  suggestedSceneCuts: [
    { frame: 0, reason: "Start" },
    { frame: 90, reason: "Bass drop — strong visual transition" },
    { frame: 201, reason: "Silence break — dramatic pause ends" },
    { frame: 450, reason: "Major energy shift" }
  ]

→ Scene 1: frames 0–89 (3s) — intro, gentle entrance animations
→ Scene 2: frames 90–200 (3.7s) — high energy, bold visuals (triggered by bass drop)
→ Scene 3: frames 201–449 (8.3s) — new section after dramatic pause
→ Scene 4: frames 450+ — final section after energy shift
```

### Matching Events to Animations

When an event frame falls within a scene, use it to time element entrances:

```tsx
// Bass drop at frame 90 → zoom-in entrance
<AnimatedText
  fontSize={96}
  fontWeight="bold"
  animation={{ entrance: 'zoom-in', damping: 8, stiffness: 200 }}
>
  IMPACT
</AnimatedText>

// Transient (swoosh) → fly-from-right
<AnimatedImage
  src={staticFile('images/product.png')}
  animation={{ entrance: 'fly-from-right', delay: 5 }}
/>

// Build peak → staggered reveal
<Stagger delayFrames={4}>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Feature 1</AnimatedText>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Feature 2</AnimatedText>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Feature 3</AnimatedText>
</Stagger>

// Silence break → dramatic reveal from black
<Background color="#000000">
  <AnimatedText
    fontSize={120}
    animation={{ entrance: 'blur-in', entranceDuration: 40 }}
  >
    THE REVEAL
  </AnimatedText>
</Background>
```

### Using Beat Data for Scene Durations

analyze_audio also returns BPM and beat-aligned durations:

```
suggestedSceneDurations:
  4-beat: { frames: 45, seconds: 1.5 }   — quick cuts
  8-beat: { frames: 90, seconds: 3.0 }   — standard scenes
  16-beat: { frames: 180, seconds: 6.0 }  — longer content scenes
```

Use these when you want evenly-paced scenes that feel rhythmically natural.

## Part 2: AudioReactive Primitive (Real-Time)

For elements that respond to audio energy DURING playback, use `AudioReactive`:

```tsx
import { AudioReactive, useAudioReactive } from '../src/primitives';
import { staticFile } from 'remotion';

// Wrap a scene in AudioReactive to give children access to frequency data
export const MyScene: React.FC = () => (
  <AudioReactive src={staticFile('audio/music.mp3')}>
    <PulsingTitle />
    <SpectrumBars />
  </AudioReactive>
);
```

### useAudioReactive Hook

Children call `useAudioReactive()` to get real-time values:

```tsx
const {
  bassIntensity,   // 0–1, low frequencies (kick drums, bass)
  midIntensity,    // 0–1, mid frequencies (vocals, melody)
  highIntensity,   // 0–1, high frequencies (hi-hats, cymbals)
  overallEnergy,   // 0–1, average of all frequencies
  isDropping,      // true when bass spikes significantly
  isSilent,        // true when overall energy is near zero
  isLoaded,        // false while audio data loads
} = useAudioReactive();
```

### Common Reactive Patterns

**Bass pulse — scale on kick drums:**
```tsx
const { bassIntensity } = useAudioReactive();
const scale = 1 + bassIntensity * 0.3;

<div style={{ transform: `scale(${scale})` }}>
  <AnimatedText fontSize={72}>BOOM</AnimatedText>
</div>
```

**High-frequency glow — shimmer on cymbals/swooshes:**
```tsx
const { highIntensity } = useAudioReactive();
const glow = highIntensity > 0.3
  ? `0 0 ${highIntensity * 60}px rgba(99, 102, 241, ${highIntensity})`
  : 'none';

<AnimatedShape
  shape="circle"
  width={200}
  height={200}
  fill="#6366f1"
  glow={glow}
/>
```

**Energy-driven opacity — fade with the music:**
```tsx
const { overallEnergy } = useAudioReactive();
const opacity = 0.3 + overallEnergy * 0.7;

<AnimatedText style={{ opacity }}>
  Fades with the music
</AnimatedText>
```

**Silence detection — show/hide on pauses:**
```tsx
const { isSilent } = useAudioReactive();

{!isSilent && (
  <AnimatedText animation={{ entrance: 'fade-up' }}>
    Only visible when audio is playing
  </AnimatedText>
)}
```

**Spectrum bars — frequency visualization:**
```tsx
const { bassIntensity, midIntensity, highIntensity } = useAudioReactive();
const bands = [
  { energy: bassIntensity, color: '#ef4444', label: 'Bass' },
  { energy: midIntensity, color: '#eab308', label: 'Mids' },
  { energy: highIntensity, color: '#3b82f6', label: 'Highs' },
];

<LayoutStack direction="row" gap={12} align="flex-end" justify="center">
  {bands.map(b => (
    <AnimatedShape
      key={b.label}
      shape="rect"
      width={60}
      height={b.energy * 300}
      fill={b.color}
      borderRadius={8}
    />
  ))}
</LayoutStack>
```

## Part 1 + Part 2 Together

The best music-driven videos use BOTH:

1. **analyze_audio** decides WHERE to cut scenes and WHAT events to highlight
2. **AudioReactive** makes elements REACT to the music in real-time

```
analyze_audio → "bass drop at frame 90"
  → create_scene: new scene starting at frame 90
  → componentCode uses AudioReactive for live bass pulse

analyze_audio → "transient at frame 300"
  → AnimatedText with entrance: 'fly-from-right', delay matched to frame 300

analyze_audio → "silence at frames 180-200"
  → scene with black background, then dramatic reveal at frame 201
  → AudioReactive detects isSilent → fades elements out during pause
```

## Important Notes

- `AudioReactive` uses `@remotion/media-utils` internally — works in both Studio preview and render
- ALL animations inside `AudioReactive` must still use `useCurrentFrame()` / `interpolate()` / `spring()` — CSS animations are FORBIDDEN in Remotion
- `useAudioReactive()` returns zero values until audio loads (`isLoaded: false`) — components won't crash, they just render with no reactivity initially
- For best results, use WAV or high-quality MP3 — low-bitrate audio produces less accurate frequency data
