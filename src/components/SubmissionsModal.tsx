'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Submission, FeedbackType } from '@/types/motion';
import { readJsonFromWalrus } from '@/lib/walrus';
import { motion, AnimatePresence } from 'framer-motion';

function getSubIds(formId: string): string[] {
  try { return JSON.parse(localStorage.getItem(`motion:subs:${formId}`) ?? '[]'); } catch { return []; }
}
function exportCSV(subs: Submission[]) {
  const h = ['ID','Time','Type','Feedback','Rating','Link','Media','Checkboxes','Private','Address'];
  const rows = subs.map(s => [s.id, new Date(s.timestamp).toISOString(), s.type, `"${s.feedback.replace(/"/g,'""')}"`, s.rating, s.link, s.mediaBlobId, s.checkboxes.join('|'), s.isPrivate, s.submitterAddress ?? '']);
  const csv = [h, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `motion-${Date.now()}.csv`; a.click();
}

function Stars({ n }: { n: number }) {
  return <span>{Array.from({length:5},(_,i) => <span key={i} style={{ color: i < n ? '#fbbf24' : 'rgba(255,255,255,0.15)', fontSize: '12px' }}>★</span>)}</span>;
}

const TYPE_COLORS: Record<string, string> = { bug:'#ef4444', feature:'#7c3aed', survey:'#06b6d4', application:'#10b981' };
const TYPE_LABELS: Record<string, string> = { bug:'Bug', feature:'Feature', survey:'Survey', application:'Application' };

export function SubmissionsModal({ formId, onClose }: { formId: string; onClose: () => void }) {
  const [subs, setSubs]           = useState<Submission[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterType, setFilterType] = useState<FeedbackType | 'all'>('all');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy]       = useState<'latest' | 'rating'>('latest');
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const ids = getSubIds(formId);
    const results = await Promise.all(ids.map(id =>
      readJsonFromWalrus<Submission>(id).then(s => ({ ...s, blobId: s.blobId ?? id })).catch(() => null)
    ));
    setSubs(results.filter(Boolean) as Submission[]);
    setLoading(false);
  }, [formId]);

  useEffect(() => { load(); }, [load]);

  const filtered = subs
    .filter(s => filterType === 'all' || s.type === filterType)
    .filter(s => s.rating >= minRating)
    .sort((a, b) => sortBy === 'rating' ? b.rating - a.rating : b.timestamp - a.timestamp);

  return (
    <AnimatePresence>
      <motion.div onClick={e => e.target === e.currentTarget && onClose()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

          {/* Header */}
          <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em', flex: 1 }}>
              Submissions <span style={{ fontSize: '13px', color: 'var(--text-3)', fontWeight: 400 }}>({filtered.length})</span>
            </h2>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(filtered)}>Export CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={load}>↻</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '20px', lineHeight: 1 }}>✕</button>
          </div>

          {/* Filters */}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
            <select className="select" value={filterType} onChange={e => setFilterType(e.target.value as FeedbackType | 'all')}
              style={{ width: '130px', fontSize: '12px', padding: '6px 10px', background: 'var(--surface)', color: 'var(--text-1)' }}>
              <option value="all">All types</option>
              {(['bug','feature','survey','application'] as FeedbackType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <select className="select" value={minRating} onChange={e => setMinRating(+e.target.value)}
              style={{ width: '120px', fontSize: '12px', padding: '6px 10px', background: 'var(--surface)', color: 'var(--text-1)' }}>
              <option value={0}>Any rating</option>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>≥ {n} stars</option>)}
            </select>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['latest','rating'] as const).map(s => (
                <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSortBy(s)} style={{ fontSize: '12px' }}>
                  {s === 'latest' ? 'Latest' : 'Rating'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', gap: '10px', color: 'var(--text-3)' }}>
                <span className="spinner" style={{ width: '18px', height: '18px' }} /> Loading from Walrus…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)', fontSize: '14px' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📭</div>
                No submissions yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtered.map(s => (
                  <div key={s.id} style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {/* Row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
                      onClick={() => setExpanded(e => e === s.id ? null : s.id)}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: `${TYPE_COLORS[s.type]}18`, color: TYPE_COLORS[s.type], border: `1px solid ${TYPE_COLORS[s.type]}30`, flexShrink: 0, marginTop: '2px' }}>
                        {TYPE_LABELS[s.type].toUpperCase()}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', color: 'var(--text-1)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as unknown as undefined, lineHeight: 1.5 }}>
                          {s.feedback || <em style={{ color: 'var(--text-3)' }}>No text</em>}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                          {s.rating > 0 && <Stars n={s.rating} />}
                          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{new Date(s.timestamp).toLocaleDateString()}</span>
                          {s.isPrivate && <span style={{ fontSize: '10px', color: '#a78bfa' }}>🔒 Private</span>}
                        </div>
                      </div>
                      <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>{expanded === s.id ? '▲' : '▼'}</span>
                    </div>
                    {/* Expanded */}
                    {expanded === s.id && (
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {s.link && <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>🔗 <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>{s.link}</a></div>}
                        {s.checkboxes.length > 0 && <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>✓ {s.checkboxes.join(', ')}</div>}
                        {s.mediaBlobId && <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>📎 <a href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${s.mediaBlobId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>View file ↗</a></div>}
                        {s.submitterAddress && <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{s.submitterAddress}</div>}
                        {s.blobId && <a href={`https://walruscan.com/testnet/blob/${s.blobId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-3)', textDecoration: 'none' }}>View on Walruscan ↗</a>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
