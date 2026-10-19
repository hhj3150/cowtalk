-- OPS-04: 다중 인스턴스·재시작에서 잡 중복 실행과 유료 알림톡 중복 발송 방지
--
-- job_leases: Redis(BullMQ)가 없을 때 in-process 스케줄러가 잡마다 짧은 임대를 잡는다.
--             임대를 잡은 인스턴스만 그 주기를 실행한다.
-- briefing_deliveries: 아침 브리핑 발송 원장. 발송 전에 (농장, KST 날짜)를 먼저 선점한다.
--             예전엔 메모리에만 있어 06~07시 재시작이나 레플리카 2개 이상이면 중복 발송됐다.
-- 기존 데이터 변경 없음 (테이블 신규 생성만).

CREATE TABLE IF NOT EXISTS job_leases (
  name        VARCHAR(100) PRIMARY KEY,
  holder      VARCHAR(100) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS briefing_deliveries (
  farm_id       UUID NOT NULL REFERENCES farms(farm_id),
  briefing_date DATE NOT NULL,
  claimed_by    VARCHAR(100) NOT NULL,
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, briefing_date)
);
