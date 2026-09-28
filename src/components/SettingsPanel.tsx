import { useState } from 'react';
import { Info, LayoutGrid, Settings, X } from 'lucide-react';
import { version } from '../../package.json';
import {
  getLanguagePreference,
  setLanguagePreference,
  t,
  useLanguage,
  type LanguagePreference,
} from '../lib/i18n';

interface Props {
  onClose: () => void;
  onError: (error: unknown) => void;
}
// Keep sections independent so future preferences do not expand the main screen.
const sections = [
  { id: 'general', label: '通用', icon: Settings },
  { id: 'about', label: '关于', icon: Info },
] as const;

export function SettingsPanel({ onClose, onError }: Props) {
  useLanguage();
  const [section, setSection] = useState<(typeof sections)[number]['id']>('general');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-heading">
          <h2 id="settings-title">{t('设置')}</h2>
          <button className="icon-button" aria-label={t('关闭设置')} onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label={t('设置分类')}>
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-pressed={section === id}
                aria-controls="settings-content"
                onClick={() => setSection(id)}
              >
                <Icon size={16} />
                {t(label)}
              </button>
            ))}
          </nav>
          <div className="settings-content" id="settings-content">
            {section === 'general' ? (
              <>
                <h3>{t('通用')}</h3>
                <div className="settings-group">
                  <label className="settings-row" htmlFor="language-preference">
                    <span>{t('界面语言')}</span>
                    <select
                      id="language-preference"
                      value={getLanguagePreference()}
                      onChange={(event) => {
                        void setLanguagePreference(event.target.value as LanguagePreference).catch(
                          onError,
                        );
                      }}
                    >
                      <option value="system">{t('跟随系统')}</option>
                      <option value="zh">简体中文</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <h3>{t('关于')}</h3>
                <div className="about-brand">
                  <span className="brand-mark">
                    <LayoutGrid size={30} />
                  </span>
                  <div>
                    <strong>SpaceTiles</strong>
                    <p>{t('磁盘空间分析')}</p>
                  </div>
                </div>
                <dl className="settings-group about-metadata">
                  <div className="settings-row">
                    <dt>{t('版本')}</dt>
                    <dd>{version}</dd>
                  </div>
                  <div className="settings-row">
                    <dt>{t('开发者')}</dt>
                    <dd>itlowly</dd>
                  </div>
                  <div className="settings-row">
                    <dt>{t('许可证')}</dt>
                    <dd>MIT</dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
