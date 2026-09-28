import type { Metric, TileNode } from './types';
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Tile extends Rect {
  node: TileNode;
  depth: number;
  aggregate: boolean;
  relativePath: string;
  groupId: number;
}

// Balanced binary partitioning keeps adjacent rectangles stable and bounded.
// Sorting is done by the backend; zero-area entries stay available in the list.
export function partition<T>(
  items: T[],
  bounds: Rect,
  weight: (item: T) => number,
): { item: T; rect: Rect }[] {
  const positive = items.filter((item) => weight(item) > 0);
  const prefix = [0];
  for (const item of positive) prefix.push(prefix[prefix.length - 1] + weight(item));
  const output: { item: T; rect: Rect }[] = [];
  function split(start: number, end: number, rect: Rect) {
    if (end <= start || rect.width <= 0 || rect.height <= 0) return;
    if (end - start === 1) {
      output.push({ item: positive[start], rect });
      return;
    }
    const sum = prefix[end] - prefix[start];
    const target = prefix[start] + sum / 2;
    let low = start + 1,
      high = end - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (prefix[mid] < target) low = mid + 1;
      else high = mid;
    }
    let pivot = low;
    if (
      pivot > start + 1 &&
      Math.abs(prefix[pivot - 1] - target) < Math.abs(prefix[pivot] - target)
    )
      pivot--;
    const ratio = (prefix[pivot] - prefix[start]) / sum;
    if (rect.width >= rect.height) {
      const width = rect.width * ratio;
      split(start, pivot, { ...rect, width });
      split(pivot, end, { ...rect, x: rect.x + width, width: rect.width - width });
    } else {
      const height = rect.height * ratio;
      split(start, pivot, { ...rect, height });
      split(pivot, end, { ...rect, y: rect.y + height, height: rect.height - height });
    }
  }
  split(0, positive.length, bounds);
  return output;
}
export function layout(root: TileNode, width: number, height: number, metric: Metric): Tile[] {
  const tiles: Tile[] = [];
  function descend(
    node: TileNode,
    bounds: Rect,
    depth: number,
    relativePath: string,
    groupId: number,
  ) {
    const children = node.children.map((child) => ({
      node: child,
      size: child[metric],
      aggregate: false,
    }));
    if (node.otherSize > 0)
      children.push({
        node: { ...node, name: '其他项目', [metric]: node.otherSize, children: [], otherSize: 0 },
        size: node.otherSize,
        aggregate: true,
      });
    for (const { item, rect } of partition(children, bounds, (item) => item.size)) {
      if (rect.width < 2 || rect.height < 2) continue;
      const inset = {
        x: rect.x + 1.5,
        y: rect.y + 1.5,
        width: Math.max(0, rect.width - 3),
        height: Math.max(0, rect.height - 3),
      };
      tiles.push({
        ...inset,
        node: item.node,
        depth,
        aggregate: item.aggregate,
        relativePath: relativePath + '/' + item.node.name,
        groupId: depth === 0 ? item.node.id : groupId,
      });
      if (
        !item.aggregate &&
        item.node.children.length > 0 &&
        inset.width > 70 &&
        inset.height > 64
      ) {
        descend(
          item.node,
          { x: inset.x + 4, y: inset.y + 27, width: inset.width - 8, height: inset.height - 31 },
          depth + 1,
          relativePath + '/' + item.node.name,
          depth === 0 ? item.node.id : groupId,
        );
      }
    }
  }
  descend(root, { x: 0, y: 0, width, height }, 0, '', root.id);
  return tiles;
}
export function hitTest(tiles: Tile[], x: number, y: number): Tile | undefined {
  // Deepest children are drawn last; reverse order makes selection match the visible tile.
  for (let index = tiles.length - 1; index >= 0; index--) {
    const tile = tiles[index];
    if (x >= tile.x && x <= tile.x + tile.width && y >= tile.y && y <= tile.y + tile.height)
      return tile;
  }
}
