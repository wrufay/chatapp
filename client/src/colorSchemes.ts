export interface ColorScheme {
  name: string;
  titleStart: string;
  titleEnd: string;
  accent: string;
  body: string;
  text: string;
  textMuted: string;
  border: string;
  borderLight: string;
}

// Keys must exactly match VALID_COLOR_SCHEMES in server/index.js -- there's
// no shared-types package between client and server in this repo.
export const COLOR_SCHEMES: Record<string, ColorScheme> = {
  slate: {
    name: 'Slate',
    titleStart: '#495366', titleEnd: '#8a97ab', accent: '#5c6b84',
    body: '#eef0f3', text: '#2b313d', textMuted: '#6b7585',
    border: '#8a97ab', borderLight: '#c7cdd6',
  },
  mint: {
    name: 'Mint',
    titleStart: '#1b4332', titleEnd: '#74c69d', accent: '#2d6a4f',
    body: '#ecfdf5', text: '#1b4332', textMuted: '#52796f',
    border: '#74c69d', borderLight: '#b7e4c7',
  },
  sunset: {
    name: 'Sunset',
    titleStart: '#c1440e', titleEnd: '#f4a261', accent: '#e76f51',
    body: '#fff3e6', text: '#6a2c0a', textMuted: '#b5651d',
    border: '#f4a261', borderLight: '#ffd8a8',
  },
  ocean: {
    name: 'Ocean',
    titleStart: '#023e8a', titleEnd: '#48cae4', accent: '#0077b6',
    body: '#edf9ff', text: '#03045e', textMuted: '#0077b6',
    border: '#48cae4', borderLight: '#ade8f4',
  },
  rose: {
    name: 'Rose',
    titleStart: '#9d174d', titleEnd: '#f9a8d4', accent: '#db2777',
    body: '#fff0f6', text: '#831843', textMuted: '#be185d',
    border: '#f9a8d4', borderLight: '#fbcfe8',
  },
  citrus: {
    name: 'Citrus',
    titleStart: '#b45309', titleEnd: '#fbbf24', accent: '#d97706',
    body: '#fffbeb', text: '#78350f', textMuted: '#b45309',
    border: '#fbbf24', borderLight: '#fde68a',
  },
};

export const DEFAULT_COLOR_SCHEME = 'slate';
