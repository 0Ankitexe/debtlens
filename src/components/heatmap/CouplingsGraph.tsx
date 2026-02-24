import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getChangeCouplings } from '../../lib/tauri';
import type { CouplingPair } from '../../lib/tauri';

interface GNode extends d3.SimulationNodeDatum { id: string; score: number; loc: number; }
interface GLink extends d3.SimulationLinkDatum<GNode> { coupling_ratio: number; co_change_count: number; has_import_link: boolean; }

export const CouplingsGraph: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const { warningThreshold, criticalThreshold } = useSettingsStore();
  const [allPairs, setAllPairs] = useState<CouplingPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [clusters, setClusters] = useState<{ files: string[]; avgCoupling: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.05);

  // Fetch ALL pairs once (threshold=0) — slider filters locally
  const loadData = useCallback(async () => {
    if (!workspace) return;
    setLoading(true); setError(null);
    try { setAllPairs(await getChangeCouplings(workspace.path, 0)); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [workspace]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter pairs locally based on slider value — no backend call
  const pairs = allPairs.filter((p) => p.coupling_ratio >= threshold);


  useEffect(() => {
    if (!svgRef.current || pairs.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const { width: W, height: H } = svgRef.current.getBoundingClientRect();

    const fileSet = new Set<string>();
    pairs.forEach((p) => { fileSet.add(p.file_a); fileSet.add(p.file_b); });
    const nodes: GNode[] = Array.from(fileSet).map((id) => {
      const f = analysisResult?.files.find((f) => f.relative_path === id);
      return { id, score: f?.composite_score ?? 50, loc: f?.loc ?? 100 };
    });
    const links: GLink[] = pairs.map((p) => ({ source: p.file_a, target: p.file_b, coupling_ratio: p.coupling_ratio, co_change_count: p.co_change_count, has_import_link: p.has_import_link }));

    // Cluster detection (hidden coupling = no import link)
    const adj = new Map<string, Set<string>>();
    pairs.forEach((p) => {
      if (!p.has_import_link) {
        if (!adj.has(p.file_a)) adj.set(p.file_a, new Set());
        if (!adj.has(p.file_b)) adj.set(p.file_b, new Set());
        adj.get(p.file_a)!.add(p.file_b);
        adj.get(p.file_b)!.add(p.file_a);
      }
    });
    const visited = new Set<string>();
    const clusterList: { files: string[]; avgCoupling: number }[] = [];
    Array.from(fileSet).forEach((start) => {
      if (visited.has(start)) return;
      const cluster: string[] = [];
      const queue = [start];
      while (queue.length) {
        const n = queue.pop()!;
        if (visited.has(n)) continue;
        visited.add(n); cluster.push(n);
        adj.get(n)?.forEach((nb) => queue.push(nb));
      }
      if (cluster.length >= 2) {
        const cp = pairs.filter((p) => cluster.includes(p.file_a) && cluster.includes(p.file_b));
        const avg = cp.reduce((s, p) => s + p.coupling_ratio, 0) / Math.max(cp.length, 1);
        clusterList.push({ files: cluster, avgCoupling: avg });
      }
    });
    setClusters(clusterList.sort((a, b) => b.files.length - a.files.length).slice(0, 5));

    const scoreColor = (s: number) => s >= criticalThreshold ? 'var(--debt-critical)' : s >= warningThreshold ? 'var(--debt-high)' : s >= 35 ? 'var(--debt-medium)' : 'var(--debt-low)';
    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on('zoom', (e) => g.attr('transform', e.transform)));

    const sim = d3.forceSimulation<GNode>(nodes)
      .force('link', d3.forceLink<GNode, GLink>(links).id((d) => d.id).distance(90).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter((W || 800) / 2, (H || 500) / 2))
      .force('collide', d3.forceCollide<GNode>().radius((d) => Math.sqrt(d.loc / 5) + 12));

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', (d) => d.has_import_link ? 'rgba(99,179,237,0.5)' : 'rgba(236,161,53,0.6)')
      .attr('stroke-width', (d) => Math.max(1, d.coupling_ratio * 5))
      .attr('stroke-dasharray', (d) => d.has_import_link ? '' : '4,3')
      .attr('opacity', 0.75);

    const nodeG = g.append('g').selectAll<SVGGElement, GNode>('g').data(nodes).join('g').attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, GNode>()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('click', (e, d) => { e.stopPropagation(); setSelectedNode((prev) => prev === d.id ? null : d.id); });

    nodeG.append('circle')
      .attr('r', (d) => Math.max(8, Math.sqrt(d.loc / 5)))
      .attr('fill', (d) => scoreColor(d.score))
      .attr('fill-opacity', 0.8)
      .attr('stroke', (d) => scoreColor(d.score))
      .attr('stroke-width', 2).attr('stroke-opacity', 0.5);

    nodeG.append('text')
      .text((d) => d.id.split('/').pop() ?? d.id)
      .attr('text-anchor', 'middle').attr('dy', (d) => -(Math.max(8, Math.sqrt(d.loc / 5)) + 5))
      .attr('font-size', '9px').attr('fill', 'var(--text-muted)').attr('pointer-events', 'none');

    sim.on('tick', () => {
      link.attr('x1', (d) => (d.source as GNode).x ?? 0).attr('y1', (d) => (d.source as GNode).y ?? 0)
        .attr('x2', (d) => (d.target as GNode).x ?? 0).attr('y2', (d) => (d.target as GNode).y ?? 0);
      nodeG.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
    svg.on('click', () => setSelectedNode(null));
    return () => { sim.stop(); };
  }, [pairs, analysisResult, warningThreshold, criticalThreshold]);

  if (!workspace) return <div className="empty-state" style={{ height: '100%' }}><p>Open a repository to view coupling graph</p></div>;

  const partners = selectedNode
    ? pairs.filter((p) => p.file_a === selectedNode || p.file_b === selectedNode)
      .map((p) => ({ file: p.file_a === selectedNode ? p.file_b : p.file_a, ratio: p.coupling_ratio, count: p.co_change_count, hasImport: p.has_import_link }))
      .sort((a, b) => b.ratio - a.ratio).slice(0, 5)
    : [];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Min coupling:</span>
        <input type="range" min="0.01" max="0.5" step="0.01" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} style={{ width: '120px' }} />
        <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{(threshold * 100).toFixed(0)}%</span>
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>Loading…</span>}
        {!loading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pairs.length} pairs · {clusters.length} hidden clusters</span>}
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {error && <div className="empty-state" style={{ height: '100%' }}><p style={{ color: 'var(--debt-critical)' }}>{error}</p></div>}
        {!error && pairs.length === 0 && !loading && (
          <div className="empty-state" style={{ height: '100%' }}>
            <p>No co-change pairs above {(threshold * 100).toFixed(0)}% threshold.</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Try lowering the slider or running analysis first.</p>
          </div>
        )}
        <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
        <div style={{ position: 'absolute', bottom: '12px', left: '12px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: 0, borderTop: '2px solid rgba(99,179,237,0.6)' }} /><span>Structural import</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: 0, borderTop: '2px dashed rgba(236,161,53,0.6)' }} /><span>Hidden coupling</span></div>
        </div>
        <AnimatePresence>
          {selectedNode && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="panel-glass" style={{ position: 'absolute', top: '12px', right: '12px', width: '240px', padding: '12px', maxHeight: '80%', overflowY: 'auto' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', marginBottom: '8px', wordBreak: 'break-all' }}>{selectedNode}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>Top co-change partners</div>
              {partners.map((p) => (
                <div key={p.file} style={{ padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '2px', wordBreak: 'break-all' }}>{p.file}</div>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--accent)' }}>{(p.ratio * 100).toFixed(0)}%</span>
                    <span>{p.count}×</span>
                    {!p.hasImport && <span style={{ color: 'var(--debt-high)' }}>⚠ Hidden</span>}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
          {!selectedNode && clusters.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="panel-glass" style={{ position: 'absolute', top: '12px', right: '12px', width: '240px', padding: '12px', maxHeight: '60%', overflowY: 'auto' }}>
              <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>🔍 Hidden Clusters</div>
              {clusters.map((c, i) => (
                <div key={i} style={{ marginBottom: '8px', padding: '8px', borderRadius: '4px', background: 'rgba(236,161,53,0.07)', border: '1px solid rgba(236,161,53,0.2)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--debt-high)', marginBottom: '3px' }}>{c.files.length} files co-change without imports</div>
                  {c.files.slice(0, 3).map((f) => <div key={f} style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.split('/').pop()}</div>)}
                  {c.files.length > 3 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{c.files.length - 3} more</div>}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
