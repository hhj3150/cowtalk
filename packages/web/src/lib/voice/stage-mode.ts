// 강연 모드 — 스피커가 큰 곳(강연장·행사장)에서 시연할 때
//
// 켜면: 답변을 말하거나 생각하는 동안에는 호명("팅커벨")·중지("그만") 청취를 멈춘다.
// 스피커 소리가 마이크로 되들어와 스스로 끊기거나 다시 호출되는 일을 원천 차단한다.
// 대신 답변 도중 말로 끼어들 수는 없다 — 화면의 중지 버튼을 쓴다.
// 기기(브라우저)별 설정이다. 시연 점검 화면(/settings/voice-check)에서 켜고 끈다.

const KEY = 'cowtalk:tinkerbell:stage-mode';
const EVENT = 'tinkerbell:stage-mode';

export function readStageMode(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function writeStageMode(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 저장 불가 환경 — 이번 화면에서만 적용 */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

/** 변경 구독 — 같은 탭(커스텀 이벤트)과 다른 탭(storage) 모두 */
export function subscribeStageMode(cb: (on: boolean) => void): () => void {
  const onLocal = (e: Event): void => cb(Boolean((e as CustomEvent<boolean>).detail));
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) cb(e.newValue === '1'); };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}

/** 호명 청취기를 켜 둘지 — 강연 모드면 대기(idle) 중에만 */
export function shouldWakeListen(p: {
  readonly alwaysOpen: boolean;
  readonly wakeEnabled: boolean;
  readonly stageMode: boolean;
  readonly state: 'idle' | 'listening' | 'thinking' | 'speaking';
}): boolean {
  if (!p.alwaysOpen || !p.wakeEnabled || p.state === 'listening') return false;
  return p.stageMode ? p.state === 'idle' : true;
}
