// 처방전 PDF 생성 — prescription.routes의 TODO 실구현
// 한글 폰트 처리는 report pdfGenerator와 동일 패턴 (NanumGothic, 없으면 Helvetica 폴백).

import PDFDocument from 'pdfkit';
import fs from 'fs';
import { getDb } from '../../config/database.js';
import { prescriptions, prescriptionItems, drugDatabase, animals, farms, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

function registerKoreanFont(doc: PDFKit.PDFDocument): string {
  const fontPath = '/usr/share/fonts/truetype/nanum/NanumGothic.ttf';
  try {
    if (fs.existsSync(fontPath)) {
      doc.registerFont('Korean', fontPath);
      return 'Korean';
    }
  } catch {
    // 폴백
  }
  return 'Helvetica';
}

const ROUTE_LABELS: Readonly<Record<string, string>> = {
  oral: '경구',
  injection: '주사',
  topical: '외용',
};

export async function generatePrescriptionPdf(prescriptionId: string): Promise<Buffer | null> {
  const db = getDb();

  const [rx] = await db
    .select({
      prescriptionId: prescriptions.prescriptionId,
      diagnosis: prescriptions.diagnosis,
      notes: prescriptions.notes,
      status: prescriptions.status,
      prescribedAt: prescriptions.prescribedAt,
      expiresAt: prescriptions.expiresAt,
      earTag: animals.earTag,
      traceId: animals.traceId,
      farmName: farms.name,
      farmAddress: farms.address,
      vetName: users.name,
    })
    .from(prescriptions)
    .leftJoin(animals, eq(prescriptions.animalId, animals.animalId))
    .leftJoin(farms, eq(prescriptions.farmId, farms.farmId))
    .leftJoin(users, eq(prescriptions.vetId, users.userId))
    .where(eq(prescriptions.prescriptionId, prescriptionId))
    .limit(1);
  if (!rx) return null;

  const items = await db
    .select({
      drugName: drugDatabase.name,
      withdrawalDays: drugDatabase.withdrawalMilkDays,
      dosage: prescriptionItems.dosage,
      frequency: prescriptionItems.frequency,
      durationDays: prescriptionItems.durationDays,
      route: prescriptionItems.route,
      notes: prescriptionItems.notes,
    })
    .from(prescriptionItems)
    .leftJoin(drugDatabase, eq(prescriptionItems.drugId, drugDatabase.drugId))
    .where(eq(prescriptionItems.prescriptionId, prescriptionId));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const font = registerKoreanFont(doc);
    doc.font(font);

    // 헤더
    doc.fontSize(20).text('가축 처방전', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666666')
      .text(`처방전 번호: ${rx.prescriptionId} · CowTalk v5.0`, { align: 'center' });
    doc.moveDown(1.2);
    doc.fillColor('#000000');

    // 기본 정보
    const info: Array<[string, string]> = [
      ['농장', `${rx.farmName ?? '-'} (${rx.farmAddress ?? '-'})`],
      ['개체', `귀표 ${rx.earTag ?? '-'}${rx.traceId ? ` · 이력번호 ${rx.traceId}` : ''}`],
      ['진단명', rx.diagnosis],
      ['처방 수의사', rx.vetName ?? '-'],
      ['처방일', rx.prescribedAt.toISOString().slice(0, 10)],
      ['유효기간', rx.expiresAt ? rx.expiresAt.toISOString().slice(0, 10) : '-'],
      ['상태', rx.status],
    ];
    doc.fontSize(11);
    for (const [k, v] of info) {
      doc.text(`${k}:  ${v}`);
      doc.moveDown(0.2);
    }

    // 처방 약품
    doc.moveDown(0.8);
    doc.fontSize(13).text('처방 내역');
    doc.moveDown(0.4);
    doc.fontSize(10);
    if (items.length === 0) {
      doc.fillColor('#666666').text('등록된 처방 약품이 없습니다.').fillColor('#000000');
    }
    items.forEach((it, i) => {
      doc.text(
        `${i + 1}. ${it.drugName ?? '약품'} — ${it.dosage}, ${it.frequency}, ${it.durationDays}일, ${ROUTE_LABELS[it.route] ?? it.route}` +
        (it.withdrawalDays != null ? ` (휴약기간 ${it.withdrawalDays}일)` : ''),
      );
      if (it.notes) {
        doc.fillColor('#666666').fontSize(9).text(`   비고: ${it.notes}`).fontSize(10).fillColor('#000000');
      }
      doc.moveDown(0.3);
    });

    // 메모 + 휴약 경고
    if (rx.notes) {
      doc.moveDown(0.6);
      doc.fontSize(11).text('메모');
      doc.fontSize(10).fillColor('#333333').text(rx.notes).fillColor('#000000');
    }
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#b45309')
      .text('※ 휴약기간 내 원유·식육 출하를 금지합니다. 본 처방전은 수의사법에 따른 처방 기록입니다.');

    doc.end();
  });
}
