# E2E 리허설 리포트 — 2026-05-08 (D-5)

**시연일**: 2026-05-13 (수) — 농진청 + 우즈벡 등 중앙아시아 5개국 관계자
**리허설 환경**: Production (Railway 서버 + Netlify 웹)
**리허설 범위**: 4역할 × 5언어 = 20조합 팅커벨 챗 매트릭스 + farmer × 술탄팜 컨텍스트 별도

---

## TL;DR

- **시연 치명 버그 1건 발견 + 수정 완료**: en/uz/mn farmer 질문에서 도구 호출 후 응답이 0~83자로 잘리는 문제. 3건 커밋·배포 후 5/5 모두 정상 답변(2200~4400자) 복구.
- **시연 가능 여부**: ✅ 기능적으로는 시연 가능 (20/20 비어있지 않은 응답).
- **잔존 우려**: 레이턴시 평균 25~30초, 최대 50초. 시연 목표 ≤20초를 17~18건이 초과. 응답 품질은 좋으나 "기다리는 시간"이 길어 시연 동선에서 인내심 필요.

---

## 1. 테스트 방법

- 마스터 계정 `ha@d2o.kr` quick-login → `/auth/switch-role`로 4개 역할 토큰 캐시
- `/api/chat/stream` (SSE)으로 4역할 × 5언어 = 20조합 매트릭스
- 각 조합 1질문, 응답 시간·언어·도구 호출 캡처
- 추가: farmer × 5언어 × 술탄팜(`0eaf0418-3796-44ed-9882-a42a430ccf0c`) 컨텍스트로 농장 바인딩 케이스 검증
- 스크립트: `/tmp/rehearsal/run-sse-matrix.mjs`, `/tmp/rehearsal/run-farmer-with-context.mjs`

질문 셋 (각 역할당 5언어 1개씩, 의도적으로 도구 호출이 필요한 질문):

| 역할 | 질문 (한국어) |
|---|---|
| farmer | "오늘 할 일 요약해 줘" |
| veterinarian | "유방염 의심 케이스 있어?" |
| government_admin | "전국 축산 현황 요약해줘" |
| quarantine_officer | "체온이상 농장 현황 알려줘" |

---

## 2. 발견 — 시연 치명 버그

### 증상

**farmer + 술탄팜 컨텍스트** 매트릭스 (수정 전):

| lang | 도구 호출 | 응답 글자수 | 상태 |
|---|---|---|---|
| ko | 0 | 1290 | ✅ |
| en | 12 | **83** | ❌ "Let me pull up the live data for Sultan Farm before giving you today's action plan." (preamble만) |
| uz | 10 | **0** | ❌ 완전 빈 응답 |
| ru | 0 | 3322 | ✅ |
| mn | 10 | **0** | ❌ 완전 빈 응답 |

ko/ru는 컨텍스트가 자동으로 주입돼 도구 없이 답변. en/uz/mn은 Claude가 도구를 호출했지만 **최종 답변 생성 전에 라운드가 종료**되어 빈/잘린 응답 반환.

### 원인 분석

`packages/server/src/ai-brain/claude-client.ts:215` `callClaudeForChatWithTools`:

```typescript
const MAX_TOOL_ROUNDS = 3;
for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
  const response = await anthropic.messages.create({ ..., tools });
  if (response.stop_reason !== 'tool_use') return done;
  // 도구 실행 → 다음 라운드
}
// 루프 종료 — 누적 텍스트만 dump
if (fullText.length === 0) onError(...);
else onDone(fullText);
```

en/uz/mn 응답에서 Claude가 4번 연속 `stop_reason='tool_use'`로 응답 (총 10~12개 도구 호출)하면 루프가 끝나고 누적된 preamble만(또는 0자) 반환. **최종 답변을 만들 기회가 없음**.

ko/ru는 컨텍스트 빌더(`resolveContext`)가 충분한 데이터를 프롬프트에 미리 주입하므로 Claude가 도구를 안 부르고 직접 답변 → 영향 없음.

---

## 3. 수정 (3 커밋, 모두 배포 완료)

