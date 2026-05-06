'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Submission, SubmissionStatus } from '@/types/motion';
import { readJsonFromWalrus, getWalrusScanUrl, uploadJsonToWalrus } from '@/lib/walrus';
import { getSubIds, mergeSubIds, getAllSubIds } from '@/lib/fields';

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending: '#fbbf24', approved: '#4ade80', rejected: '#f87171',
};

function exportCSV(subs: Submission[]) {
  if (!subs.length) return;
  const keys = [...new Set(subs.flatMap(s => Object.keys(s.data)))];
  const headers = ['ID', 'Time', 'Submitter', 'Status', ...keys];
  const rows = subs.map(s => [
    s.id,
    new Date(s.timestamp).toISOString(),
    s.submitterAddress ?? '',
    s.status,
    ...keys.map(k => `"${String(s.data[k] ?? '').replace(/"/g, '""')}"`)
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `submissions-${Date.now()}.csv`;
  a.click();
}

export function SubmissionsTab({ formBlobId: initialFormBlobId }: { formBlobId: string }) {
  // Admin can override which form blob ID to query
  const [activeBlobId, setActiveBlobId] = useState(initialFormBlobId);
  const [blobIdInput, setBlobIdInput]   = useState(initialFormBlobId === 'default' ? '' : initialFormBlobId);

  const [subs, setSubs]         = useState<Submission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState<SubmissionStatus | 'all'>('all');
  const [notes, setNotes]       = useState<Record<string, string>>({});

  // Import by single blob ID
  const [importId, setImportId]   = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const key = activeBlobId === 'default' ? '' : activeBlobId;

    let allIds: string[] = [];

    // 1. Backend index (auto) — primary source
    try {
      const url = key
        ? `/api/submissions?formBlobId=${encodeURIComponent(key)}`
        : `/api/submissions`; // no formBlobId = return ALL submissions
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json() as { subBlobIds?: string[] };
        const serverIds = json.subBlobIds ?? [];
        if (key) mergeSubIds(key, serverIds);
        allIds = [...new Set([...allIds, ...serverIds])];
      }
    } catch {
      console.warn('[motion] Backend index unreachable, falling back to localStorage.');
    }

    // 2. LocalStorage fallback — includes same-browser submissions + the shared ALL bucket
    if (key) {
      allIds = [...new Set([...allIds, ...getSubIds(key)])];
    }
    // Always also check the local ALL bucket (catches submissions from same browser regardless of key)
    allIds = [...new Set([...allIds, ...getAllSubIds()])];

    if (!allIds.length) { setSubs([]); setLoading(false); return; }

    const results = await Promise.all(
      allIds.map(id =>
        readJsonFromWalrus<Submission>(id)
          .then(s => ({ ...s, blobId: s.blobId ?? id }))
          .catch(() => null)
      )
    );
    setSubs((results.filter(Boolean) as Submission[]).sort((a, b) => b.timestamp - a.timestamp));
    setLoading(false);
  }, [activeBlobId]);

  useEffect(() => { load(); }, [load]);

  async function importSingleBlob() {
    const id = importId.trim();
    if (!id) return;
    setImporting(true); setImportMsg('');
    try {
      const sub = await readJsonFromWalrus<Submission>(id);
      if (sub?.timestamp) {
        const fid = sub.formBlobId ?? activeBlobId;
        mergeSubIds(fid, [id]);
        // Also register with backend
        await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formBlobId: fid, subBlobId: id }),
        }).catch(() => {});
        setImportMsg(`✓ Imported: "${(sub.data.project_name as string) || id.slice(0, 12)}…"`);
        setImportId('');
        load();
      } else {
        setImportMsg('⚠ Not a valid submission blob.');
      }
    } catch { setImportMsg('✕ Could not read this Blob ID.'); }
    setImporting(false);
  }

  async function updateStatus(sub: Submission, status: SubmissionStatus) {
    const updated = { ...sub, status, adminNotes: notes[sub.id] ?? sub.adminNotes ?? '' };
    try {
      await uploadJsonToWalrus(updated);
      setSubs(prev => prev.map(s => s.id === sub.id ? updated : s));
    } catch { alert('Failed to update status'); }
  }

  const filtered = subs.filter(s => filter === 'all' || s.status === filter);

  const isDefaultQuery = activeBlobId === 'default' || !activeBlobId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Active form query ─────────────────────────── */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Showing submissions for form
          </p>
          {!isDefaultQuery && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(124,58,237,0.12)', color: 'var(--accent-2)', border: '1px solid rgba(124,58,237,0.25)' }}>
              {activeBlobId.slice(0, 16)}…
            </span>
          )}
          {isDefaultQuery && (
            <span style={{ fontSize: '12px', color: '#fbbf24' }}>⚠ No form selected — showing all</span>
          )}
        </div>

        {/* Override blob ID input */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="input"
            placeholder="Paste Form Blob ID to filter (or leave empty for all)"
            value={blobIdInput}
            onChange={e => setBlobIdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setActiveBlobId(blobIdInput.trim() || 'default')}
            style={{ flex: 1, fontSize: '12px', fontFamily: 'var(--mono)' }}
          />
          <button className="btn btn-secondary btn-sm"
            onClick={() => setActiveBlobId(blobIdInput.trim() || 'default')}>
            Apply
          </button>
          {!isDefaultQuery && (
            <button className="btn btn-ghost btn-sm"
              onClick={() => { setBlobIdInput(''); setActiveBlobId('default'); }}>
              Show All
            </button>
          )}
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.5 }}>
          The Form Blob ID is shown after publishing in the Form Builder tab.
          Submissions are automatically fetched from the backend index when a user submits.
        </p>
      </div>

      {/* ── Import single blob ─────────────────────────── */}
      <div className="card" style={{ padding: '14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 500, flexShrink: 0 }}>Manual import:</p>
        <input
          className="input"
          placeholder="Paste a submission Blob ID"
          value={importId} onChange={e => setImportId(e.target.value)}
          style={{ flex: 1, minWidth: '200px', fontSize: '12px', fontFamily: 'var(--mono)' }}
          onKeyDown={e => e.key === 'Enter' && importSingleBlob()}
        />
        <button className="btn btn-secondary btn-sm" onClick={importSingleBlob}
          disabled={importing || !importId.trim()}>
          {importing ? <span className="spinner" /> : '+ Import'}
        </button>
        {importMsg && (
          <p style={{ width: '100%', fontSize: '12px', color: importMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>
            {importMsg}
          </p>
        )}
      </div>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.7 }}>
              ({s === 'all' ? subs.length : subs.filter(x => x.status === s).length})
            </span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filtered)}>Export CSV</button>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-3)', gap: '10px' }}>
          <span className="spinner" style={{ width: '18px', height: '18px' }} /> Loading from Walrus…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-3)', fontSize: '14px', lineHeight: 2 }}>
          📭 No submissions yet.<br />
          <span style={{ fontSize: '12px' }}>
            Submissions appear automatically after users submit the form.
          </span>
        </div>
      ) : filtered.map(s => (
        <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
            onClick={() => setExpanded(e => e === s.id ? null : s.id)}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s.status], flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                {(s.data.project_name as string) || 'Unnamed Project'}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                {(s.data.session_select as string) && <span style={{ color: 'var(--accent-2)', marginRight: '6px' }}>{s.data.session_select as string}</span>}
                {(s.data.leader_name as string) || ''}
                {' · '}{new Date(s.timestamp).toLocaleDateString('en-GB')}
                {' · '}{s.submitterAddress ? `${s.submitterAddress.slice(0, 8)}…` : 'Anonymous'}
              </p>
            </div>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', flexShrink: 0,
              background: `${STATUS_COLORS[s.status]}18`, color: STATUS_COLORS[s.status],
              border: `1px solid ${STATUS_COLORS[s.status]}30`,
            }}>
              {s.status}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>{expanded === s.id ? '▲' : '▼'}</span>
          </div>

          {/* Detail */}
          {expanded === s.id && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', maxHeight: '520px', overflowY: 'auto' }}>
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', fontSize: '13px', alignItems: 'start' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '2px' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-1)', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No')
                        : Array.isArray(v) ? v.join(', ')
                        : v.toString().startsWith('http')
                          ? <a href={v.toString()} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>{v.toString()} ↗</a>
                          : v.toString() || <em style={{ color: 'var(--text-3)' }}>—</em>}
                    </span>
                  </div>
                ))}
                {s.signature && (
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', fontSize: '13px', alignItems: 'start' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: '#4ade80', wordBreak: 'break-all' }}>{s.signature.slice(0, 80)}…</span>
                  </div>
                )}
              </div>
              {/* Actions */}
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea className="textarea" rows={2} placeholder="Admin notes…"
                  style={{ minHeight: 'unset', resize: 'none', fontSize: '13px' }}
                  value={notes[s.id] ?? s.adminNotes ?? ''}
                  onChange={e => setNotes(n => ({ ...n, [s.id]: e.target.value }))} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-sm" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', flex: 1 }}
                    onClick={() => updateStatus(s, 'approved')}>✓ Approve</button>
                  <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', flex: 1 }}
                    onClick={() => updateStatus(s, 'rejected')}>✕ Reject</button>
                  {s.blobId && (
                    <a href={getWalrusScanUrl(s.blobId)} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Walruscan ↗</a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
