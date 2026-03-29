// 사이드바 — 아이콘 전용 56px, hover 시 200px 확장 + 메뉴명 표시

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@web/stores/auth.store';
import type { Role } from '@cowtalk/shared';

interface MenuItem {
  readonly label: string;
  readonly path: string;
  readonly icon: React.ReactNode;
}

function IconDashboard(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
  );
}

function IconMap(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function IconSettings(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconUsers(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconAi(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function IconServer(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

// 방역관 전용 아이콘들
function IconShield(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconRadar(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function IconBeaker(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15m-6.3-11.896A24.01 24.01 0 0112 3.75a24.01 24.01 0 01-.55.046M12 3.75c-.251.023-.501.05-.75.082M3 14.5l.62.827A.75.75 0 004.24 16h15.52a.75.75 0 00.62-1.173L19.8 15m-15.6 0L4.5 14.5" />
    </svg>
  );
}

function IconChartBar(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}


function IconDatabase(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function IconGlobe(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function IconNetwork(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function IconClipboard(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}

function IconBarn(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V21m0 0h3.375c.621 0 1.125-.504 1.125-1.125V9.75M4.875 21h14.25c.621 0 1.125-.504 1.125-1.125V9.75M12 3l8.25 6.75M12 3L3.75 9.75M12 3v6" />
    </svg>
  );
}

function IconCow(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <ellipse cx="12" cy="13" rx="7" ry="5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10c-1-2-2-4-1-6M19 10c1-2 2-4 1-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18v2M15 18v2" />
    </svg>
  );
}

// 공통 메뉴 — 모든 역할 동일 (simple is best)
const COMMON_MENU: readonly MenuItem[] = [
  { label: '대시보드', path: '/', icon: <IconDashboard /> },
  { label: '내 소', path: '/my-cattle', icon: <IconCow /> },
  { label: '지역 지도', path: '/regional-map', icon: <IconMap /> },
  { label: '알림 설정', path: '/notifications', icon: <IconSettings /> },
];

// 관리자 전용 추가 메뉴
const ADMIN_EXTRA: readonly MenuItem[] = [
  { label: '목장 관리', path: '/farm-management', icon: <IconBarn /> },
  { label: '사용자 관리', path: '/admin/users', icon: <IconUsers /> },
  { label: '시스템 상태', path: '/admin/system', icon: <IconServer /> },
  { label: 'AI 성능', path: '/ai-performance', icon: <IconAi /> },
];

// 방역관 전용 메뉴
const QUARANTINE_MENU: readonly MenuItem[] = [
  { label: '통합 대시보드', path: '/dashboard', icon: <IconDashboard /> },
  { label: '방역 대시보드', path: '/epidemiology/dashboard', icon: <IconShield /> },
  { label: '목장 관리', path: '/farm-management', icon: <IconBarn /> },
  { label: '지역 지도', path: '/regional-map', icon: <IconMap /> },
  { label: '반경 분석', path: '/epidemiology/radius', icon: <IconRadar /> },
  { label: '확산 시뮬레이션', path: '/epidemiology/simulation', icon: <IconBeaker /> },
  { label: '이동 네트워크', path: '/epidemiology/contact-network', icon: <IconNetwork /> },
  { label: '역학 조사', path: '/epidemiology/investigation/new', icon: <IconClipboard /> },
  { label: '조기감지 성과', path: '/epidemiology/metrics', icon: <IconChartBar /> },
  { label: '전국 방역 현황', path: '/epidemiology/national', icon: <IconGlobe /> },
  { label: '방역 사례 DB', path: '/epidemiology/cases', icon: <IconDatabase /> },
  { label: '알림 설정', path: '/notifications', icon: <IconSettings /> },
];

// ── 축산 소식 (정적 — 향후 API/RSS로 교체) ──

const LIVESTOCK_NEWS: readonly { title: string; source: string; date: string; url: string }[] = [
  { title: '럼피스킨병 백신 접종률 98% 달성', source: '농림축산식품부', date: '3.28', url: '#' },
  { title: '올해 한우 송아지 가격 전년 대비 12% 상승', source: '축산신문', date: '3.27', url: '#' },
  { title: '젖소 유량 신기록 — 홀스타인 평균 35L 돌파', source: 'DCIC', date: '3.26', url: '#' },
  { title: 'AI 센서 기반 질병 조기감지 시스템 확산', source: '농촌진흥청', date: '3.25', url: '#' },
  { title: '구제역 청정국 지위 3년 연속 유지', source: 'OIE', date: '3.24', url: '#' },
  { title: '축산 환경규제 강화 — 2027년까지 적용', source: '환경부', date: '3.23', url: '#' },
];

const MENU_BY_ROLE: Record<Role, readonly MenuItem[]> = {
  farmer: COMMON_MENU,
  veterinarian: COMMON_MENU,
  inseminator: COMMON_MENU,
  government_admin: [...COMMON_MENU, ...ADMIN_EXTRA],
  quarantine_officer: QUARANTINE_MENU,
  feed_company: COMMON_MENU,
};

export function Sidebar(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'farmer';
  const items = MENU_BY_ROLE[role];

  return (
    <nav
      className="flex h-full flex-col border-r py-3"
      style={{
        width: 200,
        background: 'var(--ct-card)',
        borderColor: 'var(--ct-border)',
      }}
    >
      {/* 로고 */}
      <div className="mb-4 flex items-center gap-2.5 px-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ background: 'var(--ct-primary)' }}
        >
          CT
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ct-text)' }}>CowTalk</span>
      </div>

      {/* 메뉴 */}
      <div className="flex flex-col gap-0.5 px-2" style={{ flex: '0 0 auto' }}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-all text-xs ${
                isActive ? 'font-semibold' : ''
              }`
            }
            style={({ isActive }) =>
              isActive
                ? { background: 'var(--ct-sidebar-highlight)', color: 'var(--ct-primary)' }
                : { color: 'var(--ct-text-secondary)' }
            }
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* 뉴스/소식 피드 */}
      <div className="flex-1 mt-3 px-2 overflow-y-auto" style={{ minHeight: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ct-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 6px', marginBottom: 4 }}>
          축산 소식
        </div>
        {LIVESTOCK_NEWS.map((news, i) => (
          <a
            key={i}
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg px-2 py-2 transition-colors"
            style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--ct-text-secondary)', textDecoration: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontWeight: 600, color: 'var(--ct-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {news.title}
            </div>
            <div style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>{news.source} · {news.date}</div>
          </a>
        ))}
        <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', textAlign: 'center', padding: '8px 0', borderTop: '1px solid var(--ct-border)', marginTop: 4 }}>
          광고 문의: ad@d2o.kr
        </div>
      </div>

      {/* 하단 데모 링크 */}
      <NavLink
        to="/demo"
        className="mt-1 mx-2 flex h-8 items-center gap-2 rounded-lg px-2.5 transition-colors text-xs"
        style={{ color: 'var(--ct-text-secondary)' }}
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
        <span className="truncate">데모 모드</span>
      </NavLink>
    </nav>
  );
}
