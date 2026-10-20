// SEC-20: 생성된 보고서 파일을 만든 사람에게 묶는다 — 예전엔 다운로드 링크(UUID)만 알면 누구나 받았다
// (채팅 기록·화면 공유·로그로 링크가 새면 남의 목장 보고서가 그대로 열린다)
// 파일 옆에 `${fileId}.owner` 를 둔다. 만료 정리(cleanup)는 디렉터리 전체를 mtime 으로 지우므로 같이 지워진다.

import fs from 'fs';
import path from 'path';
import { REPORT_CONFIG } from './config.js';

function ownerPath(fileId: string, dir: string): string {
  return path.join(dir, `${fileId}.owner`);
}

export function writeReportOwner(fileId: string, userId: string, dir: string = REPORT_CONFIG.OUTPUT_DIR): void {
  fs.writeFileSync(ownerPath(fileId, dir), userId, { encoding: 'utf-8', mode: 0o600 });
}

/** 다운로드 허용 여부 — 생성자 본인만. 생성자 기록이 없는 파일(이전 버전)은 거부 */
export function canDownloadReport(fileId: string, userId: string | undefined, dir: string = REPORT_CONFIG.OUTPUT_DIR): boolean {
  if (!userId) return false;
  try {
    return fs.readFileSync(ownerPath(fileId, dir), 'utf-8').trim() === userId;
  } catch {
    return false;
  }
}
