/**
 * Form Registry — scans all Walrus Blob objects owned by a wallet.
 *
 * Flow:
 *   getOwnedObjects(wallet, filter=Blob) → decode blob_id → fetch content →
 *   classify as 'form' | 'submission' → cache in localStorage
 */

import type { FormConfig, Submission } from '@/types/walform';
import { readJsonFromWalrus } from '@/lib/walrus';
import { publishSubmission } from '@/lib/submission-index';

// Walrus mainnet Blob struct type on Sui
const WALRUS_BLOB_TYPE =
  '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob';

const FORMS_CACHE_KEY = 'walform:registry:forms';
const SUBS_CACHE_KEY  = 'walform:registry:subs';
const ARCHIVED_FORMS_KEY = 'walform:registry:archived_forms';

// ---------- blob_id decoding ----------

/** Convert a u256 decimal string (from Sui object field) to Walrus base64url blobId */
export function decodeBlobId(u256decimal: string): string {
  const hex = BigInt(u256decimal).toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------- blob classification ----------

export type BlobKind = 'form' | 'submission' | 'unknown';

export interface ClassifiedBlob {
  blobId: string;
  kind: BlobKind;
  content: FormConfig | Submission | null;
}

function classify(obj: any): BlobKind {
  if (!obj || typeof obj !== 'object') return 'unknown';
  if (obj.type === 'form' || (Array.isArray(obj.fields) && obj.title !== undefined)) return 'form';
  if (obj.type === 'submission' || obj.status !== undefined) return 'submission';
  return 'unknown';
}

// ---------- localStorage cache ----------

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function writeCache(key: string, data: any) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota full */ }
}

/** Get cached form blobIds for a wallet */
export function getCachedFormIds(wallet: string): string[] {
  const map = readCache<Record<string, string[]>>(FORMS_CACHE_KEY) ?? {};
  return map[wallet] ?? [];
}

/** Get cached submission blobIds for a wallet */
export function getCachedSubIds(wallet: string): string[] {
  const map = readCache<Record<string, string[]>>(SUBS_CACHE_KEY) ?? {};
  return map[wallet] ?? [];
}

function addCachedId(cacheKey: string, wallet: string, blobId: string) {
  const map = readCache<Record<string, string[]>>(cacheKey) ?? {};
  const ids = map[wallet] ?? [];
  if (!ids.includes(blobId)) {
    map[wallet] = [...ids, blobId];
    writeCache(cacheKey, map);
  }
}

/** Archive a form blob ID so it no longer shows up */
export function archiveForm(wallet: string, blobId: string) {
  addCachedId(ARCHIVED_FORMS_KEY, wallet, blobId);
}

/** Get archived form blob IDs for a wallet */
export function getArchivedFormIds(wallet: string): string[] {
  const map = readCache<Record<string, string[]>>(ARCHIVED_FORMS_KEY) ?? {};
  return map[wallet] ?? [];
}

/** Cache a form blob ID for a wallet so it appears in My Forms */
export function cacheFormId(wallet: string, blobId: string) {
  addCachedId(FORMS_CACHE_KEY, wallet, blobId);
}

// ---------- main scan ----------

/**
 * Scans ALL Walrus Blob objects owned by `wallet`.
 * Returns { forms, submissions }.
 * Also persists newly found IDs into localStorage cache.
 */
export async function scanOwnedBlobs(wallet: string): Promise<{
  forms: FormConfig[];
  submissions: Submission[];
}> {
  const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
  const { NETWORK } = await import('@/lib/walrus');
  
  const client = new SuiJsonRpcClient({ 
    url: getJsonRpcFullnodeUrl(NETWORK as any),
    network: NETWORK as any
  });

  const newBlobIds: string[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const res = await client.getOwnedObjects({
      owner: wallet,
      filter: { StructType: WALRUS_BLOB_TYPE },
      options: { showContent: true },
      cursor: cursor ?? undefined,
      limit: 50,
    });

    for (const obj of res.data ?? []) {
      const fields = (obj.data?.content as any)?.fields;
      if (!fields?.blob_id) continue;
      try {
        const blobId = decodeBlobId(String(fields.blob_id));
        newBlobIds.push(blobId);
      } catch { /* skip malformed */ }
    }

    hasNextPage = res.hasNextPage;
    cursor = res.nextCursor ?? null;
  }

  // Fetch all content in parallel and classify
  const forms: FormConfig[] = [];
  const submissions: Submission[] = [];
  const archivedIds = getArchivedFormIds(wallet);

  const results = await Promise.allSettled(
    newBlobIds.map(id => readJsonFromWalrus<any>(id).then(c => ({ blobId: id, content: c })))
  );

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { blobId, content } = r.value;
    const kind = classify(content);

    if (kind === 'form') {
      if (!archivedIds.includes(blobId)) {
        const form = { ...content, publishedBlobId: content.publishedBlobId ?? blobId } as FormConfig;
        forms.push(form);
        addCachedId(FORMS_CACHE_KEY, wallet, blobId);
      }
    } else if (kind === 'submission') {
      const sub = { ...content, blobId: content.blobId ?? blobId } as Submission;
      submissions.push(sub);
      addCachedId(SUBS_CACHE_KEY, wallet, blobId);
      // Also push to submission-index for BroadcastChannel
      publishSubmission(blobId, sub.formBlobId || sub.formId || '');
    }
  }

  return { forms, submissions };
}
