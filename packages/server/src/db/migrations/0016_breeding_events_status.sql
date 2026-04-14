-- 0016: breeding_events에 status 컬럼 추가 (발정동기화 프로그램 스케줄링용)
-- completed: 완료 (기존 데이터 기본값)
-- scheduled: 예정됨 (발정동기화 호르몬 투여 일정)
-- cancelled: 취소됨

ALTER TABLE breeding_events ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
CREATE INDEX IF NOT EXISTS breeding_events_status_idx ON breeding_events(status);
