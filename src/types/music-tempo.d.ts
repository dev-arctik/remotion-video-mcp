// Type stubs for music-tempo (CJS, no bundled types)
// Uses the Beatroot algorithm to detect BPM and beat positions

declare module 'music-tempo' {
  interface MusicTempoParams {
    bufferSize?: number;
    hopSize?: number;
    decayRate?: number;
    peakFindingWindow?: number;
    meanWndMultiplier?: number;
    peakThreshold?: number;
    widthTreshold?: number;
    maxIOI?: number;
    minIOI?: number;
    maxTempos?: number;
    minBeatInterval?: number;  // seconds — 0.3 = 200 BPM
    maxBeatInterval?: number;  // seconds — 1.0 = 60 BPM
    initPeriod?: number;
    thresholdBI?: number;
    thresholdBT?: number;
    expiryTime?: number;
  }

  class MusicTempo {
    tempo: number;       // BPM
    beats: number[];     // beat timestamps in seconds
    constructor(audioData: Float32Array, params?: MusicTempoParams);
  }

  export default MusicTempo;
}
