// 사이드바 — 메뉴는 단일 소스(config/sidebar-menu.ts)에서 산출 (FLOW-02 Step2 / 2.5 / 2.6)
//
// ⚠️ FLOW-02 Step2.6 노트:
// - 역할 시뮬레이션은 role-simulation.store(휘발성)를 구독한다. localStorage 직접 읽기 금지.
// - master 본질 판정 = user.role === 'government_admin' AND user.name 에 'Master Admin' 포함.
//   → D2O master(하현제)와 실제 government_admin 행정관(예: 최경기행정)을 구분한다.
//   legacy 오염으로 user.role 이 mutate된 경우는 auth-migration.ts 가 마운트 전 복구.
// - lucide-react 미설치 → 기존 인라인 SVG 아이콘 컴포넌트로 매핑.

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@web/stores/auth.store';
import { useRoleSimulationStore } from '@web/stores/role-simulation.store';
import { getMenuForRole, type MenuRole } from '@web/config/sidebar-menu';

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

function IconShield(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconActivity(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4.5l2.25-6 4.5 12 2.25-6H21" />
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

function IconCalendar(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function IconStethoscope(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 3v6a4.5 4.5 0 009 0V3M5.25 3H3.75M5.25 3h1.5M14.25 3h1.5M14.25 3h-1.5M9.75 13.5v3a4.5 4.5 0 109 0V15m0 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    </svg>
  );
}

function IconBell(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
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

function IconBreeding(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15m-6.3-11.896A24.01 24.01 0 0112 3.75c-.18 0-.358.004-.534.013M12 3.75c-.251.023-.501.05-.75.082M3 14.5l.62.827A.75.75 0 004.24 16h15.52a.75.75 0 00.62-1.173L19.8 15" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v4m-3 0h6" />
    </svg>
  );
}

function IconCard(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

// MenuItem.icon 문자열 → 인라인 SVG 아이콘 매핑.
// (lucide-react 미설치 → 프로젝트 컨벤션인 인라인 SVG 컴포넌트 재사용)
const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <IconDashboard />,
  Cog:             <IconCow />,
  Heart:           <IconBreeding />,
  Calendar:        <IconCalendar />,
  Stethoscope:     <IconStethoscope />,
  CalendarClock:   <IconClipboard />,
  Activity:        <IconActivity />,
  Map:             <IconMap />,
  ShieldAlert:     <IconShield />,
  Bell:            <IconBell />,
  CreditCard:      <IconCard />,
  Building2:       <IconBarn />,
  Users:           <IconUsers />,
  Server:          <IconServer />,
  Brain:           <IconAi />,
};

/**
 * master 본질 + 시뮬레이션 역할 → 메뉴 산출용 MenuRole 결정 (FLOW-02 Step2.6).
 * - master 본질 + 시뮬레이션 안 함(null) → 'master' (전체 15 메뉴)
 * - master 본질 + 시뮬레이션 중 → 시뮬레이션 역할
 * - 비-master → 본 계정 역할
 *
 * master 본질 판정은 호출처(Sidebar)에서 `role==='government_admin' && name.includes('Master Admin')`
 * 로 계산해 boolean 으로 넘긴다 — 실제 government_admin 행정관(예: 최경기행정)과 D2O master 를 구분.
 */
export function resolveMenuRole(
  isMasterEssence: boolean,
  simulatedRole: MenuRole | null,
  userRole: MenuRole | undefined,
): MenuRole {
  if (isMasterEssence && simulatedRole === null) {
    return 'master';
  }
  return (simulatedRole ?? userRole) ?? 'farmer';
}

export function Sidebar(): React.JSX.Element {
  const userRole = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name);
  const simulatedRole = useRoleSimulationStore((s) => s.simulatedRole);

  // master 본질 = government_admin 역할 + name 'Master Admin' 포함 (D2O master 식별).
  // legacy 'cowtalk-master-role' localStorage 키는 더 이상 읽지 않는다.
  const isMasterEssence = userRole === 'government_admin'
    && (userName?.includes('Master Admin') ?? false);
  const menuRole = resolveMenuRole(isMasterEssence, simulatedRole, userRole);

  // 단일 소스(config/sidebar-menu.ts)에서 메뉴 산출.
  let items = getMenuForRole(menuRole);

  // fallback 안전장치 — 예상치 못한 role 로 메뉴가 비면 사이드바 공백 사고 방지.
  if (items.length === 0) {
    console.warn(`[Sidebar] getMenuForRole("${menuRole}") returned empty — 'master' 메뉴로 fallback`);
    items = getMenuForRole('master');
  }

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

      {/* 메뉴 — 단일 소스 기반 */}
      <div className="flex flex-col gap-0.5 px-2" style={{ flex: '0 0 auto' }}>
        {items.map((item, idx) => {
          // group='admin' 첫 항목 앞에 시각적 구분선.
          const prev = idx > 0 ? items[idx - 1] : undefined;
          const showAdminDivider = item.group === 'admin' && prev?.group !== 'admin';
          return (
            <React.Fragment key={item.id}>
              {showAdminDivider && (
                <div
                  style={{
                    borderTop: '1px solid var(--ct-border)',
                    margin: '4px 8px 2px',
                  }}
                />
              )}
              <NavLink
                to={item.href}
                end={item.href === '/'}
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
                {ICON_MAP[item.icon] ?? <IconDashboard />}
                <span className="truncate">{item.label}</span>
              </NavLink>
            </React.Fragment>
          );
        })}
      </div>

      {/* 여백 — 바로가기/데모를 하단에 고정 */}
      <div className="flex-1" style={{ minHeight: 0 }} />

      {/* 바로가기 */}
      <div className="px-2 pb-1" style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ct-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 6px', marginBottom: 3 }}>
          바로가기
        </div>
        {[
          { icon: '🐂', label: 'A2 Jersey Milk', sub: '갈전리 목장', url: 'https://www.a2jerseymilk.com' },
          { icon: '🏛️', label: '농림축산식품부', sub: 'MAFRA', url: 'https://www.mafra.go.kr' },
          { icon: '🌾', label: '농촌진흥청', sub: 'RDA', url: 'https://www.rda.go.kr' },
          { icon: '🔬', label: '축산과학원', sub: 'NIAS', url: 'https://www.nias.go.kr' },
          { icon: '🥛', label: '젖소개량사업소', sub: 'DCIC', url: 'https://www.dcic.co.kr' },
          { icon: '🥩', label: '축산물품질평가원', sub: 'EKAPE', url: 'https://www.ekape.or.kr' },
          { icon: '🧬', label: '종축개량협회', sub: 'KAIA', url: 'https://www.aiak.or.kr' },
        ].map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors"
            style={{ textDecoration: 'none', fontSize: 10, color: 'var(--ct-text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 11, flexShrink: 0 }}>{link.icon}</span>
            <span className="truncate" style={{ fontWeight: 600, color: 'var(--ct-text)' }}>{link.label}</span>
          </a>
        ))}
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
