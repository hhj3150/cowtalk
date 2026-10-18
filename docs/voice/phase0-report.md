# 음성형 어시스턴트 전환 — 착수 전 보고 (Phase 0)

> 지시서 §7에 따라 **구현 전** 세 가지를 보고한다.
> (1) 오케스트레이션 프레임워크 선택 근거 (2) STT/TTS 후보 비교 (3) Phase 1 작업 계획
>
> 작성 시점의 코드베이스 감사 결과를 함께 싣는다. **지시서가 전제한 것보다 이미 구현된 것이 많다.**

---

## 0. 먼저 — 지시서와 코드베이스의 차이

### 0-1. 이미 있는 것 (지시서가 "만들자"고 한 것 중 상당수)

| 지시서 항목 | 현재 상태 | 위치 |
|---|---|---|
| STT | **구현됨** — OpenAI Whisper(`whisper-1`), 언어 지정·도메인 프롬프트 힌트 지원 | `services/audio/stt.service.ts` |
| TTS | **구현됨** — OpenAI TTS, LRU 캐시(200건·24h), `maxChars` 절단으로 비용 통제 | `services/audio/tts.service.ts` |
| 음성 API | **구현됨** — `POST /api/audio/speak`, `/api/audio/transcribe` (인증 적용) | `api/routes/audio.routes.ts` |
| 마이크 입력 | **구현됨** — Web Speech API, 권한 사전 감지, 에러 9종 한국어 매핑 | `hooks/useVoiceInput.ts` (257줄) |
| **호출어** | **구현됨** — "팅커벨" 상시 청취, 오인식 변형 6종, 마이크 점유 조정 | `hooks/useWakeWord.ts` (278줄) |
| **끼어들기(중지)** | **부분 구현** — "조용히 해/그만/멈춰/stop" 인터럽트 패턴 | `useWakeWord.ts` |
| 음성 출력 | **구현됨** — voiceMode 토글, 이전 오디오 정리, 자동재생 정책 회피 | `hooks/useVoiceOutput.ts` (203줄) |
| LLM 스트리밍 | **구현됨** — `messages.stream`, `finalMessage()` | `ai-brain/claude-client.ts` |
| **TTFT 계측** | **구현됨** — 요청당 1회 `ttftMs` 로깅 | `claude-client.ts:343-368` |
| **프롬프트 캐싱** | **구현됨** — 시스템 프롬프트 + 도구 배열 마지막에 `cache_control` | `claude-client.ts:49,61` |
| 도구 체계 | **구현됨** — 25개, 역할별 접근제어, 감사 로그 | `ai-brain/tools/` |
| **HITL 승인 게이트** | **구현됨** — `APPROVAL_REQUIRED_BY_ROLE`, 승인 요청 생성 후 `pending_approval` 반환 | `tool-gateway.ts:92-197` |
| 모델 파라미터 분기 | **구현됨** — 세대별 sampling/thinking/effort 판정 한 곳에 집중 | `ai-brain/claude-model-params.ts` |
| 다국어 | **구현됨** — i18n 딕셔너리 + 언어 전환 | `web/src/i18n/` |

> **결론: Phase 1의 "프로토타입"은 사실상 이미 돌아간다.**
> 남은 것은 새로 만드는 일이 아니라 **음성 경로를 1급 인터페이스로 승격시키고, 지연을 예산 안에 넣고,
> 교체 가능한 인터페이스로 정리하는 일**이다. 이 차이가 아래 계획 전체의 성격을 바꾼다.

### 0-2. 지시서와 실제가 다른 부분 (사실 확인)

| 지시서 | 실제 | 대응 |
|---|---|---|
| "Kafka" | **BullMQ + Redis** (Kafka 미사용) | 지시서 표기만 정정. 아키텍처 영향 없음 |
| "ECO-BIT v2.0" | 저장소 명칭은 **CowTalk v5.0** | 명칭 확인 필요 |
| "Estrus Agent MVP" | 해당 명칭 없음. 번식 기능은 `recommend_insemination_window`·`schedule_sync_protocol`·`breeding-pipeline` 등으로 존재 | 대상 모듈 확인 필요 |
| 호출어 "카우톡" | 현재 호출어는 **"팅커벨"** | **결정 필요** — 변경/병행 |
| 도구 7종 (`get_animal_status` 등) | 이름은 없으나 **기능은 대부분 기존 25종에 존재** | 신규 생성 대신 **음성용 얇은 래퍼** 권장 (§4-3) |

