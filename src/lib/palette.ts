import type { Entry } from './types';
import { category, fileTypes, type FileCategory } from './fileTypes';
export type ColorMode = 'directory' | 'type';

// White labels keep a contrast ratio above 4.5:1 on every base color.
export const directoryPalette = [
  '#2864ad',
  '#a85a18',
  '#7750ae',
  '#227651',
  '#b24763',
  '#16768c',
  '#866426',
  '#526494',
];
export const typeColors = Object.fromEntries(
  fileTypes.map((type) => [type.id, type.color]),
) as Record<FileCategory, string>;
function pathHash(path: string): number {
  let hash = 2166136261;
  for (const char of path) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
// Resolve collisions among siblings in name order, independent of size sorting.
export function groupColors(entries: Entry[], parentPath: string): Map<number, string> {
  const result = new Map<number, string>();
  const used = new Set<number>();
  const ordered = [...entries].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id,
  );
  for (const entry of ordered) {
    let index = pathHash(`${parentPath}/${entry.name}`) % directoryPalette.length;
    if (used.size === directoryPalette.length) used.clear();
    while (used.has(index)) index = (index + 1) % directoryPalette.length;
    used.add(index);
    result.set(entry.id, directoryPalette[index]);
  }
  return result;
}
export function entryColor(entry: Entry, mode: ColorMode, groups: Map<number, string>): string {
  return mode === 'directory'
    ? (groups.get(entry.id) ?? directoryPalette[0])
    : typeColors[category(entry)];
}
// Descendants stay in their parent group's hue. Darkening separates levels without
// alpha-blending adjacent branches into the same muddy color.
export function shade(hex: string, depth: number, variation: number): string {
  const factor = Math.max(0.7, 1 - depth * 0.055 - (variation % 3) * 0.035);
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(hex.slice(i, i + 2), 16) * factor)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
