import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getComponentColor } from '../../lib/formatters';

interface ComponentScore {
  raw_score: number;
  weight: number;
  contribution: number;
}

interface Props {
  components: Record<string, ComponentScore>;
  size?: number;
}

const COMPONENT_KEYS = [
  'churn_rate', 'code_smell_density', 'coupling_index', 'change_coupling',
  'test_coverage_gap', 'knowledge_concentration', 'cyclomatic_complexity', 'decision_staleness',
];

export const ScoreRing: React.FC<Props> = ({ components, size = 52 }) => {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const r = size / 2;
    const inner = r * 0.55;
    const g = svg.append('g').attr('transform', `translate(${r},${r})`);

    const total = COMPONENT_KEYS.reduce((s, k) => s + (components[k]?.contribution ?? 0), 0);
    if (total === 0) return;

    const arcs = COMPONENT_KEYS.map((key) => ({
      key,
      value: (components[key]?.contribution ?? 0) / total,
    })).filter((d) => d.value > 0);

    const pie = d3.pie<{ key: string; value: number }>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.03);

    const arc = d3.arc<d3.PieArcDatum<{ key: string; value: number }>>()
      .innerRadius(inner)
      .outerRadius(r - 1);

    const hoverArc = d3.arc<d3.PieArcDatum<{ key: string; value: number }>>()
      .innerRadius(inner)
      .outerRadius(r + 2);

    g.selectAll('path')
      .data(pie(arcs))
      .join('path')
      .attr('d', arc)
      .attr('fill', (d) => getComponentColor(d.data.key))
      .attr('fill-opacity', 0.85)
      .style('cursor', 'pointer')
      .on('mouseenter', function (_, d) {
        d3.select(this).transition().duration(150).attr('d', hoverArc(d) ?? '').attr('fill-opacity', 1);
      })
      .on('mouseleave', function (_, d) {
        d3.select(this).transition().duration(150).attr('d', arc(d) ?? '').attr('fill-opacity', 0.85);
      });

    // Center score
    const score = COMPONENT_KEYS.reduce((s, k) => s + (components[k]?.contribution ?? 0), 0);
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', Math.max(9, size / 5) + 'px')
      .attr('font-weight', '700')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', scoreColor(score))
      .text(Math.round(score));
  }, [components, size]);

  return <svg ref={ref} width={size} height={size} style={{ flexShrink: 0 }} />;
};

function scoreColor(score: number): string {
  if (score < 40) return 'var(--debt-low)';
  if (score < 65) return 'var(--debt-medium)';
  if (score < 80) return 'var(--debt-high)';
  return 'var(--debt-critical)';
}
