export type Metric = 'logical' | 'allocated';
export interface Entry {
  id: number;
  name: string;
  directory: boolean;
  logical: number;
  allocated: number;
  note: string | null;
}
export interface TileNode extends Entry {
  children: TileNode[];
  otherSize: number;
}
export interface Snapshot {
  scanId: number;
  status: 'scanning' | 'complete' | 'cancelled';
  files: number;
  directories: number;
  skipped: number;
  errors: number;
  denied: number;
  issues: { path: string; message: string; permissionDenied: boolean }[];
  elapsedMs: number;
  rootPath: string;
  currentPath: string;
  totalLogical: number;
  totalAllocated: number;
  breadcrumbs: Entry[];
  tree: TileNode;
  entries: Entry[];
  childCount: number;
}
export function formatSize(size: number): string {
  if (size === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** unit).toLocaleString('en-US', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}
