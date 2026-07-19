// 유량 CSV 파서 — 검정성적표·Lely T4C 내보내기 호환
//
// 지원 형식 (헤더 자동 감지, 콤마/탭/세미콜론 허용):
//   귀번호,유량                          — 최소 2열 (수기·착유기 export)
//   귀번호,유량,유지방,유단백,체세포      — 5열 (젖소 검정성적 데이터)
//   임의 열 배치 (Lely T4C 등)           — 헤더 이름으로 열 자동 감지,
//                                          실패 시 UI에서 열 수동 매핑 (parseDelimited + extractMilkRows)
// 유성분 열은 있으면 반영, 비어 있으면 생략. 순수 함수 — UI/서버 공용.

export interface MilkCsvRow {
  readonly yieldL: number;
  /** 유지방 % */
  readonly fat?: number;
  /** 유단백 % */
  readonly protein?: number;
  /** 유당 % */
  readonly lactose?: number;
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

// ===========================
// 임의 열 배치 지원 (Lely T4C 등 착유기 내보내기)
// ===========================

export interface DelimitedTable {
  readonly headers: readonly string[];
  readonly dataRows: readonly (readonly string[])[];
  /** 첫 행이 헤더로 감지됐는지 (숫자 아닌 셀이 2개 이상) */
  readonly hasHeader: boolean;
}

/** 구분자 자동 감지(콤마/탭/세미콜론) 표 파싱 — 열 매핑 UI의 원료 */
export function parseDelimited(text: string): DelimitedTable {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], dataRows: [], hasHeader: false };

  const delimiter = [',', '\t', ';']
    .map((d) => ({ d, n: (lines[0] ?? '').split(d).length }))
    .sort((a, b) => b.n - a.n)[0]!.d;

  const rows = lines.map((l) => l.split(delimiter).map((c) => c.trim()));
  const first = rows[0]!;
  const nonNumeric = first.filter((c) => c !== '' && !Number.isFinite(Number(c))).length;
  const hasHeader = nonNumeric >= 2;

  return {
    headers: hasHeader ? first : first.map((_, i) => `${i + 1}열`),
    dataRows: hasHeader ? rows.slice(1) : rows,
    hasHeader,
  };
}

export interface MilkColumnMapping {
  readonly earTag: number;
  readonly yieldL: number;
  readonly fat?: number;
  readonly protein?: number;
  readonly lactose?: number;
  readonly scc?: number;
}

// 헤더 이름 후보 — 국문/영문 착유기·검정성적 내보내기에서 흔한 표기
const HEADER_PATTERNS: Readonly<Record<keyof MilkColumnMapping, RegExp>> = {
  earTag: /귀번호|관리번호|동물\s*번호|개체\s*번호|이표|animal\s*(no|number|id)?$|cow\s*(no|number)?|번호/i,
  yieldL: /일\s*유량|유량|산유량|착유량|젖|milk\s*(yield)?|yield|production/i,
  fat: /유지방|지방|fat/i,
  protein: /유단백|단백|protein/i,
  lactose: /유당|lactose/i,
  scc: /체세포|scc|somatic/i,
};

/** 헤더 이름으로 열 자동 감지 — 귀번호·유량을 못 찾으면 null (UI 수동 매핑으로 폴백) */
export function detectMilkColumns(headers: readonly string[]): MilkColumnMapping | null {
  const find = (key: keyof MilkColumnMapping, exclude: readonly number[]): number =>
    headers.findIndex((h, i) => !exclude.includes(i) && HEADER_PATTERNS[key].test(h));

  const yieldL = find('yieldL', []);
  const earTag = find('earTag', [yieldL]);
  if (earTag < 0 || yieldL < 0) return null;

  const used = [earTag, yieldL];
  const fat = find('fat', used);
  if (fat >= 0) used.push(fat);
  const protein = find('protein', used);
  if (protein >= 0) used.push(protein);
  const lactose = find('lactose', used);
  if (lactose >= 0) used.push(lactose);
  const scc = find('scc', used);

  return {
    earTag,
    yieldL,
    ...(fat >= 0 ? { fat } : {}),
    ...(protein >= 0 ? { protein } : {}),
    ...(lactose >= 0 ? { lactose } : {}),
    ...(scc >= 0 ? { scc } : {}),
  };
}

/** 매핑된 열로 표에서 유량 기록 추출 — parseMilkCsv와 동일한 범위 검증 */
export function extractMilkRows(
  table: DelimitedTable,
  mapping: MilkColumnMapping,
): MilkCsvResult {
  const rows = new Map<string, MilkCsvRow>();
  const errors: string[] = [];

  table.dataRows.forEach((cells, i) => {
    const rowNo = i + (table.hasHeader ? 2 : 1);
    const earTag = (cells[mapping.earTag] ?? '').trim();
    const yieldL = Number(cells[mapping.yieldL]);
    if (!earTag) {
      errors.push(`${rowNo}행: 귀번호 없음`);
      return;
    }
    if (!Number.isFinite(yieldL) || yieldL < 0 || yieldL > 100) {
      errors.push(`${rowNo}행 (${earTag}): 유량은 0~100L 범위여야 함`);
      return;
    }
    const fat = mapping.fat != null ? parseOptionalNumber(cells[mapping.fat], 0, 10) : { invalid: false as const };
    const protein = mapping.protein != null ? parseOptionalNumber(cells[mapping.protein], 0, 10) : { invalid: false as const };
    const lactose = mapping.lactose != null ? parseOptionalNumber(cells[mapping.lactose], 0, 10) : { invalid: false as const };
    const scc = mapping.scc != null ? parseOptionalNumber(cells[mapping.scc], 0, 10000) : { invalid: false as const };
    if (fat.invalid || protein.invalid || lactose.invalid || scc.invalid) {
      errors.push(`${rowNo}행 (${earTag}): 유성분 값 이상`);
    }
    rows.set(earTag, {
      yieldL,
      ...('value' in fat && fat.value != null ? { fat: fat.value } : {}),
      ...('value' in protein && protein.value != null ? { protein: protein.value } : {}),
      ...('value' in lactose && lactose.value != null ? { lactose: lactose.value } : {}),
      ...('value' in scc && scc.value != null ? { scc: scc.value } : {}),
    });
  });

  return { rows, errors };
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
