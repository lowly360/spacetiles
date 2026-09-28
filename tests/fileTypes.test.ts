import { expect, it } from 'vitest';
import { category, extensionCategories, fileTypes } from '../src/lib/fileTypes';
it('covers at least 50 unique extensions without conflicting assignments', () => {
  const extensions = fileTypes.flatMap((type) => [...type.extensions]);
  expect(extensions.length).toBeGreaterThanOrEqual(50);
  expect(new Set(extensions).size).toBe(extensions.length);
  for (const [extension, type] of extensionCategories)
    expect(category({ name: `sample.${extension}`, directory: false })).toBe(type);
});
it.each([
  ['PHOTO.HEIC', 'image'],
  ['movie.MKV', 'video'],
  ['voice.m4a', 'audio'],
  ['report.PDF', 'document'],
  ['budget.xlsx', 'spreadsheet'],
  ['talk.key', 'presentation'],
  ['source.tar.gz', 'archive'],
  ['setup.dmg', 'installer'],
  ['setup.pkg', 'installer'],
  ['main.ts', 'code'],
  ['store.sqlite3', 'data'],
  ['draft.psd', 'design'],
  ['font.woff2', 'font'],
  ['Dockerfile', 'code'],
  ['.gitignore', 'code'],
  ['unknown.zzz', 'other'],
  ['pdf', 'other'],
])('classifies %s as %s', (name, type) => expect(category({ name, directory: false })).toBe(type));
it('recognizes macOS bundles without misclassifying ordinary dotted folder names', () => {
  expect(category({ name: 'Example.app', directory: true })).toBe('installer');
  expect(category({ name: 'Report.pages', directory: true })).toBe('document');
  expect(category({ name: 'photos.jpg', directory: true })).toBe('folder');
  expect(category({ name: 'v1.2', directory: true })).toBe('folder');
});
