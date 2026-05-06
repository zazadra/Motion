/**
 * POST /api/walrus/finalize
 *
 * Body: { blobId: string, blobObjectId: string }
 * Returns: { ok: true, blobId: string, certTxBytes: string }
 *
 * Server-side:
 * 1. Retrieves cached slivers from the prepare step
 * 2. Uploads slivers to all Walrus storage nodes
 * 3. Collects storage confirmations from nodes
 * 4. Builds the certification PTB
 * 5. Returns cert tx bytes for the client to sign (seals the blob on-chain)
 */

import { NextRequest, NextResponse } from 'next/server';
import { WalrusClient } from '@mysten/walrus';
import { CoreClient } from '@mysten/sui/client';
import { sliverCache } from '../prepare/route';

const suiClient    = new CoreClient({ network: 'mainnet', url: 'https://fullnode.mainnet.sui.io:443' });
const walrusClient = new WalrusClient({ network: 'mainnet', suiClient });

export async function POST(req: NextRequest) {
  try {
    const { blobId, blobObjectId } = await req.json() as {
      blobId: string;
      blobObjectId: string;
    };

    if (!blobId || !blobObjectId) {
      return NextResponse.json({ error: 'blobId and blobObjectId required' }, { status: 400 });
    }

    // Retrieve cached encoding from the prepare step
    const cached = sliverCache.get(blobId);
    if (!cached) {
      return NextResponse.json(
        { error: 'Blob encoding not found in cache. Please re-upload (start from prepare).' },
        { status: 404 }
      );
    }
    if (Date.now() > cached.expiresAt) {
      sliverCache.delete(blobId);
      return NextResponse.json(
        { error: 'Blob encoding cache expired (>15 min). Please re-upload.' },
        { status: 410 }
      );
    }

    const { metadata, sliversByNode } = cached;

    // 1. Upload slivers to all storage nodes + collect confirmations in one call
    const confirmations = await walrusClient.writeEncodedBlobToNodes({
      blobId,
      metadata,
      sliversByNode,
      deletable: false,
      objectId: blobObjectId,
    });

    // 2. Build certification transaction
    const validConfirmations = confirmations.filter((c): c is NonNullable<typeof c> => c !== null);
    if (validConfirmations.length === 0) {
      throw new Error('No storage confirmations received — nodes may be unavailable');
    }

    const certTx = walrusClient.certifyBlobTransaction({
      blobId,
      blobObjectId,
      confirmations: validConfirmations,
      deletable: false,
    });

    // Serialize cert tx for client to sign
    const certTxBytes = Buffer.from(await certTx.build({ client: suiClient })).toString('base64');

    // Clean up cache
    sliverCache.delete(blobId);

    return NextResponse.json({ ok: true, blobId, certTxBytes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[walrus/finalize] Error:', msg);
    return NextResponse.json({ error: 'Finalize failed', detail: msg }, { status: 500 });
  }
}
