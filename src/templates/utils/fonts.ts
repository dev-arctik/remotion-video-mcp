// Font loading via @remotion/fonts (or plain CSS @font-face)
// Templates import this to ensure fonts are registered before rendering

import { staticFile } from 'remotion';

// Map of font family names → their file paths in public/fonts/
const FONT_REGISTRY: Record<string, string> = {};

// Register a font so it's available for rendering
export function registerFont(family: string, fileName: string): void {
  const url = staticFile(`fonts/${fileName}`);
  FONT_REGISTRY[family] = url;

  // Inject @font-face into the document (runs at composition evaluation time)
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: '${family}'; src: url('${url}'); }`;
  document.head.appendChild(style);
}

// Get the font-family CSS value
export function getFontFamily(family: string): string {
  return family;
}
