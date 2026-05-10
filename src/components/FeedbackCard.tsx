'use client';

import { useState, useRef } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { dAppKit } from '@/app/dapp-kit';
import { uploadJsonToWalrus, getWalrusScanUrl } from '@/lib/walrus';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ────────────────────────────────────────────────────────
interface Submission {
  feedback: string;
  link: string;
  submitter: string;
  timestamp: number;
  version: string;
}

// ── Helpers ──────────────────────────────────────────────────────
function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ── Spinner ──────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="anim-spin"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── Copy icon ────────────────────────────────────────────────────
function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────
export function FeedbackCard() {
  const account = useCurrentAccount();

  const [feedback, setFeedback] = useState('');
  const [link, setLink]         = useState('');
  const [status, setStatus]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [blobId, setBlobId]     = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied]     = useState(false);
  const textRef                 = useRef<HTMLTextAreaElement>(null);

  const canSubmit = account && feedback.trim().length > 0 && status !== 'loading';

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('loading');
    setErrorMsg('');

    const payload: Submission = {
      feedback: feedback.trim(),
      link:     link.trim(),
      submitter: account.address,
      timestamp: Date.now(),
      version:   '1',
    };

    try {
      const signer = {
        address: account.address,
        signAndExecute: async (transaction: unknown) => {
          const result = await dAppKit.signAndExecuteTransaction({ transaction: transaction as any });
          // dAppKit v2 returns { $kind, Transaction: { digest } }
          const digest = (result as any)?.Transaction?.digest ?? (result as any)?.digest;
          if (!digest) throw new Error('Wallet signing failed or was cancelled');
          return { digest };
        },
      };
      const { blobId: id } = await uploadJsonToWalrus(payload, signer, 10);
      setBlobId(id);
      setFeedback('');
      setLink('');
      setStatus('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(blobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setStatus('idle');
    setBlobId('');
    setTimeout(() => textRef.current?.focus(), 100);
  }

  return (
    <div
      className="card anim-fade-up"
      style={{ padding: '36px', maxWidth: '480px', width: '100%', margin: '0 auto' }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-1)', lineHeight: 1.2 }}>
          Share your feedback
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.6 }}>
          Stored permanently on{' '}
          <a
            href="https://walrus.xyz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-hl)', textDecoration: 'none', fontWeight: 500 }}
          >
            Walrus
          </a>
          {' '}— no server, no database.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Success state ──────────────────────────────── */}
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div className="success-badge" style={{ width: 'fit-content' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Stored on Walrus
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-2)' }}>
              Your feedback is permanently stored. Share the ID to verify it.
            </p>

            {/* Blob ID */}
            <div className="blob-id">
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {blobId}
              </span>
              <button
                onClick={handleCopy}
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '2px', lineHeight: 1 }}
                title="Copy blob ID"
              >
                <CopyIcon copied={copied} />
              </button>
            </div>

            {/* External links */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a
                href={getWalrusScanUrl(blobId)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '13px', color: 'var(--accent-hl)', textDecoration: 'none', fontWeight: 500 }}
              >
                View on Walruscan ↗
              </a>
            </div>

            <button
              onClick={handleReset}
              className="btn-primary"
              style={{ background: 'rgba(255,255,255,0.07)', boxShadow: 'none', marginTop: '4px' }}
            >
              Submit another
            </button>
          </motion.div>
        ) : (
          /* ── Form state ──────────────────────────────── */
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* Textarea */}
            <div>
              <textarea
                ref={textRef}
                className="field"
                placeholder="What's on your mind?"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={5}
                disabled={!account || status === 'loading'}
                style={{ opacity: !account ? 0.5 : 1 }}
              />
              {/* Char count */}
              {feedback.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-3)', textAlign: 'right' }}>
                  {feedback.length} chars
                </div>
              )}
            </div>

            {/* Link input */}
            <input
              type="url"
              className="field"
              placeholder="Link (optional)"
              value={link}
              onChange={e => setLink(e.target.value)}
              disabled={!account || status === 'loading'}
              style={{ opacity: !account ? 0.5 : 1 }}
            />

            {/* Error message */}
            {status === 'error' && (
              <p style={{ fontSize: '13px', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                {errorMsg}
              </p>
            )}

            {/* Submit / Connect */}
            {account ? (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{ marginTop: '4px' }}
              >
                {status === 'loading' ? (
                  <>
                    <Spinner />
                    Storing on Walrus…
                  </>
                ) : (
                  'Submit feedback'
                )}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', padding: '4px 0' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Connect wallet to submit</p>
                <ConnectButton instance={dAppKit} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
