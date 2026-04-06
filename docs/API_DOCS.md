# CowTalk v5.0 API Documentation

## Overview

- **Base URL**: `/api`
- **Auth**: JWT Bearer Token (`Authorization: Bearer <token>`)
- **Success Response**: `{ "success": true, "data": T }`
- **Error Response**: `{ "success": false, "error": { "code": string, "message": string } }`

---

## 1. Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | 서버 상태 확인 |

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "5.0.0",
    "timestamp": "2026-03-17T00:00:00.000Z"
  }
}
```

---

## 2. Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | 로그인 (JWT 발급) |
| POST | `/api/auth/register` | No | 회원가입 |
| GET | `/api/auth/me` | Yes | 현재 사용자 정보 |
| POST | `/api/auth/refresh` | No | 토큰 갱신 |
| POST | `/api/auth/logout` | Yes | 로그아웃 |

### POST `/api/auth/login`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**: `{ "success": true, "data": { "accessToken": "...", "refreshToken": "..." } }`

### POST `/api/auth/register`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "홍길동",
  "role": "farmer"
}
```

### POST `/api/auth/refresh`

**Request Body**:
```json
{
  "refreshToken": "..."
}
```

### GET `/api/auth/me`

**Response**: `{ "success": true, "data": { "userId": "...", "email": "...", "name": "...", "role": "farmer" } }`

---

## 3. Farms

All endpoints require authentication + `farm` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/farms` | Yes | 농장 목록 조회 |
| GET | `/api/farms/:farmId` | Yes | 농장 상세 조회 |
| POST | `/api/farms` | Yes | 농장 등록 |
| PATCH | `/api/farms/:farmId` | Yes | 농장 정보 수정 |
| DELETE | `/api/farms/:farmId` | Yes | 농장 삭제 |
| GET | `/api/farms/:farmId/profile` | Yes | 농장 프로필 (두수, 품종, 장비, 인증, 지표) |
| GET | `/api/farms/:farmId/learning` | Yes | 농장 학습 패턴 (AI 피드백 이력, 감지 패턴) |
| GET | `/api/farms/:farmId/similar` | Yes | 유사 농장 목록 (유사도 기반) |
| GET | `/api/farms/:farmId/report-card` | Yes | 분기 리포트카드 (등급, 카테고리별 점수) |

### GET `/api/farms`

**Query Parameters**: `farmQuerySchema` 기반 필터링/페이지네이션

### GET `/api/farms/:farmId/profile`

**Response**:
```json
{
  "success": true,
  "data": {
    "farmId": "f-1",
    "name": "행복목장",
    "ownerName": "김목장",
    "address": "경기도 화성시 봉담읍",
    "capacity": 120,
    "currentHeadCount": 95,
    "breedComposition": { "holstein": 80, "jersey": 10, "hanwoo": 5 },
    "certifications": ["무항생제", "HACCP"],
    "equipment": ["위내센서 볼루스", "TMR 배합기", "자동착유기"],
    "metrics": { "avgMilkYield": 32.5, "avgScc": 180000, "reproductionRate": 42.0 }
  }
}
```

### GET `/api/farms/:farmId/report-card`

**Response**:
```json
{
  "success": true,
  "data": {
    "farmId": "f-1",
    "quarter": "2026-Q1",
    "overallGrade": "A",
    "categories": [
      { "name": "생산성", "grade": "A", "score": 88, "trend": "up" }
    ],
    "highlights": ["유량 전분기 대비 5% 증가"],
    "improvements": ["번식율 개선 필요"]
  }
}
```

---

## 4. Animals

All endpoints require authentication + `animal` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/animals` | Yes | 동물 목록 조회 |
| GET | `/api/animals/:animalId` | Yes | 동물 상세 (역할별 AI 해석 포함) |
| POST | `/api/animals` | Yes | 동물 등록 |
| PATCH | `/api/animals/:animalId` | Yes | 동물 정보 수정 |

### GET `/api/animals`

**Query Parameters**: `animalQuerySchema` 기반 필터링/페이지네이션

### POST `/api/animals`

**Request Body**: `createAnimalSchema` 기반

---

## 5. Sensors

All endpoints require authentication + `sensor` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sensors` | Yes | 센서 데이터 조회 (시계열) |
| GET | `/api/sensors/latest/:animalId` | Yes | 개체별 최신 센서값 |
| GET | `/api/sensors/devices/:animalId` | Yes | 개체별 센서 디바이스 목록 |

### GET `/api/sensors`

**Query Parameters**: `sensorQuerySchema` 기반 (farmId, animalId, from, to, metric)

---

## 6. Predictions

All endpoints require authentication + `prediction` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/predictions` | Yes | AI 예측 목록 (페이지네이션) |
| GET | `/api/predictions/:predictionId` | Yes | 예측 상세 |

