// 온톨로지 그래프 조립 코어 테스트 — 중복 제거·고아 엣지 제거

import { describe, it, expect } from 'vitest';
import { assembleGraph } from './graph-resolver.service.js';
import type { OntologyNode, OntologyEdge } from '@cowtalk/shared';

function node(id: string, type: OntologyNode['type'] = 'animal'): OntologyNode {
  return { id, type, label: id, props: {} };
}

describe('assembleGraph', () => {
  it('중복 노드는 첫 항목만 유지한다', () => {
    const g = assembleGraph(
      'animal:a1',
      [node('animal:a1'), node('animal:a1'), node('farm:f1', 'farm')],
      [],
      90,
    );
    expect(g.nodes).toHaveLength(2);
  });

  it('중복 엣지는 1개만 유지한다', () => {
    const edges: OntologyEdge[] = [
      { from: 'animal:a1', to: 'farm:f1', relation: 'belongs_to' },
      { from: 'animal:a1', to: 'farm:f1', relation: 'belongs_to' },
    ];
    const g = assembleGraph('animal:a1', [node('animal:a1'), node('farm:f1', 'farm')], edges, 90);
    expect(g.edges).toHaveLength(1);
  });

  it('양 끝 노드가 없는 고아 엣지는 제거된다', () => {
    const edges: OntologyEdge[] = [
      { from: 'animal:a1', to: 'farm:f1', relation: 'belongs_to' },
      { from: 'label:x', to: 'sensor_event:없는노드', relation: 'labels' },
    ];
    const g = assembleGraph('animal:a1', [node('animal:a1'), node('farm:f1', 'farm')], edges, 90);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.relation).toBe('belongs_to');
  });

  it('같은 노드쌍이라도 관계가 다르면 별개 엣지로 유지한다', () => {
    const edges: OntologyEdge[] = [
      { from: 'transfer:t1', to: 'farm:f1', relation: 'moved_from' },
      { from: 'transfer:t1', to: 'farm:f1', relation: 'moved_to' },
    ];
    const g = assembleGraph('farm:f1', [node('transfer:t1', 'transfer'), node('farm:f1', 'farm')], edges, 90);
    expect(g.edges).toHaveLength(2);
  });

  it('anchor와 windowDays가 결과에 보존된다', () => {
    const g = assembleGraph('animal:a1', [node('animal:a1')], [], 30);
    expect(g.anchor).toBe('animal:a1');
    expect(g.windowDays).toBe(30);
  });
});
