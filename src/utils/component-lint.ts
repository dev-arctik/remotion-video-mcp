// Soft lint for componentCode strings passed to create_scene / update_scene.
// Detects the most damaging anti-patterns (continuous beat-driven motion on text)
// and returns warnings — never blocks the write. Warnings appear in the tool
// response so Claude sees them immediately and can self-correct.
//
// Heuristics are intentionally conservative — false positives are worse than false
// negatives here, since blocking a correct scene is more annoying than warning on
// a correct one.

export interface LintWarning {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  remedy: string;
}

// Text-like primitive component names — used to detect "this scene contains text"
const TEXT_PRIMITIVES = ['AnimatedText', 'AnimatedTextChars', 'AnimatedTextWords', 'Captions'];

// Patterns that look like content elements wrapped in continuous-motion transforms.
// We don't try to fully parse JSX — instead we check for co-occurrence of known bad
// idioms with text primitive names anywhere in the same file.

function hasTextPrimitive(code: string): boolean {
  return TEXT_PRIMITIVES.some((name) => new RegExp(`<\\s*${name}[\\s>]`).test(code));
}

function findFrameDrivenSine(code: string): boolean {
  // Math.sin(...frame...) — captures Math.sin(frame * X), Math.sin(frame / X), etc.
  // Allows whitespace, dots (for member access like obj.frame), and arithmetic operators inside the parens
  return /Math\.sin\s*\([^)]*\bframe\b[^)]*\)/.test(code);
}

function findFrameDrivenCos(code: string): boolean {
  return /Math\.cos\s*\([^)]*\bframe\b[^)]*\)/.test(code);
}

function findBeatTier(code: string): boolean {
  // useBeat({ ... tier: 'beat' ... }) — the per-quarter-note tier that throbs at most BPMs
  return /useBeat\s*\(\s*\{[^}]*tier\s*:\s*['"]beat['"]/.test(code);
}

function findUseAudioReactiveDestructuringIntensity(code: string): boolean {
  // Picks up `const { bassIntensity, ... } = useAudioReactive()` — continuous values
  // that almost always end up in a transform if there's text in the same scene.
  return /useAudioReactive\s*\(\s*\)/.test(code);
}

/**
 * Lint a componentCode string. Returns an array of warnings — empty if clean.
 * Severity 'warning' is what we use for forbidden-on-text patterns; 'info' for soft suggestions.
 */
export function lintComponentCode(code: string | undefined): LintWarning[] {
  if (!code) return [];
  const warnings: LintWarning[] = [];
  const containsText = hasTextPrimitive(code);

  // Rule: Math.sin(frame*) anywhere — almost always wrong
  if (findFrameDrivenSine(code)) {
    warnings.push({
      rule: 'no-frame-driven-sine',
      severity: 'warning',
      message:
        'Detected `Math.sin(...frame...)` — this is a continuous oscillator that usually ' +
        'produces visible throbbing on whatever element it scales/translates.',
      remedy:
        'Remove the sine. If you want a beat accent on a DECORATIVE shape, use ' +
        '`useBeat({ tier: "downbeat", decayFrames: 6 }).pulse` instead — it decays after ' +
        'each beat instead of oscillating continuously. For text, just use spring entrance ' +
        'and let it hold still.',
    });
  }

  if (findFrameDrivenCos(code)) {
    warnings.push({
      rule: 'no-frame-driven-cos',
      severity: 'warning',
      message:
        'Detected `Math.cos(...frame...)` — same continuous-oscillator problem as Math.sin(frame).',
      remedy:
        'Replace with `useBeat({ tier: "downbeat", decayFrames: 6 }).pulse` on a decorative ' +
        'element, or remove entirely if applied to text/UI.',
    });
  }

  // Rule: useBeat with tier:'beat' — throbs at any BPM above ~80
  if (findBeatTier(code)) {
    warnings.push({
      rule: 'no-beat-tier',
      severity: 'warning',
      message:
        'Detected `useBeat({ tier: "beat" })` — the per-quarter-note tier produces 2+ pulses/sec ' +
        'at typical BPMs, which reads as throbbing. Beat-by-beat motion is almost never what ' +
        'you actually want.',
      remedy:
        'Switch to `tier: "downbeat"` (once per bar) or `tier: "phrase-4"` (once every 4 bars). ' +
        'If you want the per-beat feeling on text: cut the scene on the beat instead of ' +
        'animating the text during it.',
    });
  }

  // Rule: useAudioReactive() in a scene that ALSO contains text primitives.
  // High false-positive rate (could be wrapping a sibling visualizer correctly), so this is
  // info-level — flagged for awareness, not warning.
  if (findUseAudioReactiveDestructuringIntensity(code) && containsText) {
    warnings.push({
      rule: 'audio-reactive-with-text-in-scene',
      severity: 'info',
      message:
        'This scene uses both `useAudioReactive()` and text primitives. AudioReactive values ' +
        '(bassIntensity, midIntensity, highIntensity, overallEnergy) must NOT drive transform/' +
        'opacity on text continuously — that produces throbbing.',
      remedy:
        'Confirm the AudioReactive values only drive DECORATIVE elements (spectrum bars, particles, ' +
        'gradients, glow shapes). Text should enter via spring and hold still. Use the gated event ' +
        'flags (`isBassHit`, `isHighHit`, `isPeak`) for one-shot decorative effects, never on text.',
    });
  }

  return warnings;
}
