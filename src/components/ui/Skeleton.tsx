'use client';
import { motion } from 'framer-motion';

export function Skeleton({ width, height, borderRadius = '8px', style }: { width?: string | number; height?: string | number; borderRadius?: string | number; style?: React.CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: width ?? '100%',
        height: height ?? '20px',
        borderRadius,
        background: 'rgba(255, 255, 255, 0.05)',
        ...style
      }}
    />
  );
}

export function FormCardSkeleton() {
  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Skeleton width="60%" height="24px" />
      <Skeleton width="100%" height="16px" />
      <Skeleton width="80%" height="16px" />
      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
        <Skeleton width="80px" height="32px" borderRadius="8px" />
        <Skeleton width="80px" height="32px" borderRadius="8px" />
      </div>
    </div>
  );
}

export function SubmissionRowSkeleton() {
  return (
    <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
      <Skeleton width="40px" height="40px" borderRadius="8px" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton width="30%" height="16px" />
        <Skeleton width="50%" height="12px" />
      </div>
      <Skeleton width="80px" height="24px" borderRadius="12px" />
    </div>
  );
}
