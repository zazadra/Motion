import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const PUBLISHER_POOL = [
  'https://publisher.walrus-mainnet.mystenlabs.com',
  'https://publisher.walrus.space',
  'https://walrus-mainnet-publisher.staketab.org',
  'https://walrus-mainnet-publisher-1.staketab.org',
  'https://walrus-mainnet-publisher.chainode.tech',
  'https://publisher.walrus-mainnet.nodeinfra.com',
  'https://publisher.walrus-mainnet.decentnode.com',
  'https://publisher.walrus-mainnet.blockscope.net'
];

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = searchParams.get('epochs') || '1';
    const sendObjectTo = searchParams.get('send_object_to');

    // Buffer the request into memory to allow retries across different providers
    // Note: Vercel Edge Runtime handles requests up to ~4MB when buffered this way.
    const buffer = await req.arrayBuffer();
    
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    if (buffer.byteLength > 4.5 * 1024 * 1024) { 
      return NextResponse.json({ error: "File too large for backend relay (4.5MB limit). Please use a smaller file." }, { status: 413 });
    }

    let lastError = '';

    // Provider Rotation Loop
    for (const publisherUrl of PUBLISHER_POOL) {
      let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
      if (sendObjectTo) {
        url += `&send_object_to=${sendObjectTo}`;
      }

      console.log(`[Backend Relay] Attempting upload to: ${publisherUrl}`);

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: buffer,
          signal: AbortSignal.timeout(30000) 
        });

        if (!res.ok) {
          let errorText = '';
          try {
            errorText = await res.text();
          } catch {
            errorText = `HTTP ${res.status}`;
          }
          
          if (res.status >= 500 && errorText.includes('<!DOCTYPE html>')) {
            errorText = `Bad Gateway (502/504) - Node offline`;
          }
          
          console.warn(`[Backend Relay] [${publisherUrl}] failed: ${res.status} - ${errorText.substring(0, 100)}`);
          lastError = `${publisherUrl}: ${res.status} ${errorText.substring(0, 50)}`;
          continue; // Try next provider
        }

        const data = await res.json();
        console.log(`[Backend Relay] SUCCESS on ${publisherUrl}`);
        return NextResponse.json(data);

      } catch (err: any) {
        console.warn(`[Backend Relay] [${publisherUrl}] Network/Timeout Error: ${err.message}`);
        lastError = `${publisherUrl}: ${err.message}`;
        continue; // Try next provider
      }
    }

    // If we reach here, all providers failed
    console.error('[Backend Relay] All providers failed. Last error:', lastError);
    return NextResponse.json({ error: `All Walrus publishers failed. Last error: ${lastError}` }, { status: 502 });

  } catch (error: any) {
    console.error('[Backend Relay] Internal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
