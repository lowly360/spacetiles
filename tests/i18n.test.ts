// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => mocks);
import {
  english,
  getLanguage,
  initializeLanguage,
  setLanguagePreference,
  getLanguagePreference,
  resolveLanguage,
  setLanguage,
  t,
  translateError,
  translateNote,
} from '../src/lib/i18n';
import { fileTypes } from '../src/lib/fileTypes';
import { layout } from '../src/lib/layout';
import { demoRoot } from '../src/lib/demo';
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  setLanguage('en');
});
it.each(['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK', 'zh_Hans_CN', 'ZH-cn'])(
  'recognizes Chinese language %s',
  (language) => {
    expect(resolveLanguage(language)).toBe('zh');
  },
);
it.each(['en-CN', 'ja-JP', 'fr', '', undefined, 'zho', 'es-ES'])(
  'defaults to English for %s',
  (language) => {
    expect(resolveLanguage(language)).toBe('en');
  },
);
it('uses macOS primary language rather than browser region or fallback languages', async () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  mocks.isTauri.mockReturnValue(true);
  mocks.invoke.mockResolvedValue('zh-Hant');
  await initializeLanguage();
  expect(getLanguage()).toBe('zh');
  expect(document.documentElement.lang).toBe('zh-CN');
  mocks.invoke.mockResolvedValue('ja-JP');
  await initializeLanguage();
  expect(getLanguage()).toBe('en');
});
it('uses the browser primary language when native detection fails', async () => {
  mocks.isTauri.mockReturnValue(true);
  mocks.invoke.mockRejectedValue(new Error('unavailable'));
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN');
  await initializeLanguage();
  expect(getLanguage()).toBe('zh');
});
it('does not let a secondary Chinese browser language override English', async () => {
  mocks.isTauri.mockReturnValue(false);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'zh-CN']);
  await initializeLanguage();
  expect(getLanguage()).toBe('en');
});
it('translates full messages, classifications and aggregate labels', () => {
  setLanguage('en');
  expect(t('进入 {name}', { name: '中文文件夹' })).toBe('Open 中文文件夹');
  expect(t('{count} 项', { count: 12 })).toBe('12 items');
  expect(fileTypes.find((type) => type.id === 'archive')?.label).toBe('Archives');
  const root = { ...demoRoot, children: [], otherSize: demoRoot.logical };
  expect(layout(root, 800, 600, 'logical')[0].node.name).toBe('Other items');
  setLanguage('zh');
  expect(t('{count} 项', { count: 12 })).toBe('12 项');
  expect(fileTypes.find((type) => type.id === 'archive')?.label).toBe('压缩包');
});
it('translates backend codes while retaining operating system diagnostics', () => {
  setLanguage('en');
  expect(translateNote('symlink')).toBe('Symbolic link · Not followed');
  expect(translateError('folder_access_failed: denied: 13')).toBe(
    'Cannot access this folder. Check its file access permissions.: denied: 13',
  );
  setLanguage('zh');
  expect(translateNote('duplicate_link')).toBe('重复硬链接 · 大小已归入其他路径');
  expect(translateError('Unknown OS error')).toBe('Unknown OS error');
});
it('keeps interpolation placeholders consistent between languages', () => {
  for (const [chinese, englishText] of Object.entries(english)) {
    expect(englishText).not.toMatch(/[\u3400-\u9fff]/);
    expect(englishText.match(/\{\w+\}/g)?.sort() ?? []).toEqual(
      chinese.match(/\{\w+\}/g)?.sort() ?? [],
    );
  }
});

it('restores a saved override and returns to the detected system language', async () => {
  mocks.isTauri.mockReturnValue(true);
  mocks.invoke.mockImplementation(async (command: string) =>
    command === 'preferred_language' ? 'zh-CN' : undefined,
  );
  localStorage.setItem('spacetiles.language', 'en');
  await initializeLanguage();
  expect(getLanguage()).toBe('en');
  expect(getLanguagePreference()).toBe('en');
  await setLanguagePreference('system');
  expect(getLanguage()).toBe('zh');
  expect(localStorage.getItem('spacetiles.language')).toBe('system');
  expect(mocks.invoke).toHaveBeenCalledWith('set_menu_language', { language: 'zh' });
});
