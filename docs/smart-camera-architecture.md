# CowTalk 지능형 카메라 연동 아키텍처

> 작성일: 2026-04-15
> 비전: 하현제 수의사 (D2O Corp 대표)
> 목적: 센서 알람 → AI 판단 → 카메라 직접 관찰 — 원격 진료 완결

---

## 1. 비전

### 1.1 현재의 한계

```
전통적 진료 흐름:
  축주가 이상 발견 → 수의사 전화 → 문진 → 왕진 결정 → 현장 방문
  → 히스토리 파악 → 체온/청진/촉진/직장검사 → 진단 → 치료 → 예후 관찰

문제:
  1. 수의사가 직접 가야만 소를 볼 수 있음
  2. 방역 시 외부 접촉 최소화 원칙과 충돌
  3. 해외 목장(우즈벡)은 방문 자체가 불가능
  4. 야간 발정, 분만 임박 — 사람이 없는 시간에 관찰 불가
```

### 1.2 CowTalk + 카메라의 완결형

```
CowTalk 완결형 진료 흐름:
  센서 → AI 알람 → 카메라 자동 추적 → 수의사 원격 관찰
  → AI + 수의사 공동 판단 → 치료 지시 → 센서 예후 모니터링

해결하는 것:
  1. 대한민국에서 우즈벡 소를 본다
  2. 경기도 방역관이 안성 칠사목장 소를 현장 가지 않고 관찰
  3. 야간 발정·분만 — 카메라가 24시간 모니터링
  4. 방역 원칙(접촉 최소화) 완벽 준수
```

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  위내센서    │────→│  CowTalk AI  │────→│  지능형 카메라   │
│ (bolus)     │     │  (서버)      │     │  (축사 내 설치)  │
│ 체온/반추   │     │              │     │                 │
│ /활동       │     │  알람 발생   │     │  PTZ 자동 추적   │
└─────────────┘     │  개체 특정   │     │  개체 인식(AI)   │
                    │  행동 지시   │     │  실시간 스트리밍  │
                    └──────┬───────┘     └────────┬────────┘
                           │                      │
                    ┌──────┴──────────────────────┴──────┐
                    │         CowTalk 웹/앱              │
                    │                                    │
                    │  알람 카드 → [📹 실시간 보기] 버튼  │
                    │  → PTZ 카메라가 해당 소로 이동      │
                    │  → 수의사가 직접 소의 상태 관찰     │
                    │  → AI 분석 + 수의사 판단 → 치료 지시 │
                    └────────────────────────────────────┘
```

### 2.2 카메라 요구사항

| 항목 | 사양 | 이유 |
|------|------|------|
| **종류** | PTZ (Pan-Tilt-Zoom) | 원격 조작으로 특정 소 추적 |
| **해상도** | 4K (3840×2160) | 유방 부종, BCS, 보행 관찰에 충분한 해상도 |
| **야간** | IR 적외선 | 야간 발정·분만 관찰 필수 |
| **연결** | Wi-Fi 6 / PoE | 축사 환경 안정 연결 |
| **AI** | Edge AI (온디바이스) | 개체 인식을 카메라 자체에서 처리 |
| **프로토콜** | ONVIF / RTSP | 표준 프로토콜로 CowTalk 연동 |
| **내구성** | IP67 방수방진 | 축사 환경 (습도, 분진, 암모니아) |

### 2.3 개체 추적 기술

```
개체 식별 방법 (우선순위):
  1. 이표(귀번호) OCR — 카메라 AI가 귀번호를 읽어 개체 특정
  2. 체형 인식 — 소의 반점/체형 패턴으로 개별 식별 (딥러닝)
  3. 센서 위치 — 볼루스 센서의 활동량 패턴 + 카메라 위치 연동
  4. 목장주 지정 — 수동으로 "이 소가 345번"이라고 태깅

자동 추적 흐름:
  CowTalk 알람 발생 (345번 소 발정)
  → API: "카메라야, 345번 소를 찾아라"
  → 카메라 AI: 귀번호 OCR / 체형 매칭으로 345번 위치 파악
  → PTZ 카메라: 해당 소 방향으로 자동 이동 + 줌
  → 웹/앱: 실시간 스트리밍 시작
```

---

## 3. CowTalk 소프트웨어 연동 설계

### 3.1 데이터 모델

```typescript
// 카메라 등록 정보
interface FarmCamera {
  cameraId: string;
  farmId: string;
  name: string;               // "1동 PTZ카메라", "분만실 카메라"
  location: string;           // "1동 서측", "분만실"
  streamUrl: string;          // rtsp://camera-ip:554/stream
  ptzControlUrl: string;      // http://camera-ip/api/ptz
  aiEnabled: boolean;         // Edge AI 개체 인식 지원
  status: 'online' | 'offline';
}

