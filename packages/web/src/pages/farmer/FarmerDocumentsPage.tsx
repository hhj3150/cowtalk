// /documents — 농장주 수신함: 수의사가 보낸 진료기록부·처방전·진단서 열람·확인
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { farmerApi } from '@web/api/farmer.api';
import type { VetDocModel } from '@web/api/vet.api';

export default function FarmerDocumentsPage(): React.JSX.Element {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({ queryKey: ['farmer', 'documents'], queryFn: () => farmerApi.listDocuments() });

  const docQuery = useQuery({
    queryKey: ['farmer', 'document', openId],
    queryFn: () => farmerApi.getDocument(openId as string),
    enabled: !!openId,
  });

  const ackMutation = useMutation({
    mutationFn: (deliveryId: string) => farmerApi.acknowledge(deliveryId),
    onSuccess: () => {
      setNotice('문서를 확인 처리했습니다.');
      void qc.invalidateQueries({ queryKey: ['farmer', 'documents'] });
    },
    onError: () => setNotice('확인 처리에 실패했습니다.'),
  });

  const downloadMutation = useMutation({
    mutationFn: (deliveryId: string) => farmerApi.downloadPdf(deliveryId),
    onSuccess: (blob, deliveryId) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cowtalk_document_${deliveryId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: () => setNotice('PDF 다운로드에 실패했습니다.'),
  });

  const card: React.CSSProperties = {
    background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)',
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3 pb-24">
      <header>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>받은 문서함</h1>
        <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          담당 수의사가 보낸 진료기록부·처방전·진단서를 확인하고 보관하세요.
        </p>
      </header>

      {notice && <div className="rounded-lg p-3 text-sm" style={card}>{notice}</div>}

      {listQuery.isLoading && <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>불러오는 중…</p>}
      {listQuery.data && listQuery.data.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>받은 문서가 없습니다.</p>
      )}

      <ul className="space-y-2">
        {(listQuery.data ?? []).map((d) => (
          <li key={d.delivery_id} className="rounded-lg" style={{ border: '1px solid var(--ct-border)' }}>
            <button
              type="button"
              onClick={() => setOpenId(openId === d.delivery_id ? null : d.delivery_id)}
              className="w-full p-3 text-left"
              aria-expanded={openId === d.delivery_id}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium" style={{ color: 'var(--ct-text)' }}>
                  {d.doc_title}
                  {d.status === 'acknowledged'
                    ? <span className="ml-2 text-xs" style={{ color: 'var(--ct-success, #16a34a)' }}>✓ 확인함</span>
                    : <span className="ml-2 text-xs" style={{ color: 'var(--ct-warning, #f59e0b)' }}>● 새 문서</span>}
                </span>
                <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                  {openId === d.delivery_id ? '▲' : '▼'}
                </span>
              </div>
              <div className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                {new Date(d.sent_at).toLocaleString('ko-KR')}
                {d.ear_tag_number ? ` · ${d.ear_tag_number}번` : ''}
                {d.final_diagnosis ? ` · ${d.final_diagnosis}` : ''}
              </div>
            </button>

            {openId === d.delivery_id && (
              <div className="space-y-3 border-t p-3" style={{ borderColor: 'var(--ct-border)' }}>
                {docQuery.isLoading && <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>문서 불러오는 중…</p>}
                {docQuery.data && <DocumentPreview model={docQuery.data} />}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadMutation.mutate(d.delivery_id)}
                    disabled={downloadMutation.isPending}
                    className="rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: 'var(--ct-primary, #2563eb)', color: '#fff' }}
                  >
                    {downloadMutation.isPending ? '생성 중…' : 'PDF 저장'}
                  </button>
                  {d.status !== 'acknowledged' && (
                    <button
                      type="button"
                      onClick={() => ackMutation.mutate(d.delivery_id)}
                      disabled={ackMutation.isPending}
                      className="rounded-lg px-3 py-2 text-sm font-medium"
                      style={card}
                    >
                      {ackMutation.isPending ? '처리 중…' : '확인했습니다'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentPreview({ model }: { model: VetDocModel }): React.JSX.Element {
  return (
    <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}>
      <h2 className="mb-2 text-center text-base font-bold" style={{ color: 'var(--ct-text)' }}>{model.doc_title}</h2>
      <dl className="space-y-0.5">
        {model.header_pairs.map((p, i) => (
          <div key={i} className="flex gap-2">
            <dt className="shrink-0 text-xs" style={{ color: 'var(--ct-text-secondary)', width: 96 }}>{p.key}</dt>
            <dd className="text-xs" style={{ color: 'var(--ct-text)' }}>{p.value}</dd>
          </div>
        ))}
      </dl>
      {model.sections.map((sec, i) => (
        <div key={i} className="mt-2">
          <h3 className="text-xs font-bold" style={{ color: 'var(--ct-text)' }}>{sec.heading}</h3>
          {(sec.pairs ?? []).map((p, j) => (
            <div key={j} className="flex gap-2">
              <dt className="shrink-0 text-xs" style={{ color: 'var(--ct-text-secondary)', width: 96 }}>{p.key}</dt>
              <dd className="text-xs" style={{ color: 'var(--ct-text)' }}>{p.value}</dd>
            </div>
          ))}
          {(sec.paragraphs ?? []).map((t, j) => (
            <p key={j} className="text-xs" style={{ color: 'var(--ct-text)' }}>{t}</p>
          ))}
        </div>
      ))}
      <p className="mt-2 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
        발행일 {model.issue_date} · {model.issuer.name}
        {model.issuer.clinicName ? ` · ${model.issuer.clinicName}` : ''}
      </p>
    </div>
  );
}
