'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { uploadFileToWalrus, readJsonFromWalrus, getWalrusScanUrl } from '@/lib/walrus';
import { uploadJsonOnChain } from '@/lib/walrus-onchain';
import { addSubId, DEFAULT_CONFIG } from '@/lib/fields';
import type { FormConfig, SessionField, Submission } from '@/types/motion';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const ClientOnly = dynamic(() => Promise.resolve(({ children }: { children: React.ReactNode }) => <>{children}</>), { ssr: false });

function uid() { return Math.random().toString(36).slice(2, 10); }
function shorten(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

// ── Single field renderer ──────────────────────────────────────────
function FieldInput({ field, value, onChange, onFile, uploading }: {
  field: SessionField;
  value: string | string[] | boolean;
  onChange: (v: string | string[] | boolean) => void;
  onFile: (f: File) => Promise<void>;
  uploading: boolean;
}) {
  const base = value as string;
  switch (field.type) {
    case 'text':
    case 'email':
      return <input type={field.type} className="input" placeholder={field.placeholder} value={base||''} onChange={e=>onChange(e.target.value)} />;
    case 'url':
      return <input type="url" className="input" placeholder={field.placeholder||'https://'} value={base||''} onChange={e=>onChange(e.target.value)} />;
    case 'textarea':
      return <textarea className="textarea" placeholder={field.placeholder} rows={4} value={base||''} onChange={e=>onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="select" value={base||''} onChange={e=>onChange(e.target.value)} style={{ background:'var(--card)', color:'var(--text-1)' }}>
          <option value="">Select…</option>
          {field.options?.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'checkbox':
      return (
        <label style={{ display:'flex', alignItems:'flex-start', gap:'10px', cursor:'pointer', fontSize:'14px', color:'var(--text-2)' }}>
          <input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}
            style={{ width:'16px', height:'16px', accentColor:'var(--accent)', cursor:'pointer', marginTop:'2px', flexShrink:0 }} />
          <span>{field.label}{field.linkUrl && <> · <a href={field.linkUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-2)'}}>{field.linkText||field.linkUrl}</a></>}</span>
        </label>
      );
    case 'file':
      return (
        <label style={{ display:'flex', alignItems:'center', gap:'10px', padding:'14px', borderRadius:'10px', border:'1px dashed var(--border)', cursor:'pointer', background:'rgba(255,255,255,0.02)', fontSize:'13px', color:'var(--text-3)', transition:'border-color 0.15s' }}>
          <input type="file" accept="image/*,video/*,.pdf,.doc,.docx" style={{ display:'none' }} onChange={async e=>{ const f=e.target.files?.[0]; if(f) await onFile(f); }} />
          {uploading ? <><span className="spinner"/> Uploading to Walrus…</>
           : base ? <span style={{color:'#4ade80'}}>✓ Uploaded — click to replace</span>
           : <>📎 Click or drop file</>}
        </label>
      );
    default: return null;
  }
}

// ── Main page ──────────────────────────────────────────────────────
export default function Home() {
  const account = useCurrentAccount();
  function disconnect() { dAppKit.disconnectWallet(); }

  const [config, setConfig]     = useState<FormConfig>(DEFAULT_CONFIG);
  const [formBlobId, setFormBlobId] = useState<string>('default');
  const [configLoading, setConfigLoading] = useState(true);

  const [data, setData]         = useState<Record<string, string|string[]|boolean>>({});
  const [fileUploading, setFileUploading] = useState<Record<string,boolean>>({});
  const [errors, setErrors]     = useState<Record<string,string>>({});

  const [status, setStatus]     = useState<'idle'|'signing'|'submitting'|'success'|'error'>('idle');
  const [submittedBlobId, setSubmittedBlobId] = useState('');
  const [errMsg, setErrMsg]     = useState('');
  const [wCopied, setWCopied]   = useState(false);

  // Load form config from ?form=blobId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fid = params.get('form');
    if (!fid) { setConfigLoading(false); return; }
    setFormBlobId(fid);
    readJsonFromWalrus<FormConfig>(fid)
      .then(cfg => setConfig(cfg))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  function setField(id: string, v: string|string[]|boolean) {
    setData(d => ({ ...d, [id]: v }));
    setErrors(e => { const n={...e}; delete n[id]; return n; });
  }

  async function handleFile(fieldId: string, file: File) {
    setFileUploading(u => ({ ...u, [fieldId]: true }));
    try {
      const { blobId } = await uploadFileToWalrus(file);
      setField(fieldId, blobId);
    } catch { setErrors(e => ({ ...e, [fieldId]: 'File upload failed — try again.' })); }
    setFileUploading(u => ({ ...u, [fieldId]: false }));
  }

  function validate(): boolean {
    const errs: Record<string,string> = {};
    config.fields.filter(f=>f.enabled&&f.required).forEach(f => {
      const v = data[f.id];
      const empty = v===undefined||v===''||v===false||(Array.isArray(v)&&v.length===0);
      if (empty) errs[f.id] = 'This field is required.';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    if (!account) {
      setStatus('idle');
      setErrMsg('Please connect your wallet to submit.');
      return;
    }

    setStatus('submitting');
    try {
      const submission: Submission = {
        id: uid(), formBlobId, data,
        submitterAddress: account.address,
        timestamp: Date.now(), status: 'pending',
      };

      // ── On-chain Walrus upload ───────────────────────────────────
      const { blobId } = await uploadJsonOnChain(submission, account.address);
      submission.blobId = blobId;

      // Auto-register with backend index so admin sees it immediately
      try {
        await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formBlobId, subBlobId: blobId }),
        });
      } catch {
        console.warn('[motion] Failed to register submission with backend index.');
      }

      addSubId(formBlobId, blobId);
      setSubmittedBlobId(blobId);
      setStatus('success');
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed.');
      setStatus('error');
    }

  }

  const enabledFields = config.fields.filter(f => f.enabled);

  // ── Loading ──────────────────────────────────────────────────
  if (configLoading) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', color:'var(--text-3)', gap:'10px' }}>
      <span className="spinner" style={{width:'20px',height:'20px'}}/> Loading form…
    </div>
  );

  // ── No form ──────────────────────────────────────────────────
  if (!new URLSearchParams(window.location.search).get('form') && formBlobId === 'default') {
    // Show "waiting for link" when no ?form= in URL
    // (admin has not published yet, user landed directly)
  }

  if (status === 'success') return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(124,58,237,0.13) 0%, transparent 60%)' }}>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="card" style={{ padding:'40px', maxWidth:'480px', width:'100%', textAlign:'center', margin:'24px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🐋</div>
        <h2 style={{ fontSize:'20px', fontWeight:700, marginBottom:'8px', letterSpacing:'-0.02em' }}>Application Submitted!</h2>
        <p style={{ fontSize:'14px', color:'var(--text-2)', lineHeight:1.6, marginBottom:'24px' }}>
          Your submission is permanently stored on Walrus. The team will review it shortly.
        </p>

        {/* Blob ID — share this with admin */}
        <div style={{ background:'rgba(124,58,237,0.07)', border:'1px solid rgba(124,58,237,0.25)', borderRadius:'12px', padding:'16px', marginBottom:'16px', textAlign:'left' }}>
          <p style={{ fontSize:'11px', fontWeight:600, color:'var(--accent-2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>
            📋 Your Submission ID — share this with the admin
          </p>
          <p style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--text-1)', wordBreak:'break-all', lineHeight:1.6, marginBottom:'10px' }}>
            {submittedBlobId}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            style={{ width:'100%' }}
            onClick={() => { navigator.clipboard.writeText(submittedBlobId); }}
          >
            Copy Blob ID
          </button>
        </div>

        <div style={{ display:'flex', gap:'8px', justifyContent:'center' }}>
          <a href={getWalrusScanUrl(submittedBlobId)} target="_blank" rel="noopener noreferrer"
            className="btn btn-secondary" style={{ display:'inline-flex', textDecoration:'none' }}>
            View on Walruscan ↗
          </a>
        </div>
      </motion.div>
    </div>
  );


  // ── Form ──────────────────────────────────────────────────────
  return (
    <ClientOnly>
      <div style={{ minHeight:'100dvh', background:'var(--bg)', backgroundImage:'radial-gradient(ellipse 80% 35% at 50% 0%, rgba(124,58,237,0.13) 0%, transparent 60%)' }}>
        {/* Header */}
        <header style={{ position:'sticky', top:0, zIndex:40, backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(7,9,15,0.85)' }}>
          <div style={{ maxWidth:'720px', margin:'0 auto', padding:'0 24px', height:'56px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
              <svg width={24} height={24} viewBox="0 0 32 32" fill="none"><rect width={32} height={32} rx={8} fill="rgba(124,58,237,0.18)"/><path d="M10 22V14l6-4 6 4v8" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M13 22v-5h6v5" stroke="#7c3aed" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize:'15px', fontWeight:700, letterSpacing:'-0.03em' }}>Motion</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              {account ? (
                <>
                  <button className="addr-chip" onClick={() => { navigator.clipboard.writeText(account.address); setWCopied(true); setTimeout(()=>setWCopied(false),1800); }} style={{ border:'none' }}>
                    <span className="addr-dot anim-pulse"/>
                    <span className="mono">{shorten(account.address)}</span>
                    {wCopied && <span style={{ fontSize:'10px', color:'#4ade80' }}>✓</span>}
                  </button>
                  <button onClick={() => disconnect()} style={{ fontSize:'11px', color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', textUnderlineOffset:'2px' }}>Disconnect</button>
                </>
              ) : <ConnectButton instance={dAppKit} />}
            </div>
          </div>
        </header>

        {/* Form */}
        <main style={{ maxWidth:'720px', margin:'0 auto', padding:'48px 24px 80px' }}>
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:0.4,ease:[0.16,1,0.3,1]}}>
            <h1 style={{ fontSize:'26px', fontWeight:800, letterSpacing:'-0.03em', marginBottom:'8px' }}>{config.title}</h1>
            <p style={{ fontSize:'14px', color:'var(--text-2)', lineHeight:1.6, marginBottom:'40px' }}>{config.description}</p>

            <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
              {enabledFields.map((f, i) => (
                <motion.div key={f.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.03,duration:0.3}}>
                  {f.type === 'checkbox' ? (
                    // Checkbox: label is inside the input
                    <div>
                      <FieldInput field={f} value={data[f.id]??false} onChange={v=>setField(f.id,v)} onFile={file=>handleFile(f.id,file)} uploading={!!fileUploading[f.id]} />
                      {errors[f.id] && <p style={{ fontSize:'12px', color:'#f87171', marginTop:'5px' }}>{errors[f.id]}</p>}
                    </div>
                  ) : (
                    <div>
                      <label className="input-label" style={{ fontSize:'14px', color:'var(--text-1)', marginBottom:'8px' }}>
                        {f.label} {f.required && <span className="input-required">*</span>}
                      </label>
                      {f.helpText && (
                        <p style={{ fontSize:'12px', color:'var(--text-3)', marginBottom:'8px', lineHeight:1.5 }}>
                          {f.helpText}{' '}
                          {f.linkUrl && <a href={f.linkUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent-2)'}}>{f.linkText||f.linkUrl} ↗</a>}
                        </p>
                      )}
                      <FieldInput field={f} value={data[f.id]??''} onChange={v=>setField(f.id,v)} onFile={file=>handleFile(f.id,file)} uploading={!!fileUploading[f.id]} />
                      {errors[f.id] && <p style={{ fontSize:'12px', color:'#f87171', marginTop:'5px' }}>{errors[f.id]}</p>}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Error */}
            {errMsg && <div className="alert-error" style={{ marginTop:'24px' }}>{errMsg}</div>}

            {/* Submit */}
            <div style={{ marginTop:'36px', paddingTop:'24px', borderTop:'1px solid var(--border)' }}>
              {account ? (
                <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
                  onClick={handleSubmit} disabled={status==='signing'||status==='submitting'}>
                  {status==='signing'   ? <><span className="spinner"/> Waiting for wallet approval…</>
                   :status==='submitting'? <><span className="spinner"/> Storing on Walrus…</>
                   : 'Sign & Submit'}
                </button>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' }}>
                  <p style={{ fontSize:'13px', color:'var(--text-2)', fontWeight:500 }}>Connect your wallet to submit</p>
                  <ConnectButton instance={dAppKit} />
                  <p style={{ fontSize:'11px', color:'var(--text-3)' }}>or</p>
                  <button className="btn btn-secondary" style={{ width:'100%' }} onClick={handleSubmit} disabled={status==='submitting'}>
                    {status==='submitting' ? <><span className="spinner"/> Submitting…</> : 'Submit without wallet'}
                  </button>
                </div>
              )}
              <p style={{ marginTop:'12px', fontSize:'12px', color:'var(--text-3)', textAlign:'center' }}>
                Stored on <a href="https://walrus.space" target="_blank" rel="noopener noreferrer" style={{color:'var(--text-2)',textDecoration:'none'}}>Walrus</a> · Decentralised · No server · No database
              </p>
            </div>
          </motion.div>
        </main>
      </div>
    </ClientOnly>
  );
}
