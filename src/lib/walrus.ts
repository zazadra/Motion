/**
 * Walrus HTTP API - Direct Browser Uploads
 * Mainnet: publisher.walrus.space + aggregator.walrus.space
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet'; 
export const WALRUS_AGGREGATOR = 'https://wal-aggregator-mainnet.staketab.org';

// Walrus Mainnet Publisher Pool
export const PUBLISHER_POOL = [
  'https://walrus-mainnet-publisher-1.staketab.org:443',
  'https://publisher.walrus-mainnet.mystenlabs.com',
  'https://walrus-publisher-mainnet.mystenlabs.com',
  'https://publisher.mainnet.walrus.space',
  'https://publisher.walrus-mainnet.nodeinfra.com',
  'https://publisher.walrus-mainnet.decentnode.com',
  'https://publisher.walrus-mainnet.blockscope.net',
  'https://walrus-mainnet-publisher.chainode.tech'
];

export type UploadStatus = 'pending' | 'uploading' | 'retrying' | 'queued' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  attempt?: number;
  message?: string;
}

function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  if (result.newlyCreated) {
    const blob = (result.newlyCreated as Record<string, unknown>).blobObject as Record<string, unknown>;
    return {
      blobId:   blob.blobId as string,
      objectId: blob.id as string,
      endEpoch: (blob.storage as Record<string, unknown>)?.endEpoch as number,
    };
  }
  if (result.alreadyCertified) {
    const ac = result.alreadyCertified as Record<string, unknown>;
    return {
      blobId:   ac.blobId as string,
      objectId: ((ac.event as Record<string, unknown>)?.txDigest as string) ?? '',
      endEpoch: ac.endEpoch as number,
    };
  }
  throw new Error('Unexpected Walrus response: ' + JSON.stringify(result));
}

/**
 * Health check: verify if a provider is responsive.
 */
async function checkHealth(provider: string): Promise<boolean> {
  try {
    const res = await fetch(provider, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Core upload function with Multi-Provider Fallback and Retries.
 */
export async function uploadBytesToWalrus(
  data: Uint8Array | string,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<WalrusUploadResponse> {
  const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const startTime = Date.now();
  let lastError: string = '';

  for (const provider of PUBLISHER_POOL) {
    const providerName = new URL(provider).hostname;
    
    // Quick health check
    onProgress?.({ status: 'uploading', provider: providerName, message: `Checking health of ${providerName}...` });
    const isHealthy = await checkHealth(provider);
    if (!isHealthy) {
      console.warn(`[Walrus] Skipping unhealthy provider: ${providerName}`);
      continue;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const statusMsg = attempt > 1 
          ? `Retrying with ${providerName} (Attempt ${attempt})...` 
          : `Uploading to ${providerName}...`;
        
        onProgress?.({ status: attempt > 1 ? 'retrying' : 'uploading', provider: providerName, attempt, message: statusMsg });

        let url = `/api/walrus/upload?epochs=${epochs}&publisher=${encodeURIComponent(provider)}`;
        if (sendObjectTo) url += `&send_object_to=${sendObjectTo}`;

        const res = await fetch(url, { 
          method: 'POST', 
          body: body as any,
          signal: AbortSignal.timeout(45000) // 45s per attempt
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }

        const result = await res.json();
        const duration = Date.now() - startTime;
        console.log(`[Walrus] SUCCESS! Provider: ${providerName}, Duration: ${duration}ms`);
        onProgress?.({ status: 'success', provider: providerName, message: 'Upload successful!' });
        return parseWalrusResponse(result);

      } catch (err: any) {
        lastError = err.message || 'Unknown error';
        console.warn(`[Walrus] [${providerName}] Attempt ${attempt} failed: ${lastError}`);
        
        if (attempt < 2) {
          const delay = 1000 * attempt; // 1s, 2s backoff
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  // If we reach here, all providers failed
  const errorMsg = `All providers failed. Last error: ${lastError}`;
  onProgress?.({ status: 'failed', message: errorMsg });
  
  // Local Persistence Logic for JSON data
  if (typeof data === 'string' || (data instanceof Uint8Array && data.length < 1024 * 512)) {
    try {
      const queue = JSON.parse(localStorage.getItem('walform_upload_queue') || '[]');
      queue.push({
        data: typeof data === 'string' ? data : Array.from(data),
        epochs,
        sendObjectTo,
        timestamp: Date.now()
      });
      localStorage.setItem('walform_upload_queue', JSON.stringify(queue));
      onProgress?.({ status: 'queued', message: 'Persistent storage failed. Data queued for local retry.' });
    } catch (e) {
      console.error('Failed to queue upload locally:', e);
    }
  }

  throw new Error(errorMsg);
}

export async function uploadJsonToWalrus<T>(
  data: T,
  epochs = 5,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), epochs, sendObjectTo, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  epochs = 1,
  sendObjectTo?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, epochs, sendObjectTo, onProgress);
}

/**
 * Background Queue Processor
 */
export async function processUploadQueue() {
  const queue = JSON.parse(localStorage.getItem('walform_upload_queue') || '[]');
  if (queue.length === 0) return;

  console.log(`[Walrus] Processing ${queue.length} items from local queue...`);
  const newQueue = [];

  for (const item of queue) {
    try {
      const data = Array.isArray(item.data) ? new Uint8Array(item.data) : item.data;
      await uploadBytesToWalrus(data, item.epochs, item.sendObjectTo);
      console.log('[Walrus] Successfully flushed queued item.');
    } catch {
      newQueue.push(item); // Keep in queue
    }
  }

  localStorage.setItem('walform_upload_queue', JSON.stringify(newQueue));
}

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Read failed (${res.status}) for ${blobId}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function readJsonFromWalrus<T>(blobId: string, retries = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      const bytes = await readBlobFromWalrus(blobId);
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

export function getWalrusBlobUrl(blobId: string) {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}

export function getWalrusScanUrl(blobId: string) {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
