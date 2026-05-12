/**
 * Walrus On-Chain Integration
 * - Tatum Sui RPC for reliable chain queries
 * - Move contract interactions for form/submission indexing
 */

import type { WalrusUploadResponse } from '@/types/walform';
import type { WalrusSigner } from '@/lib/walrus';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { getSuiRpcUrl } from '@/lib/walrus';

export const WALFORM_PACKAGE_ID: string =
  '0x56d0c64c632b581c6efc3fa7b6f058f3d1cdbd1d83fb7399a9da2cac48267e3f';

// ---------------------------------------------------------------------------
// Tatum-powered Sui client
// ---------------------------------------------------------------------------

let _suiClient: SuiJsonRpcClient | null = null;

/** Returns a singleton Sui JSON-RPC client, preferring Tatum RPC for reliability. */
export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    const url = getSuiRpcUrl(); // Uses Tatum if NEXT_PUBLIC_TATUM_API_KEY is set
    _suiClient = new SuiJsonRpcClient({ url, network: 'mainnet' });
  }
  return _suiClient;
}

// ---------------------------------------------------------------------------
// Upload entry point
// ---------------------------------------------------------------------------

export async function uploadOnChain(
  data: unknown,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (progress: { message: string }) => void,
): Promise<WalrusUploadResponse> {
  if (!signer?.address) {
    throw new Error('Sui Wallet not connected. Please connect your wallet first.');
  }

  const { uploadBytesToWalrus } = await import('@/lib/walrus');

  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof Blob || data instanceof File) {
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(data));
  }

  return uploadBytesToWalrus(bytes, signer, epochs, (p) =>
    onProgress?.({ message: p.message ?? `Status: ${p.status}` }),
  );
}

export async function uploadJsonOnChain<T>(
  data: T,
  signer: WalrusSigner,
  epochs = 3,
  onProgress?: (progress: { message: string }) => void,
): Promise<WalrusUploadResponse> {
  return uploadOnChain(data, signer, epochs, onProgress);
}

// ---------------------------------------------------------------------------
// Sui Move contract interactions
// ---------------------------------------------------------------------------

export async function createFormObject(formId: string, blobId: string, _ownerAddress: string) {
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

export async function createSubmissionObject(
  formId: string,
  blobId: string,
  status: string,
  owner: string,
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