---

## 7. Alerts

All endpoints require authentication + `alert` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/alerts` | Yes | 알림 목록 (페이지네이션) |
| GET | `/api/alerts/:alertId` | Yes | 알림 상세 |
| PATCH | `/api/alerts/:alertId/status` | Yes | 알림 상태 변경 (read, dismissed 등) |

---

## 8. Feedback

All endpoints require authentication + `feedback` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/feedback` | Yes | 피드백 목록 (페이지네이션) |
| POST | `/api/feedback` | Yes | 피드백 생성 (AI 예측에 대한 현장 피드백) |

### POST `/api/feedback`

**Request Body**: `createFeedbackSchema` 기반

---

## 9. Dashboard

All endpoints require authentication. 역할에 따라 자동으로 다른 대시보드 반환.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard` | Yes | 역할별 AI 대시보드 |
| GET | `/api/dashboard/kpi` | Yes | KPI 카드 데이터만 |

**Query Parameters**: `farmId`, `regionId`, `tenantId` (역할에 따라 필요한 파라미터 다름)

**지원 역할**: `farmer`, `veterinarian`, `government_admin`, `quarantine_officer`

---

## 10. Chat

All endpoints require authentication. Claude AI 기반 대화.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/chat/message` | Yes | JSON 응답 대화 |
| POST | `/api/chat/stream` | Yes | SSE 스트리밍 대화 |
| GET | `/api/chat/history` | Yes | 대화 이력 |

### POST `/api/chat/message`

**Request Body**:
```json
{
  "question": "1234번 개체 건강 상태는?",
  "farmId": "f-1",
  "animalId": "a-1",
  "conversationHistory": [
    { "role": "user", "content": "이전 질문" },
    { "role": "assistant", "content": "이전 답변" }
  ]
}
```

### POST `/api/chat/stream`

Same request body. Response: `text/event-stream` (SSE).

```
data: {"type":"text","content":"..."}
data: {"type":"done","content":"전체 응답 텍스트"}
data: {"type":"error","content":"에러 메시지"}
```

---

## 11. Regional

All endpoints require authentication + `regional` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/regional/summary` | Yes | 지역 통계 요약 |
| GET | `/api/regional/map` | Yes | 지도 마커 데이터 |
| GET | `/api/regional/:regionId` | Yes | 지역별 AI 분석 (역할별 해석) |

---

## 12. Actions

All endpoints require authentication + `action` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/actions` | Yes | 액션 플랜 목록 |
| GET | `/api/actions/:actionId` | Yes | 액션 상세 |
| PATCH | `/api/actions/:actionId/status` | Yes | 액션 상태 변경 |

---

## 13. Export

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/export` | Yes | 데이터 내보내기 (CSV, Excel 등) |

**Request Body**: `exportSchema` 기반

**Response**: `{ "success": true, "data": { "downloadUrl": "...", "message": "..." } }`

---

## 14. Users

All endpoints require authentication + `user` permission.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Yes | 사용자 목록 |
| GET | `/api/users/:userId` | Yes | 사용자 상세 |
| PATCH | `/api/users/:userId` | Yes | 사용자 정보 수정 |

---

## 15. Search

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/search` | Yes | 통합 검색 |
| GET | `/api/search/autocomplete` | Yes | 자동완성 (최소 2글자) |

### GET `/api/search`

**Query Parameters**:
- `q` (string) - 검색어
- `type` (string, optional) - `animal` | `farm`

**Response**:
```json
{
  "success": true,
  "data": {
    "animals": [{ "type": "animal", "id": "a-1", "label": "002-1234-5678", "subLabel": "목장A" }],
    "farms": [{ "type": "farm", "id": "f-1", "label": "목장A", "subLabel": "경기도 화성시" }],
    "total": 2
  }
}
```

### GET `/api/search/autocomplete`

**Query Parameters**: `q` (string, 최소 2글자)

---

## 16. Prescriptions

All endpoints require authentication. 처방전 생성은 `veterinarian` 역할 전용.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/prescriptions/drugs` | Yes | 약품 카탈로그 |
| POST | `/api/prescriptions` | Yes (수의사) | 처방전 생성 |
| GET | `/api/prescriptions/animal/:animalId` | Yes | 개체별 처방 이력 |
| GET | `/api/prescriptions/:prescriptionId/pdf` | Yes | 처방전 PDF URL |

### POST `/api/prescriptions`

**Request Body**:
```json
{
  "animalId": "a-1",
  "farmId": "f-1",
  "diagnosis": "유방염",
  "items": [
    { "drugId": "d-1", "dosage": "10ml", "frequency": "1일 2회", "durationDays": 5 }
  ],
  "notes": "좌전 분방"
}
```

### GET `/api/prescriptions/drugs`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "drugId": "d-1",
      "name": "페니실린",
      "category": "antibiotic",
      "withdrawalMilkDays": 4,
      "withdrawalMeatDays": 14,
      "unit": "ml"
    }
  ]
}
```

