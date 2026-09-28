import { useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

export type Language = 'en' | 'zh';
export type LanguagePreference = 'system' | Language;
// Only the primary preferred language determines the UI. A secondary Chinese
// language must not override a user's English, Japanese, or other preference.
export function resolveLanguage(language: string | null | undefined): Language {
  return /^zh(?:[-_]|$)/i.test(language ?? '') ? 'zh' : 'en';
}
let systemLanguage: Language = resolveLanguage(
  typeof navigator === 'undefined' ? '' : navigator.language,
);
let language = systemLanguage;
let preference: LanguagePreference = 'system';
const listeners = new Set<() => void>();
export function setLanguage(value: Language) {
  language = value;
  if (typeof document !== 'undefined')
    document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en';
  listeners.forEach((listener) => listener());
}
export function getLanguage() {
  return language;
}
export function getLanguagePreference() {
  return preference;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
// Include the preference so choosing "system" rerenders even when the resolved
// language is unchanged. React and Canvas consume the same locale state.
export function useLanguage() {
  useSyncExternalStore(subscribe, () => `${language}:${preference}`);
  return language;
}
export async function setLanguagePreference(value: LanguagePreference) {
  preference = value;
  try {
    localStorage.setItem('spacetiles.language', value);
  } catch {
    /* Session-only if storage is unavailable. */
  }
  setLanguage(value === 'system' ? systemLanguage : value);
  if (isTauri()) await invoke('set_menu_language', { language });
}
export async function initializeLanguage() {
  let preferred = navigator.language;
  if (isTauri()) {
    try {
      preferred = await invoke<string>('preferred_language');
    } catch {
      /* Use browser language if native detection is unavailable. */
    }
  }
  systemLanguage = resolveLanguage(preferred);
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('spacetiles.language');
  } catch {
    /* Default to system. */
  }
  preference = saved === 'en' || saved === 'zh' ? saved : 'system';
  setLanguage(preference === 'system' ? systemLanguage : preference);
  if (isTauri()) {
    try {
      await invoke('set_menu_language', { language });
    } catch {
      /* Keep the working UI even if the native menu is unavailable. */
    }
  }
}

// Chinese source strings are typed keys. Interpolated messages stay together so
// translators can change word order without changing component code.
export const english = {
  设置: 'Settings',
  关闭设置: 'Close settings',
  界面语言: 'Language',
  跟随系统: 'System default',
  通用: 'General',
  关于: 'About',
  版本: 'Version',
  开发者: 'Developer',
  许可证: 'License',
  设置分类: 'Settings categories',

  正在扫描: 'Scanning',
  扫描完成: 'Complete',
  '已取消 · 部分结果': 'Stopped · Partial',
  '浏览器仅支持示例预览。请运行桌面应用以扫描本机目录。':
    'The browser supports the demo only. Open the desktop app to scan local folders.',
  选择要分析的目录: 'Choose a folder to analyze',
  'SpaceTiles 首页': 'SpaceTiles home',
  '返回首页，保留当前扫描': 'Go home and keep the current scan',
  看见空间的去向: 'See where your space goes',
  磁盘空间分析: 'Disk space analyzer',
  目录: 'Folders',
  '打开中…': 'Opening…',
  选择目录: 'Choose folder',
  重新扫描: 'Rescan',
  停止: 'Stop',
  示例: 'Demo',
  ' · 不完整': ' · Incomplete',
  配色方式: 'Color mode',
  按目录配色: 'By folder',
  按类型配色: 'By type',
  权限与统计说明: 'Permissions and size information',
  权限: 'Access',
  显示详情侧栏: 'Show details sidebar',
  详情: 'Details',
  权限说明: 'About permissions',
  关闭错误提示: 'Dismiss error',
  '磁盘空间，': 'Your disk space.',
  '一目了然。': 'At a glance.',
  '文件与目录，按大小展开。': 'Files and folders, sized to scale.',
  '从一张矩形图开始，找到占用空间的大文件。': 'Explore the map to find what takes up space.',
  选择一个目录: 'Choose a folder',
  返回示例: 'Back to demo',
  返回扫描: 'Back to scan',
  打开示例: 'Try the demo',
  '本地只读扫描 · 不修改文件': 'Local, read-only scanning · Your files stay untouched',
  '正在读取目录…': 'Reading folder…',
  视频: 'Video',
  '旅行.mov': 'Travel.mov',
  '剪辑.mp4': 'Edit.mp4',
  图片: 'Images',
  文稿: 'Documents',
  音频: 'Audio',
  表格: 'Spreadsheets',
  演示: 'Presentations',
  压缩包: 'Archives',
  安装包: 'Installers',
  代码: 'Code',
  数据: 'Data',
  设计: 'Design',
  字体: 'Fonts',
  其他: 'Other',
  按文件类型配色: 'Colors by file type',
  只读: 'Read-only',
  查看详情: 'View details',
  权限设置: 'Permission settings',
  目录路径: 'Folder path',
  返回上一级: 'Go up one level',
  大小统计方式: 'Size metric',
  逻辑大小: 'Logical size',
  已分配: 'Allocated',
  选中项目: 'Selected item',
  当前目录: 'Current folder',
  占当前目录: 'Share of this folder',
  已分配大小: 'Allocated size',
  '在 Finder 中显示': 'Show in Finder',
  直属大文件: 'Largest direct files',
  目录内容: 'Folder contents',
  全部: 'All',
  仅文件: 'Files only',
  '按大小 ↓': 'Size ↓',
  当前目录内容: 'Current folder contents',
  '正在扫描…': 'Scanning…',
  当前目录没有直属文件: 'No direct files in this folder',
  目录为空: 'This folder is empty',
  '最多显示最大的 100 项': 'Showing up to 100 largest items',
  ' · 不含子目录中的文件': ' · Excludes files in subfolders',
  配色图例: 'Color legend',
  目录分色: 'Folder colors',
  已分配大小不等于可释放空间: 'Allocated size is not reclaimable space',
  双击目录进入: 'Double-click a folder to explore',
  关闭权限说明: 'Close permission information',
  文件访问权限: 'File access',
  'SpaceTiles 只读取文件名、大小等信息。扫描从你选择的目录开始，不会修改文件，也不会上传扫描结果。':
    'SpaceTiles reads metadata such as file names and sizes, starting from the folder you choose. It does not modify files or upload scan results.',
  访问受限的目录: 'Protected folders',
  '打开「系统设置 → 隐私与安全性 → 文件与文件夹」，检查相关访问权限。如果需要分析邮件、备份等受保护数据，再按需将 SpaceTiles 加入「完全磁盘访问权限」。':
    'Check access under System Settings → Privacy & Security → Files and Folders. If you need to analyze protected data such as mail or backups, add SpaceTiles to Full Disk Access as needed.',
  '访问被拒绝也可能来自文件所有者或系统保护。完全磁盘访问权限并不能解除所有限制。授权后可能需要退出并重新打开应用，再重新扫描。':
    'File ownership and system protections can also deny access. Full Disk Access does not remove every restriction. After granting access, you may need to quit and reopen the app before rescanning.',
  大小统计: 'Understanding file sizes',
  '逻辑大小是文件声明的长度；已分配大小来自文件系统报告的块数。APFS 共享块、克隆与快照意味着它们都不等于删除后可释放的空间。硬链接只计一次，符号链接和其他设备挂载点默认跳过。':
    'Logical size is the length reported by a file; allocated size comes from filesystem block counts. With APFS shared blocks, clones, and snapshots, neither equals the space reclaimed by deletion. Hard links count once. Symbolic links and mounts on other devices are skipped.',
  打开隐私与安全性: 'Open Privacy & Security',
  关闭错误详情: 'Close error details',
  未读取的项目: 'Unread items',
  访问被拒绝: 'Access denied',
  读取失败: 'Read failed',
  '空间矩形图；也可通过右侧目录列表使用键盘浏览':
    'Disk space treemap. Use the folder list on the right for keyboard navigation.',
  无可显示的大小: 'No size to display',
  '请在右侧查看空文件或未读取的项目。': 'Check the list on the right for empty or unread items.',
  ' · 合并显示': ' · Grouped items',
  ' · 双击进入': ' · Double-click to explore',
  其他项目: 'Other items',
  '{files} 文件 · {folders} 目录': '{files} files · {folders} folders',
  '{files} 个文件 · {folders} 个目录 · {seconds} 秒':
    '{files} files · {folders} folders · {seconds} s',
  '{seconds} 秒': '{seconds} s',
  '{count} 项未能读取。当前大小不包含未读取内容。':
    '{count} items could not be read. Their contents are excluded from the totals.',
  '其中 {count} 项访问被拒绝。': 'Access was denied for {count} items.',
  '{count} 项': '{count} items',
  '进入 {name}': 'Open {name}',
  '跳过 {count} 项 · ': 'Skipped {count} items · ',
  '共 {count} 项错误，最多保留前 100 条。以下内容未纳入完整统计。':
    '{count} errors in total; up to the first 100 are listed. These items are not fully included in the totals.',
  我的空间: 'My space',
  '城市漫游 · 剪辑.mov': 'City walk · Edit.mov',
  '夏日旅行.mp4': 'Summer trip.mp4',
  素材: 'Footage',
  '海边日落.mov': 'Sunset.mov',
  '街景.mov': 'Street.mov',
  '配乐.wav': 'Soundtrack.wav',
  '素材归档.zip': 'Assets.zip',
  '参考资料.pdf': 'References.pdf',
  '山间清晨.heic': 'Mountain morning.heic',
  '海岸线.jpg': 'Coastline.jpg',
  '作品集.psd': 'Portfolio.psd',
  '项目归档.zip': 'Projects.zip',
  '产品手册.pdf': 'Product guide.pdf',
  '笔记.md': 'Notes.md',
  '/示例数据/': '/Demo/',
} as const;
export type Message = keyof typeof english;
export function t(key: Message, values: Record<string, string | number> = {}): string {
  const template = language === 'zh' ? key : english[key];
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(values[name] ?? placeholder),
  );
}

