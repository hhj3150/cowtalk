// 음성 시연 점검 — 강연·시연 10분 전에 여는 화면
//
// 서버 쪽(대화 모델·음성 합성·음성 인식)은 실제로 한 번씩 호출해 확인하고,
// 이 기기 쪽(마이크 권한·브라우저 음성 인식·소리 재생)은 지금 이 브라우저에서 확인한다.
// 강연 모드(스피커가 큰 곳에서 자기 소리에 반응하지 않게)도 여기서 켠다.

import React, { useEffect, useState } from 'react';
import { apiGet, describeColdPathError } from '@web/api/client';
import { speak } from '@web/api/audio.api';
import { readStageMode, writeStageMode } from '@web/lib/voice/stage-mode';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

type Status = 'ok' | 'slow' | 'fail' | 'warn' | 'pending';

interface ServerCheck {
  readonly name: string;
  readonly label: string;
  readonly status: 'ok' | 'slow' | 'fail';
  readonly latencyMs: number;
  readonly detail: string;
}
interface VoiceReadiness {
  readonly ready: boolean;
  readonly checkedAt: string;
  readonly totalMs: number;
  readonly checks: readonly ServerCheck[];
}
interface Row {
  readonly label: string;
  readonly status: Status;
  readonly detail: string;
}

const BADGE: Record<Status, { text: string; cls: string }> = {
  ok: { text: '정상', cls: 'bg-emerald-900/60 text-emerald-300' },
  slow: { text: '느림', cls: 'bg-amber-900/60 text-amber-300' },
  warn: { text: '확인', cls: 'bg-amber-900/60 text-amber-300' },
  fail: { text: '실패', cls: 'bg-red-900/60 text-red-300' },
  pending: { text: '…', cls: 'bg-slate-700 text-slate-300' },
};

const box: React.CSSProperties = { borderColor: 'var(--ct-border)', background: 'var(--ct-card)' };
const muted: React.CSSProperties = { color: 'var(--ct-text-muted)' };

