/**
 * Walrus On-Chain Integration
 *
 * Coordinates between:
 *   1. Walrus blob storage (via HTTP Relay)
 *   2. Sui Move smart contracts (Form/Submission indexing)
 */

import type { WalrusUploadResponse } from '@/types/walform';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { NETWORK } from '@/lib/walrus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WALFORM_PACKAGE_ID: string =
  '0x56d0c64c632b581c6efc3fa7b6f058f3d1cdbd1d83fb7399a9da2cac48267e3f';

const WALRUS_BLOB_TYPE = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob';

// ---------------------------------------------------------------------------
// Sui Client singleton
// ---------------------------------------------------------------------------

let _suiClient: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    _suiClient = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(NETWORK as 'mainnet'),
      network: NETWORK as any,
    });
  }
  return _suiClient;
}

// ---------------------------------------------------------------------------
// Upload entry points
// ---------------------------------------------------------------------------

/**
 * Upload arbitrary data to Walrus using the high-performance HTTP relay.
 *
 * @param data - Any JSON-serializable value, or a raw Uint8Array/Blob/File
 * @param ownerAddress - The user's connected Sui wallet address
 * @param epochs - Storage duration (default 5 ≈ ~6 months on mainnet)
 * @param targetOwner - Address to receive the Blob NFT (defaults to ownerAddress)
 * @param onProgress - Progress message callback for UI feedback
 */
export async function uploadOnChain(
  data: unknown,
  ownerAddress: string,
  epochs = 5,
  targetOwner?: string,
  onProgress?: (progress: { message: string }) => void
): Promise<WalrusUploadResponse> {
  if (!ownerAddress) throw new Error('Sui Wallet not found. Please ensure your wallet is connected and unlocked.');

  const { uploadBytesToWalrus } = await import('@/lib/walrus');

  // Serialize to bytes if not already raw binary
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof Blob || data instanceof File) {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(data));
  }

  onProgress?.({ message: 'Uploading to Walrus via high-performance relay...' });
  
  // Use the direct HTTP upload which is much faster and more reliable
  const res = await uploadBytesToWalrus(
    bytes, 
    epochs, 
    targetOwner || ownerAddress, 
    (p) => onProgress?.({ message: p.message || `Status: ${p.status}` })
  );

  console.log("[Walrus] Upload successful:", res);
  
  return res;
}

/**
 * Convenience wrapper for JSON data uploads.
 */
export async function uploadJsonOnChain<T>(
  data: T,
  ownerAddress: string,
  epochs = 5,
  targetOwner?: string,
  onProgress?: (progress: { message: string }) => void
): Promise<WalrusUploadResponse> {
  return uploadOnChain(data, ownerAddress, epochs, targetOwner, onProgress);
}

// ---------------------------------------------------------------------------
// Sui Move contract interactions
// ---------------------------------------------------------------------------

/**
 * Creates a Form indexing object on Sui chain.
 */
export async function createFormObject(
  formId: string,
  blobId: string,
  _ownerAddress: string
) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::create_form`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(blobId),
      txb.pure.u64(BigInt(Date.now())),
    ],
  });
  return txb;
}

/**
 * Creates a Submission indexing object on Sui chain.
 */
export async function createSubmissionObject(
  formId: string,
  blobId: string,
  status: string,
  owner: string
) {
  const { Transaction } = await import('@mysten/sui/transactions');
  const txb = new Transaction();
  txb.moveCall({
    target: `${WALFORM_PACKAGE_ID}::walform::register_submission`,
    arguments: [
      txb.pure.string(formId),
      txb.pure.string(blobId),
      txb.pure.u64(BigInt(Date.now())),
      txb.pure.string(status),
      txb.pure.address(owner),
    ],
  });
  return txb;
}
