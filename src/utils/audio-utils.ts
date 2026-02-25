import fs from 'fs-extra';

export interface AudioSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface TimestampData {
  type: string;
  speaker: string;
  totalDuration: number;
  segments: AudioSegment[];
}

// Parse a timestamp JSON file (Whisper/AssemblyAI format)
export async function parseTimestampFile(filePath: string): Promise<TimestampData> {
  const data = await fs.readJson(filePath);
  if (!data.segments || !Array.isArray(data.segments)) {
    throw new Error(`Invalid timestamp file: missing 'segments' array in ${filePath}`);
  }
  return data as TimestampData;
}

// Calculate frame duration from an audio segment
export function segmentToDurationFrames(segment: AudioSegment, fps: number): number {
  return Math.ceil((segment.endTime - segment.startTime) * fps);
}
