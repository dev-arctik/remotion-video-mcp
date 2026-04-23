---
name: audio-events-and-reactivity
description: Using analyze_audio events and AudioReactive primitive for music-driven videos
metadata:
  tags: audio, beats, bass-drop, swoosh, impact, music, reactive, frequency
---

# Audio-Driven Video Creation

This skill covers two systems that work together for music-driven videos:
1. **analyze_audio / analyze_beats** (MCP tools) — detect dramatic moments + beats for scene PLANNING
2. **AudioReactive / BeatSync** (Remotion primitives) — real-time reactivity, **decorative elements only**

---

## ⛔ THE ONE RULE (READ THIS FIRST)

**Never apply continuous audio-driven motion to text, titles, captions, or layout containers.**

The audio-sync feeling comes from **scene cuts landing on bass-drops** and **element entrances landing on beats**. Not from elements moving DURING those beats.

| ❌ Forbidden on text/UI | ✅ Allowed on text/UI |
|---|---|
| `scale = 1 + bassIntensity * 0.3` continuously | One-shot spring entrance, then HOLD STILL |
| `Math.sin(frame * BPM_FACTOR)` on `scale()` | `<AnimatedText animation={{ entrance: 'fade-up' }}>` |
| `useBeat({ tier: 'beat' }).pulse` on text scale | Cut to a new scene on the bass-drop frame |
| `opacity = overallEnergy` on text | Entrance `delay` set to a beat frame |
| `useAudioReactive()` driving title transform | Exit on `silence-break` event |

**Why:** at 120 BPM beat-by-beat = 2 hits/sec. At 160 BPM = 2.7 hits/sec. The eye reads this as constant throbbing, not rhythm. After 2-3 beats it stops feeling like sync and starts feeling like jitter. After 30 seconds of it, the viewer wants to close the tab.

`AudioReactive` and `useBeat`'s `pulse` value exist for **spectrum bars, particle systems, decorative shapes, and background gradients** — never for content elements.

---

## Part 1: Scene PLANNING with analyze_audio (the high-leverage path)

This is where ~90% of the music-sync feeling comes from. Get the cuts right and the video already feels locked to the music.

### Event Types

| Event | What It Detects | What to do at this frame |
|-------|----------------|--------------------------|
| `bass-drop` | Sudden low-frequency spike (kick, sub-bass) | **CUT to a new scene.** Optionally: hard zoom on the entering element via spring. |
| `impact` | All frequencies spike (orchestral hit) | **CUT** + flash a 1-frame white overlay. |
| `transient` | High-freq spike (swoosh, cymbal, clap) | **Element entrance** lands on this frame (`delay = transient.frame - sceneStart`). |
| `build-start` | Energy gradually rising | **Stagger element entrances** across the build window. |
| `build-peak` | Energy peaks after a build | **Climax reveal** — full-screen element appears. |
| `silence-break` | Audio returns after a silent pause | Scene starts black, content reveals on this frame. |
| `energy-shift` | Major change in overall energy | Section boundary — new visual style or palette. |

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
→ Scene 2: frames 90–200 (3.7s) — high energy, bold visuals (started by bass drop CUT)
→ Scene 3: frames 201–449 (8.3s) — new section after dramatic pause
→ Scene 4: frames 450+ — final section after energy shift
```

The CUT to scene 2 on frame 90 IS the "bass drop hit." No additional motion required on the title that appears in scene 2 — its mere appearance synced to the drop is the sync.

### Matching Events to Entrance Timing

When an event frame falls inside a scene, use it to time entrances:

```tsx
// Scene starts at frame 90 (bass drop). Title enters via spring on frame 0 of scene → coincides with the cut.
// No continuous motion afterward — it just appears and sits there.
<AnimatedText
  fontSize={120}
  fontWeight={700}
  animation={{ entrance: 'zoom-in', damping: 8, stiffness: 200 }}
>
  IMPACT
</AnimatedText>

