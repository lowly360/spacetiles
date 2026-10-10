import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, FolderOpen, Terminal } from 'lucide-react';
import { t } from '../lib/i18n';

export type ItemAction = 'open_finder' | 'copy_path' | 'open_terminal';

interface Props {
  x: number;
  y: number;
  disabled: boolean;
  onAction: (action: ItemAction) => void;
  onClose: () => void;
}

export function ItemContextMenu({ x, y, disabled, onAction, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const bounds = menu.current!.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
  }, [x, y]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) onClose();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        onClose();
      }
      const items = Array.from(
        menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
      );
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return (
    <div
      ref={menu}
      className="item-context-menu"
      role="menu"
      aria-label={t('文件操作')}
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button role="menuitem" disabled={disabled} onClick={() => onAction('open_finder')}>
        <FolderOpen size={15} /> {t('在访达中打开')}
      </button>
      <button role="menuitem" disabled={disabled} onClick={() => onAction('copy_path')}>
        <Copy size={15} /> {t('复制绝对路径')}
      </button>
      <button role="menuitem" disabled={disabled} onClick={() => onAction('open_terminal')}>
        <Terminal size={15} /> {t('在终端中打开')}
      </button>
      {disabled && <small>{t('示例数据不支持文件操作')}</small>}
    </div>
  );
}
