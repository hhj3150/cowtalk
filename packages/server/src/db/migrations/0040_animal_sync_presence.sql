-- smaXtec 동기화 응답에서 빠진 개체(도태·판매) 추적 — docs/plans/2026-11-smaxtec-removed-animals.md
--
-- smaXtec 은 도태·판매 개체를 계정 개체 목록에서 뺀다. 동기화는 응답에 있는 개체만 갱신해
-- 빠진 개체가 active 로 남았다 (송영신목장: smaXtec 37두 vs CowTalk 48두).
-- 개체 행·이벤트·센서 기록은 삭제하지 않는다 — 상태만 inactive 로, 이력은 animal_status_history.
-- 멱등: IF NOT EXISTS.

ALTER TABLE animals ADD COLUMN IF NOT EXISTS last_seen_in_sync_at timestamptz;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS sync_missing_count integer NOT NULL DEFAULT 0;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS sync_missing_since timestamptz;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS inactive_reason varchar(40);
CREATE INDEX IF NOT EXISTS animals_last_seen_idx ON animals (last_seen_in_sync_at);
