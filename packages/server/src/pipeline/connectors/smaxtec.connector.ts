// smaXtec 커넥터 — v4 smaxtecApi.js 이식 + 강화
// 이벤트(발정, 질병, 분만): 95% 정확도 → 그대로 신뢰, 재판단 안 함
// 센서 수치(체온, 반추, 활동, 음수, pH): 보조 데이터로 시계열 저장
// 조직/농장: 141개 농장 목록
// 동물: 개체 목록, 센서 매핑

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { AbstractConnector, withRetry } from './base.connector.js';
import type { ConnectorConfig, FetchResult } from './base.connector.js';
// ===========================
// smaXtec API 응답 타입
// ===========================

export interface SmaxtecOrganisation {
  readonly organisation_id: string;
  readonly name: string;
  readonly timezone: string;
}

export interface SmaxtecAnimal {
  readonly _id: string;
  readonly official_id: string | null;
  readonly name: string | null;
  readonly display_name: string | null;
  readonly organisation_id: string;
  readonly group_id: string | null;
  readonly group_name: string | null;
  readonly mark: string | null;
  readonly sensor: string | null;
  readonly current_device_id: string | null;
  readonly archived: boolean;
  readonly active: boolean;
  readonly birthday: string | null;
  readonly race: string | null;
  readonly lactation_status: string | null;
  readonly last_readout: string | null;
  readonly tags: readonly string[];
  readonly do_not_breed: boolean;
  readonly created_at: string;
  // Backward compat alias
  readonly animal_id?: string;
  readonly sensor_id?: string;
}

export interface SmaxtecRawEvent {
  readonly _id: string;
  readonly animal_id: string;
  readonly official_id: string | null;
  readonly organisation_id?: string;
  readonly event_type: string;
  readonly event_ts: string;
  readonly create_ts: string;
  readonly cycle_length?: number;
  readonly days_to_calving?: number;
  readonly expected_calving_date?: string;
  readonly insemination_date?: string;
  readonly pregnant?: boolean;
  readonly number?: number;
  readonly value?: number;
  // Backward compat aliases
  readonly event_id?: string;
  readonly timestamp?: string;
  readonly confidence?: number;
  readonly severity?: string;
  readonly stage?: string;
  readonly data?: Record<string, unknown>;
}

/** smaXtec Data API raw response item — value can be null (smaXtec sends NaN for gaps) */
export interface SmaxtecSensorMetricRaw {
  readonly metric: string;
  readonly unit: string;
  readonly data: readonly (readonly [string, number | null])[];
}

export interface SmaxtecSensorData {
  readonly animal_id: string;
  readonly metrics: Record<
    string,
    readonly { readonly ts: number; readonly value: number | null }[]
  >;
}

/** smaXtec 커넥터가 반환하는 통합 데이터 */
export interface SmaxtecFetchData {
  readonly organisations: readonly SmaxtecOrganisation[];
  readonly animals: readonly SmaxtecAnimal[];
  readonly events: readonly SmaxtecRawEvent[];
  readonly sensorData: readonly SmaxtecSensorData[];
}

// ===========================
// API 클라이언트 (v4 이식)
// ===========================

export class SmaxtecApiClient {
  private readonly integrationBase = 'https://api.smaxtec.com/integration/v2';
  private readonly apiBase = 'https://api.smaxtec.com/api/v2';
  private token: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(
    private readonly email: string,
    private readonly password: string,
  ) {}

  async authenticate(): Promise<string> {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    logger.info('[smaXtec] Authenticating...');
    const res = await fetch(`${this.integrationBase}/users/session_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: this.email, password: this.password }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`smaXtec auth failed: ${String(res.status)} ${text}`);
    }

    const data = (await res.json()) as { token: string; expires_in: number };
    this.token = data.token;
    // 만료 5분 전에 갱신 (v4 동일)
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    logger.info('[smaXtec] Authenticated OK');
    return this.token;
  }

  private async request<T>(base: string, path: string, retried = false): Promise<T> {
    const token = await this.authenticate();
    const url = `${base}${path}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000); // 60초 타임아웃

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      // 토큰 만료 → 재인증 후 재시도 (1회)
      if (res.status === 401 && !retried) {
        this.token = null;
        this.tokenExpiry = null;
        return this.request<T>(base, path, true);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`smaXtec ${String(res.status)} ${path}: ${text.slice(0, 200)}`);
      }

