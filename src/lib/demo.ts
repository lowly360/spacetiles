import type { Snapshot, TileNode } from './types';
let nextId = 0;
function file(name: string, mib: number): TileNode {
  return {
    id: nextId++,
    name,
    directory: false,
    logical: mib * 1048576,
    allocated: mib * 1048576,
    note: null,
    children: [],
    otherSize: 0,
  };
}
function folder(name: string, children: TileNode[]): TileNode {
  return {
    id: nextId++,
    name,
    directory: true,
    logical: children.reduce((sum, n) => sum + n.logical, 0),
    allocated: children.reduce((sum, n) => sum + n.allocated, 0),
    note: null,
    children: children.sort((a, b) => b.logical - a.logical),
    otherSize: 0,
  };
}
export const demoRoot = folder('我的空间', [
  folder('Movies', [
    file('城市漫游 · 剪辑.mov', 8200),
    file('夏日旅行.mp4', 4900),
    folder('素材', [file('海边日落.mov', 2200), file('街景.mov', 1400), file('配乐.wav', 600)]),
  ]),
  folder('Projects', [
    folder('design-system', [
      file('components.tsx', 1400),
      file('tokens.json', 600),
      file('preview.png', 500),
    ]),
    folder('website', [file('app.tsx', 1600), file('assets.svg', 1100)]),
    file('prototype.fig', 1000),
  ]),
  folder('Downloads', [
    file('macOS-install.dmg', 4600),
    file('素材归档.zip', 2700),
    file('参考资料.pdf', 300),
  ]),
  folder('Pictures', [
    folder('2026', [file('山间清晨.heic', 1900), file('海岸线.jpg', 1500)]),
    file('作品集.psd', 2000),
  ]),
  folder('Music', [file('Ambient collection.flac', 2200), file('Piano sessions.wav', 1300)]),
  folder('Documents', [
    file('项目归档.zip', 1100),
    file('产品手册.pdf', 650),
    file('笔记.md', 150),
  ]),
]);
export function demoSnapshot(id: number, allocated: boolean, filesOnly: boolean): Snapshot {
  const trail: TileNode[] = [];
  function find(node: TileNode): boolean {
    trail.push(node);
    if (node.id === id) return true;
    for (const child of node.children) if (find(child)) return true;
    trail.pop();
    return false;
  }
  if (!find(demoRoot)) {
    trail.length = 0;
    trail.push(demoRoot);
  }
  const tree = trail[trail.length - 1];
  return {
    scanId: -1,
    status: 'complete',
    files: nextId - 11,
    directories: 11,
    skipped: 0,
    errors: 0,
    denied: 0,
    issues: [],
    elapsedMs: 1250,
    rootPath: '/示例数据/我的空间',
    currentPath: '/示例数据/' + trail.map((n) => n.name).join('/'),
    totalLogical: demoRoot.logical,
    totalAllocated: demoRoot.allocated,
    breadcrumbs: trail,
    tree,
    entries: tree.children
      .filter((n) => !filesOnly || !n.directory)
      .sort(
        (a, b) => b[allocated ? 'allocated' : 'logical'] - a[allocated ? 'allocated' : 'logical'],
      ),
    childCount: tree.children.length,
  };
}
