import { describe, it, expect } from 'vitest';
import { cityToProvince, resolveFarmProvince, latLngToProvince } from '../province-mapper.js';

describe('cityToProvince — 주소 시·군명 권위 판별', () => {
  it('경기 남부(좌표상 충남/충북에 흡수되던) 시·군을 정확히 경기로', () => {
    for (const city of ['평택', '안성', '이천', '여주', '화성', '포천', '김포', '파주']) {
      expect(cityToProvince(city)).toBe('경기도');
    }
  });

  it('smaXtec 주소 형태(괄호 안 "시군 + 소유주명")에서도 시군 추출', () => {
    expect(cityToProvince('칠곡 이현우')).toBe('경상북도');
    expect(cityToProvince('포천')).toBe('경기도');
    expect(cityToProvince('평택시')).toBe('경기도');
  });

  it('긴 지명 우선 — "남양주"가 "양주"로 오판되지 않음 (둘 다 경기라 결과 동일하지만 매칭 안정성)', () => {
    expect(cityToProvince('남양주')).toBe('경기도');
  });

  it('각 도 대표 시 매핑', () => {
    expect(cityToProvince('청주')).toBe('충청북도');
    expect(cityToProvince('천안')).toBe('충청남도');
    expect(cityToProvince('전주')).toBe('전라북도');
    expect(cityToProvince('순천')).toBe('전라남도');
    expect(cityToProvince('안동')).toBe('경상북도');
    expect(cityToProvince('진주')).toBe('경상남도');
    expect(cityToProvince('춘천')).toBe('강원특별자치도');
    expect(cityToProvince('서귀포')).toBe('제주특별자치도');
  });

  it('동일 지명(광주·고성)은 매핑 제외 → null (좌표 fallback에 위임)', () => {
    expect(cityToProvince('광주')).toBeNull();
    expect(cityToProvince('고성')).toBeNull();
  });

  it('인식 불가/빈값 → null', () => {
    expect(cityToProvince(null)).toBeNull();
    expect(cityToProvince('')).toBeNull();
    expect(cityToProvince('주소 미등록')).toBeNull();
  });
});

describe('resolveFarmProvince — 통합 우선순위 (region > 주소 > 좌표)', () => {
  it('유효 regionId 시도가 최우선', () => {
    expect(resolveFarmProvince({ regionProvince: '전라남도', address: '평택', lat: 37, lng: 127 }))
      .toBe('전라남도');
  });

  it("'전국' placeholder는 무시하고 주소로", () => {
    expect(resolveFarmProvince({ regionProvince: '전국', address: '평택', lat: 36.5, lng: 127.5 }))
      .toBe('경기도');
  });

  it('regionId 없고 주소로 판별 — 좌표가 충북을 가리켜도 주소(경기)가 우선', () => {
    // 평택 좌표(36.99,127.11)는 경계박스에서 충남에 흡수되던 값
    expect(resolveFarmProvince({ regionProvince: null, address: '평택', lat: 36.99, lng: 127.11 }))
      .toBe('경기도');
  });

  it('주소 인식 불가 → 좌표 fallback', () => {
    const byCoord = latLngToProvince(35.46, 128.21); // 경남 중심
    expect(resolveFarmProvince({ address: '미상', lat: 35.46, lng: 128.21 })).toBe(byCoord);
  });

  it('하드코딩 기본 좌표(36.5,127.5)만 있고 주소 없으면 좌표 fallback(회귀 방지용 명시)', () => {
    // 주소가 없으면 기존 동작 유지 — 새 오류를 만들지 않음
    expect(resolveFarmProvince({ address: null, lat: 36.5, lng: 127.5 }))
      .toBe(latLngToProvince(36.5, 127.5));
  });
});
