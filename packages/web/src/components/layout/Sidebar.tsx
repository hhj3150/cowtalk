// 사이드바 — 메뉴는 단일 소스(config/sidebar-menu.ts)에서 산출 (FLOW-02 Step2 / Step2.5)
//
// ⚠️ FLOW-02 Step2.5 노트:
// - 역할 시뮬레이션은 role-simulation.store(휘발성)를 구독한다. localStorage 직접 읽기 금지.
// - master 본질 판정 = user.role === 'government_admin' (Header.tsx 의 isMaster 정의와 일치,
//   auth store 영속 → SSR/하이드레이션 안전). RoleSwitcher 가 user.role 을 더 이상 변경하지
//   않으므로 government_admin 은 master 계정을 안정적으로 식별한다.
// - lucide-react 미설치 → 기존 인라인 SVG 아이콘 컴포넌트로 매핑.

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@web/stores/auth.store';
import { useRoleSimulationStore } from '@web/stores/role-simulation.store';
import { fetchNews } from '@web/api/news.api';
import type { NewsItem, NewsCategory } from '@web/api/news.api';
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

// ── 축산 소식 (API/RSS 연동, 장애 시 정적 폴백) ──

const CATEGORY_LABELS: Record<NewsCategory, { label: string; color: string }> = {
  policy: { label: '정책', color: '#3b82f6' },
  latest: { label: '최신', color: '#22c55e' },
  global: { label: '해외', color: '#a855f7' },
  disease: { label: '전염병', color: '#ef4444' },
  notice: { label: '공지', color: '#f97316' },
};

const FALLBACK_NEWS: readonly NewsItem[] = [
  { title: '럼피스킨병 백신 접종률 98% 달성', source: '농림축산식품부', date: '3.28', url: '#', category: 'disease', pubDate: '' },
  { title: '2026년 축산 직불금 확대 시행', source: '농림축산식품부', date: '3.28', url: '#', category: 'policy', pubDate: '' },
  { title: '올해 한우 송아지 가격 전년 대비 12% 상승', source: '축산신문', date: '3.27', url: '#', category: 'latest', pubDate: '' },
  { title: 'EU, 항생제 사용 50% 감축 로드맵 발표', source: 'EMA', date: '3.27', url: '#', category: 'global', pubDate: '' },
  { title: '젖소 유량 신기록 — 홀스타인 평균 35L 돌파', source: 'DCIC', date: '3.26', url: '#', category: 'latest', pubDate: '' },
  { title: '호주 구제역 의심 사례 발생 — 한국 수입 검역 강화', source: 'OIE', date: '3.26', url: '#', category: 'disease', pubDate: '' },
  { title: 'AI 센서 기반 질병 조기감지 시스템 확산', source: '농촌진흥청', date: '3.25', url: '#', category: 'latest', pubDate: '' },
  { title: '구제역 청정국 지위 3년 연속 유지', source: 'OIE', date: '3.24', url: '#', category: 'global', pubDate: '' },
  { title: '축산 환경규제 강화 — 2027년까지 적용', source: '환경부', date: '3.23', url: '#', category: 'policy', pubDate: '' },
  { title: 'CowTalk v5.0 업데이트 — 번식 AI 루프 추가', source: 'D2O Corp', date: '3.23', url: '#', category: 'notice', pubDate: '' },
];

function useNewsItems(): readonly NewsItem[] {
  const [items, setItems] = useState<readonly NewsItem[]>(FALLBACK_NEWS);

  useEffect(() => {
    let cancelled = false;
    fetchNews()
      .then((data) => { if (!cancelled && data.length > 0) setItems(data); })
      .catch(() => { /* 폴백 유지 */ });
    return () => { cancelled = true; };
  }, []);

  return items;
}

/**
 * 본 계정 역할 + 시뮬레이션 역할 → 메뉴 산출용 MenuRole 결정 (FLOW-02 Step2.5).
 * - master 본질 + 시뮬레이션 안 함 → 'master' (전체 15 메뉴)
 * - master 본질 + 시뮬레이션 중 → 시뮬레이션 역할
 * - 비-master → 본 계정 역할
 */
export function resolveMenuRole(
  userRole: MenuRole | undefined,
  simulatedRole: MenuRole | null,
): MenuRole {
  const isMaster = userRole === 'government_admin';
  if (isMaster) {
    return simulatedRole ?? 'master';
  }
  return userRole ?? 'farmer';
}

export function Sidebar(): React.JSX.Element {
  const userRole = useAuthStore((s) => s.user?.role);
  const simulatedRole = useRoleSimulationStore((s) => s.simulatedRole);
  const menuRole = resolveMenuRole(userRole, simulatedRole);
  const newsItems = useNewsItems();

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

      {/* 뉴스/소식 피드 */}
      <div className="flex-1 mt-3 px-2 overflow-y-auto" style={{ minHeight: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ct-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 6px', marginBottom: 4 }}>
          축산 소식
        </div>
        {newsItems.map((news, i) => {
          const cat = CATEGORY_LABELS[news.category];
          return (
            <a
              key={i}
              href={news.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg px-2 py-1.5 transition-colors"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--ct-text-secondary)', textDecoration: 'none', marginBottom: 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: `${cat.color}20`, color: cat.color, flexShrink: 0 }}>
                  {cat.label}
                </span>
                <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>{news.date}</span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--ct-text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {news.title}
              </div>
              <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginTop: 1 }}>{news.source}</div>
            </a>
          );
        })}
        <div style={{ borderTop: '1px solid var(--ct-border)', marginTop: 6, paddingTop: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', textAlign: 'center', marginBottom: 6 }}>
            광고 문의: ad@d2o.kr
          </div>
        </div>
      </div>

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
