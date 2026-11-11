import { fonts } from '../theme/tokens';

// Quicksand has no Ethiopic glyphs. Let the platform's system family render
// mixed Amharic/Latin text instead of requesting unavailable Quicksand glyphs.
export function containsEthiopic(value: unknown): boolean {
  if (typeof value === 'string') return /[\u1200-\u139f\u2d80-\u2ddf\uab00-\uab2f]/u.test(value);
  if (Array.isArray(value)) return value.some(containsEthiopic);
  return !!value && typeof value === 'object' && 'props' in value && !!(value as {props?: unknown}).props && containsEthiopic((value as {props: {children?: unknown}}).props.children);
}

export function parentTextFont(value: unknown, weight: keyof typeof fonts, platform: string) {
  return containsEthiopic(value) ? (platform === 'ios' ? 'System' : 'sans-serif') : fonts[weight];
}
