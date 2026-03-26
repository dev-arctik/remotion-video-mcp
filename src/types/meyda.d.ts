// Type stubs for meyda (audio feature extraction, no bundled types)

declare module 'meyda' {
  type MeydaFeature =
    | 'amplitudeSpectrum'
    | 'buffer'
    | 'chroma'
    | 'complexSpectrum'
    | 'energy'
    | 'loudness'
    | 'melBands'
    | 'mfcc'
    | 'perceptualSharpness'
    | 'perceptualSpread'
    | 'powerSpectrum'
    | 'rms'
    | 'spectralCentroid'
    | 'spectralCrest'
    | 'spectralFlatness'
    | 'spectralFlux'
    | 'spectralKurtosis'
    | 'spectralRolloff'
    | 'spectralSkewness'
    | 'spectralSlope'
    | 'spectralSpread'
    | 'zcr';

  interface MeydaExtractResult {
    rms?: number;
    energy?: number;
    powerSpectrum?: Float32Array;
    amplitudeSpectrum?: Float32Array;
    spectralFlux?: number;
    spectralCentroid?: number | null;
    spectralRolloff?: number;
    spectralFlatness?: number;
    zcr?: number;
    loudness?: { specific: Float32Array; total: number };
    mfcc?: number[];
    chroma?: number[];
    melBands?: number[];
    [key: string]: unknown;
  }

  const Meyda: {
    bufferSize: number;
    sampleRate: number;
    extract(features: MeydaFeature | MeydaFeature[], signal: Float32Array): MeydaExtractResult;
    listAvailableFeatureExtractors(): MeydaFeature[];
  };

  export default Meyda;
}
