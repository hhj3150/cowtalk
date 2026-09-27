# CowTalk 저작권(컴퓨터프로그램) 등록 준비 자료

한국저작권위원회 저작권등록시스템(www.cros.or.kr) 신청용 초안 묶음. 법률 자문이 아니므로 신청 전 변리사·위원회 등록 상담(1800-5455)으로 확인한다.

| # | 파일 | 용도 |
|---|---|---|
| 1 | `01_프로그램명세서_초안.docx` | 등록 신청서의 저작물 정보·프로그램 개요·창작 내용 입력 원고 |
| 2 | `out/` (git 제외) | 제출용 소스 복제물 — `node scripts/ip/build-copyright-submission.mjs` 로 생성 |
| 3 | `03_저작재산권양도계약서_초안.docx` | 개인(하현제) → 법인 권리 이전 계약 + 기여자 확인서·의사록 양식 |

## 소스 복제물 생성

```bash
node scripts/ip/build-copyright-submission.mjs                 # 테스트 제외 (기본)
node scripts/ip/build-copyright-submission.mjs --include-tests # 테스트 포함
node scripts/ip/build-copyright-submission.mjs --excerpt-pages 25
```

- `cowtalk-source-full.txt` 전체본 / `cowtalk-source-excerpt.txt` 앞·뒤 N쪽 발췌본
- `manifest.csv` 파일별 SHA-256, `summary.json` 전체 해시·기준 커밋
- 키·토큰 패턴이 발견되면 산출물을 만들지 않고 중단한다. 데모 시드 비밀번호는 제출본에서 가린다.
- PDF가 필요하면: `soffice --headless --convert-to pdf cowtalk-source-excerpt.txt`

## 신청 전 확인 필요 (명세서 10장)

1. 권리자: 개인 / ㈜제네틱스 / 농업회사법인 D2O — 화면에는 "D2O Corp." 표기
2. 커밋 작성자 "James Ha"(406건)가 본인 계정인지
3. 선행 버전 v4.0의 저작자·창작일
4. 공표일 (기재안 2026-03-22, Netlify 공개 배포)
5. AI 코딩 도구 활용 사실 기재 방식 (커밋 569건 중 480건 AI 공동작성 표기)
6. **등록 권고 기한 2027-03-16** — 창작 후 1년이 지나면 창작일 추정 효력 없음 (저작권법 제53조 제3항)
