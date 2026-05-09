/**
 * 20 pre-built avatar options for TeamOS users.
 * Each avatar is an inline SVG data URL with unique colors and patterns.
 */

export interface AvatarOption {
  id: string;
  label: string;
  svg: string; // inline SVG data URL
  bgColor: string; // for fallback display
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function makeAvatar(id: string, label: string, bgColor: string, fgColor: string, shape: string): AvatarOption {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="${bgColor}"/>${shape}</svg>`;
  return { id, label, svg: svgToDataUrl(svg), bgColor };
}

// Helper shapes
const star = (cx: number, cy: number, r: number, fill: string) =>
  `<polygon points="${[0,1,2,3,4].map(i => {const a = Math.PI/2 + i*2*Math.PI/5; const ri = i%2===0?r:r*0.4; return `${cx+ri*Math.cos(a)},${cy-ri*Math.sin(a)}`;}).join(' ')}" fill="${fill}"/>`;

const circle = (cx: number, cy: number, r: number, fill: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

const diamond = (cx: number, cy: number, s: number, fill: string) =>
  `<rect x="${cx-s/2}" y="${cy-s/2}" width="${s}" height="${s}" rx="4" transform="rotate(45 ${cx} ${cy})" fill="${fill}"/>`;

export const AVATAR_OPTIONS: AvatarOption[] = [
  // 1 - Coral Sunset
  makeAvatar("av01", "Coral Sunset", "#FF6B6B", "#fff",
    `${circle(60,50,18,"rgba(255,255,255,0.9)")}${circle(60,85,8,"rgba(255,255,255,0.5)")}${circle(40,72,5,"rgba(255,255,255,0.4)")}${circle(80,72,5,"rgba(255,255,255,0.4)")}`),

  // 2 - Ocean Blue
  makeAvatar("av02", "Ocean Blue", "#4ECDC4", "#fff",
    `${circle(60,55,22,"rgba(255,255,255,0.85)")}${circle(42,78,6,"rgba(255,255,255,0.5)")}${circle(78,78,6,"rgba(255,255,255,0.5)")}`),

  // 3 - Royal Purple
  makeAvatar("av03", "Royal Purple", "#9B59B6", "#fff",
    `${star(60,52,22,"rgba(255,255,255,0.9)")}${circle(60,85,6,"rgba(255,255,255,0.4)")}`),

  // 4 - Sunflower
  makeAvatar("av04", "Sunflower", "#F1C40F", "#fff",
    `${circle(60,52,20,"rgba(255,255,255,0.9)")}${circle(38,75,7,"rgba(255,255,255,0.5)")}${circle(82,75,7,"rgba(255,255,255,0.5)")}`),

  // 5 - Emerald
  makeAvatar("av05", "Emerald", "#2ECC71", "#fff",
    `${diamond(60,55,28,"rgba(255,255,255,0.85)")}${circle(60,85,5,"rgba(255,255,255,0.4)")}`),

  // 6 - Midnight
  makeAvatar("av06", "Midnight", "#2C3E50", "#00D4E8",
    `${circle(60,48,16,"rgba(0,212,232,0.9)")}${circle(44,72,8,"rgba(0,212,232,0.5)")}${circle(76,72,8,"rgba(0,212,232,0.5)")}${circle(60,88,5,"rgba(0,212,232,0.3)")}`),

  // 7 - Flamingo
  makeAvatar("av07", "Flamingo", "#E74C8B", "#fff",
    `${circle(60,50,20,"rgba(255,255,255,0.85)")}${circle(60,82,10,"rgba(255,255,255,0.4)")}`),

  // 8 - Sky
  makeAvatar("av08", "Sky", "#3498DB", "#fff",
    `${star(60,55,24,"rgba(255,255,255,0.85)")}`),

  // 9 - Tangerine
  makeAvatar("av09", "Tangerine", "#E67E22", "#fff",
    `${circle(60,48,18,"rgba(255,255,255,0.9)")}${diamond(60,80,14,"rgba(255,255,255,0.5)")}`),

  // 10 - Lavender
  makeAvatar("av10", "Lavender", "#A78BFA", "#fff",
    `${circle(48,50,14,"rgba(255,255,255,0.8)")}${circle(72,50,14,"rgba(255,255,255,0.8)")}${circle(60,78,10,"rgba(255,255,255,0.5)")}`),

  // 11 - Mint
  makeAvatar("av11", "Mint", "#00BFA5", "#fff",
    `${diamond(60,52,30,"rgba(255,255,255,0.8)")}${circle(60,85,6,"rgba(255,255,255,0.4)")}`),

  // 12 - Rose
  makeAvatar("av12", "Rose", "#F48FB1", "#fff",
    `${circle(60,55,22,"rgba(255,255,255,0.85)")}${circle(38,38,8,"rgba(255,255,255,0.4)")}${circle(82,38,8,"rgba(255,255,255,0.4)")}`),

  // 13 - Indigo
  makeAvatar("av13", "Indigo", "#5C6BC0", "#fff",
    `${star(60,50,20,"rgba(255,255,255,0.9)")}${circle(40,80,6,"rgba(255,255,255,0.4)")}${circle(80,80,6,"rgba(255,255,255,0.4)")}`),

  // 14 - Amber
  makeAvatar("av14", "Amber", "#FFB300", "#fff",
    `${circle(60,50,20,"rgba(255,255,255,0.9)")}${circle(35,78,6,"rgba(255,255,255,0.5)")}${circle(85,78,6,"rgba(255,255,255,0.5)")}${circle(60,90,4,"rgba(255,255,255,0.3)")}`),

  // 15 - Teal
  makeAvatar("av15", "Teal", "#009688", "#fff",
    `${diamond(60,48,24,"rgba(255,255,255,0.85)")}${diamond(60,82,12,"rgba(255,255,255,0.4)")}`),

  // 16 - Cherry
  makeAvatar("av16", "Cherry", "#C62828", "#fff",
    `${circle(60,52,20,"rgba(255,255,255,0.85)")}${star(60,85,8,"rgba(255,255,255,0.5)")}`),

  // 17 - Electric
  makeAvatar("av17", "Electric", "#00D4E8", "#1a1a2e",
    `${circle(60,52,18,"rgba(26,26,46,0.85)")}${circle(42,78,6,"rgba(26,26,46,0.5)")}${circle(78,78,6,"rgba(26,26,46,0.5)")}`),

  // 18 - Forest
  makeAvatar("av18", "Forest", "#1B5E20", "#81C784",
    `${star(60,52,22,"rgba(129,199,132,0.9)")}${circle(60,85,5,"rgba(129,199,132,0.4)")}`),

  // 19 - Blush
  makeAvatar("av19", "Blush", "#FFAB91", "#fff",
    `${circle(48,48,14,"rgba(255,255,255,0.85)")}${circle(72,48,14,"rgba(255,255,255,0.85)")}${circle(60,75,16,"rgba(255,255,255,0.6)")}`),

  // 20 - Graphite
  makeAvatar("av20", "Graphite", "#455A64", "#CFD8DC",
    `${diamond(60,50,26,"rgba(207,216,220,0.85)")}${circle(38,82,5,"rgba(207,216,220,0.4)")}${circle(82,82,5,"rgba(207,216,220,0.4)")}`),
];
