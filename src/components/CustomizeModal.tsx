'use client';
import { useState } from 'react';
import type { FormConfig } from '@/types/motion';
import { uploadJsonToWalrus } from '@/lib/walrus';
import { motion, AnimatePresence } from 'framer-motion';

function uid() { return Math.random().toString(36).slice(2, 10); }

type FieldKey = 'rating' | 'link' | 'media' | 'checkboxes';
const FIELDS: { key: FieldKey; label: string; desc: string }[] = [
  { key: 'rating',     label: 'Star Rating', desc: '5-star quality input' },
  { key: 'link',       label: 'URL / Link',  desc: 'Optional URL field' },
  { key: 'media',      label: 'Media Upload', desc: 'Image or video to Walrus' },
  { key: 'checkboxes', label: 'Checkboxes',  desc: 'Multi-select options' },
];

export function CustomizeModal({ config, onSave, onClose }: {
  config: FormConfig;
  onSave: (c: FormConfig) => void;
  onClose: () => void;
}) {
  const [local, setLocal]     = useState<FormConfig>(JSON.parse(JSON.stringify(config)));
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied]   = useState(false);

  function toggleField(k: FieldKey) {
    setLocal(c => ({ ...c, enabled: { ...c.enabled, [k]: !c.enabled[k] } }));
  }
  function toggleRequired(k: string) {
    setLocal(c => ({
      ...c,
      required: c.required.includes(k) ? c.required.filter(f => f !== k) : [...c.required, k],
    }));
  }
  function updateOpt(i: number, v: string) {
    setLocal(c => { const o = [...c.checkboxOptions]; o[i] = v; return { ...c, checkboxOptions: o }; });
  }
  function addOpt() { setLocal(c => ({ ...c, checkboxOptions: [...c.checkboxOptions, 'New option'] })); }
  function removeOpt(i: number) {
    setLocal(c => ({ ...c, checkboxOptions: c.checkboxOptions.filter((_, j) => j !== i) }));
  }

  async function share() {
    setSharing(true);
    try {
      const cfg = { ...local, id: uid(), createdAt: Date.now() };
      const { blobId } = await uploadJsonToWalrus(cfg, 10);
      const url = `${window.location.origin}/?form=${blobId}`;
      setShareUrl(url);
      onSave(cfg);
    } catch { alert('Walrus upload failed — check network and retry.'); }
    setSharing(false);
  }

  function copy() { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  return (
    <AnimatePresence>
      <motion.div onClick={e => e.target === e.currentTarget && onClose()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', width: '100%', maxWidth: '460px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', padding: '28px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>Customize Form</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '20px', lineHeight: 1 }}>✕</button>
          </div>

          {/* Title / Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <div>
              <label className="input-label">Form Title</label>
              <input className="input" value={local.title} onChange={e => setLocal(c => ({ ...c, title: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">Description</label>
              <input className="input" value={local.description} onChange={e => setLocal(c => ({ ...c, description: e.target.value }))} />
            </div>
          </div>

          {/* Field toggles */}
          <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '10px' }}>Optional Fields</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
            {FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${local.enabled[f.key] ? 'rgba(124,58,237,0.35)' : 'var(--border)'}`, transition: 'border-color 0.15s' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-1)' }}>{f.label}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{f.desc}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {local.enabled[f.key] && (
                    <button onClick={() => toggleRequired(f.key)} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: local.required.includes(f.key) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)', color: local.required.includes(f.key) ? '#f87171' : 'var(--text-3)' }}>
                      {local.required.includes(f.key) ? 'Required' : 'Optional'}
                    </button>
                  )}
                  <input type="checkbox" className="toggle" checked={local.enabled[f.key]} onChange={() => toggleField(f.key)} />
                </div>
              </div>
            ))}
          </div>

          {/* Checkbox options */}
          {local.enabled.checkboxes && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '10px' }}>Checkbox Options</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {local.checkboxOptions.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px' }}>
                    <input className="input" value={opt} onChange={e => updateOpt(i, e.target.value)} style={{ fontSize: '13px', padding: '7px 11px' }} />
                    <button onClick={() => removeOpt(i)} disabled={local.checkboxOptions.length <= 1}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-3)', padding: '6px 10px' }}>✕</button>
                  </div>
                ))}
                <button onClick={addOpt} className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', marginTop: '2px' }}>+ Add option</button>
              </div>
            </div>
          )}

          <hr className="divider" style={{ marginBottom: '20px' }} />

          {/* Save & Share */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn btn-primary" onClick={() => { onSave(local); onClose(); }}>Save Changes</button>
            <button className="btn btn-secondary" onClick={share} disabled={sharing}>
              {sharing ? <><span className="spinner" /> Uploading to Walrus…</> : '🔗 Generate Shareable Link'}
            </button>
            {shareUrl && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareUrl}</div>
                <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? '✓' : 'Copy'}</button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
