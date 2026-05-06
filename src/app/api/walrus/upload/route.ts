import { NextRequest, NextResponse } from 'next/server';

/**
 * Walrus upload proxy — avoids CORS on the browser side.
 * Tries Walrus Mainnet publisher first, falls back to Testnet.
 * 
 * EInvalidEpochsAhead fix: max epochs for Walrus is 53.
 */
const MAINNET_PUBLISHER = 'https://publisher.walrus.space';
const TESTNET_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';

// Walrus max epochs ahead = 53. Use 10 (≈10 weeks mainnet / ~10 days testnet).
const SAFE_EPOCHS = '10';

export async function PUT(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? 'application/octet-stream';
  const body        = Buffer.from(await req.arrayBuffer());

  async function tryPublisher(baseUrl: string) {
    const res = await fetch(`${baseUrl}/v1/blobs?epochs=${SAFE_EPOCHS}`, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': contentType },
    });
    return res;
  }

  // Try mainnet first
  try {
    const res = await tryPublisher(MAINNET_PUBLISHER);
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ ...data, _network: 'mainnet' }, { status: 200 });
    }
    // Publisher returned an HTTP error — don't fall back, return the real error
    const text = await res.text();
    return NextResponse.json({ error: 'Walrus mainnet error', detail: text }, { status: res.status });
  } catch {
    // Network-level failure (unreachable) — fall back to testnet
    try {
      const res = await tryPublisher(TESTNET_PUBLISHER);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ ...data, _network: 'testnet' }, { status: 200 });
      }
      const text = await res.text();
      return NextResponse.json({ error: 'Walrus testnet error', detail: text }, { status: res.status });
    } catch (e2: unknown) {
      return NextResponse.json({ error: 'Both Walrus publishers unreachable', detail: String(e2) }, { status: 502 });
    }
  }
}