// 카메라 이벤트 (개체 추적 기록)
interface CameraTrackingEvent {
  trackingId: string;
  cameraId: string;
  animalId: string;
  alarmId: string;            // 트리거한 알람
  requestedAt: Date;
  locatedAt: Date | null;     // 개체 발견 시각
  trackingStatus: 'searching' | 'tracking' | 'lost' | 'completed';
  snapshotUrl: string | null; // 캡처 이미지 URL
  clipUrl: string | null;     // 30초 클립 URL
}
```

### 3.2 API 엔드포인트 (미래 구현용)

```typescript
// 카메라 관리
POST   /api/cameras                  // 카메라 등록
GET    /api/cameras?farmId=          // 농장 카메라 목록
DELETE /api/cameras/:cameraId        // 카메라 삭제

// 개체 추적
POST   /api/cameras/track            // 개체 추적 요청
  body: { animalId, cameraId?, reason: "estrus_alarm" }
GET    /api/cameras/track/:trackingId // 추적 상태 조회
DELETE /api/cameras/track/:trackingId // 추적 중지

// 실시간 스트리밍
GET    /api/cameras/:cameraId/stream  // WebRTC/HLS 스트리밍 URL 반환
POST   /api/cameras/:cameraId/ptz     // PTZ 제어 (pan, tilt, zoom)
POST   /api/cameras/:cameraId/snapshot // 현재 프레임 캡처

// 녹화
GET    /api/cameras/:cameraId/clips?from=&to= // 과거 클립 조회
POST   /api/cameras/:cameraId/clips   // 이벤트 전후 클립 저장
```

### 3.3 알람 → 카메라 자동 연동 흐름

```typescript
// CowTalk 알람 발생 시 자동 카메라 연동
async function onAlarmCreated(alarm: SovereignAlarm): Promise<void> {
  // 1. 해당 농장의 온라인 카메라 조회
  const cameras = await getCameras(alarm.farmId, 'online');
  if (cameras.length === 0) return;  // 카메라 없으면 패스

  // 2. 알람 심각도에 따라 자동 추적 여부 결정
  if (alarm.severity === 'critical' || alarm.severity === 'warning') {
    // 가장 가까운 카메라 선택
    const camera = selectBestCamera(cameras, alarm.animalId);

    // 3. 개체 추적 요청
    const tracking = await requestTracking({
      cameraId: camera.cameraId,
      animalId: alarm.animalId,
      reason: alarm.type,
    });

    // 4. 30초 클립 자동 저장
    await scheduleClipCapture(camera.cameraId, 30);

    // 5. 알람 카드에 [📹 보기] 버튼 추가
    await updateAlarmWithCamera(alarm.alarmId, {
      cameraAvailable: true,
      trackingId: tracking.trackingId,
      streamUrl: camera.streamUrl,
    });
  }
}
```

### 3.4 UI 연동 (프론트엔드)

```
알람 카드 구성 (카메라 연동 후):

┌──────────────────────────────────────────┐
│ 🔴 #345 유방염 의심 (체온 40.2°C)       │
│ 해돋이목장 | DIM 45일 | 3산              │
│                                          │
│ [📹 실시간 보기]  [📋 히스토리]  [💊 치료] │
│                                          │
│ ┌──────────────────────────────────┐     │
│ │  [실시간 카메라 스트림]           │     │
│ │  PTZ 제어: ◀ ▲ ▼ ▶  🔍+  🔍-   │     │
│ │  스냅샷: 📷  녹화: ⏺  클립: 🎬  │     │
│ └──────────────────────────────────┘     │
│                                          │
│ AI 분석: "보행 이상 없음. 유방 좌후 분방  │
│ 부종 의심. 체온+반추 패턴은 임상형 유방염  │
│ 2단계에 해당. CMT 검사 권장."            │
└──────────────────────────────────────────┘
```

---

## 4. 활용 시나리오

### 4.1 수의사 원격 진료

```
시나리오: 하원장님이 서울에서 해돋이목장(포천) 345번 소 진료

1. 팅커벨: "345번 소 유방염 의심 (체온 40.2°C, 반추 18% 감소)"
2. 하원장님: [📹 실시간 보기] 클릭
3. 카메라: PTZ가 345번 소로 자동 이동, 줌인
4. 하원장님: 유방 부종 육안 확인, 보행 관찰 → "좌후 분방 부종 확인"
5. 팅커벨에 입력: "좌후 분방 임상형 유방염 확인. 세파졸린 유방내 주입 처방."
6. 치료 기록 자동 생성 + 카메라 스냅샷 첨부
7. 다음 날 센서: 체온 하강 + 반추 회복 → "치료 반응 양호"
```

### 4.2 국가 방역 원격 감시

```
시나리오: 경기도 방역관이 안성 칠사목장 집단 발열 감시

