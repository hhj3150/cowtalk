// SEC-20 회귀 — 보고서 다운로드 링크(UUID)만 알면 누구나 남의 보고서를 받던 문제
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeReportOwner, canDownloadReport } from '../report-owner.js';

let dir: string;
const FILE = '11111111-2222-4333-8444-555555555555';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpt-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('SEC-20 보고서 생성자 묶기', () => {
  it('만든 사람만 받는다', () => {
    writeReportOwner(FILE, 'user-a', dir);
    expect(canDownloadReport(FILE, 'user-a', dir)).toBe(true);
    expect(canDownloadReport(FILE, 'user-b', dir)).toBe(false);
    expect(canDownloadReport(FILE, undefined, dir)).toBe(false);
  });
  it('생성자 기록이 없는 파일은 거부', () => {
    expect(canDownloadReport(FILE, 'user-a', dir)).toBe(false);
  });
});
