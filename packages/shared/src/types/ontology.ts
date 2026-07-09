// 온톨로지 그래프 — 관계의 단일 조회 계층
//
// Palantir식 원칙: 데이터를 저장하는 것이 아니라 '관계'를 조회 가능하게 만든다.
// CowTalk의 관계는 이미 82개 테이블의 FK로 저장되어 있다 — 이 타입은 그것을
// 그래프(노드+엣지) 형태로 노출하는 표준 계약이다. 별도 그래프 스토어 없음.
//
// 소비처: 결정 카드 원인 체인, 팅커벨 AI(query_animal_graph 도구), 향후 그래프 UI.

export type OntologyNodeType =
  | 'animal'
  | 'farm'
  | 'sensor_event'   // smaXtec 이벤트 (신뢰 원천)
  | 'health_event'   // 진단
  | 'treatment'      // 처치
  | 'breeding_event' // 발정/수정/건유 등
  | 'pregnancy_check'
  | 'calving'
  | 'prediction'     // CowTalk AI 판단 (소버린 등)
  | 'label'          // 전문가/자동 레이블 (정답)
  | 'transfer';      // 개체 이동 (역학 접촉 경로)

export type OntologyRelation =
  | 'belongs_to'      // animal → farm
  | 'detected_on'     // sensor_event → animal
  | 'diagnosed'       // health_event → animal
  | 'treated_with'    // treatment → health_event
  | 'bred'            // breeding_event → animal
  | 'checked'         // pregnancy_check → animal
  | 'calved'          // calving → animal
  | 'predicted_for'   // prediction → animal
  | 'labels'          // label → sensor_event
  | 'moved_from'      // transfer → farm (출발)
  | 'moved_to'        // transfer → farm (도착)
  | 'moves';          // transfer → animal (이동된 개체)

export interface OntologyNode {
  /** 그래프 내 유일 ID — `${type}:${entityId}` */
  readonly id: string;
  readonly type: OntologyNodeType;
  /** 사람이 읽는 요약 (예: "발열 (critical)", "수정 — KPN1234") */
  readonly label: string;
  readonly occurredAt?: string;
  /** 타입별 상세 속성 (엔티티 원본 필드 발췌) */
  readonly props: Readonly<Record<string, unknown>>;
}

export interface OntologyEdge {
  readonly from: string; // node id
  readonly to: string;   // node id
  readonly relation: OntologyRelation;
}

export interface OntologyGraph {
  /** 앵커 노드 ID (예: animal:uuid) */
  readonly anchor: string;
  readonly nodes: readonly OntologyNode[];
  readonly edges: readonly OntologyEdge[];
  /** 조회 창 (일) */
  readonly windowDays: number;
  readonly generatedAt: string;
}
