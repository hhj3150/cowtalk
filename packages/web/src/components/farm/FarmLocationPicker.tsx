// 목장 위치 선택기 — 주소 지오코딩 + 지도 클릭 미세조정
// "주소로 좌표 찾기" → 후보 선택 → 지도에서 클릭/마커 확인으로 필지 단위 확정

import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress, reverseGeocode, type GeocodeCandidate } from '@web/api/farm-management.api';

interface Props {
  readonly address: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly onChange: (lat: number, lng: number) => void;
  /** GPS 등록 시 역지오코딩된 주소 제안 (주소칸 자동 채움용) */
  readonly onAddressSuggest?: (address: string) => void;
}

const KOREA_CENTER: [number, number] = [36.5, 127.8];
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** 지도 클릭 → 좌표 반영 */
function ClickHandler({ onPick }: { readonly onPick: (lat: number, lng: number) => void }): null {
  useMapEvents({
    click: (e) => {
      onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

/** 좌표 변경 시 지도 이동 */
function Recenter({ lat, lng }: { readonly lat: number; readonly lng: number }): null {
  const map = useMap();
  React.useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 14));
  }, [map, lat, lng]);
  return null;
}

export function FarmLocationPicker({ address, lat, lng, onChange, onAddressSuggest }: Props): React.JSX.Element {
  const [candidates, setCandidates] = useState<readonly GeocodeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsInfo, setGpsInfo] = useState<string | null>(null);
  const [suggestedAddress, setSuggestedAddress] = useState<string | null>(null);

  const hasPosition = lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng);

  const handleSearch = useCallback(async () => {
    const query = address.trim();
    if (query.length < 3) {
      setSearchError('먼저 주소를 입력하세요 (3자 이상)');
      return;
    }
    setSearching(true);
    setSearchError(null);
    setCandidates([]);
    try {
      const results = await geocodeAddress(query);
      if (results.length === 0) {
        setSearchError('좌표를 찾지 못했습니다 — 지도를 클릭해 직접 위치를 지정하세요');
      } else if (results.length === 1) {
        onChange(results[0]!.lat, results[0]!.lng);
      } else {
        setCandidates(results);
      }
    } catch {
      setSearchError('지오코딩 실패 — 지도를 클릭해 직접 위치를 지정하세요');
    } finally {
      setSearching(false);
    }
  }, [address, onChange]);

  const pickCandidate = useCallback((c: GeocodeCandidate) => {
    onChange(c.lat, c.lng);
    setCandidates([]);
  }, [onChange]);

  // 현장 등록 — 스마트폰 GPS로 "지금 서 있는 곳"을 목장 위치로. 주소도 자동 제안.
  const handleUseCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setSearchError('이 기기/브라우저는 위치 정보를 지원하지 않습니다');
      return;
    }
    setLocating(true);
    setSearchError(null);
    setGpsInfo(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const plat = Number(pos.coords.latitude.toFixed(6));
        const plng = Number(pos.coords.longitude.toFixed(6));
        onChange(plat, plng);
        setGpsInfo(`GPS 정확도 ±${String(Math.round(pos.coords.accuracy))}m`);
        setLocating(false);
        // 좌표 → 주소 자동 제안 (실패해도 좌표 등록은 유지)
        reverseGeocode(plat, plng)
          .then((addr) => { if (addr) setSuggestedAddress(addr); })
          .catch(() => { /* 비치명적 */ });
      },
      (err) => {
        setLocating(false);
        const msg = err.code === err.PERMISSION_DENIED
          ? '위치 권한이 거부되었습니다 — 브라우저 설정에서 위치 접근을 허용해주세요'
          : err.code === err.TIMEOUT
            ? '위치 확인 시간 초과 — 하늘이 보이는 곳에서 다시 시도해주세요'
            : '위치를 가져오지 못했습니다';
        setSearchError(msg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          {locating ? '위치 확인 중...' : '📱 현재 위치로 등록 (GPS)'}
        </button>
        <button
          type="button"
          onClick={() => { void handleSearch(); }}
          disabled={searching}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
        >
          {searching ? '검색 중...' : '📍 주소로 좌표 찾기'}
        </button>
        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {hasPosition
            ? `위도 ${lat!.toFixed(6)} · 경도 ${lng!.toFixed(6)}${gpsInfo ? ` · ${gpsInfo}` : ''}`
            : '좌표 미지정 — 목장에서 GPS 버튼, 또는 주소 검색·지도 클릭'}
        </span>
      </div>

      {searchError && <p className="text-xs text-amber-400">{searchError}</p>}

      {suggestedAddress && (
        <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', color: 'var(--ct-text)' }}
        >
          <span>감지된 주소: <strong>{suggestedAddress}</strong></span>
          {onAddressSuggest && (
            <button
              type="button"
              onClick={() => { onAddressSuggest(suggestedAddress); setSuggestedAddress(null); }}
              className="rounded px-2 py-0.5 font-semibold text-white"
              style={{ background: '#10b981' }}
            >
              주소칸에 넣기
            </button>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <ul className="rounded-lg border divide-y text-xs" style={{ borderColor: 'var(--ct-border)' }}>
          {candidates.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => pickCandidate(c)}
                className="w-full px-3 py-2 text-left hover:opacity-70"
                style={{ color: 'var(--ct-text)' }}
              >
                {c.label}
                <span className="ml-2" style={{ color: 'var(--ct-text-secondary)' }}>
                  ({c.lat.toFixed(5)}, {c.lng.toFixed(5)})
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--ct-border)', height: 260 }}>
        <MapContainer
          center={hasPosition ? [lat!, lng!] : KOREA_CENTER}
          zoom={hasPosition ? 14 : 6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer url={CARTO_DARK} attribution={CARTO_ATTRIBUTION} />
          <ClickHandler onPick={onChange} />
          {hasPosition && (
            <>
              <Recenter lat={lat!} lng={lng!} />
              <CircleMarker
                center={[lat!, lng!]}
                radius={10}
                pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.7 }}
              >
                <Tooltip permanent direction="top" offset={[0, -10]}>목장 위치</Tooltip>
              </CircleMarker>
            </>
          )}
        </MapContainer>
      </div>
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
        지도를 클릭하면 그 지점으로 좌표가 이동합니다 — 축사 지붕 위를 직접 찍어 필지 단위로 확정하세요.
      </p>
    </div>
  );
}
