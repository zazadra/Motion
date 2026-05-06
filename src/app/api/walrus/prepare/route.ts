/**
 * POST /api/walrus/prepare
 * 
 * Body: { data: number[], owner: string, epochs?: number }
 * Returns: { txBytes: string, blobId: string }
 *
 * Server-side:
 * 1. Encodes the blob into slivers using the Walrus SDK (WASM, Node-only)
 * 2. Builds a registration PTB that includes WAL storage payment
 * 3. Returns the transaction bytes (Base64) for the client to sign
 *
 * The user's wallet pays WAL + SUI gas when signing this transaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { WalrusClient } from '@mysten/walrus';
import { CoreClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const suiClient    = new CoreClient({ network: 'mainnet', url: 'https://fullnode.mainnet.sui.io:443' });
const walrusClient = new WalrusClient({ network: 'mainnet', suiClient });

// Module-level sliver cache (short-lived, purged in /finalize)
export interface CachedEncoding {
  blobId: string;
  metadata: Awaited<ReturnType<WalrusClient['encodeBlob']>>['metadata'];
  sliversByNode: Awaited<ReturnType<WalrusClient['encodeBlob']>>['sliversByNode'];
  size: number;
  expiresAt: number; // epoch ms
}

export const sliverCache = new Map<string, CachedEncoding>();

export async function POST(req: NextRequest) {
  try {
    const { data, owner, epochs = 10 } = await req.json() as {
      data: number[];
      owner: string;
      epochs?: number;
    };

    if (!Array.isArray(data) || !owner) {
      return NextResponse.json({ error: 'data (number[]) and owner (string) are required' }, { status: 400 });
    }

    const bytes = new Uint8Array(data);

    // 1. Encode blob into slivers using WalrusClient (WASM — runs server-side only)
    const { blobId, metadata, sliversByNode, rootHash } = await walrusClient.encodeBlob(bytes);

    // 2. Build the registration transaction (includes WAL storage cost)
    //    The owner field ensures WAL is drawn from their wallet when they sign
    const tx: Transaction = walrusClient.registerBlobTransaction({
      blobId,
      rootHash,
      size: bytes.length,
      epochs,
      deletable: false,
      owner,
    });

    // Serialize to Base64 for the client
    const txBytes = Buffer.from(await tx.build({ client: suiClient })).toString('base64');

    // Cache slivers for the finalize step (TTL: 15 min)
    sliverCache.set(blobId, {
      blobId,
      metadata,
      sliversByNode,
      size: bytes.length,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    return NextResponse.json({ txBytes, blobId, size: bytes.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[walrus/prepare] Error:', msg);
    return NextResponse.json({ error: 'Prepare failed', detail: msg }, { status: 500 });
  }
}
