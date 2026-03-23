# 전염병 조기경보 시스템 구현 계획

## 상태: 진행 중

## 요구사항
146개 목장 7,146두 대상, 지역/지자체/브랜드 단위 전염병 패턴 감지 및 조기 경보 시스템

## Phase 1: 공유 타입 + DB 스키마 — [ ]
- packages/shared/src/types/epidemic.ts (신규)
- packages/shared/src/constants/epidemic-thresholds.ts (신규)
- packages/server/src/db/schema.ts (수정)

## Phase 2: 클러스터 감지 엔진 — [ ]
- packages/server/src/epidemic/geo-utils.ts (신규)
- packages/server/src/epidemic/cluster-detector.ts (신규)
- packages/server/src/epidemic/spread-analyzer.ts (신규)
- packages/server/src/epidemic/cluster-repository.ts (신규)

## Phase 3: AI 해석 + 알림 에스컬레이션 — [ ]
- packages/server/src/ai-brain/prompts/epidemic-prompt.ts (신규)
- packages/server/src/ai-brain/claude-interpreter.ts (수정)
- packages/server/src/ai-brain/alert/epidemic-escalation.ts (신규)

## Phase 4: 스케줄 + 파이프라인 연결 — [ ]
- packages/server/src/epidemic/epidemic-scheduler.ts (신규)
- packages/server/src/pipeline/profile-builder.ts (수정)
- packages/server/src/intelligence-loop/event-processor.ts (수정)

## Phase 5: API 라우트 — [ ]
- packages/server/src/api/routes/epidemic.routes.ts (신규)
- packages/server/src/api/routes/regional.routes.ts (수정)

## Phase 6: 프론트엔드 — 방역 대시보드 — [ ]
- packages/web/src/api/epidemic.api.ts (신규)
- packages/web/src/components/epidemic/EpidemicAlertBanner.tsx (신규)
- packages/web/src/components/epidemic/EpidemicMapWidget.tsx (신규)
- packages/web/src/components/epidemic/ClusterDetailModal.tsx (신규)
- packages/web/src/components/epidemic/SpreadTrendChart.tsx (신규)
- packages/web/src/pages/dashboard/UnifiedDashboard.tsx (수정)

## Phase 7: 테스트 — [ ]
- packages/server/src/epidemic/__tests__/cluster-detector.test.ts (신규)
- packages/server/src/epidemic/__tests__/geo-utils.test.ts (신규)