### 0-3. 지시서 도구 ↔ 기존 도구 매핑

| 지시서 도구 | 기존 도구 | 비고 |
|---|---|---|
| `get_animal_status` | `query_animal` + `query_sensor_data` | 2개를 하나로 묶는 음성용 요약 래퍼 필요 |
| `list_alerts` | 알림은 도구가 아니라 `alerts` 테이블/라우트로 존재 | **신규 도구 필요** |
| `get_estrus_candidates` | `recommend_insemination_window`, `query_breeding_stats` | 오늘자 목록 형태로 래핑 |
| `get_barn_environment` | `query_weather` (THI·열스트레스 권고 포함) | 명칭만 정리 |
| `propose_action` / `confirm_action` | `tool-gateway`의 승인 게이트가 동일 역할 | **재구현 금지** — 기존 승인 흐름에 음성 확인 단계만 연결 |
| `log_note` | `record_expert_label`, `record_treatment` | 자유 메모용 경량 도구 신규 필요 |

---

## 1. 오케스트레이션 프레임워크 — 선택 근거

### 1-1. 후보 비교

| | **LiveKit Agents** | **Pipecat** | **자체 구현 (기존 스택)** |
|---|---|---|---|
| 언어 | Python + TypeScript | **Python 전용** | **TypeScript** (현 스택) |
| TS 성숙도 | **Python 대비 기능 격차 존재** (보고됨) | 해당 없음 | — |
| 전송 | WebRTC (룸 모델) | 직접 구성 | **HTTP + Socket.IO (이미 있음)** |
| 턴 감지·barge-in | 내장 (adaptive turn detection) | 내장 | **직접 구현 필요** |
| 전화(SIP) | **GA** (Phone Numbers 포함) | 별도 구성 | Twilio 직접 연동 |
| 도입 비용 | WebRTC 인프라 + 배포 경로 신설 | **Python 사이드카 신설** | **0 — 기존 배포에 그대로** |
| 기존 자산 재사용 | 호출어·TTFT·승인 게이트 **재작성** | 동일하게 재작성 | **전부 그대로** |

### 1-2. 결론

> **Phase 1은 프레임워크를 도입하지 않는다. 기존 Express + Socket.IO 위에 음성 레이어를 얹는다.**
> **Phase 2에서 barge-in·연속 턴이 필요해질 때 LiveKit Agents(TS)를 재평가한다.**
> **Phase 3 전화 채널에서는 LiveKit SIP 또는 Twilio를 별도 판단한다.**

근거 넷:

1. **Pipecat은 Python 전용이다.** 저장소 전체가 TypeScript(Express 5 + Vite React)이므로 Python 사이드카를 새로 세워야 한다. 배포·모니터링·타입 공유가 전부 이원화된다. 지시서 §1 "현재 스택을 변경하지 말 것"과 정면으로 부딪힌다.
2. **LiveKit TS SDK는 Python 대비 기능 격차가 보고되어 있다.** TS로 가면 격차를 만나고, Python으로 가면 1번 문제로 돌아온다.
3. **Phase 1이 요구하는 기능을 기존 스택이 이미 만족한다.** push-to-talk에는 턴 감지·barge-in·룸 모델이 필요 없다. 프레임워크가 주는 가치의 대부분이 Phase 1에서는 쓰이지 않는다.
4. **재작성 비용이 크다.** 호출어(278줄)·TTFT 계측·승인 게이트·역할별 도구 접근제어는 모두 검증된 자산이다. 프레임워크에 얹으려면 다시 만들어야 한다.

> ⚠️ **다만 이 판단에는 만료 시점이 있다.** barge-in을 제대로(사용자가 말하기 시작하면 TTS 즉시 중단 + 부분 발화 유지) 구현하려면
> 서버 측 VAD와 전이중(full-duplex) 오디오가 필요하고, 그때는 직접 구현이 프레임워크보다 비싸진다.
> **Phase 2 착수 시점에 재평가하는 것을 계획에 명시**한다.

---

## 2. STT / TTS 후보 비교

### 2-1. STT — 한국어

한국어는 **CER(문자 오류율)**이 WER보다 적합한 지표다. 공개 벤치마크 기준:

| 엔진 | 한국어 CER | 스트리밍 | 용어 사전 | 비고 |
|---|---:|---|---|---|
| **ReturnZero (RTZR/VITO)** | **5.91%** | 지원 | 지원 | 국내 특화, 최상위 정확도 |
| **Naver CLOVA Speech** | **7.52%** | 지원 | 지원 | 국내 특화, 도메인 사전 강점 |
| Deepgram Nova | — | **최저 지연군** | 지원 | 지연 우수, 한국어 CER은 국내 엔진 대비 열세로 알려짐 |
| Google STT (telephony) | — | **최저 지연군** | 지원 | 전화 채널에 강점 |
| **OpenAI Whisper (현행)** | **11.39%** | **미지원(배치)** | 프롬프트 힌트만 | 다국어 폭 넓음. **오류율 약 2배** |

> **가장 중요한 발견 — 현행 Whisper는 한국어 CER이 국내 엔진의 약 2배다.**
> 이 사업의 발화는 **개체번호(4자리 숫자)와 축산 전문용어**가 핵심이다.
> "1877번"을 "1878번"으로 듣는 순간 조회도 기록도 전부 틀린다.
> 지시서 §4가 "개체번호 복창 확인"을 요구한 이유가 이것이고, 복창만으로는 부족하다.

**권고**

- **1차: CLOVA Speech** — 정확도가 국내 상위권이면서 **도메인 용어 사전 등록**이 명확하고, 국내 리전으로 지연이 짧다(데이터 주권 측면도 유리).
- **대안: ReturnZero** — CER이 가장 낮다. 계약 조건·API 성숙도 확인 후 A/B.
- **Whisper는 유지하되 폴백으로 강등** — 다국어(우즈벡어·러시아어) 지원은 Whisper가 유리하므로 **Phase 3 해외 채널의 폴백**으로 남긴다.
- **한국어 성능은 반드시 우리 데이터로 실측한다.** 공개 CER은 일반 음성 기준이며, 축사 소음 + 개체번호 조합은 별개 문제다. Phase 1 산출물에 **자체 벤치마크 세트(개체번호 100건 + 전문용어 100건)**를 포함한다.

### 2-2. TTS — 한국어

| 엔진 | 한국어 품질 | 첫 오디오 지연 | 스트리밍 | 비고 |
|---|---|---|---|---|
| **ElevenLabs (Flash 계열)** | 상 | **최저군** | 지원 | 지연 최우선일 때 |
| **Naver CLOVA Voice** | **상 (한국어 자연스러움 우수)** | 양호 | 지원 | 국내 리전, 한국어 억양 강점 |
| **OpenAI TTS (현행)** | 중상 | 보통 | 문장 단위 | 이미 캐시·절단 최적화 적용됨 |

**권고**

- **1차: CLOVA Voice** — 축산 현장 고령 사용자 대상이라 **명료도와 억양의 자연스러움**이 지연 몇 십 ms보다 중요하다.
- **대안: ElevenLabs Flash** — 지연이 예산을 넘을 때 교체.
- **현행 OpenAI TTS는 폴백으로 유지** — 이미 캐시가 붙어 있어 정형 문구(호출 응답·확인 문구)에는 오히려 유리하다.

### 2-3. 교체 가능하게 만드는 방식

```
voice/providers/
  stt.port.ts     interface SttProvider { transcribeStream(...), transcribe(...) }
  tts.port.ts     interface TtsProvider { synthesizeStream(...), synthesize(...) }
  clova.stt.ts / rtzr.stt.ts / whisper.stt.ts
  clova.tts.ts / elevenlabs.tts.ts / openai.tts.ts
```

환경변수 하나로 전환한다: `VOICE_STT_PROVIDER=clova|rtzr|whisper`, `VOICE_TTS_PROVIDER=clova|elevenlabs|openai`.
이 저장소가 이미 쓰는 방식(`ANTHROPIC_MODEL` 환경변수 교체 → `npm run check:model`)과 같은 패턴이다.

---

## 3. 지연 예산 — 1초 목표에 대한 정직한 분석

### 3-1. 구간별 예산 (사용자 발화 종료 → 첫 음성 출력)

| 구간 | 낙관 | 현실 | 비고 |
|---|---:|---:|---|
| 발화 종료 감지(endpointing) | 150ms | 300ms | 짧게 잡으면 말 끊김, 길게 잡으면 지연 |
| STT 최종 전사 | 100ms | 250ms | 스트리밍 전제. 배치면 +1~2s |
| **LLM 첫 토큰(TTFT)** | **250ms** | **600ms** | 캐시 히트·Haiku 라우팅 시 하한 |
| 첫 문장 완성 | 100ms | 250ms | 문장 경계 도달까지 |
| TTS 첫 오디오 | 80ms | 250ms | Flash 계열 하한 |
| 네트워크 왕복 | 50ms | 150ms | 국내 리전 전제 |
| **합계 (도구 호출 없음)** | **730ms** | **1,800ms** | |

