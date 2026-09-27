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

## 결정 사항 (2026-09-27 하원장님 확인)

- 저작자: **하현제** (개인) / 저작재산권자: **농업회사법인 디투오 주식회사(D2O Corp.)** — 양도계약 후 양도 등록
- 커밋 작성자 "James Ha"·"하현제" 모두 본인 계정
- 개발 방식: 기획·설계·도메인 규칙은 하현제가 직접 창작, AI 코딩 도구와 바이브코딩으로 구현

## 남은 확인 사항

1. 선행 버전 v4.0의 창작일·개발 방식
2. 공표일 (기재안 2026-03-22, Netlify 공개 배포)
3. D2O 법인등기부상 정확한 상호·법인등록번호
4. **등록 권고 기한 2027-03-16** — 창작 후 1년이 지나면 창작일 추정 효력 없음 (저작권법 제53조 제3항)