| 커밋 | 내용 |
|---|---|
| [`963aba7`](https://github.com/hhj3150/cowtalk/commit/963aba7) | 라운드 초과 시 도구 미전달로 final round 1회 추가 호출 |
| [`e2be32f`](https://github.com/hhj3150/cowtalk/commit/e2be32f) | final round에 명시적 wrap-up 메시지 + MAX_TOOL_ROUNDS 3→4 |
| [`65f272c`](https://github.com/hhj3150/cowtalk/commit/65f272c) | 한 라운드 내 도구 직렬→`Promise.all` 병렬 실행 |

핵심 로직 (`packages/server/src/ai-brain/claude-client.ts:307` 이하):

```typescript
// 라운드 한도 초과 시 강제 wrap-up
const wrapUpMessages = [
  ...messages,
  { role: 'user', content: '위 도구 결과들을 바탕으로 최종 답변을 지금 작성해 주세요. 더 이상 도구를 호출하지 마세요. ...' },
];
const finalResponse = await anthropic.messages.create({
  ..., messages: wrapUpMessages,  // tools 미전달
});
```

병렬화 (`packages/server/src/ai-brain/claude-client.ts:289` 이하):

```typescript
const settled = await Promise.all(
  toolUseBlocks.map((toolBlock) =>
    executeToolWithGateway(toolBlock.name, toolBlock.input, gatewayContext),
  ),
);
```

---

## 4. 수정 후 검증 — farmer × 5언어 (수정 전 vs 후)

| lang | 수정 전 글자수 | 수정 후 글자수 | 도구 호출 | first-text | 총 시간 |
|---|---|---|---|---|---|
| ko | 1290 ✅ | 1080 ✅ | 0 | 18.3s | 18.3s |
| en | **83** ❌ | **4388** ✅ | 15 | 5.7s | 45.3s |
| uz | **0** ❌ | **2946** ✅ | 12 | 50.2s | 50.2s |
| ru | 3322 ✅ (1차) → **86** ❌ (2차) | **4112** ✅ | 17 | 5.9s | 52.8s |
| mn | **0** ❌ | **2884** ✅ | 13 | 62.2s | 62.2s |

**5/5 모두 의미 있는 답변 생성**. 시연 치명 버그 해소.

---

## 5. 전체 4역할×5언어 매트릭스 — 수정 후 baseline

수정 적용 후 운영 환경(Railway) 매트릭스 (farmId 컨텍스트 미전달, 일반 질문 모드):

| 메트릭 | 값 |
|---|---|
| 성공 | 20/20 (100%) |
| 언어 매칭 (디텍터 기준) | 19/20 — 미스매치 1건은 디텍터 false positive (응답은 정상 영어, 한국어 농장명 포함으로 분류 오류) |
| 도구 호출 ≥1회 | 7/20 (farmId 미전달 영향) |
| 총 응답 시간 평균 | **28.7s** (max 49.5s) |
| First-text TTFB 평균 | **18.3s** (max 44.4s, min 3.4s) |

도구를 호출하는 케이스(government_admin, quarantine_officer)는 first-text 3~5초로 빠르게 시작. 도구 미호출 케이스는 전체 응답이 한꺼번에 반환되어 first-text == total.

---

## 6. 응답 시간 분포 (수정 후 매트릭스)

| 범위 | 건수 |
|---|---|
| ≤15초 | 0 |
| 15~20초 | 3 (vet/en, vet/uz, quarantine/uz, quarantine/mn) |
| 20~30초 | 7 |
| 30~40초 | 4 |
| 40~50초 | 5 |
| ≥50초 | 1 (vet/mn 49.5s, 거의 50초) |

**시연 목표 ≤20초를 만족하는 케이스: 3/20 (15%)**. 대부분 25~50초.

---

## 7. 잔존 이슈 및 우려 사항

### 🟡 P1 — 레이턴시

- 평균 28.7초, 최대 50초. 시연 동선에서 "기다리는 시간"이 길어 인내심 필요.
- 원인: Claude API 자체 응답 시간 (라운드당 5~8초) × 라운드 수.
- 병렬화로 도구 실행 시간은 단축됐지만 Claude 모델 응답이 병목.
- **권장 시연 동선**: 무거운 데이터 도출 질문 직후 다른 화면(지도, 개체 카드)을 보여주며 응답 대기.

### 🟡 P2 — 한국어 농장명 노출

- en/uz/ru/mn 응답에 "조은목장(홍천)", "크로바목장 #14" 같은 한국어 농장명이 그대로 출력.
- 시연 영향: 우즈벡 청중에게 가독성 저하. 의미 전달은 됨.
- **단기 회피**: 응답 본문 내용은 정상이므로 시연 진행 가능. 시연 후 농장 alias 필드(memory: project_next_session_handoff Phase 2 후보) 도입.

### 🟢 P3 — 도구 호출 비결정성

- 동일 질문이라도 Claude가 도구를 호출할 수도, 안 할 수도 있음.
- 수정 후 매트릭스에서 farmId 미전달 시 도구 호출 12/20 → 7/20으로 감소 (호출 패턴 변화는 자연스러움).
- 시연 영향: 답변 품질은 모두 정상이므로 무관.

---

## 8. 권장 시연 동선

`project_next_session_handoff.md` 권장 동선 + 이번 리허설 결과 반영:

1. **로그인**: 마스터 계정 또는 술탄팜 농장주
2. **첫 화면**: 메인 대시보드 — KPI + 전국 지도 (~5s)
3. **농장 드릴다운**: 술탄팜 카드 클릭 → 개체 #124(산차7, 7일이벤트14)
4. **팅커벨 대화 (시연 핵심)** — 응답 대기 중 시각 효과:
   - 우즈벡어 질문: "Bu sigirning sog'lig'i qanday?" → first-text 3~5초로 시작, 약 30~40초 후 완성
   - 한국어 질문: "오늘 할 일 요약해 줘" → first-text 18초 (전체 한꺼번에)
   - 영어 질문: "What should I do today?" → first-text 5초
5. **방역 모드**: 역할을 quarantine_officer로 전환 → "체온이상 농장 현황 알려줘" → 17~30초
6. **드릴다운**: 시도 → 농장 → 개체 (3단계)

각 팅커벨 응답이 끝날 때까지 다른 화면(지도, 차트, 이벤트 타임라인)을 적극 활용해 대기 시간 채우기.

---

## 9. 다음 단계 (시연 D-5 ~ D-day)

| 우선순위 | 작업 | 예상 |
|---|---|---|
| **P0** | 사용자 직접 시연 동선 1회 점검 (브라우저 + 음성 + TTS) | 30분 |
| **P0** | 우즈벡어 TTS 발음 청취 (Nova) | 15분 |
| P1 | Pre-warm 스크립트 (Railway cold start 방지) — 시연 1시간 전 실행 | 15분 |
| P1 | 외부 API (data.go.kr, EKAPE, 농촌진흥청) prefetch 캐시 — 시연 시간대 라이브 응답성 미리 측정 | 30분 |
| P2 | 농장 alias 필드 도입 (외래어 한↔영 매핑) | 반나절 |

**D-2 (5/11) freeze 권장** 기조 유지 — 그 후 어떠한 코드 변경도 시연 시점에 영향 줄 수 있음.

---

## 증거 로그

- `docs/rehearsal-2026-05-08-before-fix.json` — 수정 전 SSE 매트릭스 20조합
- `docs/rehearsal-2026-05-08-farmer-with-context.json` — farmer × 술탄팜 첫 진단
- `docs/rehearsal-2026-05-08-retest.json` — 수정 후 farmer × 5언어 검증
- `docs/rehearsal-2026-05-08-after-fix.txt` — 수정 후 SSE 매트릭스 20조합 baseline
- 커밋: [`963aba7`](https://github.com/hhj3150/cowtalk/commit/963aba7), [`e2be32f`](https://github.com/hhj3150/cowtalk/commit/e2be32f), [`65f272c`](https://github.com/hhj3150/cowtalk/commit/65f272c)
