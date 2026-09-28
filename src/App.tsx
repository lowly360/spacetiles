import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  HardDrive,
  LayoutGrid,
  Palette,
  PanelRight,
  Ruler,
  RefreshCw,
  ShieldCheck,
  Square,
  X,
  Info,
  Play,
} from 'lucide-react';
import { Treemap } from './components/Treemap';
import { formatSize, type Entry, type Metric, type Snapshot } from './lib/types';
import { groupColors, entryColor, type ColorMode } from './lib/palette';
import { fileTypes } from './lib/fileTypes';
import { version } from '../package.json';
import { demoRoot, demoSnapshot } from './lib/demo';

const native = isTauri();
const statuses = { scanning: '正在扫描', complete: '扫描完成', cancelled: '已取消 · 部分结果' };
export default function App() {
  const [showHome, setShowHome] = useState(true);
  const [scanId, setScanId] = useState<number | null>(null);
  const [directory, setDirectory] = useState(0);
  const [metric, setMetric] = useState<Metric>(() =>
    localStorage.getItem('spacetiles.metric') === 'allocated' ? 'allocated' : 'logical',
  );
  const [colorMode, setColorMode] = useState<ColorMode>('type');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [filesOnly, setFilesOnly] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [issues, setIssues] = useState(false);
  const actionVersion = useRef(0);
  const demo = scanId === -1;
  const groups = useMemo(
    () => groupColors(snapshot?.tree.children ?? [], snapshot?.currentPath ?? ''),
    [snapshot],
  );
  useEffect(() => {
    localStorage.setItem('spacetiles.metric', metric);
  }, [metric]);
  useEffect(() => {
    if (scanId === null) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try {
        const next =
          scanId === -1
            ? demoSnapshot(directory, metric === 'allocated', filesOnly)
            : await invoke<Snapshot>('get_snapshot', {
                scanId,
                nodeId: directory,
                allocated: metric === 'allocated',
                filesOnly,
              });
        if (disposed) return;
        setSnapshot(next);
        // Only one request is in flight. Navigation invalidates old responses.
        if (next.status === 'scanning') timer = setTimeout(update, 650);
      } catch (e) {
        if (!disposed) setError(String(e));
      }
    }
    void update();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [scanId, directory, metric, filesOnly]);
  useEffect(() => {
    if (!privacy && !issues) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [],
      );
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPrivacy(false);
        setIssues(false);
      }
      if (event.key === 'Tab') {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [privacy, issues]);
  async function start(path: string) {
    const version = ++actionVersion.current;
    setBusy(true);
    setError('');
    try {
      const id = await invoke<number>('start_scan', { path });
      if (version !== actionVersion.current) return;
      setShowHome(false);
      setSnapshot(null);
      setSelected(null);
      setDirectory(0);
      setScanId(id);
    } catch (e) {
      setError(String(e));
    } finally {
      if (version === actionVersion.current) setBusy(false);
    }
  }
  async function choose() {
    if (!native) {
      setError('浏览器仅支持示例预览。请运行桌面应用以扫描本机目录。');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const path = await open({ directory: true, multiple: false, title: '选择要分析的目录' });
      if (typeof path === 'string') await start(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (scanId === null || demo) return;
    try {
      await invoke('cancel_scan', { scanId });
    } catch (e) {
      setError(String(e));
    }
  }
  async function showDemo() {
    setShowHome(false);
    if (scanId !== null && !demo) await cancel();
    setDirectory(demoRoot.id);
    setScanId(-1);
    setSnapshot(null);
    setSelected(null);
    setError('');
  }
  const enter = useCallback((entry: Entry) => {
    if (entry.directory) {
      setDirectory(entry.id);
      setSelected(null);
    }
  }, []);
  async function reveal(entry: Entry) {
    if (demo) return;
    try {
      await invoke('reveal_item', { scanId, nodeId: entry.id });
    } catch (e) {
      setError(String(e));
    }
  }
  async function settings() {
    try {
      await invoke('open_privacy_settings');
    } catch (e) {
      setError(String(e));
    }
  }
  const current = snapshot?.tree;
  // Refresh selected directories as their descendants are discovered.
  function findVisible(node: typeof current, id: number): Entry | undefined {
    if (!node) return;
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findVisible(child, id);
      if (found) return found;
    }
  }
  const chosen = selected
    ? (findVisible(current, selected.id) ??
      snapshot?.entries.find((entry) => entry.id === selected.id) ??
      selected)
    : current;
  const scanning = snapshot?.status === 'scanning';
  const loadingView = snapshot !== null && snapshot.tree.id !== directory;
  const total = snapshot
    ? metric === 'logical'
      ? snapshot.totalLogical
      : snapshot.totalAllocated
    : 0;
  const parent = snapshot?.breadcrumbs.at(-2);
  const percent =
    chosen && current && current[metric] > 0
      ? Math.min(100, (chosen[metric] / current[metric]) * 100)
      : 0;
  return (
    <div className={`app-shell ${native ? 'native' : ''}`}>
      <header className="toolbar" data-tauri-drag-region>
        <button
          className="home-brand"
          aria-label="SpaceTiles 首页"
          title="返回首页，保留当前扫描"
          onClick={() => setShowHome(true)}
        >
          <span className="brand-mark">
            <LayoutGrid size={23} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">
              SpaceTiles <span className="version">{version}</span>
            </span>
            <span className="slogan">看见空间的去向</span>
          </span>
        </button>
        <div className="brand" data-tauri-drag-region title={snapshot?.rootPath ?? 'SpaceTiles'}>
          {snapshot ? <HardDrive size={18} /> : <LayoutGrid size={18} />}
          <div data-tauri-drag-region>
            <strong data-tauri-drag-region>
              {snapshot?.breadcrumbs[0].name ?? '磁盘空间分析'}
            </strong>
            {snapshot && (
              <small data-tauri-drag-region>
                {formatSize(total)}
                <span className="header-counts">
                  {' '}
                  · {snapshot.files.toLocaleString()} 文件 · {snapshot.directories.toLocaleString()}{' '}
                  目录
                </span>
              </small>
            )}
          </div>
        </div>
        <div className="toolbar-actions">
          <button disabled={busy} onClick={choose}>
            <FolderOpen size={16} />
            {busy ? '打开中…' : '选择目录'}
          </button>
          <button
            disabled={!snapshot || busy || demo}
            onClick={() => snapshot && start(snapshot.rootPath)}
          >
            <RefreshCw size={15} />
            重新扫描
          </button>
          {scanning && (
            <button onClick={cancel}>
              <Square size={13} />
              停止
            </button>
          )}
        </div>
        <div className="toolbar-spacer" data-tauri-drag-region />
        {snapshot && (
          <div
            className="scan-state"
            title={`${snapshot.files.toLocaleString()} 个文件 · ${snapshot.directories.toLocaleString()} 个目录 · ${(snapshot.elapsedMs / 1000).toFixed(1)} 秒`}
          >
            <span className={scanning ? 'status-dot running' : 'status-dot'} />
            <span>
              {demo ? '示例' : statuses[snapshot.status]}
              {snapshot.errors > 0 ? ' · 不完整' : ''}
            </span>
            <small>{(snapshot.elapsedMs / 1000).toFixed(1)} 秒</small>
          </div>
        )}
        <div className="toolbar-actions">
          <label className="toolbar-select">
            <Palette size={15} />
            <select
              aria-label="配色方式"
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
            >
              <option value="directory">按目录配色</option>
              <option value="type">按类型配色</option>
            </select>
          </label>
          <button aria-label="权限与统计说明" onClick={() => setPrivacy(true)}>
            <ShieldCheck size={15} />
            权限
          </button>
          <button
            aria-label="显示详情侧栏"
            aria-pressed={sidebarVisible}
            onClick={() => setSidebarVisible((v) => !v)}
          >
            <PanelRight size={15} />
            详情
          </button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <Info size={16} />
          <span>{error}</span>
          <button onClick={() => setPrivacy(true)}>权限说明</button>
          <button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {showHome || !snapshot ? (
        <main className="welcome">
          <div className="welcome-copy">
            <span className="welcome-label">
              <LayoutGrid size={14} />
              SpaceTiles <span>{version}</span>
            </span>
            <h1>
              磁盘空间，
              <br />
              一目了然。
            </h1>
            <p>
              文件与目录，按大小展开。
              <br />
              从一张矩形图开始，找到占用空间的大文件。
            </p>
            <div className="welcome-actions">
              <button className="primary" onClick={choose} disabled={busy}>
                <FolderOpen size={17} />
                选择一个目录
              </button>
              {snapshot ? (
                <button onClick={() => setShowHome(false)}>
                  <ArrowLeft size={15} />
                  {demo ? '返回示例' : '返回扫描'}
                </button>
              ) : (
                <button disabled={busy} onClick={showDemo}>
                  <Play size={15} />
                  打开示例
                </button>
              )}
            </div>
            <div className="welcome-note">
              <ShieldCheck size={14} />
              本地只读扫描 · 不修改文件
            </div>
            {scanId !== null && !snapshot && <p role="status">正在读取目录…</p>}
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="art-toolbar">
              <span />
              <span />
              <span />
              <i>SpaceTiles</i>
              <LayoutGrid size={12} />
            </div>
            <div className="art-grid">
              <div className="art-folder art-video">
                <span>视频</span>
                <div className="art-inner">
                  <i>
                    <span>旅行.mov</span>
                  </i>
                  <i>
                    <span>剪辑.mp4</span>
                  </i>
                </div>
              </div>
              <div className="art-folder art-images">
                <span>图片</span>
                <div className="art-inner">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="art-folder art-docs">
                <span>文稿</span>
                <div className="art-inner">
                  <i />
                  <i />
                </div>
              </div>
              <div className="art-folder art-music">
                <span>音频</span>
                <div className="art-inner">
                  <i />
                  <i />
                </div>
              </div>
            </div>
            <div className="art-footer">
              <span>
                <i />
                按文件类型配色
              </span>
              <span>只读</span>
            </div>
          </div>
        </main>
      ) : (
        <>
          {snapshot.errors > 0 && (
            <div className="permission-banner">
              <Info size={16} />
              <span>
                {snapshot.errors} 项未能读取
                {snapshot.denied > 0 ? `，其中 ${snapshot.denied} 项访问被拒绝` : ''}
                。当前大小不包含未读取内容。
              </span>
              <button onClick={() => setIssues(true)}>查看详情</button>
              {snapshot.denied > 0 && <button onClick={() => setPrivacy(true)}>权限设置</button>}
            </div>
          )}
          <div className="workspace">
            <main className="map-panel">
              <div className="map-toolbar">
                <nav aria-label="目录路径">
                  <button
                    className="icon-button"
                    aria-label="返回上一级"
                    disabled={!parent || loadingView}
                    onClick={() => parent && enter(parent)}
                  >
                    <ArrowLeft size={17} />
                  </button>
                  {snapshot.breadcrumbs.map((entry, index) => (
                    <span key={entry.id} className="crumb">
                      {index > 0 && <ChevronRight size={12} />}
                      <button
                        title={entry.name}
                        disabled={loadingView}
                        onClick={() => enter(entry)}
                      >
                        {entry.name}
                      </button>
                    </span>
                  ))}
                </nav>
                <div className="metric-switch" role="group" aria-label="大小统计方式">
                  <Ruler size={13} />
                  <button
                    aria-pressed={metric === 'logical'}
                    className={metric === 'logical' ? 'active' : ''}
                    onClick={() => setMetric('logical')}
                  >
                    逻辑大小
                  </button>
                  <button
                    aria-pressed={metric === 'allocated'}
                    className={metric === 'allocated' ? 'active' : ''}
                    onClick={() => setMetric('allocated')}
                  >
                    已分配
                  </button>
                </div>
              </div>
              <div className={`map-body ${loadingView ? 'loading-view' : ''}`}>
                <Treemap
                  colorMode={colorMode}
                  rootPath={snapshot.currentPath}
                  root={snapshot.tree}
                  metric={metric}
                  selected={selected?.id ?? null}
                  onSelect={setSelected}
                  onEnter={enter}
                />
              </div>
            </main>
            {sidebarVisible && (
              <aside className="sidebar">
                <section className="selection">
                  <span className="eyebrow">{selected ? '选中项目' : '当前目录'}</span>
                  <div className="selection-title">
                    {chosen?.directory ? <Folder size={19} /> : <File size={19} />}
                    <h2 title={chosen?.name}>{chosen?.name}</h2>
                  </div>
                  <div className="selected-size">{formatSize(chosen?.[metric] ?? 0)}</div>
                  <div className="share-line">
                    <span>占当前目录</span>
                    <span>{percent.toFixed(1)}%</span>
                  </div>
                  <div className="share-track">
                    <i style={{ width: `${percent}%` }} />
                  </div>
                  <dl>
                    <div>
                      <dt>逻辑大小</dt>
                      <dd>{formatSize(chosen?.logical ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>已分配大小</dt>
                      <dd>{formatSize(chosen?.allocated ?? 0)}</dd>
                    </div>
                  </dl>
                  {chosen?.note && <p className="item-note">{chosen.note}</p>}
                  <button
                    className="reveal"
                    disabled={demo || !chosen}
                    onClick={() => chosen && reveal(chosen)}
                  >
                    <FolderOpen size={15} />
                    在 Finder 中显示
                    <ArrowUpRight size={13} />
                  </button>
                </section>
                <section className="contents">
                  <div className="contents-heading">
                    <h3>{filesOnly ? '直属大文件' : '目录内容'}</h3>
                    <span>{snapshot.childCount} 项</span>
                  </div>
                  <div className="list-tabs">
                    <button
                      className={!filesOnly ? 'active' : ''}
                      onClick={() => setFilesOnly(false)}
                    >
                      全部
                    </button>
                    <button
                      className={filesOnly ? 'active' : ''}
                      onClick={() => setFilesOnly(true)}
                    >
                      仅文件
                    </button>
                    <span>按大小 ↓</span>
                  </div>
                  <div className="entry-list" aria-label="当前目录内容">
                    {snapshot.entries.map((entry) => (
                      <div
                        className={`entry-row ${selected?.id === entry.id ? 'selected' : ''}`}
                        key={entry.id}
                      >
                        <button
                          className="entry-select"
                          aria-label={`${entry.name} ${formatSize(entry[metric])}`}
                          onClick={() => setSelected(entry)}
                          onDoubleClick={() => enter(entry)}
                          title={entry.note ? `${entry.name} · ${entry.note}` : entry.name}
                        >
                          <span
                            className="entry-icon"
                            style={{ color: entryColor(entry, colorMode, groups) }}
                          >
                            {entry.directory ? <Folder size={15} /> : <File size={15} />}
                          </span>
                          <span className="entry-name">{entry.name}</span>
                          <span className="entry-size">{formatSize(entry[metric])}</span>
                        </button>
                        {entry.directory && (
                          <button
                            className="enter-dir"
                            aria-label={`进入 ${entry.name}`}
                            onClick={() => enter(entry)}
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {snapshot.entries.length === 0 && (
                      <p className="list-empty">
                        {scanning ? '正在扫描…' : filesOnly ? '当前目录没有直属文件' : '目录为空'}
                      </p>
                    )}
                  </div>
                  <p className="list-caption">
                    最多显示最大的 100 项{filesOnly ? ' · 不含子目录中的文件' : ''}
                  </p>
                </section>
              </aside>
            )}
          </div>
          <footer className="statusbar">
            <div className="legend" aria-label="配色图例" tabIndex={0}>
              {colorMode === 'directory' ? (
                <>
                  <Palette size={12} />
                  <span>目录分色</span>
                  {snapshot.tree.children.slice(0, 5).map((entry) => (
                    <span key={entry.id} title={entry.name}>
                      <i style={{ background: groups.get(entry.id) }} />
                      {entry.name}
                    </span>
                  ))}
                </>
              ) : (
                fileTypes.map((type) => (
                  <span
                    key={type.id}
                    title={
                      type.extensions.length
                        ? type.extensions.map((ext) => '.' + ext).join('、')
                        : type.label
                    }
                  >
                    <i style={{ background: type.color }} />
                    {type.label}
                  </span>
                ))
              )}
            </div>
            <span className="footer-info" title={snapshot.currentPath}>
              {snapshot.skipped > 0 ? `跳过 ${snapshot.skipped} 项 · ` : ''}
              {metric === 'allocated' ? '已分配大小不等于可释放空间' : '双击目录进入'} ·{' '}
              {formatSize(current![metric])}
            </span>
          </footer>
        </>
      )}
      {privacy && (
        <div className="modal-backdrop" onClick={() => setPrivacy(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭权限说明"
              onClick={() => setPrivacy(false)}
            >
              <X size={18} />
            </button>
            <ShieldCheck className="modal-icon" size={28} />
            <h2 id="privacy-title">文件访问权限</h2>
            <p>
              SpaceTiles
              只读取文件名、大小等信息。扫描从你选择的目录开始，不会修改文件，也不会上传扫描结果。
            </p>
            <h3>访问受限的目录</h3>
            <p>
              打开「系统设置 → 隐私与安全性 →
              文件与文件夹」，检查相关访问权限。如果需要分析邮件、备份等受保护数据，再按需将
              SpaceTiles 加入「完全磁盘访问权限」。
            </p>
            <p>
              访问被拒绝也可能来自文件所有者或系统保护。完全磁盘访问权限并不能解除所有限制。授权后可能需要退出并重新打开应用，再重新扫描。
            </p>
            <h3>大小统计</h3>
            <p>
              逻辑大小是文件声明的长度；已分配大小来自文件系统报告的块数。APFS
              共享块、克隆与快照意味着它们都不等于删除后可释放的空间。硬链接只计一次，符号链接和其他设备挂载点默认跳过。
            </p>
            <button className="primary" disabled={!native} onClick={settings}>
              打开隐私与安全性
              <ArrowUpRight size={15} />
            </button>
          </section>
        </div>
      )}
      {issues && snapshot && (
        <div className="modal-backdrop" onClick={() => setIssues(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="issues-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭错误详情"
              onClick={() => setIssues(false)}
            >
              <X size={18} />
            </button>
            <h2 id="issues-title">未读取的项目</h2>
            <p>共 {snapshot.errors} 项错误，最多保留前 100 条。以下内容未纳入完整统计。</p>
            <div className="issue-list">
              {snapshot.issues.map((issue, index) => (
                <article key={index}>
                  <strong>{issue.permissionDenied ? '访问被拒绝' : '读取失败'}</strong>
                  <code>{issue.path}</code>
                  <p>{issue.message}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
