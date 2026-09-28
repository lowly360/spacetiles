// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Snapshot } from '../src/lib/types';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
// Canvas geometry is tested separately. Here we exercise async command orchestration.
vi.mock('../src/components/Treemap', () => ({ Treemap: () => <div>空间图</div> }));
import App from '../src/App';
function snapshot(scanId = 1, status: Snapshot['status'] = 'complete'): Snapshot {
  const tree = {
    id: 0,
    name: `目录 ${scanId}`,
    directory: true,
    logical: 100,
    allocated: 4096,
    note: null,
    children: [],
    otherSize: 0,
  };
  return {
    scanId,
    status,
    tree,
    files: 1,
    directories: 1,
    skipped: 0,
    errors: 0,
    denied: 0,
    issues: [],
    elapsedMs: 1,
    rootPath: '/test',
    currentPath: '/test',
    totalLogical: 100,
    totalAllocated: 4096,
    breadcrumbs: [tree],
    entries: [],
    childCount: 0,
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.open.mockResolvedValue('/test');
});
afterEach(() => cleanup());
it('supports entering directories, filtering files and returning in the demo', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '打开示例' }));
  fireEvent.click(await screen.findByRole('button', { name: '进入 Movies' }));
  expect(await screen.findByRole('heading', { name: 'Movies' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '仅文件' }));
  expect(screen.queryByRole('button', { name: '进入 素材' })).toBeNull();
  expect(screen.getByRole('button', { name: '城市漫游 · 剪辑.mov 8 GiB' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '返回上一级' }));
  expect(await screen.findByRole('heading', { name: '我的空间' })).toBeTruthy();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('preserves permission-denied errors in the summary and detail dialog', async () => {
  const result = snapshot();
  result.errors = 1;
  result.denied = 1;
  result.issues = [
    { path: '/test/private', message: 'Operation not permitted', permissionDenied: true },
  ];
  mocks.invoke.mockImplementation(async (command: string) =>
    command === 'start_scan' ? 1 : result,
  );
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '选择目录' }));
  expect(await screen.findByText('扫描完成 · 不完整')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('/test/private')).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('cancels a running scan and prevents an old response replacing a newer scan', async () => {
  let id = 0;
  let calls = 0;
  let resolveOld: (value: Snapshot) => void = () => {};
  mocks.invoke.mockImplementation((command: string, args: { scanId: number }) => {
    if (command === 'start_scan') return Promise.resolve(++id);
    if (command === 'cancel_scan') return Promise.resolve();
    if (args.scanId === 1) {
      calls++;
      if (calls === 1) return Promise.resolve(snapshot(1, 'scanning'));
      return new Promise<Snapshot>((resolve) => {
        resolveOld = resolve;
      });
    }
    return Promise.resolve(snapshot(2));
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '选择目录' }));
  fireEvent.click(await screen.findByRole('button', { name: '停止' }));
  expect(mocks.invoke).toHaveBeenCalledWith('cancel_scan', { scanId: 1 });
  // Changing the metric requests a fresh snapshot while scan 1 is still in flight.
  fireEvent.click(screen.getByRole('button', { name: '已分配' }));
  await waitFor(() => expect(calls).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: '重新扫描' }));
  expect(await screen.findByRole('heading', { name: '目录 2' })).toBeTruthy();
  await act(async () => resolveOld(snapshot(1)));
  expect(screen.getByRole('heading', { name: '目录 2' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: '目录 1' })).toBeNull();
});
it('does not start a scan when the folder picker is cancelled', async () => {
  mocks.open.mockResolvedValue(null);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '选择目录' }));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '选择目录' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('defaults to type colors despite old preferences and toggles details', async () => {
  localStorage.setItem('spacetiles.colors.v2', 'directory');
  render(<App />);
  const colors = screen.getByRole('combobox', { name: '配色方式' }) as HTMLSelectElement;
  expect(colors.value).toBe('type');
  fireEvent.change(colors, { target: { value: 'directory' } });
  expect(colors.value).toBe('directory');
  fireEvent.click(screen.getByRole('button', { name: '打开示例' }));
  expect(await screen.findByRole('complementary')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '显示详情侧栏' }));
  expect(screen.queryByRole('complementary')).toBeNull();
});
it('returns home from the brand without losing the current scan', async () => {
  mocks.invoke.mockImplementation(async (command: string) =>
    command === 'start_scan' ? 1 : snapshot(),
  );
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '选择目录' }));
  expect(await screen.findByRole('heading', { name: '目录 1' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'SpaceTiles 首页' }));
  expect(screen.getByRole('heading', { name: '磁盘空间，一目了然。' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '返回扫描' }));
  expect(screen.getByRole('heading', { name: '目录 1' })).toBeTruthy();
  expect(mocks.invoke.mock.calls.filter((call) => call[0] === 'start_scan')).toHaveLength(1);
  expect(mocks.invoke.mock.calls.some((call) => call[0] === 'cancel_scan')).toBe(false);
});