---

## 17. Vaccines

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/vaccines/schedule/:farmId` | Yes | 농장별 백신 스케줄 |
| POST | `/api/vaccines/record` | Yes | 접종 기록 |
| GET | `/api/vaccines/coverage/:regionId` | Yes | 지역별 접종률 |

### POST `/api/vaccines/record`

**Request Body**:
```json
{
  "scheduleId": "s-1",
  "animalId": "a-1",
  "farmId": "f-1",
  "vaccineName": "구제역",
  "batchNumber": "LOT-2026-001",
  "notes": ""
}
```

### GET `/api/vaccines/coverage/:regionId`

**Response**:
```json
{
  "success": true,
  "data": {
    "regionId": "r-1",
    "totalAnimals": 5000,
    "vaccines": [
      { "name": "구제역", "vaccinated": 4800, "coverage": 96.0 },
      { "name": "브루셀라", "vaccinated": 4500, "coverage": 90.0 }
    ],
    "lastUpdated": "2026-03-17T00:00:00.000Z"
  }
}
```

---

## 18. Events

All endpoints require authentication. 농장 이벤트 기록/조회 + 음성 입력.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/events/types` | Yes | 이벤트 타입 정의 |
| POST | `/api/events` | Yes | 단건 이벤트 기록 |
| POST | `/api/events/bulk` | Yes | 벌크 이벤트 기록 |
| GET | `/api/events/:animalId` | Yes | 개체별 이벤트 조회 |
| GET | `/api/events/farm/:farmId` | Yes | 농장별 이벤트 (필터 가능) |
| POST | `/api/events/voice` | Yes | 음성 이벤트 변환 (STT + NLU) |

### POST `/api/events`

**Request Body**:
```json
{
  "farmId": "f-1",
  "animalId": "a-1",
  "eventType": "health",
  "subType": "질병",
  "description": "유방염 의심",
  "severity": "high",
  "eventDate": "2026-03-17T08:00:00Z",
  "metadata": {}
}
```

### GET `/api/events/farm/:farmId`

**Query Parameters**: `eventType`, `from`, `to`

### GET `/api/events/:animalId`

**Query Parameters**: `limit` (default 20), `offset` (default 0)

### GET `/api/events/types`

**Response**: 6개 이벤트 타입 (health, breeding, feeding, movement, treatment, observation) + 하위 타입

---

## 19. Economics

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/economics/:farmId` | Yes | 농장 경제 데이터 |
| POST | `/api/economics` | Yes | 경제 데이터 저장 |
| GET | `/api/economics/:farmId/productivity` | Yes | 생산성 스냅샷 |
| GET | `/api/economics/benchmark/:tenantId` | Yes | 벤치마크 비교 |
| GET | `/api/economics/:farmId/analysis` | Yes | AI 경제성 분석 |
| GET | `/api/economics/roi-calculator` | Yes | ROI 계산기 |

### GET `/api/economics/:farmId`

**Query Parameters**: `period` (YYYY-MM)

### POST `/api/economics`

**Request Body**:
```json
{
  "farmId": "f-1",
  "period": "2026-03",
  "revenue": { "milk": 15000000, "calves": 3000000, "subsidies": 2000000 },
  "costs": { "feed": 8000000, "labor": 3000000, "vet": 1500000 },
  "notes": ""
}
```

### GET `/api/economics/roi-calculator`

**Query Parameters**: `headCount` (default 50), `investmentType` (default `sensor`)

---

## 20. Calving

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/calving/upcoming/:farmId` | Yes | 분만 예정 목록 |
| POST | `/api/calving/record` | Yes | 분만 기록 |
| POST | `/api/calving/newborn/:calfId/checklist` | Yes | 신생아 체크리스트 |

### POST `/api/calving/record`

**Request Body**:
```json
{
  "animalId": "a-1",
  "farmId": "f-1",
  "calvingDate": "2026-03-17",
  "calvingType": "normal",
  "twinning": false,
  "calves": [{ "sex": "female", "weightKg": 38 }],
  "notes": ""
}
```

### POST `/api/calving/newborn/:calfId/checklist`

**Request Body**:
```json
{
  "colostrumFed": true,
  "colostrumTimestamp": "2026-03-17T01:00:00Z",
  "navelTreated": true,
  "weightKg": 38,
  "vitality": "good",
  "notes": ""
}
```

---

## 21. Escalation

