// 비밀번호 리셋 스크립트 — production 잠금 시 복구용.
// 실행: tsx packages/server/src/scripts/reset-admin-password.ts
//
// 환경변수:
//   RESET_EMAIL  — 리셋할 사용자 이메일 (기본: ha@d2o.kr)
//   RESET_PW     — 새 비밀번호 (기본: test1234)
//
// Railway 사용 예:
//   railway run npx tsx packages/server/src/scripts/reset-admin-password.ts
//   또는 RESET_PW='새비번' tsx packages/server/src/scripts/reset-admin-password.ts

import bcrypt from 'bcryptjs';
import { getDb } from '../config/database.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function main(): Promise<void> {
  const email = process.env.RESET_EMAIL ?? 'ha@d2o.kr';
  const newPassword = process.env.RESET_PW ?? 'test1234';

  if (newPassword.length < 6) {
    console.error('❌ RESET_PW 는 6자 이상이어야 합니다.');
    process.exit(1);
  }

  const db = getDb();
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length === 0) {
    console.error(`❌ 사용자 없음: ${email}`);
    console.error('   시드 사용자 목록: ha@d2o.kr / admin@gyeonggi.kr / quarantine@test.kr');
    process.exit(1);
  }

  await db.update(users)
    .set({ passwordHash, status: 'active', updatedAt: new Date() })
    .where(eq(users.email, email));

  console.info('');
  console.info('✅ 비밀번호 리셋 완료');
  console.info('────────────────────────────────────────');
  console.info(`이메일:   ${email}`);
  console.info(`비밀번호: ${newPassword}`);
  console.info('────────────────────────────────────────');
  console.info('이제 로그인 가능합니다. https://cowtalk.netlify.app');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ 실패:', err);
  process.exit(1);
});