function RowList({ rows }: { readonly rows: readonly Row[] }): React.ReactElement {
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--ct-border)' }}>
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-3 py-2">
          <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${BADGE[r.status].cls}`}>{BADGE[r.status].text}</span>
          <div>
            <div className="text-sm" style={{ color: 'var(--ct-text)' }}>{r.label}</div>
            <div className="text-xs" style={muted}>{r.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function browserBasics(): Row[] {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const ua = navigator.userAgent;
  const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
  const isEdge = /Edg\//.test(ua);
  return [
    {
      label: '보안 연결 (HTTPS)',
      status: window.isSecureContext ? 'ok' : 'fail',
      detail: window.isSecureContext ? '마이크를 쓸 수 있는 연결입니다' : 'HTTPS 주소로 접속해야 마이크를 쓸 수 있습니다',
    },
    {
      label: '브라우저',
      status: isChrome || isEdge ? 'ok' : 'warn',
      detail: isChrome || isEdge ? (isChrome ? 'Chrome' : 'Edge') : 'Chrome 을 권장합니다 (다른 브라우저는 서버 인식으로 동작)',
    },
    {
      label: '브라우저 음성 인식',
      status: w.SpeechRecognition || w.webkitSpeechRecognition ? 'ok' : 'warn',
      detail: w.SpeechRecognition || w.webkitSpeechRecognition
        ? '사용 가능 — 행사장 와이파이가 막으면 자동으로 CowTalk 서버 인식으로 바뀝니다'
        : '없음 — CowTalk 서버 인식으로 동작합니다',
    },
    {
      label: '녹음 (서버 인식용)',
      status: typeof MediaRecorder !== 'undefined' ? 'ok' : 'fail',
      detail: typeof MediaRecorder !== 'undefined' ? '사용 가능' : '이 브라우저는 녹음을 지원하지 않습니다',
    },
  ];
}

export default function VoiceCheckPage(): React.ReactElement {
  const [server, setServer] = useState<VoiceReadiness | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverRunning, setServerRunning] = useState(false);
  const [mic, setMic] = useState<Row>({ label: '마이크 권한', status: 'pending', detail: '아래 "마이크 확인"을 누르세요' });
  const [sound, setSound] = useState<Row>({ label: '소리 재생 (스피커)', status: 'pending', detail: '아래 "소리 시험"을 누르세요 — 화면을 한 번 누른 효과도 있습니다' });
  const [stageMode, setStageMode] = useState<boolean>(() => readStageMode());
  const basics = browserBasics();

  const runServer = async (force: boolean): Promise<void> => {
    setServerRunning(true);
    setServerError(null);
    try {
      setServer(await apiGet<VoiceReadiness>('/health/voice', force ? { force: 1 } : undefined, { timeout: 60_000, noAutoRetry: true }));
    } catch (e) {
      setServerError(describeColdPathError(e));
    } finally {
      setServerRunning(false);
    }
  };

  useEffect(() => { void runServer(false); }, []);

  const checkMic = async (): Promise<void> => {
    setMic({ label: '마이크 권한', status: 'pending', detail: '확인 중…' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const name = track?.label || '기본 마이크';
      for (const t of stream.getTracks()) t.stop();
      setMic({ label: '마이크 권한', status: 'ok', detail: `허용됨 — ${name}. 강연장 마이크를 쓰려면 운영체제 소리 설정에서 입력 장치를 고르세요` });
    } catch (e) {
      const n = (e as { name?: string }).name ?? '';
      setMic({
        label: '마이크 권한',
        status: 'fail',
        detail: n === 'NotAllowedError' ? '차단됨 — 주소창 왼쪽 자물쇠에서 마이크를 허용하세요' : n === 'NotFoundError' ? '마이크를 찾을 수 없습니다' : `실패: ${n || '알 수 없음'}`,
      });
    }
  };

  const checkSound = async (): Promise<void> => {
    setSound({ label: '소리 재생 (스피커)', status: 'pending', detail: '합성·재생 중…' });
    const t0 = performance.now();
    try {
      const { audioBlob } = await speak({ text: '안녕하세요. 카우톡 팅커벨 음성 점검입니다. 잘 들리시나요?', maxChars: 200 });
      const ms = Math.round(performance.now() - t0);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setSound({ label: '소리 재생 (스피커)', status: ms > 4000 ? 'slow' : 'ok', detail: `재생 중 — 합성 ${String(ms)}ms. 소리가 안 들리면 출력 장치·볼륨을 확인하세요` });
    } catch (e) {
      const n = (e as { name?: string; message?: string });
      setSound({ label: '소리 재생 (스피커)', status: 'fail', detail: n.name === 'NotAllowedError' ? '자동 재생 차단 — 화면을 한 번 누른 뒤 다시 시도하세요' : `실패: ${(n.message ?? '').slice(0, 120)}` });
    }
  };

  const serverRows: Row[] = server
    ? server.checks.map((c) => ({ label: c.label, status: c.status, detail: `${String(c.latencyMs)}ms · ${c.detail}` }))
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: 'var(--ct-text)' }}><TitleAccentBar />음성 시연 점검</h1>
        <p className="mt-1 text-sm" style={muted}>강연·시연 10분 전에 여세요. 서버와 이 기기의 음성 경로를 실제로 한 번씩 확인합니다.</p>
      </div>

      <section className="rounded-xl border p-4" style={box}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
            서버 {server && (server.ready ? <span className="ml-2 text-emerald-400">준비됨</span> : <span className="ml-2 text-red-400">문제 있음</span>)}
          </h2>
          <button type="button" disabled={serverRunning} onClick={() => { void runServer(true); }}
            className="rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">
            {serverRunning ? '점검 중…' : '다시 점검'}
          </button>
        </div>
        {serverError && <p role="alert" className="mt-2 text-sm text-red-400">{serverError}</p>}
        {server && <RowList rows={serverRows} />}
        {server && <p className="mt-1 text-[11px]" style={muted}>{new Date(server.checkedAt).toLocaleTimeString('ko-KR')} 점검 · 총 {String(server.totalMs)}ms (1분 안 재점검은 같은 결과를 보여줍니다)</p>}
      </section>

      <section className="rounded-xl border p-4" style={box}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>이 기기</h2>
        <RowList rows={[...basics, mic, sound]} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { void checkMic(); }} className="rounded-md border px-3 py-1 text-xs" style={{ ...box, color: 'var(--ct-text)' }}>마이크 확인</button>
          <button type="button" onClick={() => { void checkSound(); }} className="rounded-md border px-3 py-1 text-xs" style={{ ...box, color: 'var(--ct-text)' }}>소리 시험</button>
        </div>
      </section>

      <section className="rounded-xl border p-4" style={box}>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={stageMode} onChange={(e) => { writeStageMode(e.target.checked); setStageMode(e.target.checked); }} />
          <span>
            <span className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>강연 모드 (스피커가 큰 곳)</span>
            <span className="mt-0.5 block text-xs" style={muted}>
              팅커벨이 말하거나 생각하는 동안에는 "팅커벨"·"그만"을 듣지 않습니다. 스피커 소리가 마이크로 되들어와
              스스로 멈추거나 다시 불리는 일을 막습니다. 답변 도중 멈추려면 화면의 중지 버튼을 누르세요.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border p-4 text-sm" style={{ ...box, color: 'var(--ct-text)' }}>
        <h2 className="mb-2 font-bold">시연 체크리스트</h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs" style={muted}>
          <li>가능하면 행사장 와이파이 대신 유선 또는 휴대폰 핫스팟을 쓰세요.</li>
          <li>Chrome 으로, 시연 직전에 새로 로그인하고 화면을 한 번 누르세요 (소리 재생 허용).</li>
          <li>위 서버 점검이 모두 "정상"이고, "소리 시험"이 스피커로 들리는지 확인하세요.</li>
          <li>강연장 스피커를 쓰면 강연 모드를 켜세요.</li>
          <li>질문은 마이크 버튼을 눌러 하세요 — 호명("팅커벨")보다 확실합니다.</li>
          <li>답변이 길어지면 중지 버튼으로 끊고 다음 질문으로 넘어가세요.</li>
        </ol>
      </section>
    </div>
  );
}
