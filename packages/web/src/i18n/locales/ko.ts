// 한국어 사전 — 기준 언어. 키는 도메인.항목 (예: nav.dashboard)

export const ko: Readonly<Record<string, string>> = {
  // 네비게이션 (sidebar-menu id와 1:1)
  'nav.dashboard': '대시보드',
  'nav.my-cows': '내 소',
  'nav.breeding': '번식 커맨드',
  'nav.breeding-cal': '번식 캘린더',
  'nav.vet-cases': '진료 큐',
  'nav.vet-schedule': '왕진 일정',
  'nav.sensor-cmp': '센서 비교',
  'nav.region-map': '지역 지도',
  'nav.epi-dash': '방역 대시보드',
  'nav.automation': '자동화 룰',
  'nav.alerts': '알림 설정',
  'nav.report-sched': '보고서 발송',
  'nav.subscription': '구독 관리',
  'nav.admin-farms': '목장 관리',
  'nav.admin-users': '사용자 관리',
  'nav.admin-system': '시스템 상태',
  'nav.admin-ai': 'AI 성능',

  // 역할
  'role.farmer': '농가주',
  'role.veterinarian': '수의사',
  'role.government_admin': 'MASTER',
  'role.quarantine_officer': '방역관',
  'role.user': '사용자',

  // 결정 큐
  'decision.title': '오늘 해야 할 일',
  'decision.subtitle': 'AI 우선순위 결정 큐',
  'decision.completedLast7d': '최근 7일 조치 완료 {n}건',
  'decision.more': '외 {n}건',
  'decision.empty': '✓ 지금 필요한 조치가 없습니다',
  'decision.emptyDetail': '최근 48시간 판단 기준 — 긴급 신호 없음',
  'decision.checkAnimal': '개체 확인',
  'decision.checkFarm': '농장 확인',

  // 공통
  'common.loading': '로딩 중...',
  'common.language': '언어',
};
