// 경제 파라미터 카탈로그 — 기본값·단위·허용범위·근거
//
// 기본값은 문헌·고시 기반 보수적 추정치다. 실제 운영에서는 관리 화면에서
// 글로벌/농장별로 수정하며, 모든 경제 환산 결과에는 적용 단가가 노출된다.

import type {
  EconomicParameterDefinition,
  EconomicParameterKey,
} from '../types/economics.js';

export const ECONOMIC_PARAMETER_DEFS: readonly EconomicParameterDefinition[] = [
  {
    key: 'milk_price_krw_per_l',
    labelKo: '원유 단가',
    unit: '원/L',
    defaultValue: 1084,
    min: 100,
    max: 5000,
    basis: '낙농진흥회 고시 원유 기본가격 근사값. 농가별 계약 단가로 교체 권장.',
  },
  {
    key: 'open_day_cost_krw',
    labelKo: '공태 1일 비용',
    unit: '원/일',
    defaultValue: 8000,
    min: 0,
    max: 100000,
    basis: '국내 낙농 문헌의 공태일당 손실(5천~1만원) 중간값 보수 채택.',
  },
  {
    key: 'insemination_cost_krw',
    labelKo: '인공수정 1회 비용',
    unit: '원/회',
    defaultValue: 50000,
    min: 0,
    max: 1000000,
    basis: '정액 스트로 + 수정사 시술료 일반 범위(3~7만원)의 중간값.',
  },
  {
    key: 'mastitis_case_loss_krw',
    labelKo: '유방염 1건 손실',
    unit: '원/건',
    defaultValue: 300000,
    min: 0,
    max: 5000000,
    basis: '치료비 + 폐기유 + 유량 감소 합산 문헌치(30~50만원)의 하한.',
  },
  {
    key: 'ketosis_case_loss_krw',
    labelKo: '케토시스 1건 손실',
    unit: '원/건',
    defaultValue: 200000,
    min: 0,
    max: 5000000,
    basis: '치료비 + 유량 감소 + 번식 지연 문헌 추정치의 보수값.',
  },
  {
    key: 'adult_death_loss_krw',
    labelKo: '성우 폐사 손실',
    unit: '원/두',
    defaultValue: 3000000,
    min: 0,
    max: 50000000,
    basis: '경산우 대체 비용(육성우 구입가 - 도태 잔존가치) 보수 추정.',
  },
  {
    key: 'calf_value_krw',
    labelKo: '송아지 가치',
    unit: '원/두',
    defaultValue: 500000,
    min: 0,
    max: 20000000,
    basis: '젖소 암송아지 시세 기준 보수값. 한우 송아지는 농장별 수정 필요.',
  },
  {
    key: 'treatment_cost_per_case_krw',
    labelKo: '평균 치료비(1건)',
    unit: '원/건',
    defaultValue: 100000,
    min: 0,
    max: 5000000,
    basis: '왕진료 + 약품비 일반 범위의 보수값.',
  },
  {
    key: 'sensor_cost_per_head_krw',
    labelKo: '센서 도입비(두당)',
    unit: '원/두',
    defaultValue: 150000,
    min: 0,
    max: 10000000,
    basis: '위내센서+통신장비 두당 도입비 근사값. 실제 계약 단가로 교체 권장.',
  },
  {
    key: 'labor_hour_cost_krw',
    labelKo: '노동 시간당 비용',
    unit: '원/시간',
    defaultValue: 12000,
    min: 0,
    max: 200000,
    basis: '최저임금 이상 농촌 고용 실질 시급 근사값.',
  },
] as const;

export const ECONOMIC_PARAMETER_MAP: Readonly<
  Record<EconomicParameterKey, EconomicParameterDefinition>
> = Object.fromEntries(ECONOMIC_PARAMETER_DEFS.map((d) => [d.key, d])) as Record<
  EconomicParameterKey,
  EconomicParameterDefinition
>;

export const ECONOMIC_PARAMETER_KEYS: readonly EconomicParameterKey[] =
  ECONOMIC_PARAMETER_DEFS.map((d) => d.key);

export function isEconomicParameterKey(key: string): key is EconomicParameterKey {
  return key in ECONOMIC_PARAMETER_MAP;
}
