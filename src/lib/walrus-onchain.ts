/**
 * On-chain Walrus upload orchestrator (client-side).
 *
 * Flow (2 wallet popups):
 * 1. POST /api/walrus/prepare  → server encodes blob + builds registration PTB
 * 2. signAndExecuteTransaction → user pays WAL (storage cost) + SUI gas (wallet popup 1)
 * 3. POST /api/walrus/finalize → server uploads slivers to storage nodes + returns cert tx
 * 4. signAndExecuteTransaction → user signs cert tx (only SUI gas, popup 2)
 *
 * Result: blobId certified on Sui mainnet, WAL deducted from user wallet.
 */

import type { WalrusUploadResponse } from '@/types/motion';
import { dAppKit } from '@/app/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

/** Extract the first created object ID from a Sui tx result */
function extractBlobObjectId(txResult: Awaited<ReturnType<typeof dAppKit.signAndExecuteTransaction>>): string | null {
  // The tx result's effects.created contains newly created objects
  const effects = (txResult as Record<string, unknown>).effects as Record<string, unknown> | undefined;
  if (!effects) return null;

  const created = effects.created as Array<{ reference?: { objectId?: string }; objectId?: string }> | undefined;
  if (created?.length) {
    return created[0].reference?.objectId ?? created[0].objectId ?? null;
  }

  // Try bcs decoded effects
  const bcs = (txResult as Record<string, unknown>).bcs as Record<string, unknown> | undefined;
  if (bcs) {
    const bcsCreated = (bcs as Record<string, unknown>).created as Array<{ objectId?: string }> | undefined;
    if (bcsCreated?.length) return bcsCreated[0].objectId ?? null;
  }

  return null;
}

/**
 * Upload data to Walrus on-chain.
 * Requires the user's wallet to be connected via dAppKit.
 * Shows 2 wallet popups:
 *   Popup 1: Register blob + pay WAL storage cost (mainnet)
 *   Popup 2: Certify blob (small SUI gas only)
 */
export async function uploadOnChain(
  data: Uint8Array | string,
  ownerAddress: string,
  epochs = 10,
): Promise<WalrusUploadResponse> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  // ── Step 1: Server encodes blob + builds registration PTB ──────────────
  const prepareRes = await fetch('/api/walrus/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: Array.from(bytes), owner: ownerAddress, epochs }),
  });
  if (!prepareRes.ok) {
    const err = await prepareRes.json().catch(() => ({})) as { error?: string; detail?: string };
    throw new Error(`[Walrus] Prepare failed: ${err.error ?? ''} ${err.detail ?? ''}`.trim());
  }
  const { txBytes, blobId } = await prepareRes.json() as { txBytes: string; blobId: string; encodedSize: number };

  // ── Step 2: Client signs + executes registration tx (pays WAL + SUI gas) ─
  // Wallet popup 1: user pays WAL storage cost
  const registerTx = Transaction.from(Buffer.from(txBytes, 'base64'));
  const registerResult = await dAppKit.signAndExecuteTransaction({ transaction: registerTx });

  if (!registerResult.digest) throw new Error('[Walrus] Registration transaction failed — no digest returned');

  // Extract the blob object ID from the registration tx
  const blobObjectId = extractBlobObjectId(registerResult);
  if (!blobObjectId) {
    throw new Error('[Walrus] Could not find blobObjectId in registration tx effects. Please try again.');
  }

  // ── Step 3: Server uploads slivers → returns cert tx bytes ──────────────
  const finalizeRes = await fetch('/api/walrus/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobId, blobObjectId }),
  });
  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({})) as { error?: string; detail?: string };
    throw new Error(`[Walrus] Finalize failed: ${err.error ?? ''} ${err.detail ?? ''}`.trim());
  }
  const { certTxBytes } = await finalizeRes.json() as { certTxBytes: string };

  // ── Step 4: Client signs + executes certification tx (SUI gas only) ──────
  // Wallet popup 2: certify the blob is stored
  const certTx = Transaction.from(Buffer.from(certTxBytes, 'base64'));
  const certResult = await dAppKit.signAndExecuteTransaction({ transaction: certTx });

  if (!certResult.digest) throw new Error('[Walrus] Certification transaction failed');

  return { blobId, objectId: blobObjectId, endEpoch: epochs };
}

/**
 * Upload JSON to Walrus on-chain (helper).
 */
export async function uploadJsonOnChain<T>(data: T, ownerAddress: string, epochs = 10): Promise<WalrusUploadResponse> {
  return uploadOnChain(JSON.stringify(data), ownerAddress, epochs);
}
