// TTS 포트 — STT 와 같은 이유로 공급자를 경계 뒤에 둔다.
//
// 음성 답변의 청자는 상당수가 고령 목장주다. 지연 몇십 ms 보다
// 명료도와 억양의 자연스러움이 먼저다. 다만 그 판단은 실제로 들어보고
// 해야 하므로, 바꿔가며 들을 수 있는 구조가 먼저 필요하다.

export interface TtsRequest {
  readonly text: string;
  /** 공급자별 화자 ID. 미지정 시 공급자 기본값 */
  readonly voice?: string;
  /** 0.25~4.0 (공급자별 허용 범위는 어댑터가 클램프) */
  readonly speed?: number;
  /** 비용 통제 — 앞 N자만 합성 */
  readonly maxChars?: number;
}

export interface TtsResult {
  readonly audio: Buffer;
  readonly contentType: string;
  readonly cached: boolean;
  readonly truncated: boolean;
  readonly synthesizedLength: number;
}

export interface TtsProvider {
  readonly name: string;
  isConfigured(): boolean;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}
