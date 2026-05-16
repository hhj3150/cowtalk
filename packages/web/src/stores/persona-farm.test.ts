// 페르소나 시뮬레이션 → 농장 자동 선택 검증 (FLOW-01)

import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePersonaFarmSelection } from './persona-farm';
import { useFarmStore } from './farm.store';
import { useRoleSimulationStore } from './role-simulation.store';

const FARMS = [
  { farmId: 'f1', name: '별빛목장' },
  { farmId: 'f2', name: '해돋이목장' },
];

describe('resolvePersonaFarmSelection (순수 함수)', () => {
  it('farmer + role-change → 첫 농장 select', () => {
    expect(resolvePersonaFarmSelection('farmer', FARMS, null, 'role-change'))
      .toEqual({ kind: 'select', farmId: 'f1' });
  });

  it('veterinarian + role-change → 첫 농장 select (수의사도 단일 농장)', () => {
    expect(resolvePersonaFarmSelection('veterinarian', FARMS, null, 'role-change'))
      .toEqual({ kind: 'select', farmId: 'f1' });
  });

  it('farmer + role-change + farms 비어있음 → keep (변경 안 함)', () => {
    expect(resolvePersonaFarmSelection('farmer', [], null, 'role-change'))
      .toEqual({ kind: 'keep' });
  });

  it('farmer + farms-loaded + selectedFarmId=null → 첫 농장 select', () => {
    expect(resolvePersonaFarmSelection('farmer', FARMS, null, 'farms-loaded'))
      .toEqual({ kind: 'select', farmId: 'f1' });
  });

  it('farmer + farms-loaded + selectedFarmId 이미 있음 → keep (사용자 선택 보존)', () => {
    expect(resolvePersonaFarmSelection('farmer', FARMS, 'f2', 'farms-loaded'))
      .toEqual({ kind: 'keep' });
  });

  it('quarantine_officer → clear (광역 페르소나)', () => {
    expect(resolvePersonaFarmSelection('quarantine_officer', FARMS, 'f1', 'role-change'))
      .toEqual({ kind: 'clear' });
  });

  it('government_admin → clear', () => {
    expect(resolvePersonaFarmSelection('government_admin', FARMS, 'f1', 'role-change'))
      .toEqual({ kind: 'clear' });
  });

  it('null (master 본질 복귀) → clear', () => {
    expect(resolvePersonaFarmSelection(null, FARMS, 'f1', 'role-change'))
      .toEqual({ kind: 'clear' });
  });
});

describe('store 연동 — 페르소나 전환 시 농장 자동 선택', () => {
  beforeEach(() => {
    useFarmStore.setState({ farms: [], selectedFarmId: null, selectedFarmIds: [] });
    useRoleSimulationStore.setState({ simulatedRole: null });
  });

  it('농장 목록 로드 후 farmer 전환 → 첫 농장 자동 선택', () => {
    useFarmStore.getState().setFarms(FARMS);
    useRoleSimulationStore.getState().setSimulatedRole('farmer');
    expect(useFarmStore.getState().selectedFarmId).toBe('f1');
  });

  it('veterinarian 전환 → 첫 농장 자동 선택', () => {
    useFarmStore.getState().setFarms(FARMS);
    useRoleSimulationStore.getState().setSimulatedRole('veterinarian');
    expect(useFarmStore.getState().selectedFarmId).toBe('f1');
  });

  it('quarantine_officer 전환 → 전체(null) 유지', () => {
    useFarmStore.getState().setFarms(FARMS);
    useRoleSimulationStore.getState().setSimulatedRole('quarantine_officer');
    expect(useFarmStore.getState().selectedFarmId).toBeNull();
  });

  it('government_admin 전환 → 전체(null)', () => {
    useFarmStore.getState().setFarms(FARMS);
    useRoleSimulationStore.getState().setSimulatedRole('farmer'); // 먼저 농장 선택
    useRoleSimulationStore.getState().setSimulatedRole('government_admin');
    expect(useFarmStore.getState().selectedFarmId).toBeNull();
  });

  it('master 본질 복귀(clearSimulation) → 전체(null)', () => {
    useFarmStore.getState().setFarms(FARMS);
    useRoleSimulationStore.getState().setSimulatedRole('farmer');
    expect(useFarmStore.getState().selectedFarmId).toBe('f1');
    useRoleSimulationStore.getState().clearSimulation();
    expect(useFarmStore.getState().selectedFarmId).toBeNull();
  });

  it('farmer 전환 시점에 농장 미로드 → 이후 setFarms 가 첫 농장 선택', () => {
    // farms 비어있을 때 farmer 전환 → keep
    useRoleSimulationStore.getState().setSimulatedRole('farmer');
    expect(useFarmStore.getState().selectedFarmId).toBeNull();
    // 농장 목록 로드 → farms-loaded 가 첫 농장 선택
    useFarmStore.getState().setFarms(FARMS);
    expect(useFarmStore.getState().selectedFarmId).toBe('f1');
  });

  it('농장주 컨텍스트에서 setFarms 재호출 — 기존 선택 보존', () => {
    useFarmStore.getState().setFarms(FARMS);
    useRoleSimulationStore.getState().setSimulatedRole('farmer'); // f1 선택
    useFarmStore.getState().selectFarm('f2'); // 사용자가 f2 선택
    useFarmStore.getState().setFarms(FARMS); // 목록 갱신
    expect(useFarmStore.getState().selectedFarmId).toBe('f2'); // 보존
  });
});
