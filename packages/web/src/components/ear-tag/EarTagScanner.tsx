// 이표 스캔 컴포넌트 — 카메라 촬영 → OCR → 개체 조회 → 프로필 이동

import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  scanEarTag,
  scanEarTagManual,
  fileToBase64,
  type AnimalScanResult,
  type EarTagScanResponse,
} from '@web/api/ear-tag-scan.api';

type ScanState = 'idle' | 'analyzing' | 'result' | 'error';

export function EarTagScanner(): React.JSX.Element {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<EarTagScanResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 미리보기 URL 생성
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setState('analyzing');
    setResult(null);
    setErrorMsg('');

    try {
      const base64 = await fileToBase64(file);
      const response = await scanEarTag(base64, file.type || 'image/jpeg');
      setResult(response);
      setState('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '스캔 중 오류가 발생했습니다');
      setState('error');
    }

    // 입력 리셋 (같은 파일 재선택 가능)
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleManualSearch = useCallback(async () => {
    if (!manualNumber.trim()) return;

    setState('analyzing');
    setResult(null);
    setErrorMsg('');
    setPreviewUrl(null);

    try {
      const response = await scanEarTagManual(manualNumber.trim());
      setResult(response);
      setState('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다');
      setState('error');
    }
  }, [manualNumber]);

  const handleNavigateToAnimal = useCallback((animalId: string) => {
    navigate(`/cow/${animalId}`);
  }, [navigate]);

  const handleReset = useCallback(() => {
    setState('idle');
    setResult(null);
    setErrorMsg('');
    setManualNumber('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  return (
    <div className="flex flex-col items-center gap-6 p-4 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ct-text)' }}>
          🐄 이표 스캔
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
          소의 이표를 촬영하면 개체 정보를 바로 확인합니다
        </p>
      </div>

      {/* 카메라 촬영 영역 */}
      {state === 'idle' && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 w-full rounded-2xl border-2 border-dashed p-10 transition-colors hover:border-emerald-400"
            style={{
              borderColor: 'var(--ct-border)',
              background: 'var(--ct-card)',
              minHeight: 200,
            }}
          >
            <CameraIcon />
            <span className="text-lg font-semibold" style={{ color: 'var(--ct-text)' }}>
              이표 촬영하기
            </span>
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              카메라로 이표를 가까이 촬영해 주세요
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />

          {/* 구분선 */}
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px" style={{ background: 'var(--ct-border)' }} />
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              또는 번호 직접 입력
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--ct-border)' }} />
          </div>

          {/* 수동 입력 */}
          <div className="flex gap-2 w-full">
            <input
              type="text"
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSearch(); }}
              placeholder="이력제번호 또는 관리번호"
              className="flex-1 rounded-xl border px-4 py-3 text-sm"
              style={{
                background: 'var(--ct-card)',
                borderColor: 'var(--ct-border)',
                color: 'var(--ct-text)',
              }}
              aria-label="이표 번호 입력"
            />
            <button
              type="button"
              onClick={handleManualSearch}
              disabled={!manualNumber.trim()}
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              검색
            </button>
          </div>
        </>
      )}

      {/* 분석 중 */}
      {state === 'analyzing' && (
        <div className="flex flex-col items-center gap-4 py-10">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="촬영 이미지"
              className="w-48 h-48 object-cover rounded-2xl border"
              style={{ borderColor: 'var(--ct-border)' }}
            />
          )}
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>
              AI가 이표 번호를 인식하고 있습니다...
            </span>
          </div>
        </div>
      )}

      {/* 결과 */}
      {state === 'result' && result && (
        <div className="w-full flex flex-col gap-4">
          {/* 인식 결과 요약 */}
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)' }}
          >
            {result.recognized.length > 0 && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  {result.confidence === 'high' ? '높은 신뢰도' : result.confidence === 'medium' ? '보통 신뢰도' : result.confidence === 'manual' ? '수동 입력' : '낮은 신뢰도'}
                </span>
              </div>
            )}
            <p className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>
              {result.message}
            </p>
            {result.recognized.length > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
                인식 번호: {result.recognized.join(', ')}
              </p>
            )}
          </div>

          {/* 정확히 매칭된 개체 */}
          {result.animal && (
            <AnimalCard
              animal={result.animal}
              isPrimary
              onNavigate={handleNavigateToAnimal}
            />
          )}

          {/* 후보 개체 목록 */}
          {result.candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium px-1" style={{ color: 'var(--ct-text-secondary)' }}>
                후보 개체 ({result.candidates.length}두)
              </span>
              {result.candidates.map((c) => (
                <AnimalCard
                  key={c.animalId}
                  animal={c}
                  isPrimary={false}
                  onNavigate={handleNavigateToAnimal}
                />
              ))}
            </div>
          )}

          {/* 다시 스캔 */}
          <button
            type="button"
            onClick={handleReset}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-colors"
            style={{
              background: 'var(--ct-card)',
              border: '1px solid var(--ct-border)',
              color: 'var(--ct-text)',
            }}
          >
            다시 스캔하기
          </button>
        </div>
      )}

      {/* 에러 */}
      {state === 'error' && (
        <div className="w-full flex flex-col items-center gap-4 py-6">
          <div className="text-center">
            <p className="text-red-400 text-sm font-medium">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl px-6 py-3 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

// ── 개체 카드 ──

function AnimalCard({
  animal,
  isPrimary,
  onNavigate,
}: {
  readonly animal: AnimalScanResult;
  readonly isPrimary: boolean;
  readonly onNavigate: (id: string) => void;
}): React.JSX.Element {
  const statusLabels: Record<string, string> = {
    active: '정상',
    sick: '질병',
    dry: '건유',
    pregnant: '임신',
    heifer: '육성우',
    culled: '도태',
  };

  const statusColors: Record<string, string> = {
    active: '#10b981',
    sick: '#ef4444',
    dry: '#8b5cf6',
    pregnant: '#3b82f6',
    heifer: '#f59e0b',
    culled: '#6b7280',
  };

  return (
    <button
      type="button"
      onClick={() => onNavigate(animal.animalId)}
      className="w-full text-left rounded-xl p-4 transition-all hover:scale-[1.01]"
      style={{
        background: 'var(--ct-card)',
        border: isPrimary ? '2px solid #10b981' : '1px solid var(--ct-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isPrimary && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                매칭
              </span>
            )}
            <span className="font-bold text-lg" style={{ color: 'var(--ct-text)' }}>
              {animal.earTag}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            {animal.traceId && <span>이력: {animal.traceId}</span>}
            {animal.name && <span>이름: {animal.name}</span>}
            {animal.farmName && <span>목장: {animal.farmName}</span>}
            {animal.breed && <span>품종: {animal.breed}</span>}
            {animal.birthDate && <span>출생: {animal.birthDate}</span>}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: `${statusColors[animal.status] ?? '#6b7280'}20`,
              color: statusColors[animal.status] ?? '#6b7280',
            }}
          >
            {statusLabels[animal.status] ?? animal.status}
          </span>
          <span className="text-lg" style={{ color: 'var(--ct-text-secondary)' }}>→</span>
        </div>
      </div>
    </button>
  );
}

// ── 아이콘 ──

function CameraIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function Spinner(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M12 2a10 10 0 019.95 9" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