// Transient (swoosh) lands at frame 320 (= scene-relative frame 50 if scene starts at 270)
// Image enters on the swoosh, then holds.
<AnimatedImage
  src={staticFile('images/product.png')}
  animation={{ entrance: 'fly-from-right', delay: 50 }}
/>

// Build peak → staggered reveal of feature list. Each item enters once and stays.
<Stagger delayFrames={4}>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Feature 1</AnimatedText>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Feature 2</AnimatedText>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Feature 3</AnimatedText>
</Stagger>
```

Notice: every `<AnimatedText>` above has `animation.entrance` set and **nothing else**. No `style={{transform: scale(${pulse})}}`. No `useAudioReactive()`. The text enters and holds.

### Beat-Aligned Scene Durations

`analyze_beats` returns `suggestedSceneDurations` for evenly-paced cuts:

```
suggestedSceneDurations:
  4-beat:  { frames: 45,  seconds: 1.5 }   — quick cuts
  8-beat:  { frames: 90,  seconds: 3.0 }   — standard scenes
  16-beat: { frames: 180, seconds: 6.0 }   — longer content scenes
```

Use these as `durationFrames` on `create_scene` — your cuts now land on phrase boundaries.

---

## Part 2: useBeat — for ONE-SHOT accent pulses on DECORATIVE elements

`useBeat()` from `BeatSync` returns a `pulse` value that decays after each beat. This is the right primitive for adding *occasional* accents to decorative elements (rings, particles, frame borders) — never to text.

### The decayFrames safety rail

```tsx
import { BeatSync, useBeat } from '../src/primitives';

<BeatSync data={beatData}>
  <DecorativeRing />
</BeatSync>

const DecorativeRing = () => {
  // tier: 'downbeat' = once per bar (4 beats). At 120 BPM that's once every 2 seconds.
  // tier: 'phrase-4' = once every 4 bars (16 beats). At 120 BPM that's once every 8 seconds.
  // NEVER use tier: 'beat' (every quarter note) — produces throbbing at most BPMs.
  const { pulse } = useBeat({ tier: 'downbeat', decayFrames: 6 });

  // Apply to a DECORATIVE shape — never to text or layout
  return (
    <AnimatedShape
      shape="circle"
      width={400}
      height={400}
      fill="transparent"
      stroke="rgba(99,102,241,0.4)"
      strokeWidth={2 + pulse * 4}   // ring pulses subtly on each downbeat
      style={{ transform: `scale(${1 + pulse * 0.05})` }}
    />
  );
};
```

| Tier | Frequency at 120 BPM | Use for |
|---|---|---|
| `'beat'` | every 0.5s | ❌ NEVER — throbbing |
| `'downbeat'` | every 2s | Subtle decorative ring/badge accent |
| `'phrase-1'` | every 2s (= downbeat) | Same as downbeat |
| `'phrase-4'` | every 8s | Section-marker accent on a decorative element |
| `'phrase-8'` | every 16s | Major moment markers |
| `'phrase-16'` | every 32s | Top-level structural beats only |

**Default: if you're considering `useBeat` on a content element, you're probably wrong. Use a scene cut instead.**

---

## Part 3: AudioReactive — for VISUALIZERS only

`AudioReactive` gives elements live frequency data (`bassIntensity`, `midIntensity`, `highIntensity`). This is for music visualization: spectrum bars, oscilloscopes, particle systems, audio-reactive geometric shapes. **Never wrap a `<Background>`, title, or content layout.**

### ✅ Good: spectrum bars

```tsx
import { AudioReactive, useAudioReactive } from '../src/primitives';
import { staticFile } from 'remotion';

export const VisualizerScene: React.FC = () => (
  <AudioReactive src={staticFile('audio/music.mp3')}>
    <SpectrumBars />            {/* decorative — fine */}
    <AnimatedText               {/* sibling, NOT inside the reactive transform */}
      fontSize={80}
      animation={{ entrance: 'fade-up' }}
    >
      LIVE
    </AnimatedText>
  </AudioReactive>
);

