import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useDebtStore } from '../../store/debtStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getHeatmapData, watchlistCrud } from '../../lib/tauri';
import { HeatmapTooltip } from './HeatmapTooltip';
import { FilterToolbar } from './FilterToolbar';
import { CouplingsGraph } from './CouplingsGraph';
import { Watchlist } from './Watchlist';
import { ScoreBreakdown } from '../priority/ScoreBreakdown';
import { FileHistoryModal } from '../timeline/FileHistoryModal';

interface HeatmapDataNode {
  name: string;
  path: string;
  score?: number;
  loc?: number;
  children?: HeatmapDataNode[];
}

interface TooltipState {
  x: number;
  y: number;
  node: d3.HierarchyRectangularNode<HeatmapDataNode>;
}

type FilterMode = 'all' | 'high' | 'critical';
type ViewMode = 'treemap' | 'graph';

function scoreColor(score: number): string {
  if (score < 40) return 'var(--debt-low)';
  if (score < 65) return 'var(--debt-medium)';
  if (score < 80) return 'var(--debt-high)';
  return 'var(--debt-critical)';
}

export const DebtHeatmap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('treemap');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapDataNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const workspace = useWorkspaceStore((s) => s.workspace);

  const analysisResult = useDebtStore((s) => s.analysisResult);

  // Load heatmap data when analysis is available
  useEffect(() => {
    if (!analysisResult) return;
    setLoading(true);
    getHeatmapData()
      .then((data) => setHeatmapData(data as HeatmapDataNode))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [analysisResult]);

  const drawHeatmap = useCallback(() => {
    if (!heatmapData || !svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = containerRef.current.getBoundingClientRect();
    const W = width || 800;
    const H = height - 48 || 500; // minus toolbar

    svg.attr('width', W).attr('height', H);

    // Build hierarchy
    const root = d3.hierarchy<HeatmapDataNode>(heatmapData)
      .sum((d) => (d.children ? 0 : Math.max(d.loc ?? 1, 1)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<HeatmapDataNode>()
      .size([W, H])
      .paddingOuter(4)
      .paddingTop(20)
      .paddingInner(2)
      .round(true)(root);

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Filter leaves
    let leaves = root.leaves();
    if (filter === 'high') leaves = leaves.filter((d) => (d.data.score ?? 0) >= 65);
    if (filter === 'critical') leaves = leaves.filter((d) => (d.data.score ?? 0) >= 80);

    // Draw directory labels
    root.descendants().filter((d) => d.depth > 0 && d.children).forEach((d) => {
      const node = d as d3.HierarchyRectangularNode<HeatmapDataNode>;
      g.append('rect')
        .attr('x', node.x0)
        .attr('y', node.y0)
        .attr('width', node.x1 - node.x0)
        .attr('height', node.y1 - node.y0)
        .attr('fill', 'rgba(255,255,255,0.03)')
        .attr('stroke', 'rgba(255,255,255,0.08)')
        .attr('stroke-width', 1);

      if (node.x1 - node.x0 > 60) {
        g.append('text')
          .attr('x', node.x0 + 4)
          .attr('y', node.y0 + 14)
          .attr('font-size', '10px')
          .attr('fill', 'rgba(255,255,255,0.4)')
          .attr('font-family', 'Inter, sans-serif')
          .text(node.data.name);
      }
    });

    // Draw file leaves
    const cells = g.selectAll<SVGGElement, d3.HierarchyRectangularNode<HeatmapDataNode>>('g.leaf')
      .data(leaves as d3.HierarchyRectangularNode<HeatmapDataNode>[])
      .join('g')
      .attr('class', 'leaf')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    cells.append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => scoreColor(d.data.score ?? 0))
      .attr('fill-opacity', 0.75)
      .attr('stroke', 'rgba(0,0,0,0.3)')
      .attr('stroke-width', 1)
      .attr('rx', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this)
          .attr('stroke', 'var(--accent)')
          .attr('stroke-width', 2)
          .attr('fill-opacity', 1);
        const rect = (event.target as SVGRectElement).getBoundingClientRect();
        setTooltip({ x: rect.right + 8, y: rect.top, node: d });
      })
      .on('mouseleave', function () {
        d3.select(this)
          .attr('stroke', 'rgba(0,0,0,0.3)')
          .attr('stroke-width', 1)
          .attr('fill-opacity', 0.75);
        setTooltip(null);
      })
      .on('click', (_event, d) => {
        setSelectedPath(d.data.path);
      })
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY, path: d.data.path });
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        // Zoom into node
        const [[x0, y0], [x1, y1]] = [[d.x0, d.y0], [d.x1, d.y1]];
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const scale = Math.min(8, 0.9 / Math.max((x1 - x0) / W, (y1 - y0) / H));
        svg.transition().duration(600).ease(d3.easeCubicOut).call(
          zoom.transform,
          d3.zoomIdentity.translate(W / 2 - scale * cx, H / 2 - scale * cy).scale(scale)
        );
      });

    // File labels
    cells.append('text')
      .filter((d) => (d.x1 - d.x0) > 40 && (d.y1 - d.y0) > 20)
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => (d.y1 - d.y0) / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', (d) => Math.min(11, Math.max(8, (d.x1 - d.x0) / 8)) + 'px')
      .attr('fill', 'rgba(255,255,255,0.9)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .style('pointer-events', 'none')
      .text((d) => {
        const name = d.data.name;
        const w = d.x1 - d.x0;
        return name.length > w / 7 ? name.slice(0, Math.floor(w / 7) - 1) + '…' : name;
      });

    // Score label
    cells.append('text')
      .filter((d) => (d.x1 - d.x0) > 30 && (d.y1 - d.y0) > 30)
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => (d.y1 - d.y0) / 2 + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.6)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .style('pointer-events', 'none')
      .text((d) => Math.round(d.data.score ?? 0));

    // Double-click SVG to reset zoom
    svg.on('dblclick.zoom', null);
    svg.on('dblclick', () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });
  }, [heatmapData, filter]);

  useEffect(() => {
    drawHeatmap();
  }, [drawHeatmap]);

  // Redraw on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => drawHeatmap());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [drawHeatmap]);

  if (!analysisResult && !loading) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <p>Open a repository and run analysis to see the heatmap</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FilterToolbar filter={filter} onFilterChange={setFilter} viewMode={viewMode} onViewModeChange={setViewMode} />

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading heatmap…
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', color: 'var(--debt-critical)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {!loading && !error && viewMode === 'treemap' && (
        <svg ref={svgRef} style={{ flex: 1, display: 'block' }} />
      )}

      {!loading && !error && viewMode === 'graph' && (
        <div style={{ flex: 1 }}>
          <CouplingsGraph />
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', padding: '6px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)' }}>
        {[['Low (0–39)', 'var(--debt-low)'], ['Moderate (40–64)', 'var(--debt-medium)'], ['High (65–79)', 'var(--debt-high)'], ['Critical (80+)', 'var(--debt-critical)']].map(([label, color]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>Scroll to zoom · Dbl-click to reset · Click for breakdown</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <HeatmapTooltip x={tooltip.x} y={tooltip.y} node={tooltip.node} />
      )}

      {/* Score breakdown panel */}
      {selectedPath && (
        <ScoreBreakdown path={selectedPath} onClose={() => setSelectedPath(null)} />
      )}

      {/* Watchlist strip */}
      <Watchlist onSelectFile={setSelectedPath} />

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 300,
            background: 'rgba(17,18,28,0.95)', backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-subtle)', borderRadius: '6px',
            padding: '4px 0', minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
          onClick={() => setContextMenu(null)}
        >
          <button onClick={async () => { if (workspace) await watchlistCrud(workspace.path, 'pin', contextMenu.path); setContextMenu(null); }}
            style={menuItemStyle}>📌 Pin to Watchlist</button>
          <button onClick={async () => { if (workspace) await watchlistCrud(workspace.path, 'unpin', contextMenu.path); setContextMenu(null); }}
            style={menuItemStyle}>❌ Unpin from Watchlist</button>
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />
          <button onClick={() => { setSelectedPath(contextMenu.path); setContextMenu(null); }}
            style={menuItemStyle}>🔍 View Score Breakdown</button>
          <button onClick={() => { setHistoryPath(contextMenu.path); setContextMenu(null); }}
            style={menuItemStyle}>📈 View File History</button>
        </div>
      )}

      {/* File history modal */}
      {historyPath && (
        <FileHistoryModal filePath={historyPath} onClose={() => setHistoryPath(null)} />
      )}
    </div>
  );
};

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '6px 14px', background: 'transparent',
  border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
  textAlign: 'left',
};