### 3-2. 도구를 호출하면 1초는 달성 불가능하다

도구 호출은 **LLM 왕복이 한 번 더** 발생한다. 최소 +600~1,200ms.
그런데 "1877번 체온" 같은 **가장 흔한 발화가 전부 도구 호출**이다.

**따라서 1초 목표는 "무조건 1초"가 아니라 다음으로 재정의해야 한다:**

> **사용자가 발화를 마친 뒤 1초 안에 "무언가 들린다."**

**대응 3종**

1. **선행 응답(speculative acknowledgment)** — 도구 호출을 시작하는 즉시 정형 문구를 TTS로 내보낸다.
   "1877번 확인하겠습니다" → 이 문구는 **TTS 캐시에 이미 있어 지연이 0에 가깝다**(현행 LRU 캐시 재사용).
   실제 답변은 뒤이어 붙는다. 체감 지연이 1초 안으로 들어온다.
2. **Redis 프리캐시** — 발정 후보·오늘 알림·농장 KPI처럼 **질문이 뻔한 조회**는 5분 주기로 미리 집계해 둔다.
   도구가 DB를 치지 않고 Redis에서 즉답한다.
3. **Haiku 라우팅** — 단순 조회는 `claude-haiku-4-5`로 보낸다. TTFT가 짧고 비용이 1/5이다.
   진단·처치 논의만 `claude-sonnet-5`로 승격한다.

### 3-3. 모델 관련 실무 주의 (현행 코드 확인 결과)

- 저장소 기본값은 `ANTHROPIC_MODEL=claude-sonnet-4-6`, `ANTHROPIC_MODEL_DEEP=claude-opus-4-8`이다.
  지시서가 지정한 **`claude-sonnet-5`로 올리려면 환경변수만 바꾸면 되고**, 파라미터 분기는
  `claude-model-params.ts`가 이미 처리한다(sampling 금지·adaptive thinking·effort 판정).
- **`claude-haiku-4-5`는 `effort`를 지원하지 않고, adaptive thinking도 아니다.** 보내면 400이다.
  `claude-model-params.ts`의 `PRE_EFFORT_LEGACY`/`PRE_ADAPTIVE_LEGACY`가 `haiku-4`를 이미 구형으로 분류하고 있어
  **추가 작업 없이 안전하다.** (라우터 도입 시 이 판정이 실제로 걸리는지 테스트로 고정한다.)
- **프롬프트 캐싱은 최소 프리픽스 길이가 있다**(모델별 512~4096 토큰). 음성용 시스템 프롬프트를 짧게 만들면
  **캐시가 조용히 안 걸린다.** 캐시 히트는 `usage.cache_read_input_tokens`로 매 턴 확인한다.
- 지연 목표상 **effort는 일반 대화에서 `low`**, 진단 대화에서만 `high` 이상으로 올린다.

---

## 4. Phase 1 작업 계획

### 4-1. 범위 (하는 것 / 안 하는 것)

| 하는 것 | 안 하는 것 |
|---|---|
| push-to-talk 음성 왕복을 **1급 화면**으로 (모바일 PWA) | 호출어 상시 청취 (이미 있으나 Phase 1 범위 밖) |
| STT/TTS **포트 인터페이스 분리** + CLOVA 어댑터 추가 | barge-in 전이중 오디오 |
| **음성 전용 시스템 프롬프트**(1~2문장·숫자 우선) 분리 | 전화 채널 |
| 음성용 **도구 래퍼 7종** | 기존 25개 도구 재작성 |
| **턴별 지연 로그** (STT 종료 / 첫 토큰 / 첫 TTS) | 프레임워크 도입 |
| **개체번호 복창 확인 + HITL 음성 확인** 흐름 | 기존 승인 게이트 재구현 |
| 한국어 STT **자체 벤치마크 세트** | |

### 4-2. 산출물 구조

