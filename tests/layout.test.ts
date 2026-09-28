import { describe, expect, it } from 'vitest';
import { hitTest, layout, partition } from '../src/lib/layout';
import { demoRoot } from '../src/lib/demo';
import { formatSize } from '../src/lib/types';
describe('area partition', () => {
  it('preserves proportional area without overlap', () => {
    const items = [6, 3, 1, 0];
    const rects = partition(items, { x: 0, y: 0, width: 100, height: 80 }, (n) => n);
    expect(rects).toHaveLength(3);
    for (const { item, rect } of rects)
      expect(rect.width * rect.height).toBeCloseTo((item / 10) * 8000);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].rect,
          b = rects[j].rect;
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlapX * overlapY).toBeCloseTo(0);
      }
  });
  it('handles empty and degenerate bounds', () => {
    expect(partition([0, 0], { x: 0, y: 0, width: 100, height: 100 }, (n) => n)).toEqual([]);
    expect(layout(demoRoot, 0, 0, 'logical')).toEqual([]);
  });
  it('keeps nested rectangles in the viewport and selects deepest content', () => {
    const tiles = layout(demoRoot, 900, 600, 'logical');
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(900);
      expect(t.y + t.height).toBeLessThanOrEqual(600);
    }
    const leaf = tiles.find((t) => t.depth > 0 && !t.node.directory)!;
    expect(hitTest(tiles, leaf.x + leaf.width / 2, leaf.y + leaf.height / 2)?.node.id).toBe(
      leaf.node.id,
    );
    expect(hitTest(tiles, -1, -1)).toBeUndefined();
  });
  it('stays finite with thousands of skewed weights', () => {
    const rects = partition(
      Array.from({ length: 4000 }, (_, i) => (i === 0 ? 1e12 : 1)),
      { x: 0, y: 0, width: 800, height: 600 },
      (n) => n,
    );
    expect(rects).toHaveLength(4000);
    expect(rects.every((r) => Number.isFinite(r.rect.width) && r.rect.width >= 0)).toBe(true);
  });
});
it('uses binary units', () => {
  expect(formatSize(0)).toBe('0 B');
  expect(formatSize(1024)).toBe('1 KiB');
});
