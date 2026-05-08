'use client';
import { useState, useEffect } from 'react';
import type { FormConfig } from '@/types/walform';
import { scanOwnedBlobs, getCachedFormIds, archiveForm, getArchivedFormIds } from '@/lib/form-registry';
import { FormCardSkeleton } from '@/components/ui/Skeleton';
import { readJsonFromWalrus } from '@/lib/walrus';

export function MyFormsTab({ 
  ownerAddress, 
  onSelectForm 
}: { 
  ownerAddress: string; 
  onSelectForm: (formConfig: FormConfig) => void;
}) {
  const [forms, setForms] = useState<FormConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      // Fast load from cache
      const cachedIds = getCachedFormIds(ownerAddress);
      const archivedIds = getArchivedFormIds(ownerAddress);
      const visibleIds = cachedIds.filter(id => !archivedIds.includes(id));
      if (visibleIds.length > 0) {
        const cachedForms = await Promise.all(
          visibleIds.map(id => readJsonFromWalrus<FormConfig>(id).catch(() => null))
        );
        setForms(cachedForms.filter(Boolean) as FormConfig[]);
      }

      // Deep scan in background
      try {
        const { forms: freshForms } = await scanOwnedBlobs(ownerAddress);
        setForms(freshForms);
      } catch (err) {
        console.error('Failed to scan blobs', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [ownerAddress]);

  const handleArchive = (form: FormConfig) => {
    const blobId = form.publishedBlobId || form.id;
    if (blobId) {
      archiveForm(ownerAddress, blobId);
      setForms(prev => prev.filter(f => (f.publishedBlobId || f.id) !== blobId));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '4px' }}>My Forms</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-2)' }}>Manage forms owned by your wallet.</p>
        </div>
      </div>

      {isLoading && forms.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          <FormCardSkeleton />
          <FormCardSkeleton />
          <FormCardSkeleton />
        </div>
      ) : forms.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
          <p style={{ color: 'var(--text-2)', fontSize: '15px' }}>No forms found. Create one in the Form Builder!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {forms.map(f => (
            <div key={f.publishedBlobId ?? f.id} className="card" style={{ padding: '20px', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border)' }}
                 onClick={() => onSelectForm(f)}
                 onMouseEnter={e => {
                   e.currentTarget.style.transform = 'translateY(-2px)';
                   e.currentTarget.style.borderColor = 'var(--accent-2)';
                 }}
                 onMouseLeave={e => {
                   e.currentTarget.style.transform = 'translateY(0)';
                   e.currentTarget.style.borderColor = 'var(--border)';
                 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-1)' }}>{f.title || 'Untitled Form'}</h3>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to archive this form? It will no longer appear here.')) {
                      handleArchive(f);
                    }
                  }}
                  title="Archive Form"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px', opacity: 0.6, transition: 'opacity 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                {f.description || 'No description provided.'}
              </p>
              <div style={{ display: 'flex', gap: '8px', fontSize: '12px', fontWeight: 600 }}>
                <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-2)' }}>
                  {f.fields?.length || 0} Fields
                </span>
                {f.encryptionEnabled && (
                  <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                    End-to-End Encrypted
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
