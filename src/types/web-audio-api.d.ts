// Type stubs for web-audio-api (Node.js AudioContext polyfill, CJS, no bundled types)

declare module 'web-audio-api' {
  interface AudioBuffer {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    duration: number;
    getChannelData(channel: number): Float32Array;
  }

  class AudioContext {
    sampleRate: number;
    decodeAudioData(
      data: Buffer,
      successCallback: (buffer: AudioBuffer) => void,
      errorCallback?: (error: Error) => void,
    ): void;
  }

  export { AudioContext, AudioBuffer };
}