All endpoints require authentication. 알림 에스컬레이션 (미확인 시 상위 단계 자동 전파).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/escalation/unacknowledged` | Yes | 미확인 알림 목록 |
| POST | `/api/escalation/acknowledge/:alertId` | Yes | 알림 확인 |
| GET | `/api/escalation/config` | Yes | 에스컬레이션 설정 |
| GET | `/api/escalation/stats` | Yes | 에스컬레이션 통계 |

### Escalation Levels

| Level | Target | Timeout (분) |
|-------|--------|-------------|
| 1 | 농장주 (farmer) | 30 |
| 2 | 수의사 (veterinarian) | 60 |
| 3 | 관리기관 (government_admin) | 120 |

---

## 22. Notifications

All endpoints require authentication. 알림 채널: `push`, `email`, `kakao`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications/preferences` | Yes | 알림 설정 조회 |
| POST | `/api/notifications/preferences` | Yes | 알림 설정 저장 |
| GET | `/api/notifications/templates` | Yes | 알림 템플릿 목록 |
| POST | `/api/notifications/test` | Yes | 테스트 알림 발송 |

### POST `/api/notifications/preferences`

**Request Body**:
```json
{
  "channels": [
    {
      "channel": "push",
      "isEnabled": true,
      "alertTypes": ["critical", "high"],
      "minSeverity": "high",
      "quietHoursStart": "22:00",
      "quietHoursEnd": "06:00"
    }
  ]
}
```

---

## 23. Lactation

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lactation/:animalId` | Yes | 비유곡선 데이터 (Wood 모델 기반) |

**Response**:
```json
{
  "success": true,
  "data": {
    "animalId": "a-1",
    "currentDim": 85,
    "peakYieldDim": 45,
    "peakYieldKg": 42.5,
    "recommendedDryOffDim": 305,
    "optimalBreedingDim": 65,
    "totalExpectedYield": 10500,
    "economicEstimate": { "milkPricePerKg": 1100, "totalExpectedRevenue": 11550000 },
    "data": [
      { "dim": 1, "actualYield": 25.3, "predictedYield": 25.0 },
      { "dim": 90, "actualYield": null, "predictedYield": 38.2 }
    ]
  }
}
```

---

## 24. Breeding

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/breeding/semen` | Yes | 정액 카탈로그 |
| GET | `/api/breeding/recommend/:animalId` | Yes | 교배 추천 (유전체 + 혈통 분석) |
| GET | `/api/breeding/pedigree/:animalId` | Yes | 혈통 조회 (3대) |
| GET | `/api/breeding/stats/:farmId` | Yes | 번식 통계 |

### GET `/api/breeding/semen`

**Query Parameters**: `breed` (optional, e.g. `holstein`)

### GET `/api/breeding/recommend/:animalId`

**Response**:
```json
{
  "success": true,
  "data": {
    "animalId": "a-1",
    "recommendations": [
      {
        "rank": 1,
        "semenId": "sem-2",
        "bullName": "ALTITUDE",
        "score": 92,
        "reasons": ["유지방 개선", "체세포 감소"],
        "expectedOffspring": { "milk": "+350kg", "fat": "+15kg" },
        "inbreedingCoeff": 3.2
      }
    ]
  }
}
```

### GET `/api/breeding/stats/:farmId`

**Response**:
```json
{
  "success": true,
  "data": {
    "farmId": "f-1",
    "conceptionRate": 42.5,
    "servicesPerConception": 2.3,
    "avgDaysOpen": 118,
    "heatDetectionRate": 65.0,
    "pregnancyRate": 28.0,
    "abortionRate": 3.2,
    "monthly": [
      { "month": "2026-01", "inseminations": 12, "pregnancies": 5 }
    ]
  }
}
```

---

## 25. Treatments

All endpoints require authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/treatments/pending-outcomes` | Yes | 치료 결과 대기 목록 (14일 이내) |
| POST | `/api/treatments/:treatmentId/outcome` | Yes | 치료 결과 확인 (수의사) |

### POST `/api/treatments/:treatmentId/outcome`

**Request Body**:
```json
{
  "outcomeStatus": "recovered",
  "note": "체온 정상화, 반추 회복"
}
```

`outcomeStatus`: `recovered` | `relapsed` | `worsened`

---

## Roles

| Role | Description |
|------|-------------|
| `farmer` | 농장주 |
| `veterinarian` | 수의사 |
| `government_admin` | 관리기관 |
| `quarantine_officer` | 방역관 |

## Pagination

Standard pagination via query parameters:

```
?page=1&limit=20
```

## Error Codes

| HTTP Status | Description |
|-------------|-------------|
| 400 | Validation error (잘못된 요청) |
| 401 | Unauthorized (인증 실패) |
| 403 | Forbidden (권한 없음) |
| 404 | Not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
