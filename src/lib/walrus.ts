/**
 * Walrus HTTP API — Mainnet
 * Uploads go through our Next.js proxy (avoids CORS + handles WAL payment via publisher).
 * The SDK (WalrusClient) is server-only; see api/walrus/upload/route.ts for server usage.
 */

import type { WalrusUploadResponse } from '@/types/motion';

export const WALRUS_AGGREGATOR         = 'https://aggregator.walrus.space';
export const WALRUS_AGGREGATOR_TESTNET = 'https://aggregator.walrus-testnet.walrus.space';

// All writes go through this proxy (avoids browser CORS, handles epoch limits)
const UPLOAD_PROXY = '/api/walrus/upload';

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

export async function uploadBytesToWalrus(
  data: Uint8Array | string,
  contentType = 'application/octet-stream'
): Promise<WalrusUploadResponse> {
  const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const res = await fetch(UPLOAD_PROXY, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  return parseWalrusResponse(await res.json());
}

export async function uploadJsonToWalrus<T>(data: T): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), 'application/json');
}

export async function uploadFileToWalrus(file: File): Promise<WalrusUploadResponse> {
  const body = new Uint8Array(await file.arrayBuffer());
  const res = await fetch(UPLOAD_PROXY, { method: 'PUT', body, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  if (!res.ok) throw new Error(`File upload failed (${res.status}): ${await res.text()}`);
  return parseWalrusResponse(await res.json());
}

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  let res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) res = await fetch(`${WALRUS_AGGREGATOR_TESTNET}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Read failed (${res.status}) for ${blobId}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function readJsonFromWalrus<T>(blobId: string): Promise<T> {
  const bytes = await readBlobFromWalrus(blobId);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export function getWalrusBlobUrl(blobId: string) {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}
export function getWalrusScanUrl(blobId: string) {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
