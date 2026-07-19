// 유효 농장 ID — 목장주 동선 버그 수정 (파일럿 첫 실사용 피드백)
//
// 문제: 유량 입력·TMR 등 농장 단위 입력 화면이 상단 농장 선택(selectedFarmId)에만
// 의존해서, 배정 농장이 1개뿐인 목장주도 "농장을 선택하라"는 빈 화면을 봤다.
// 해결: 선택값이 없으면 계정에 배정된 첫 농장으로 자동 결정 (내 소 화면과 동일 규칙).
// 마스터/관리 역할은 배정이 없으므로 기존대로 명시 선택이 필요하다.

import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';

export function useEffectiveFarmId(): string | null {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const farmIds = useAuthStore((s) => s.user?.farmIds);
  return selectedFarmId ?? farmIds?.[0] ?? null;
}
