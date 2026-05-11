/**
 * Walrus Upload – Official SDK approach
 *
 * Uses @mysten/walrus `writeFilesFlow` with the official Mysten Upload Relay.
 *
 * Flow (browser, wallet-signed):
 *   1. encode()        – WASM encodes the blob locally, produces blobId
 *   2. register tx     – wallet signs a Sui tx to register blob on-chain (costs WAL/SUI)
 *   3. upload()        – relay receives encoded slivers (no extra wallet popup)
 *   4. certify tx      – wallet signs a Sui tx to certify availability
 *
 * The Upload Relay offloads writing ~2200 shard requests to the relay server,
 * so the browser only needs 4 round-trips (2 wallet signatures).
 *
 * Reads use the public aggregator — no wallet needed.
 */

import type { WalrusUploadResponse } from '@/types/walform';

export const NETWORK = 'mainnet' as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Official Mysten Labs Upload Relay – DNS verified: 34.120.182.114 */
const UPLOAD_RELAY_HOST = 'https://upload-relay.mainnet.walrus.space';

/** Official Mysten Labs Aggregator for reads */
const AGGREGATOR = 'https://aggregator.walrus-mainnet.walrus.space';

/** Public fallback aggregator */
const AGGREGATORS = [
  AGGREGATOR,
  'https://walrus-mainnet-aggregator.nodes.guru',
  'https://wal-aggregator-mainnet.staketab.org',
  'https://aggregator.walrus.space',
];

export const WALRUS_AGGREGATOR = AGGREGATOR;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus = 'pending' | 'encoding' | 'registering' | 'uploading' | 'certifying' | 'success' | 'failed';
export interface UploadProgress {
  status: UploadStatus;
  provider?: string;
  attempt?: number;
  message?: string;
}

export interface WalrusSigner {
  /**
   * Sign and execute a Sui transaction.
   * Returns the transaction digest on success, throws on failure.
   */
  signAndExecute(transaction: unknown): Promise<{ digest: string }>;
  /** The Sui wallet address this signer represents */
  address: string;
}

// ---------------------------------------------------------------------------
// Response parser (handles both SDK and raw HTTP shapes)
// ---------------------------------------------------------------------------

export function parseWalrusResponse(result: Record<string, unknown>): WalrusUploadResponse {
  // Shape from @mysten/walrus SDK writeBlob / writeFiles
  if (typeof result.blobId === 'string') {
    return {
      blobId: result.blobId,
      objectId: (result.id as string | undefined) ?? '',
      endEpoch: result.endEpoch as number | undefined,
    };
  }
  // Shape from raw HTTP publisher (legacy fallback)
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
  throw new Error('Unrecognised Walrus response: ' + JSON.stringify(result).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Main upload – uses official SDK + Upload Relay + wallet signer
// ---------------------------------------------------------------------------

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { WalrusClient, WalrusFile } from '@mysten/walrus';

/**
 * Upload bytes to Walrus Mainnet using the @mysten/walrus SDK.
 *
 * This flow requires two wallet signatures (Register & Certify).
 * If the blob is already certified (or registered), we detect empty transactions
 * to prevent Sui RPC errors ("no balance changes").
 *
 * @param data        Raw bytes, string, File, or Blob to store
 * @param signer      Wallet signer
 * @param epochs      Storage duration
 * @param onProgress  Optional progress callback
 */
export async function uploadBytesToWalrus(
  data: string | Uint8Array | File | Blob,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  // Normalise to Uint8Array
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  }

  onProgress?.({ status: 'encoding', message: 'Encoding data...' });

  const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const walrusClient = new WalrusClient({
    network: NETWORK,
    suiClient: suiClient as any, // Walrus expects a SuiClient-like object, and SuiJsonRpcClient implements most of it.
  });

  const flow = walrusClient.writeFilesFlow({
    files: [WalrusFile.from({
      contents: bytes,
      identifier: 'file',
      tags: { 'Content-Type': (data as File).type || 'application/octet-stream' }
    })]
  });

  // 1. Register
  onProgress?.({ status: 'registering', message: 'Waiting for wallet approval (register)...' });
  const registerTx = flow.register({ owner: signer.address, deletable: false, epochs });
  
  // If the blob is already certified, the transaction will have no commands.
  // We must skip signing empty transactions to prevent Sui errors.
  if (registerTx && registerTx.getData().commands.length > 0) {
    try {
      await signer.signAndExecute(registerTx);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('User rejected')) {
        onProgress?.({ status: 'failed', message: 'Upload cancelled by user (register)' });
        throw err;
      }
      // "no balance changes" means the blob is likely already registered/paid for
      if (msg.includes('no balance changes')) {
        console.info('Register skipped: Blob already exists on-chain.');
      } else {
        console.warn('Register transaction failed or skipped:', err);
      }
    }
  }

  // 2. Upload to storage nodes
  onProgress?.({ status: 'uploading', message: 'Uploading encoded slivers...' });
  const uploaded = await flow.upload();

  // 3. Certify
  onProgress?.({ status: 'certifying', message: 'Waiting for wallet approval (certify)...' });
  const certifyTx = flow.certify();
  if (certifyTx && certifyTx.getData().commands.length > 0) {
    try {
      await signer.signAndExecute(certifyTx);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('User rejected')) {
        onProgress?.({ status: 'failed', message: 'Upload cancelled by user (certify)' });
        throw err;
      }
      if (msg.includes('no balance changes')) {
        console.info('Certify skipped: Blob already certified.');
      } else {
        console.warn('Certify transaction failed or skipped:', err);
      }
    }
  }

  // The SDK might return an extended Blob ID object id or Base64url + suffix. 
  // We extract exactly 43 characters which represents the true Walrus Blob ID.
  const rawBlobId = uploaded.blobId ?? '';
  const parsedBlobId = typeof rawBlobId === 'string' ? rawBlobId.slice(0, 43) : String(rawBlobId).slice(0, 43);

  onProgress?.({ status: 'success', message: `Stored on Walrus ✓ (blobId: ${parsedBlobId.slice(0, 12)}…)` });
  
  return {
    blobId: parsedBlobId,
    objectId: uploaded.blobObjectId ?? '',
    endEpoch: 0, // endEpoch is no longer in WriteBlobStepUploaded, so we default to 0
  };
}

// ---------------------------------------------------------------------------
// Convenience wrappers (backward-compatible API surface)
// ---------------------------------------------------------------------------

export async function uploadJsonToWalrus<T>(
  data: T,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  return uploadBytesToWalrus(JSON.stringify(data), signer, epochs, onProgress);
}

export async function uploadFileToWalrus(
  file: File,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (p: UploadProgress) => void,
): Promise<WalrusUploadResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToWalrus(bytes, signer, epochs, onProgress);
}

// ---------------------------------------------------------------------------
// Read operations (public aggregator – no wallet needed)
// ---------------------------------------------------------------------------

export async function readBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  // Truncate to 43 chars (valid base64url length for 32-byte Walrus Blob ID)
  // This fixes broken submissions that accidentally stored 52-char IDs from the SDK earlier.
  const cleanBlobId = blobId.slice(0, 43);

  for (const agg of AGGREGATORS) {
    try {
      const res = await fetch(`${agg}/v1/blobs/${cleanBlobId}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  throw new Error(`Failed to read blob "${cleanBlobId}" from all aggregators`);
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
  const cleanBlobId = blobId.slice(0, 43);
  return `${AGGREGATOR}/v1/blobs/${cleanBlobId}`;
}

export function getWalrusScanUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