const backendMessages = {
  scan_state_unavailable: ['扫描状态不可用', 'Scan state is unavailable.'],
  scan_replaced: ['扫描已被替换，请刷新视图', 'This scan has been replaced. Refresh the view.'],
  absolute_path_required: ['请选择绝对路径目录', 'Choose a folder using an absolute path.'],
  folder_access_failed: [
    '无法访问所选目录，请检查文件访问权限',
    'Cannot access this folder. Check its file access permissions.',
  ],
  directory_required: ['请选择一个目录', 'Choose a folder.'],
  scan_data_unavailable: ['扫描数据不可用', 'Scan data is unavailable.'],
  item_not_found: ['找不到该项目', 'Item not found.'],
  item_unavailable: [
    '项目已移动、删除或不可访问，请重新扫描',
    'This item was moved, deleted, or is inaccessible. Scan again.',
  ],
  reveal_failed: ['无法在 Finder 中显示该项目', 'Could not show this item in Finder.'],
  finder_macos_only: ['首版仅支持 macOS Finder', 'Finder integration is available on macOS only.'],
  settings_failed: [
    '请手动打开系统设置 → 隐私与安全性',
    'Open System Settings → Privacy & Security manually.',
  ],
  settings_macos_only: [
    '此设置入口仅适用于 macOS',
    'This settings shortcut is available on macOS only.',
  ],
  directory_unavailable: [
    '目录已不可用，请返回根目录',
    'This folder is unavailable. Return to the root folder.',
  ],
  unread: ['无法读取，统计不完整', 'Could not read this item. Totals are incomplete.'],
  symlink: ['符号链接 · 未跟随', 'Symbolic link · Not followed'],
  special_file: ['特殊文件 · 已跳过', 'Special file · Skipped'],
  other_device: ['其他设备挂载点 · 已跳过', 'Mount on another device · Skipped'],
  duplicate_link: [
    '重复硬链接 · 大小已归入其他路径',
    'Duplicate hard link · Size counted at another path',
  ],
} as const;
export function translateNote(code: string): string {
  const pair = backendMessages[code as keyof typeof backendMessages];
  return pair ? pair[language === 'zh' ? 0 : 1] : code;
}
export function translateError(error: unknown): string {
  const raw = String(error);
  if (raw in english) return t(raw as Message);
  const [code, ...details] = raw.split(': ');
  // Preserve OS diagnostics verbatim; only app-owned messages are translated.
  return translateNote(code) + (details.length ? ': ' + details.join(': ') : '');
}
