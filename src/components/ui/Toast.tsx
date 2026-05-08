'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  add: (kind: ToastKind, message: string) => void;
  remove: (id: string) => void;
}

// -- Global singleton store (simple, no context needed) --
let listeners: Array<(toasts: Toast[]) => void> = [];
let _toasts: Toast[] = [];

function notify() { listeners.forEach(l => l([..._toasts])); }

export function addToast(kind: ToastKind, message: string) {
  const id = Math.random().toString(36).slice(2);
  _toasts = [..._toasts, { id, kind, message }];
  notify();
  setTimeout(() => removeToast(id), 4000);
}

export function removeToast(id: string) {
  _toasts = _toasts.filter(t => t.id !== id);
  notify();
}

export function useToasts(): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([..._toasts]);
  useEffect(() => {
    listeners.push(setToasts);
    return () => { listeners = listeners.filter(l => l !== setToasts); };
  }, []);
  return toasts;
}

// -- Icons --
const ICONS: Record<ToastKind, string> = {
  success: 'OK',
  error: 'ERR',
  info: 'INFO',
};

const COLORS: Record<ToastKind, { bg: string; border: string; dot: string }> = {
  success: { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)', dot: '#4ade80' },
  error:   { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', dot: '#f87171' },
  info:    { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.25)',  dot: '#a78bfa' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const c = COLORS[toast.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', borderRadius: '12px', minWidth: '240px', maxWidth: '380px',
        background: c.bg, border: `1px solid ${c.border}`,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      <span style={{
        fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em',
        color: c.dot, background: `${c.dot}20`, padding: '3px 7px',
        borderRadius: '6px', border: `1px solid ${c.dot}40`, flexShrink: 0,
      }}>
        {ICONS[toast.kind]}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.4 }}>
        {toast.message}
      </span>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          marginLeft: 'auto', flexShrink: 0, width: 20, height: 20,
          borderRadius: '6px', border: 'none', background: 'transparent',
          color: 'var(--text-3)', cursor: 'pointer', fontSize: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >x</button>
    </motion.div>
  );
}

/** Render this once at the app root */
export function ToastContainer() {
  const toasts = useToasts();
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end',
    }}>
      <AnimatePresence mode="popLayout">
        {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
      </AnimatePresence>
    </div>
  );
}
