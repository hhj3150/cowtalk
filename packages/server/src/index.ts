import { COWTALK_VERSION } from '@cowtalk/shared';

const PORT = process.env.PORT ?? 4000;

function main(): void {
  // Phase 2에서 Express app 구성
  console.info(`CowTalk v${COWTALK_VERSION} server starting on port ${String(PORT)}`);
}

main();
