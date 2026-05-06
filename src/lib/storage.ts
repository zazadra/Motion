import type { FormIndexEntry, Submission, SubmissionStatus } from '@/types';

// ── Keys ─────────────────────────────────────────────────────────
const formsKey  = (addr: string) => `motion:forms:${addr}`;
const subsKey   = (formBlobId: string) => `motion:subs:${formBlobId}`;

// ── Form Index ────────────────────────────────────────────────────
export function getForms(address: string): FormIndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem(formsKey(address)) ?? '[]');
  } catch { return []; }
}

export function saveForm(address: string, entry: FormIndexEntry): void {
  const existing = getForms(address).filter(f => f.formId !== entry.formId);
  localStorage.setItem(formsKey(address), JSON.stringify([entry, ...existing]));
}

export function deleteForm(address: string, formId: string): void {
  const forms = getForms(address).filter(f => f.formId !== formId);
  localStorage.setItem(formsKey(address), JSON.stringify(forms));
}

// ── Submission Index ──────────────────────────────────────────────
export function getSubmissionBlobIds(formBlobId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(subsKey(formBlobId)) ?? '[]');
  } catch { return []; }
}

export function addSubmissionBlobId(formBlobId: string, subBlobId: string): void {
  const ids = getSubmissionBlobIds(formBlobId);
  if (!ids.includes(subBlobId)) {
    localStorage.setItem(subsKey(formBlobId), JSON.stringify([...ids, subBlobId]));
  }
  // Update form submission count in all form indexes
  Object.keys(localStorage).forEach(key => {
    if (!key.startsWith('motion:forms:')) return;
    try {
      const forms: FormIndexEntry[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      const updated = forms.map(f =>
        f.blobId === formBlobId ? { ...f, submissionCount: f.submissionCount + 1 } : f
      );
      localStorage.setItem(key, JSON.stringify(updated));
    } catch { /* ignore */ }
  });
}

// ── Priority Score ────────────────────────────────────────────────
const URGENT_WORDS = ['urgent', 'critical', 'crash', 'broken', 'fail', 'error', 'block', 'severe', 'bug'];

export function calcPriority(sub: Submission): number {
  const ratingScore = (sub.rating ?? 0) * 10;
  const allText = sub.answers
    .map(a => (typeof a.value === 'string' ? a.value : ''))
    .join(' ')
    .toLowerCase();
  const kwBonus   = URGENT_WORDS.some(w => allText.includes(w)) ? 20 : 0;
  const tagBonus  = sub.tags.some(t => ['urgent','critical','bug'].includes(t.toLowerCase())) ? 15 : 0;
  const upBonus   = (sub.upvotes ?? 0) * 5;
  return ratingScore + kwBonus + tagBonus + upBonus;
}

export function priorityLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Critical', color: '#ef4444' };
  if (score >= 45) return { label: 'High',     color: '#f97316' };
  if (score >= 20) return { label: 'Medium',   color: '#eab308' };
  return              { label: 'Low',      color: '#22c55e' };
}

// ── CSV Export ────────────────────────────────────────────────────
export function exportCSV(submissions: Submission[]): void {
  if (!submissions.length) return;
  const headers = ['ID', 'Timestamp', 'Rating', 'Status', 'Tags', 'Priority', 'Submitter', 'Answers'];
  const rows = submissions.map(s => [
    s.id,
    new Date(s.timestamp).toISOString(),
    s.rating,
    s.status,
    s.tags.join('; '),
    s.priorityScore,
    s.submitterAddress ?? '',
    s.answers.map(a => `${a.fieldId}:${Array.isArray(a.value) ? a.value.join('|') : a.value}`).join(' | '),
  ]);
  const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `submissions-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Status cycle ──────────────────────────────────────────────────
export function nextStatus(s: SubmissionStatus): SubmissionStatus {
  return s === 'open' ? 'reviewing' : s === 'reviewing' ? 'done' : 'open';
}
