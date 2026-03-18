// 사용자 관리 페이지 (admin)

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@web/api/client';
import { DataTable, type Column } from '@web/components/data/DataTable';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface UserRecord {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly lastLoginAt: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  farmer: '농가주',
  veterinarian: '수의사',
  inseminator: '수정사',
  government_admin: '행정',
  quarantine_officer: '방역관',
  feed_company: '사료회사',
};

const userColumns: readonly Column<Record<string, unknown>>[] = [
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
    key: 'status',
    label: '상태',
    sortable: true,
    render: (row) => (
      <Badge
        label={row.status === 'active' ? '활성' : '비활성'}
        variant={row.status === 'active' ? 'success' : 'medium'}
      />
    ),
  },
  { key: 'lastLoginAt', label: '마지막 로그인', sortable: true },
];

export default function UserManagementPage(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiGet<readonly UserRecord[]>('/admin/users'),
    staleTime: 60 * 1000,
  });

  const [showForm, setShowForm] = useState(false);

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

      {showForm && <UserForm onClose={() => setShowForm(false)} />}

      <DataTable
        columns={userColumns}
        data={(data ?? []) as unknown as readonly Record<string, unknown>[]}
        keyField="userId"
        searchField="name"
        searchPlaceholder="이름으로 검색..."
      />
    </div>
  );
}

function UserForm({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('farmer');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiPost('/admin/users', { name, email, role, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onClose();
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">새 사용자</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className="rounded border px-3 py-2 text-sm" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" type="email" className="rounded border px-3 py-2 text-sm" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border px-3 py-2 text-sm">
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" type="password" className="rounded border px-3 py-2 text-sm" />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">저장</button>
        <button type="button" onClick={onClose} className="rounded bg-gray-100 px-4 py-1.5 text-sm text-gray-600">취소</button>
      </div>
    </div>
  );
}
