// 이메일 발송 — 정기 보고서·첨부 파일 전달 경로
//
// 정직성 규칙 (kakao-alimtalk.ts 와 같은 원칙):
// - SMTP 미설정이거나 EMAIL_TEST_MODE=true 면 **보내지 않고** testMode:true 로 돌려준다.
//   호출부는 이 값을 발송 이력에 그대로 기록한다 — "보냈다"고 착각하는 화면을 만들지 않기 위해.
// - 실패는 throw 하지 않고 success:false + error 로 돌려준다. 보고서 하나의 발송 실패가
//   다른 목장의 발송을 막지 않아야 한다.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export interface MailAttachment {
  readonly filename: string;
  /** 로컬 파일 경로 (content 와 택일) */
  readonly path?: string;
  readonly content?: Buffer;
  readonly contentType?: string;
}

export interface MailMessage {
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments?: readonly MailAttachment[];
}

export interface MailResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly error?: string;
  /** true = 실제로 나가지 않았다 (SMTP 미설정 또는 테스트 모드) */
  readonly testMode: boolean;
}

/** 이메일 주소 형식 검사 (순수) — 발송 전 수신자 정제용 */
export function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return /^[^\s@,;]+@[^\s@,;]+\.[a-zA-Z]{2,}$/.test(value.trim());
}

/** 수신자 목록 정규화 (순수) — 공백 제거·소문자·중복 제거·형식 불량 제외 */
export function normalizeRecipients(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const email = v.trim().toLowerCase();
    if (isValidEmail(email)) seen.add(email);
  }
  return [...seen];
}

export function isMailConfigured(): boolean {
  return Boolean(config.SMTP_HOST);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' }
        : undefined,
    });
  }
  return transporter;
}

/** 테스트용 — 설정 변경 후 트랜스포터 재생성 */
export function resetMailTransport(): void {
  transporter = null;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const to = normalizeRecipients(message.to);
  if (to.length === 0) {
    return { success: false, error: '유효한 수신자가 없습니다', testMode: false };
  }

  const testMode = !isMailConfigured() || config.EMAIL_TEST_MODE;
  if (testMode) {
    logger.info(
      {
        to,
        subject: message.subject,
        attachments: message.attachments?.map((a) => a.filename) ?? [],
        reason: isMailConfigured() ? 'EMAIL_TEST_MODE=true' : 'SMTP_HOST 미설정',
      },
      '[Mail] 테스트 모드 — 실제 발송하지 않음',
    );
    return { success: true, testMode: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: config.SMTP_FROM,
      to: to.join(', '),
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        ...(a.path ? { path: a.path } : {}),
        ...(a.content ? { content: a.content } : {}),
        ...(a.contentType ? { contentType: a.contentType } : {}),
      })),
    });
    logger.info({ to, subject: message.subject, messageId: info.messageId }, '[Mail] 발송 완료');
    return { success: true, messageId: info.messageId, testMode: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, subject: message.subject }, '[Mail] 발송 실패');
    return { success: false, error, testMode: false };
  }
}