      // smaXtec data API가 결측치를 JSON에 NaN 리터럴로 박아 보내는 경우가 있어
      // (특히 우즈벡 timezone +05:00 응답에서 관측됨) 표준 JSON.parse가 실패한다.
      // text() → NaN/Infinity → null 치환 후 파싱.
      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        const sanitized = text
          .replace(/(?<=[\s,[:])-?Infinity(?=[\s,\]}])/g, 'null')
          .replace(/(?<=[\s,[:])NaN(?=[\s,\]}])/g, 'null');
        return JSON.parse(sanitized) as T;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`smaXtec 요청 타임아웃 (60s): ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Integration API
  async getOrganisations(): Promise<readonly SmaxtecOrganisation[]> {
    return this.request(this.integrationBase, '/organisations');
  }

  async getAnimals(orgId: string): Promise<readonly SmaxtecAnimal[]> {
    return this.request(this.integrationBase, `/organisations/${orgId}/animals`);
  }

  async getEvents(orgId: string): Promise<readonly SmaxtecRawEvent[]> {
    return this.request(this.integrationBase, `/organisations/${orgId}/events`);
  }

  // Data API (sensor)
  // smaXtec v2 returns: [{metric, unit, data: [[ts_string, value], ...]}]
  // We normalize to: {animal_id, metrics: {temp: [{ts, value}], act: [{ts, value}]}}
  async getSensorData(
    animalId: string,
    metrics = 'temp',
    fromDate?: string,
    toDate?: string,
  ): Promise<SmaxtecSensorData> {
    // smaXtec requires separate `metrics` params: metrics=temp&metrics=act
    const metricList = metrics.split(',').map((m) => m.trim()).filter(Boolean);
    const params = new URLSearchParams();
    for (const m of metricList) params.append('metrics', m);
    if (fromDate) params.append('from_date', fromDate);
    if (toDate) params.append('to_date', toDate);

    const raw = await this.request<readonly SmaxtecSensorMetricRaw[]>(
      this.apiBase,
      `/data/animals/${animalId}.json?${params.toString()}`,
    );

    // Normalize raw array → {metrics: {temp: [{ts, value}]}}
    // value는 number | null (smaXtec이 결측치를 NaN으로 보내면 request()가 null로 치환).
    const normalized: Record<string, { ts: number; value: number | null }[]> = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        normalized[item.metric] = item.data.map(
          ([tsStr, value]: readonly [string, number | null]) => ({
            ts: new Date(tsStr).getTime() / 1000,
            value,
          }),
        );
      }
    }

    return { animal_id: animalId, metrics: normalized };
  }

  // ── Notes / Todos / Events (Public API v2) ──

  /** GET /api/v2/organisations/{org_id}/todos */
  async getTodos(orgId: string, done?: boolean): Promise<unknown> {
    const qs = done !== undefined ? `?done=${String(done)}` : '';
    return this.request<unknown>(this.apiBase, `/organisations/${orgId}/todos${qs}`);
  }

  /** GET /api/v2/events?organisation_id=&limit= */
  async getPublicEvents(orgId: string, limit = 20): Promise<unknown> {
    return this.request<unknown>(
      this.apiBase,
      `/events?organisation_id=${orgId}&limit=${String(limit)}`,
    );
  }

  /** GET /api/v2/notes/{note_id} */
  async getNote(noteId: string): Promise<unknown> {
    return this.request<unknown>(this.apiBase, `/notes/${noteId}`);
  }

  /** GET /integration/v2/organisations/{org_id}/events (Integration API) */
  async getIntegrationEvents(orgId: string, limit = 20): Promise<unknown> {
    return this.request<unknown>(
      this.integrationBase,
      `/organisations/${orgId}/events?limit=${String(limit)}`,
    );
  }

  invalidateToken(): void {
    this.token = null;
    this.tokenExpiry = null;
  }
}

// ===========================
// smaXtec 커넥터 기본 설정
// ===========================

export const SMAXTEC_DEFAULT_CONFIG: ConnectorConfig = {
  id: 'smaxtec',
  name: 'smaXtec Integration',
  enabled: true,
  syncIntervalMs: 5 * 60 * 1000, // 5분
  retryCount: 3,
  retryDelayMs: 2000,
};

// ===========================
// smaXtec 커넥터 구현
// ===========================

export class SmaxtecConnector extends AbstractConnector<SmaxtecFetchData> {
  private client: SmaxtecApiClient | null = null;
  private organisationIds: readonly string[] = [];

  constructor(connectorConfig: ConnectorConfig = SMAXTEC_DEFAULT_CONFIG) {
    super(connectorConfig);
  }

  private orgNameMap = new Map<string, string>();

  async connect(): Promise<void> {
    const email = config.SMAXTEC_EMAIL ?? process.env.SMAXTEC_EMAIL;
    const password = config.SMAXTEC_PASSWORD ?? process.env.SMAXTEC_PASSWORD;

    if (!email || !password) {
      logger.warn('[smaXtec] No credentials configured — connector disabled');
      this.status = 'disconnected';
      return;
    }

    this.client = new SmaxtecApiClient(email, password);

    try {
      await this.client.authenticate();
      const orgs = await this.client.getOrganisations();
      this.organisationIds = orgs.map((o) => o.organisation_id);
      this.orgNameMap = new Map(orgs.map((o) => [o.organisation_id, o.name]));
      this.status = 'connected';
      logger.info(
        { orgCount: orgs.length },
        `[smaXtec] Connected — ${String(orgs.length)} organisations`,
      );
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, '[smaXtec] Connection failed');
      throw error;
    }
  }

  async fetch(since?: Date): Promise<FetchResult<SmaxtecFetchData>> {
    if (!this.client) {
      throw new Error('smaXtec connector not connected');
    }

    return this.fetchWithRetry(async () => {
      const allOrgs: SmaxtecOrganisation[] = [];
      const allAnimals: SmaxtecAnimal[] = [];
      const allEvents: SmaxtecRawEvent[] = [];

      // 5개씩 병렬 처리 (API rate limit 고려)
      const CONCURRENCY = 5;
      for (let i = 0; i < this.organisationIds.length; i += CONCURRENCY) {
        const chunk = this.organisationIds.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (orgId) => {
            const [animals, events] = await Promise.all([
              this.client!.getAnimals(orgId),
              this.client!.getEvents(orgId),
            ]);
            return { orgId, animals, events };
          }),
        );

        for (const result of results) {
          if (result.status === 'rejected') {
            logger.error({ err: result.reason }, `[smaXtec] Failed to fetch org chunk`);
            continue;
          }

          const { orgId, animals, events } = result.value;
          allAnimals.push(...animals);

          // since 이후 이벤트만 필터 + org_id 주입
          const eventsWithOrg = events.map((e) => ({
            ...e,
            organisation_id: orgId,
          }));
          const filtered = since
            ? eventsWithOrg.filter((e) => new Date(e.event_ts ?? e.timestamp ?? '') > since)
            : eventsWithOrg;
          allEvents.push(...filtered);

          allOrgs.push({
            organisation_id: orgId,
            name: this.orgNameMap.get(orgId) ?? orgId,
            timezone: 'Asia/Seoul',
          });
        }

        if (i % 25 === 0 && i > 0) {
          logger.info({ processed: i, total: this.organisationIds.length }, '[smaXtec] Fetch progress');
        }
      }

      logger.info(
        { orgs: allOrgs.length, animals: allAnimals.length, events: allEvents.length },
        '[smaXtec] Fetch complete',
      );

      const data: SmaxtecFetchData = {
        organisations: allOrgs,
        animals: allAnimals,
        events: allEvents,
        sensorData: [], // 센서 데이터는 별도 배치로 수집
      };

      return {
        data: [data],
        count: allAnimals.length + allEvents.length,
        fetchedAt: new Date(),
        hasMore: false,
      };
    });
  }

  /** 특정 동물의 센서 데이터 수집 (별도 호출) */
  async fetchSensorData(
    animalId: string,
    metrics = 'temp,act,rum',
    fromDate?: string,
    toDate?: string,
  ): Promise<SmaxtecSensorData> {
    if (!this.client) {
      throw new Error('smaXtec connector not connected');
    }

    return withRetry(
      () => this.client!.getSensorData(animalId, metrics, fromDate, toDate),
      { retries: 3, delayMs: 1000, label: `smaxtec-sensor-${animalId}` },
    );
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.invalidateToken();
      this.client = null;
    }
    this.status = 'disconnected';
    logger.info('[smaXtec] Disconnected');
  }
}
