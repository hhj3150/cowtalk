// STT 포트 — 공급자를 환경변수 하나로 갈아끼우기 위한 경계.
//
// 왜 필요한가: 현행 Whisper 의 한국어 문자오류율(CER)은 공개 벤치마크에서
// 국내 특화 엔진의 약 2배다. 이 제품의 핵심 발화는 개체번호 4자리와
// 축산 전문용어라 오인식 한 글자가 조회·기록 전체를 틀리게 만든다.
// 공급자를 바꿔가며 실측할 수 있어야 하므로 호출부는 이 인터페이스만 안다.

export interface SttRequest {
  readonly audio: Buffer;
  readonly contentType: string;
  /** ISO-639-1. 미지정 시 공급자 기본값(한국어) */
  readonly language?: string;
  /**
   * 도메인 힌트 — 개체번호·축산 용어를 미리 알려 오인식을 줄인다.
   * 공급자마다 이름이 다르다: Whisper=prompt, CLOVA=boostings.
   */
  readonly hints?: readonly string[];
}

export interface SttResult {
  readonly text: string;
  /** 0~1. 공급자가 주지 않으면 undefined — 추측해서 채우지 않는다. */
  readonly confidence?: number;
  readonly language?: string;
  readonly durationMs?: number;
}

export interface SttProvider {
  /** 로그·계측에 쓰는 식별자 */
  readonly name: string;
  /** 키가 없으면 false — 호출 전에 확인해 폴백한다 */
  isConfigured(): boolean;
  transcribe(req: SttRequest): Promise<SttResult>;
}
