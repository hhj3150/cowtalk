// 유량 CSV 파서 — 검정성적표 호환
//
// 지원 형식 (헤더 자동 감지, 콤마/탭/세미콜론 허용):
//   귀번호,유량                          — 최소 2열 (수기·착유기 export)
//   귀번호,유량,유지방,유단백,체세포      — 5열 (젖소 검정성적 데이터)
// 유성분 열은 있으면 반영, 비어 있으면 생략. 순수 함수 — UI/서버 공용.

export interface MilkCsvRow {
  readonly yieldL: number;
  /** 유지방 % */
  readonly fat?: number;
  /** 유단백 % */
  readonly protein?: number;
  /** 체세포 (천/mL) */
  readonly scc?: number;
}

export interface MilkCsvResult {
  /** earTag → 기록 — 같은 귀번호 반복 시 마지막 값 */
  readonly rows: Map<string, MilkCsvRow>;
  readonly errors: readonly string[];
}

function parseOptionalNumber(
  raw: string | undefined,
  min: number,
  max: number,
): { value?: number; invalid: boolean } {
  if (raw == null || raw === '') return { invalid: false };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return { invalid: true };
  return { value: n, invalid: false };
}

export function parseMilkCsv(text: string): MilkCsvResult {
  const rows = new Map<string, MilkCsvRow>();
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i]!.split(/[,;\t]/).map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`${i + 1}행: 열이 2개 미만`);
      continue;
    }
    const earTag = parts[0]!;
    const yieldL = Number(parts[1]);
    if (!Number.isFinite(yieldL)) {
      // 첫 행이 숫자가 아니면 헤더로 간주하고 건너뜀
      if (i === 0) continue;
      errors.push(`${i + 1}행 (${earTag}): 유량이 숫자가 아님`);
      continue;
    }
    if (yieldL < 0 || yieldL > 100) {
      errors.push(`${i + 1}행 (${earTag}): 유량은 0~100L 범위여야 함`);
      continue;
    }
    if (!earTag) {
      errors.push(`${i + 1}행: 귀번호 없음`);
      continue;
    }

    const fat = parseOptionalNumber(parts[2], 0, 10);
    const protein = parseOptionalNumber(parts[3], 0, 10);
    const scc = parseOptionalNumber(parts[4], 0, 10000);
    if (fat.invalid || protein.invalid || scc.invalid) {
      errors.push(`${i + 1}행 (${earTag}): 유성분 값 이상 (유지방/유단백 0~10%, 체세포 0~10,000천/mL)`);
    }

    rows.set(earTag, {
      yieldL,
      ...(fat.value != null ? { fat: fat.value } : {}),
      ...(protein.value != null ? { protein: protein.value } : {}),
      ...(scc.value != null ? { scc: scc.value } : {}),
    });
  }
  return { rows, errors };
}
