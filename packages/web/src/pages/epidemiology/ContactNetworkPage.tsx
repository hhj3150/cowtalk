// 접촉 네트워크 그래프 페이지
// D3 force-directed 레이아웃 — 노드: 농장, 엣지: 이동 이력
// 노드 색상 = 위험도, 엣지 굵기 = 이동 두수

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { apiGet } from '@web/api/client';
import { useAuthStore } from '@web/stores/auth.store';

// ===========================
// 타입
// ===========================

type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'source';

interface NetworkNode {
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
  readonly headCount: number;
  readonly riskLevel: RiskLevel;
  readonly distanceFromSource: number;
}

interface NetworkEdge {
  readonly fromFarmId: string;
  readonly toFarmId: string;
  readonly transferDate: string;
  readonly animalCount: number;
  readonly direction: 'in' | 'out';
}

interface ContactNetworkData {
  readonly sourceFarmId: string;
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
  readonly riskChain: readonly string[];
  readonly analyzedAt: string;
  readonly period: string;
}

// ===========================
// 위험도 색상
// ===========================

const RISK_COLORS: Record<RiskLevel, string> = {
  source: '#3b82f6',
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
  none: '#94a3b8',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  source: '발원 농장',
  high: '고위험',
  medium: '중위험',
  low: '저위험',
  none: '무관',
};

// ===========================
// D3 그래프 컴포넌트
// ===========================

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  headCount: number;
  riskLevel: RiskLevel;
  distanceFromSource: number;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  animalCount: number;
  direction: 'in' | 'out';
}

function NetworkGraph({
  data,
  onNodeClick,
}: {
  data: ContactNetworkData;
  onNodeClick: (node: NetworkNode | null) => void;
}): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 600;
    const height = svgRef.current.clientHeight || 400;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });
    svg.call(zoom);

    const g = svg.append('g');

    // 노드/링크 데이터
    const nodes: D3Node[] = data.nodes.map((n) => ({
      id: n.farmId,
      label: n.farmName,
      headCount: n.headCount,
      riskLevel: n.riskLevel,
      distanceFromSource: n.distanceFromSource,
    }));

    const links: D3Link[] = data.edges.map((e) => ({
      source: e.fromFarmId,
      target: e.toFarmId,
      animalCount: e.animalCount,
      direction: e.direction,
    }));

    // Force simulation
    const simulation = d3.forceSimulation<D3Node>(nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(links).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius((d) => nodeRadius(d) + 10));

    // 링크
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', (d) => Math.max(1, Math.min(d.animalCount / 10, 8)))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrow)');

    // 화살표 마커
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#94a3b8')
      .attr('d', 'M0,-5L10,0L0,5');

    // 노드
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(d3.drag<SVGGElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as unknown as (sel: d3.Selection<d3.BaseType | SVGGElement, D3Node, SVGGElement, unknown>) => void,
      )
      .on('click', (_, d) => {
        const original = data.nodes.find((n) => n.farmId === d.id);
        onNodeClick(original ?? null);
      });

    node.append('circle')
      .attr('r', (d) => nodeRadius(d))
      .attr('fill', (d) => RISK_COLORS[d.riskLevel])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => nodeRadius(d) + 14)
      .attr('font-size', 10)
      .attr('fill', 'var(--ct-text, #1e293b)')
      .text((d) => d.label.slice(0, 6));

    // 두수 표시
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', 9)
      .attr('fill', '#fff')
      .attr('font-weight', 700)
      .text((d) => d.headCount > 0 ? `${d.headCount}두` : '');

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x ?? 0)
        .attr('y1', (d) => (d.source as D3Node).y ?? 0)
        .attr('x2', (d) => (d.target as D3Node).x ?? 0)
        .attr('y2', (d) => (d.target as D3Node).y ?? 0);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [data, onNodeClick]);

  return <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />;
}

function nodeRadius(d: D3Node): number {
  if (d.riskLevel === 'source') return 22;
  if (d.riskLevel === 'high') return 18;
  if (d.riskLevel === 'medium') return 14;
  return 10;
}

// ===========================
// 메인 페이지
// ===========================