```
packages/server/src/voice/
  system_prompt.md          음성 전용 시스템 프롬프트 (별도 파일, 지시서 §7)
  tools.schema.ts           음성 도구 스키마 (별도 파일)
  tools.ts                  기존 25종 위의 얇은 래퍼
  orchestrator.ts           턴 관리 · 선행응답 · 지연 계측
  latency.ts                턴별 계측 로거
  providers/
    stt.port.ts  tts.port.ts
    clova.stt.ts  whisper.stt.ts
    clova.tts.ts  openai.tts.ts
packages/web/src/voice/
  VoiceConsole.tsx          음성 우선 화면 (화면은 보조)
  useVoiceTurn.ts           녹음 → 전송 → 스트리밍 재생
```

### 4-3. 작업 항목 (순서)

| # | 작업 | 비고 |
|---|---|---|
| 1 | `voice/` 모듈 골격 + STT/TTS 포트 인터페이스 | 기존 서비스는 어댑터로 감싼다 (**삭제하지 않음**) |
| 2 | 지연 계측(`latency.ts`) — 턴별 5개 시점 기록 | **1번보다 먼저 붙여도 좋다.** 측정 없이 최적화 금지 |
| 3 | 음성 전용 시스템 프롬프트 작성 | 1~2문장·숫자 우선·복창 확인·근거 제시 규칙 |
| 4 | 음성 도구 래퍼 7종 | 원시 시계열 반환 금지, 짧은 JSON 요약 |
| 5 | 선행 응답(정형 문구 TTS 캐시) | 체감 지연의 핵심 |
| 6 | `VoiceConsole` 화면 + push-to-talk | 기존 `useVoiceInput`/`useVoiceOutput` 재사용 |
| 7 | CLOVA STT/TTS 어댑터 | 계정·키 확보 후 |
| 8 | 한국어 벤치마크 세트 + Whisper 대비 CER 측정 | **교체 판단의 근거** |
| 9 | HITL 음성 확인 흐름 | 기존 승인 게이트에 확인 발화 단계 연결 |

### 4-4. 완료 판정

- 목장 현장에서 **개체번호 조회 → 답변**이 음성만으로 왕복된다
- 턴별 지연 로그가 남고, **도구 없는 대화 p50 < 1.5초 / 선행응답 첫 소리 < 1초**
- 개체번호 인식 정확도가 **자체 벤치마크에서 측정**되어 있다 (수치가 나쁘면 그것도 결과다)
- 기존 대시보드·AI 엔진 동작에 **회귀 없음** (기존 테스트 통과)

---

## 5. 승인이 필요한 결정 5가지

| # | 결정 | 권고 | 이유 |
|---|---|---|---|
| 1 | **Phase 1 프레임워크 미도입** | 승인 요청 | §1. Phase 2에서 LiveKit 재평가 |
| 2 | **호출어를 "카우톡"으로 변경 / "팅커벨" 유지 / 병행** | **병행** | 기존 사용자 습관 보호 + 신규 브랜드. 패턴 배열에 추가만 하면 됨 |
| 3 | **STT를 CLOVA로 교체** (Whisper는 폴백) | 승인 요청 | 한국어 CER 11.39% → 7.52%. **개체번호 오인식이 이 제품의 급소** |
| 4 | **TTS를 CLOVA Voice로 교체** (OpenAI는 정형문구 폴백) | 승인 요청 | 고령 사용자 명료도 우선 |
| 5 | **`ANTHROPIC_MODEL`을 `claude-sonnet-5`로, 단순조회 라우터에 `claude-haiku-4-5`** | 승인 요청 | 환경변수 변경 + 라우터 신규. 파라미터 분기는 기존 코드가 처리 |

**추가로 확인 부탁드릴 것**

- CLOVA / ReturnZero **계정과 API 키** 확보 가능 여부 (없으면 Phase 1은 Whisper로 진행하고 8번 벤치마크만 먼저 만든다)
- 지시서의 **"ECO-BIT v2.0" / "Estrus Agent MVP"**가 이 저장소의 어느 모듈을 가리키는지
- 우즈베키스탄 현장(Phase 3)의 **주 언어** — 우즈벡어/러시아어 비중에 따라 STT 선택이 달라진다

---

## 6. 하지 않을 것 (지시서 §8 확인)

- 센서 브랜드는 UI·음성에 노출하지 않는다 — 음성 답변에서 "smaXtec"을 발화하지 않도록 시스템 프롬프트에 명시한다
- 기존 대시보드·AI 엔진 코드 구조는 변경하지 않는다 — `voice/`는 **기존 서비스를 호출만** 하고 수정하지 않는다
- 음성만으로 기록·처방이 실행되는 경로는 만들지 않는다 — 기존 `tool-gateway` 승인 게이트를 **우회하지 않고 통과**시킨다
