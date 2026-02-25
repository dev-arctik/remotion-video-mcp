// Palette utilities — reads style block from composition.json
export interface StyleConfig {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

// Sensible defaults when composition.json style block is sparse
const DEFAULTS: Required<StyleConfig> = {
  primaryColor: '#4F46E5',
  secondaryColor: '#7C3AED',
  backgroundColor: '#0F172A',
  textColor: '#F8FAFC',
  accentColor: '#22D3EE',
  fontFamily: 'Inter',
};

// Merge user style config with defaults
export function resolveStyle(style?: Partial<StyleConfig>): Required<StyleConfig> {
  return { ...DEFAULTS, ...style };
}
