-- 송영신목장 번식·대시보드 설정 — smaXtec Dashboard settings 화면 실값 (하원장님 제공, 2026-11-01)
--
-- 목장별 설정이 저장·동기화되지 않아 모든 목장이 CowTalk 기본값(건유 90일·장기공태 200일·
-- 임신감정 28일)으로 리마인더를 받고 있었다. 파일럿 목장부터 실값을 '직접 입력'으로 넣는다.
-- manualKeys 에 올라간 키는 smaXtec 동기화가 덮어쓰지 않는다.
--
-- 멱등: 한 번이라도 직접 입력(manualUpdatedAt)이 있으면 건너뜀 — 이후 화면에서 고친 값을
-- 부팅 auto-migrate 재실행이 되돌리지 않는다.

UPDATE farms
SET breeding_settings = breeding_settings || jsonb_build_object(
      'unacknowledgedHealthAlertHours', 48,
      'heatListHours', 36,
      'estrusRecurrenceDays', 20,
      'minBreedingAgeMonths', 12,
      'estrusDetectionAfterDim', 20,
      'inseminationWindowStartHours', 10,
      'inseminationWindowEndHours', 18,
      'pregnancyCheckDays', 40,
      'gestationDays', 280,
      'heatDetectionDuringPregnancy', 0,
      'pregnantHeatIntervalMinDays', 18,
      'pregnantHeatIntervalMaxDays', 26,
      'abortSuspectExcludeDaysBeforeCalving', 60,
      'dryOffBeforeCalvingDays', 60,
      'calvingSoonDays', 14,
      'healthAlertListHours', 36,
      'healthGraphDays', 7,
      'freshCowDim', 30,
      'noHeatDim', 50,
      'longOpenDaysDim', 175,
      'manualKeys', jsonb_build_array(
        'unacknowledgedHealthAlertHours', 'heatListHours', 'estrusRecurrenceDays',
        'minBreedingAgeMonths', 'estrusDetectionAfterDim', 'inseminationWindowStartHours',
        'inseminationWindowEndHours', 'pregnancyCheckDays', 'gestationDays',
        'heatDetectionDuringPregnancy', 'pregnantHeatIntervalMinDays', 'pregnantHeatIntervalMaxDays',
        'abortSuspectExcludeDaysBeforeCalving', 'dryOffBeforeCalvingDays', 'calvingSoonDays',
        'healthAlertListHours', 'healthGraphDays', 'freshCowDim', 'noHeatDim', 'longOpenDaysDim'
      ),
      'manualUpdatedAt', '2026-11-01T00:00:00.000Z',
      'manualUpdatedBy', 'migration-0039'
    ),
    updated_at = NOW()
WHERE name LIKE '%송영신%'
  AND deleted_at IS NULL
  AND NOT (COALESCE(breeding_settings, '{}'::jsonb) ? 'manualUpdatedAt');
