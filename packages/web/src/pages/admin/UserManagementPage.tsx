// 사용자 관리 페이지 (admin) — 계정 발급 콘솔
// - 승인 게이트: 소유자가 승인한 계정만 플랫폼 접근 가능 (승인/차단 버튼)
// - 계정 발급: 역할 + 담당 목장(다중 선택)을 지정해 생성 — 예: 동물병원에 목장 5개
// - 배정 편집: 기존 계정의 담당 목장을 언제든 교체 (저장 시 대상자 세션 재발급)

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiPut } from '@web/api/client';
import { DataTable, type Column } from '@web/components/data/DataTable';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { FarmMultiSelect } from '@web/components/admin/FarmMultiSelect';

interface UserRecord {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly approvalStatus?: string;
  readonly lastLoginAt: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  farmer: '농가주',
  veterinarian: '수의사',
  government_admin: '행정',
  quarantine_officer: '방역관',
};

const APPROVAL_LABELS: Record<string, { label: string; variant: 'success' | 'medium' | 'critical' }> = {
  approved: { label: '승인됨', variant: 'success' },
  pending: { label: '승인 대기', variant: 'medium' },
  revoked: { label: '차단됨', variant: 'critical' },
};

function buildUserColumns(
  onApprove: (userId: string) => void,
  onRevoke: (userId: string) => void,
  pendingId: string | null,
  onEditFarms: (userId: string, name: string) => void,
): readonly Column<Record<string, unknown>>[] {
  return [
    { key: 'name', label: '이름', sortable: true },
    { key: 'email', label: '이메일', sortable: true },
    {
      key: 'role',
      label: '역할',
      sortable: true,
      render: (row) => (
        <Badge label={ROLE_LABELS[String(row.role)] ?? String(row.role)} variant="info" />
      ),
    },
    {
      key: 'approvalStatus',
      label: '접근 승인',
      sortable: true,
      render: (row) => {
        const meta = APPROVAL_LABELS[String(row.approvalStatus)] ?? APPROVAL_LABELS.pending!;
        const userId = String(row.userId);
        const approved = row.approvalStatus === 'approved';
        return (
          <span className="flex items-center gap-2">
            <Badge label={meta.label} variant={meta.variant} />
            <button
              type="button"
              disabled={pendingId === userId}
              onClick={() => (approved ? onRevoke(userId) : onApprove(userId))}
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                approved
                  ? 'border border-red-300 text-red-600 hover:bg-red-50'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              } disabled:opacity-50`}
            >
              {approved ? '차단' : '승인'}
            </button>
          </span>
        );
      },
    },
    {
      key: 'userId',
      label: '담당 목장',
      render: (row) => (
        <button
          type="button"
          onClick={() => onEditFarms(String(row.userId), String(row.name))}
          className="rounded border border-blue-300 px-2 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
        >
          배정 편집
        </button>
      ),
    },
    { key: 'lastLoginAt', label: '마지막 로그인', sortable: true },
  ];
}

export default function UserManagementPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiGet<readonly UserRecord[]>('/users'),
    staleTime: 60 * 1000,
  });

  const [showForm, setShowForm] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const approvalMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'approved' | 'revoked' }) =>
      apiPatch(`/users/${userId}/approval`, { status }),
    onSuccess: () => {
      setApprovalError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } | string } } }).response?.data;
      const text = typeof msg?.error === 'string' ? msg.error : msg?.error?.message;
      setApprovalError(text ?? '승인 변경에 실패했습니다 (소유자만 가능합니다)');
    },
  });

  const [editTarget, setEditTarget] = useState<{ userId: string; name: string } | null>(null);

  const pendingId = approvalMutation.isPending
    ? approvalMutation.variables?.userId ?? null
    : null;
  const columns = buildUserColumns(
    (userId) => approvalMutation.mutate({ userId, status: 'approved' }),
    (userId) => approvalMutation.mutate({ userId, status: 'revoked' }),
    pendingId,
    (userId, name) => setEditTarget({ userId, name }),
  );

  if (isLoading) return <LoadingSkeleton lines={6} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">사용자 관리</h1>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          사용자 추가
        </button>
      </div>

      <p className="text-sm text-gray-500">
        승인된 계정만 플랫폼에 접근할 수 있습니다. 신규 가입·기존 계정은 승인 대기 상태로 시작합니다.
      </p>
      {approvalError && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">{approvalError}</p>
      )}

      {showForm && <UserForm onClose={() => setShowForm(false)} />}

      {editTarget && (
        <FarmAssignPanel
          userId={editTarget.userId}
          userName={editTarget.name}
          onClose={() => setEditTarget(null)}
        />
      )}

      <DataTable
        columns={columns}
        data={(data ?? []) as unknown as readonly Record<string, unknown>[]}
        keyField="userId"
        searchField="name"
        searchPlaceholder="이름으로 검색..."
      />
    </div>
  );
}

interface FormErrors {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUserForm(fields: { name: string; email: string; password: string }): FormErrors {
  const errors: Record<string, string> = {};
  if (fields.name.trim().length < 2) errors.name = '이름은 2자 이상이어야 합니다';
  if (!EMAIL_REGEX.test(fields.email)) errors.email = '유효한 이메일 주소를 입력하세요';
  if (fields.password.length < 8) errors.password = '비밀번호는 8자 이상이어야 합니다';
  return errors;
}

function UserForm({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('farmer');
  const [password, setPassword] = useState('');
  const [farmIds, setFarmIds] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // 실제 생성 API는 /auth/register (관리자 전용) — 목장 배정을 함께 받는다
  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        role,
        password,
        farmIds: farmIds.length > 0 ? [...farmIds] : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onClose();
    },
  });

  function handleSubmit(): void {
    setSubmitted(true);
    const validationErrors = validateUserForm({ name, email, password });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    mutation.mutate();
  }

  const inputClass = (field: keyof FormErrors) =>
    `rounded border px-3 py-2 text-sm ${submitted && errors[field] ? 'border-red-400 bg-red-50' : ''}`;

  const farmScopedRole = role === 'farmer' || role === 'veterinarian';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">새 계정 발급</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 *" className={inputClass('name')} />
          {submitted && errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>
        <div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 *" type="email" className={inputClass('email')} />
          {submitted && errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border px-3 py-2 text-sm" aria-label="역할">
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 *" type="password" className={inputClass('password')} />
          {submitted && errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
        </div>
      </div>

      <div className="mt-3">
        <FarmMultiSelect selected={farmIds} onChange={setFarmIds} />
        <p className="mt-1 text-xs text-gray-500">
          {farmScopedRole
            ? '농장주·수의사는 배정된 목장만 볼 수 있습니다. 배정이 없으면 아무 목장도 보이지 않습니다.'
            : '행정관·방역관은 배정이 없으면 전체(지역 집계)를 봅니다. 특정 목장만 담당시키려면 배정하세요.'}
        </p>
      </div>

      {submitted && farmScopedRole && farmIds.length === 0 && (
        <p className="mt-2 text-xs text-amber-600">⚠ 목장 배정이 없습니다 — 이 계정은 로그인해도 빈 화면을 보게 됩니다.</p>
      )}
      {mutation.isError && <p className="mt-2 text-xs text-red-500">저장 실패. 이메일 중복 여부를 확인해 주세요.</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={handleSubmit} disabled={mutation.isPending} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? '생성 중…' : '계정 발급'}
        </button>
        <button type="button" onClick={onClose} className="rounded bg-gray-100 px-4 py-1.5 text-sm text-gray-600">취소</button>
      </div>
    </div>
  );
}

interface UserDetailResponse {
  readonly userId: string;
  readonly farmAccess: readonly { farmId: string; farmName: string }[];
}

function FarmAssignPanel({ userId, userName, onClose }: {
  readonly userId: string;
  readonly userName: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [farmIds, setFarmIds] = useState<readonly string[] | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () => apiGet<UserDetailResponse>(`/users/${userId}`),
  });

  const current = farmIds ?? detail?.farmAccess.map((f) => f.farmId) ?? [];

  const mutation = useMutation({
    mutationFn: () => apiPut(`/users/${userId}/farms`, { farmIds: [...current] }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user-detail', userId] });
      onClose();
    },
  });

  return (
    <div className="rounded-lg border border-blue-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">담당 목장 편집 — {userName}</h3>
        <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
      </div>
      {isLoading ? (
        <LoadingSkeleton lines={3} />
      ) : (
        <>
          <FarmMultiSelect selected={current} onChange={setFarmIds} />
          <p className="mt-1 text-xs text-gray-500">
            저장하면 이 사용자의 기존 로그인 세션이 종료되고, 다시 로그인하면 새 배정이 적용됩니다.
          </p>
          {mutation.isError && <p className="mt-2 text-xs text-red-500">저장 실패. 다시 시도해 주세요.</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {mutation.isPending ? '저장 중…' : '배정 저장'}
            </button>
            <button type="button" onClick={onClose} className="rounded bg-gray-100 px-4 py-1.5 text-sm text-gray-600">취소</button>
          </div>
        </>
      )}
    </div>
  );
}