1. CowTalk: "칠사목장 — 12두 동시 발열 (38~40°C), 클러스터 경고"
2. 방역관: 칠사목장 카메라 접속 (방문 없이)
3. 카메라: 축사 전체 조망 → 발열 개체 자동 하이라이트
4. 관찰: "기침·콧물 확인 안됨, 보행 정상" → "구제역 가능성 낮음, 일반 열성 질환"
5. 결정: "이동 제한 불필요, 개체별 치료 진행"

대안: 카메라 없었다면?
  → 방역관이 직접 방문 → 외부 접촉 발생 → 방역 원칙 위반
  → 또는 축주 말만 믿고 판단 → 오판 위험
```

### 4.3 해외 원격 관리 (우즈벡)

```
시나리오: 서울에서 우즈벡 술탄목장 관리

1. CowTalk: "술탄목장 — 전체 우군 반추 저하 (3일 연속)"
2. 하원장님: 카메라 접속 → 사료 급여 상태 직접 확인
3. 관찰: "사료 잔량 과다, TMR 혼합 불균일" → 사양 관리 문제 특정
4. 팅커벨을 통해 현지 관리자에게 지시: "TMR 재혼합, 조사료 비율 확인"
```

---

## 5. 기술 구현 로드맵

### Phase 1: 소프트웨어 준비 (카메라 없이)
- [ ] CowTalk DB에 farm_cameras, camera_tracking_events 테이블 추가
- [ ] 카메라 등록/관리 API
- [ ] 알람 카드에 [📹 보기] 버튼 UI (카메라 없으면 비활성)
- [ ] WebRTC/HLS 스트리밍 프록시 서버 구조

### Phase 2: 카메라 연동 (1개 목장 PoC)
- [ ] 해돋이목장에 PTZ 카메라 1대 설치
- [ ] ONVIF/RTSP 연동 테스트
- [ ] 실시간 스트리밍 → 웹 브라우저 재생
- [ ] PTZ 원격 제어 (상하좌우 + 줌)

### Phase 3: AI 개체 추적
- [ ] 이표 OCR 모델 (귀번호 자동 인식)
- [ ] 체형 인식 모델 (소 개체 구분)
- [ ] 알람 → 카메라 자동 추적 연동
- [ ] 이벤트 전후 자동 클립 저장

### Phase 4: 원격 진료 완결
- [ ] 수의사 원격 진료 UI (카메라+센서+AI 통합 화면)
- [ ] 카메라 영상 AI 분석 (보행 이상, 유방 부종, BCS 추정)
- [ ] 진료 기록에 카메라 스냅샷 자동 첨부
- [ ] 다국가 지원 (우즈벡, 경기도 등)

### Phase 5: 국가 방역 통합
- [ ] 방역관 전용 멀티 카메라 뷰 (146농장 전환)
- [ ] 집단 이상 시 해당 농장 카메라 자동 활성화
- [ ] KAHIS 보고 시 카메라 증거 자동 첨부

---

## 6. 카메라 하드웨어 후보

| 제품 | 특징 | 가격대 | 비고 |
|------|------|--------|------|
| Hikvision DS-2DE4225IW | 4K PTZ, 25x 줌, IR 100m | 50~80만원 | ONVIF 지원, 축사 실적 다수 |
| Dahua SD6CE245XA | 4K PTZ, AI 탑재, 45x 줌 | 80~120만원 | Edge AI 내장, 객체 추적 |
| Axis Q6135-LE | 4K PTZ, 광각+줌, IP66 | 200~300만원 | 최고급, ONVIF 완벽, SDK 제공 |
| 자체 개발 | Jetson Nano + PTZ 모듈 | 30~50만원 | AI 모델 자유 탑재, IP 확보 |

**추천**: Phase 2 PoC는 Hikvision 1대로 시작, Phase 3부터 Jetson 기반 자체 개발.

---

## 7. 핵심 가치

```
센서: "345번 소가 이상합니다" (데이터)
AI: "유방염 2단계입니다. CMT 하세요" (판단)
카메라: "여기 보세요, 이 소입니다" (눈)

이 세 가지가 합쳐지면:
  → 수의사가 현장에 가지 않아도 진료 가능
  → 방역관이 농장에 가지 않아도 감시 가능
  → 서울에서 우즈벡 소를 관리 가능
  → 야간/새벽에도 24시간 관찰 가능

하원장님 30년 수의사 경험 + CowTalk AI + 지능형 카메라
= 전지구적 축산 원격 진료 플랫폼
```