const SpectrumBars = () => {
  const { bassIntensity, midIntensity, highIntensity } = useAudioReactive();
  const bands = [
    { energy: bassIntensity, color: '#ef4444' },
    { energy: midIntensity,  color: '#eab308' },
    { energy: highIntensity, color: '#3b82f6' },
  ];
  return (
    <LayoutStack direction="row" gap={12} align="flex-end" justify="center">
      {bands.map((b, i) => (
        <AnimatedShape
          key={i}
          shape="rect"
          width={60}
          height={b.energy * 300}     // height varies — this is the visualization
          fill={b.color}
          borderRadius={8}
        />
      ))}
    </LayoutStack>
  );
};
```

### ✅ Good: bass-reactive particle field

```tsx
const ParticleField = () => {
  const { bassIntensity } = useAudioReactive();
  // Decorative particles get bigger on bass — fine, they're not content
  return (
    <AnimatedShape
      shape="circle"
      width={50 + bassIntensity * 100}
      height={50 + bassIntensity * 100}
      fill="rgba(99,102,241,0.3)"
      glow={`0 0 ${bassIntensity * 80}px rgba(99,102,241,0.6)`}
    />
  );
};
```

### ❌ Bad: bass-reactive title

```tsx
// DO NOT DO THIS — text bouncing on bass = irritating throbbing
const PulsingTitle = () => {
  const { bassIntensity } = useAudioReactive();
  return (
    <div style={{ transform: `scale(${1 + bassIntensity * 0.3})` }}>
      <AnimatedText fontSize={72}>BOOM</AnimatedText>   {/* ← TEXT under continuous transform */}
    </div>
  );
};
```

### ❌ Bad: energy-driven opacity on text

```tsx
// DO NOT DO THIS — text fading in and out continuously is unreadable
const FadingTitle = () => {
  const { overallEnergy } = useAudioReactive();
  const opacity = 0.3 + overallEnergy * 0.7;
  return <AnimatedText style={{ opacity }}>Reads as broken</AnimatedText>;
};
```

If you want text to feel synced to the music: cut to it on a beat. That's it.

### Event flags — better than continuous values

`AudioReactive` exposes event-style booleans that fire only on actual peaks:

```tsx
const { isBassHit, isHighHit, isPeak, isSilent, bassIntensity } = useAudioReactive();
```

These are gated — `isBassHit` only fires when bass is BOTH loud AND dominant over mids/highs (configurable via `bassHitThreshold` and `bassDominanceRatio` props on `AudioReactive`). They're suitable for one-shot effects on decorative elements:

```tsx
// One-shot ring expansion on actual bass hits — decorative element, gated event
{isBassHit && (
  <AnimatedShape
    shape="circle"
    width={400}
    height={400}
    fill="transparent"
    stroke="rgba(255,255,255,0.6)"
    strokeWidth={4}
    animation={{ entrance: 'zoom-out', entranceDuration: 12 }}
  />
)}
```

Even with `isBassHit`, **never apply this to a text element**. Use it to spawn/scale decorative shapes only.

---

## Part 4: Putting it Together

The right division of labor for a music-driven video:

```
analyze_audio       → scene cuts land on bass-drops + suggested durations
analyze_beats       → fine-grained beat data for entrance timing
create_scene        → durationFrames + entrance.delay snap to beat frames
componentCode       → titles enter once via spring(), then HOLD STILL
                       decorative shapes optionally use useBeat({tier: 'downbeat'})
                       visualizer shapes use AudioReactive
```

The viewer's brain interprets the cut + the title appearing as one event. That IS the bass drop hit, visually. Adding additional motion to the title at that moment is gilding — and continuing motion *after* that moment is irritation.

---

## Important Notes

- `AudioReactive` uses `@remotion/media-utils` internally — works in both Studio preview and render
- All animations inside `AudioReactive` must still use `useCurrentFrame()` / `interpolate()` / `spring()` — CSS animations break renders
- `useAudioReactive()` returns zero values until audio loads (`isLoaded: false`) — components won't crash, they just render with no reactivity initially
- For best results, use WAV or high-quality MP3 — low-bitrate audio produces less accurate frequency data
