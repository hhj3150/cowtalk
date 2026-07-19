// 유량 CSV 파서 — "귀번호,유량" 2열 (헤더 자동 감지, 콤마/탭/세미콜론 허용)
//
// 착유기·검정 성적표에서 내려받은 파일을 유량 입력 화면이 일괄 반영할 때 쓴다.
// 순수 함수 — UI/서버 어디서든 동일하게 동작해야 하므로 shared에 둔다.

export interface MilkCsvResult {
  /** earTag → 일 유량(L) — 같은 귀번호 반복 시 마지막 값 */
  readonly rows: Map<string, number>;
  readonly errors: readonly string[];
}

export function parseMilkCsv(text: string): MilkCsvResult {
  const rows = new Map<string, number>();
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
    rows.set(earTag, yieldL);
  }
  return { rows, errors };
}
