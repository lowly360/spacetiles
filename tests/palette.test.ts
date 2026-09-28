import { expect, it } from 'vitest';
import { directoryPalette, groupColors, shade, typeColors } from '../src/lib/palette';
import { demoRoot } from '../src/lib/demo';
import { layout } from '../src/lib/layout';
function whiteContrast(hex: string) {
  const rgb = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 + 0.05);
}
it('keeps white labels readable on every palette and depth shade', () => {
  for (const color of [...directoryPalette, ...Object.values(typeColors)]) {
    expect(whiteContrast(color)).toBeGreaterThanOrEqual(4.5);
    expect(whiteContrast(shade(color, 2, 7))).toBeGreaterThanOrEqual(4.5);
  }
});
it('gives distinct sibling colors independent of size sorting', () => {
  const entries = demoRoot.children;
  const original = groupColors(entries, '/demo');
  const reversed = groupColors([...entries].reverse(), '/demo');
  expect(new Set(original.values()).size).toBe(entries.length);
  for (const entry of entries) expect(reversed.get(entry.id)).toBe(original.get(entry.id));
});
it('keeps descendants in their top-level color group', () => {
  const tiles = layout(demoRoot, 900, 600, 'logical');
  for (const tile of tiles) {
    const parent = tiles.find(
      (candidate) => candidate.depth === 0 && candidate.groupId === tile.groupId,
    );
    expect(parent).toBeDefined();
    expect(tile.relativePath.startsWith(parent!.relativePath)).toBe(true);
  }
});
