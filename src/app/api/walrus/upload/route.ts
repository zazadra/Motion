import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/walrus/upload — DEPRECATED (410 Gone)
 *
 * Server-side Walrus uploads are architecturally impossible on Mainnet.
 * Every blob registration requires a Sui wallet-signed transaction (register + certify).
 * The server has no wallet and cannot sign on behalf of users.
 *
 * All media uploads must use the browser-side Walrus SDK with the user's connected wallet.
 * See: src/lib/walrus.ts → uploadBytesToWalrus()
 */
export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: 'Server-side Walrus uploads are not supported on Mainnet.',
      reason:
        'Every Walrus blob registration requires a Sui wallet-signed transaction (register + certify). ' +
        'The server has no wallet and cannot sign on behalf of users.',
      fix: 'Use the browser-side Walrus SDK (uploadBytesToWalrus) with the user\'s connected wallet.',
      docs: 'https://sdk.mystenlabs.com/walrus',
    },
    { status: 410 },
  );
}

// Reject all other HTTP methods too
export async function GET(_req: NextRequest) {
  return NextResponse.json({ error: 'This endpoint has been removed. See POST for details.' }, { status: 410 });
}
