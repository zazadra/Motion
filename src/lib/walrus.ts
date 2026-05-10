/**
 * Walrus HTTP API
 *
 * Upload strategy (2-tier):
 *   1. Direct browser upload  – fastest, uses user's IP (avoids server-side rate limits)
 *   2. Backend relay          – fallback when CORS blocks direct upload
 *
 * Provider information is centralised in walrus-providers.ts.
 */

import type { WalrusUploadResponse } from '@/types/walform';
import {
  WALRUS_PROVIDERS,
  WALRUS_AGGREGATORS,
  PRIMARY_AGGREGATOR,
  buildUploadUrl,
  classifyError,
} from '@/lib/walrus-providers';

export const NETWORK = 'mainnet';

// Re-export for consumers that import directly from this file
export { PRIMARY_AGGREGATOR as WALRUS_AGGREGATOR };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus = 'pending' | 'uploading' | 'retrying' | 'queued' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  attempt?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  if (result.newlyCreated) {
    const blob = (result.newlyCreated as Record<string, unknown>)
      .blobObject as Record<string, unknown>;
    return {
      blobId: blob.blobId as string,
      objectId: blob.id as string,
      endEpoch: (blob.storage as Record<string, unknown>)?.endEpoch as number,
    };
  }
  if (result.alreadyCertified) {
    const ac = result.alreadyCertified as Record<string, unknown>;
    return {
      blobId: ac.blobId as string,
      objectId: ((ac.event as Record<string, unknown>)?.txDigest as string) ?? '',
      endEpoch: ac.endEpoch as number,
    };
  }
  throw new Error('Unexpected Walrus response shape: ' + JSON.stringify(result).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Tier 1: Direct browser upload
// ---------------------------------------------------------------------------

async function tryDirectUpload(
  bytes: Uint8Array,
  sendObjectTo?: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse | null> {
  for (const provider of WALRUS_PROVIDERS) {
    const url = buildUploadUrl(provider, { sendObjectTo });

    onProgress?.({
      status: 'uploading',
      provider: provider.name,
      message: `Trying ${provider.name}…`,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        method: provider.method,
        body: bytes.buffer as ArrayBuffer,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const { kind } = classifyError(new Error(`HTTP ${res.status}`));
        console.warn(`[Walrus Direct] ${provider.name} → ${res.status} (${kind})`);
        continue;
      }

      const data = await res.json();
      console.log(`[Walrus Direct] ✓ ${provider.name}`);
      return parseWalrusResponse(data as Record<string, unknown>);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const { kind, message } = classifyError(err);
      console.warn(`[Walrus Direct] ✗ ${provider.name} – ${kind}: ${message}`);
      // CORS failures and DNS errors both appear as TypeError here –
      // fall through to next provider regardless
      continue;
    }
  }

  return null; // All direct attempts exhausted
}

// ---------------------------------------------------------------------------
// Tier 2: Backend relay (server-side, bypasses CORS)
// ---------------------------------------------------------------------------

async function tryRelayUpload(
  data: string | Uint8Array | File | Blob,
  sendObjectTo?: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  onProgress?.({ status: 'retrying', provider: 'Backend Relay', message: 'Trying server relay…' });

  // Note: 'epochs' is NOT forwarded – it's no longer accepted by the Walrus API
  const url = sendObjectTo
    ? `/api/walrus/upload?send_object_to=${encodeURIComponent(sendObjectTo)}`
    : `/api/walrus/upload`;

  const res = await fetch(url, {
    method: 'POST',
    body: data as BodyInit,
  });

  let result: Record<string, unknown>;
  try {
    result = await res.json();
  } catch {
    throw new Error(`Relay returned non-JSON (HTTP ${res.status}: ${res.statusText})`);
  }

  if (!res.ok) {
    const detail = Array.isArray(result.detail)
      ? '\n' + (result.detail as string[]).join('\n')
      : '';
    throw new Error((result.error as string | undefined) ?? `Relay failed (HTTP ${res.status})` + detail);
  }

  return parseWalrusResponse(result);
}

// ---------------------------------------------------------------------------
// Public API: 2-tier upload with automatic fallback
// ---------------------------------------------------------------------------

export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  _epochs = 5,          // kept for API compatibility – no longer forwarded to Walrus
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const startTime = Date.now();

  // Normalise input to Uint8Array for direct upload
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Blob) {
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    bytes = data as Uint8Array;
  }

  const elapsed = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

  // --- Tier 1: Direct browser upload ---
  try {
    onProgress?.({ status: 'uploading', message: 'Connecting to Walrus network…' });
    const direct = await tryDirectUpload(bytes, sendObjectTo, onProgress);
    if (direct) {
      onProgress?.({ status: 'success', message: `Published in ${elapsed()}` });
      return direct;
    }
  } catch (err: unknown) {
    const { message } = classifyError(err);
    console.warn('[Walrus] Direct upload error:', message);
  }

  // --- Tier 2: Backend relay ---
  try {
    onProgress?.({ status: 'retrying', message: 'Routing through relay…' });
    const relay = await tryRelayUpload(data, sendObjectTo, onProgress);
    onProgress?.({ status: 'success', message: `Published via relay in ${elapsed()}` });
    return relay;
  } catch (err: unknown) {
    const { kind, message } = classifyError(err);
    onProgress?.({ status: 'failed', message: 'Upload failed – see console for details' });
    throw new Error(
      `Walrus upload failed (${kind}): ${message}`,
    );
  }
}

// Convenience wrappers

export async function uploadJsonToWalrus<T>(
  data: T,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), epochs, sendObjectTo, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, epochs, sendObjectTo, onProgress);
}

// ---------------------------------------------------------------------------
// Read Operations (multi-aggregator with retry)
// ---------------------------------------------------------------------------

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  for (const agg of WALRUS_AGGREGATORS) {
    try {
      const res = await fetch(`${agg}/v1/blobs/${blobId}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  throw new Error(`Failed to read blob "${blobId}" from all aggregators`);
}

export async function readJsonFromWalrus<T>(blobId: string, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const bytes = await readBlobFromWalrus(blobId);
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw lastErr;
}

export function getWalrusBlobUrl(blobId: string): string {
  return `${PRIMARY_AGGREGATOR}/v1/blobs/${blobId}`;
}

export function getWalrusScanUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
