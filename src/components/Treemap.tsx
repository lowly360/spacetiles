import { t, useLanguage } from '../lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSize, type Entry, type Metric, type TileNode } from '../lib/types';
import { groupColors, entryColor, shade, type ColorMode } from '../lib/palette';
import { hitTest, layout, type Tile } from '../lib/layout';
interface Props {
  colorMode: ColorMode;
  rootPath: string;
  root: TileNode;
  metric: Metric;
  selected: number | null;
  onSelect: (entry: Entry) => void;
  onEnter: (entry: Entry) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
}
export function Treemap({
  colorMode,
  rootPath,
  root,
  metric,
  selected,
  onSelect,
  onEnter,
  onContextMenu,
}: Props) {
  const language = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [hover, setHover] = useState<{ tile: Tile; x: number; y: number } | null>(null);
  const tiles = useMemo(
    () => layout(root, size.width, size.height, metric),
    [root, size, metric, language],
  );
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setHover(null), [root.id, metric, language]);
  const groups = useMemo(() => groupColors(root.children, rootPath), [root, rootPath]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const scale = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * scale);
    element.height = Math.round(size.height * scale);
    const ctx = element.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, size.width, size.height);
    for (const tile of tiles) {
      const { x, y, width, height, node, depth, aggregate } = tile;
      const base =
        colorMode === 'directory'
          ? (groups.get(tile.groupId) ?? '#566473')
          : entryColor(node, 'type', groups);
      const color = aggregate ? '#58606b' : shade(base, depth, node.id);
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.23)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
      if ((node.id === selected || node.id === hover?.tile.node.id) && !aggregate) {
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 3;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
      }
      ctx.shadowBlur = 0;
      if (width > 56 && height > 23) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 7, y + 3, width - 14, height - 6);
        ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.font = `${node.directory ? '600' : '400'} 12px -apple-system, sans-serif`;
        let text = node.name;
        while (text.length > 1 && ctx.measureText(text).width > width - 18)
          text = text.slice(0, -2) + '…';
        ctx.fillText(text, x + 9, y + 17);
        if ((!node.children.length || width < 71 || height < 65) && height > 47) {
          ctx.font = '11px -apple-system, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(formatSize(node[metric]), x + 9, y + 35);
        }
        ctx.restore();
      }
    }
  }, [tiles, size, selected, hover, metric, colorMode, groups]);
  function pointer(event: React.MouseEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    return { tile: hitTest(tiles, x, y), x, y };
  }
  return (
    <div className="treemap" ref={container}>
      <canvas
        ref={canvas}
        aria-label={t('空间矩形图；也可通过右侧目录列表使用键盘浏览')}
        onMouseMove={(e) => {
          const hit = pointer(e);
          setHover(hit.tile ? { ...hit, tile: hit.tile } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const { tile } = pointer(e);
          if (tile && !tile.aggregate) onSelect(tile.node);
        }}
        onDoubleClick={(e) => {
          const { tile } = pointer(e);
          if (tile && !tile.aggregate) onEnter(tile.node);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const { tile } = pointer(event);
          if (tile?.aggregate) return;
          setHover(null);
          onContextMenu(tile?.node ?? root, event.clientX, event.clientY);
        }}
        style={{ width: size.width, height: size.height }}
      />
      {root[metric] === 0 && (
        <div className="map-empty">
          <span>{t('无可显示的大小')}</span>
          <p>{t('请在右侧查看空文件或未读取的项目。')}</p>
        </div>
      )}
      {hover && (
        <div
          className="tooltip"
          style={{
            left: Math.max(4, Math.min(hover.x + 14, size.width - 270)),
            top: Math.max(4, Math.min(hover.y + 16, size.height - 96)),
          }}
        >
          <strong>{hover.tile.node.name}</strong>
          <small>{rootPath.replace(/\/$/, '') + hover.tile.relativePath}</small>
          <span>
            {formatSize(hover.tile.node[metric])}
            {hover.tile.aggregate
              ? t(' · 合并显示')
              : hover.tile.node.directory
                ? t(' · 双击进入')
                : ''}
          </span>
          {hover.tile.node.note && <small>{hover.tile.node.note}</small>}
        </div>
      )}
    </div>
  );
}