export default function ContactNetworkPage(): React.JSX.Element {
  const farmId = useAuthStore((s) => s.user?.farmIds?.[0]);
  const [data, setData] = useState<ContactNetworkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    if (!farmId) return;
    setLoading(true);
    apiGet<ContactNetworkData>(`/epidemiology/contact-network/${farmId}?days=${days}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [farmId, days]);

  useEffect(() => {
    load();
  }, [farmId]);

  const handleNodeClick = useCallback((node: NetworkNode | null) => {
    setSelectedNode(node);
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--ct-text)' }}>
        🕸️ 접촉 네트워크 분석
      </h1>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', margin: '0 0 20px' }}>
        최근 이동 이력 기반 전파 경로 시각화 — 노드 클릭으로 상세 정보 확인
      </p>

      {/* 컨트롤 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--ct-text-muted)' }}>
          분석 기간:
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 13 }}
          >
            <option value={7}>7일</option>
            <option value={14}>14일</option>
            <option value={30}>30일</option>
            <option value={60}>60일</option>
            <option value={90}>90일</option>
          </select>
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '로딩 중...' : '🔄 분석'}
        </button>

        {/* 범례 */}
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {(Object.entries(RISK_LABELS) as [RiskLevel, string][]).map(([level, label]) => (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: RISK_COLORS[level], display: 'inline-block' }} />
              <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* 그래프 */}
        <div style={{ height: 520, background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ct-text-muted)', fontSize: 13 }}>
              분석 중...
            </div>
          ) : data && data.nodes.length > 0 ? (
            <NetworkGraph data={data} onNodeClick={handleNodeClick} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <div style={{ fontSize: 40 }}>🕸️</div>
              <div style={{ fontSize: 13, color: 'var(--ct-text-muted)' }}>
                이 기간 내 이동 이력이 없습니다
              </div>
              <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                분석 기간을 늘리거나 농장 간 이동 데이터를 등록하세요
              </div>
            </div>
          )}
        </div>

        {/* 사이드 패널 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 선택 노드 상세 */}
          {selectedNode ? (
            <div style={{
              background: 'var(--ct-card)',
              border: `2px solid ${RISK_COLORS[selectedNode.riskLevel]}`,
              borderRadius: 12, padding: 16,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>{selectedNode.farmName}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InfoRow label="위험도" value={RISK_LABELS[selectedNode.riskLevel]} color={RISK_COLORS[selectedNode.riskLevel]} />
                <InfoRow label="두수" value={`${selectedNode.headCount.toLocaleString()}두`} />
                <InfoRow label="발원지 거리" value={`${selectedNode.distanceFromSource} hop`} />
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                style={{ marginTop: 12, width: '100%', padding: '6px', borderRadius: 6, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text-muted)', cursor: 'pointer', fontSize: 12 }}
              >
                닫기
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>
              노드를 클릭하면<br />상세 정보가 표시됩니다
            </div>
          )}

          {/* 요약 통계 */}
          {data && (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>네트워크 요약</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <InfoRow label="농장 수" value={`${data.nodes.length}개`} />
                <InfoRow label="이동 경로" value={`${data.edges.length}건`} />
                <InfoRow label="고위험 농장" value={`${data.nodes.filter((n) => n.riskLevel === 'high').length}개`} />
                <InfoRow label="분석 기간" value={data.period} />
              </div>
            </div>
          )}

          {/* 위험 경로 */}
          {data && data.riskChain.length > 1 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px', color: '#ef4444' }}>⚠️ 위험 전파 경로</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.riskChain.map((fId, idx) => {
                  const node = data.nodes.find((n) => n.farmId === fId);
                  return (
                    <div key={fId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <span style={{ color: RISK_COLORS[node?.riskLevel ?? 'none'], fontWeight: 700 }}>
                        {idx === 0 ? '🔴' : `${idx}.`}
                      </span>
                      <span style={{ color: 'var(--ct-text)' }}>{node?.farmName ?? fId.slice(0, 8)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--ct-border)' }}>
      <span style={{ color: 'var(--ct-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color ?? 'var(--ct-text)' }}>{value}</span>
    </div>
  );
}
