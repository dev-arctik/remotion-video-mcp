import fs from 'fs-extra';
import { AudioContext } from 'web-audio-api';
import MusicTempo from 'music-tempo';

export interface BeatData {
  bpm: number;
  beatCount: number;
  beatIntervalMs: number;
  beats: Array<{ time: number; frame: number }>;
  suggestedSceneDurations: {
    '4-beat': { frames: number; seconds: number };
    '8-beat': { frames: number; seconds: number };
    '16-beat': { frames: number; seconds: number };
  };
}

// Decode audio file to PCM float32 mono data via web-audio-api's AudioContext
function decodeAudio(fileBuffer: Buffer): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ctx = new AudioContext();
    ctx.decodeAudioData(
      fileBuffer,
      (audioBuffer) => {
        let monoData: Float32Array;

        if (audioBuffer.numberOfChannels >= 2) {
          // Average stereo channels to mono
          const left = audioBuffer.getChannelData(0);
          const right = audioBuffer.getChannelData(1);
          monoData = new Float32Array(left.length);
          for (let i = 0; i < left.length; i++) {
            monoData[i] = (left[i] + right[i]) / 2;
          }
        } else {
          monoData = audioBuffer.getChannelData(0);
        }

        resolve(monoData);
      },
      (err) => reject(new Error(`Failed to decode audio: ${err?.message ?? err}`)),
    );
  });
}

// Calculate scene duration in frames for a given number of beats
function beatPhraseDuration(
  beatsPerPhrase: number,
  bpm: number,
  fps: number,
): { frames: number; seconds: number } {
  const seconds = (beatsPerPhrase / bpm) * 60;
  return {
    frames: Math.round(seconds * fps),
    seconds: Math.round(seconds * 1000) / 1000,
  };
}

/**
 * Analyze an audio file for BPM and beat positions.
 * Returns beat timestamps mapped to Remotion frame numbers + suggested scene durations.
 */
export async function analyzeBeats(
  audioPath: string,
  fps: number,
  bpmRange?: { min?: number; max?: number },
): Promise<BeatData> {
  // Read and decode audio to PCM mono
  const fileBuffer = await fs.readFile(audioPath);
  const pcmData = await decodeAudio(fileBuffer);

  // Configure BPM range constraints
  // music-tempo uses beat intervals (seconds), not BPM directly
  // minBeatInterval = 60/maxBPM, maxBeatInterval = 60/minBPM
  const params: Record<string, number> = {};
  if (bpmRange?.max) params.minBeatInterval = 60 / bpmRange.max;
  if (bpmRange?.min) params.maxBeatInterval = 60 / bpmRange.min;

  // Run beat detection (Beatroot algorithm)
  const mt = new MusicTempo(pcmData, params);

  const bpm = Math.round(mt.tempo * 10) / 10;
  const beats = mt.beats.map((time: number) => ({
    time: Math.round(time * 1000) / 1000,
    frame: Math.round(time * fps),
  }));

  return {
    bpm,
    beatCount: beats.length,
    beatIntervalMs: Math.round((60000 / bpm) * 100) / 100,
    beats,
    suggestedSceneDurations: {
      '4-beat': beatPhraseDuration(4, bpm, fps),
      '8-beat': beatPhraseDuration(8, bpm, fps),
      '16-beat': beatPhraseDuration(16, bpm, fps),
    },
  };
}
