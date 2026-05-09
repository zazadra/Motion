import { NextRequest, NextResponse } from 'next/server';

const WALRUS_PUBLISHER = 'https://walrus-mainnet-publisher-1.staketab.org:443';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = searchParams.get('epochs') || '1';
    const sendObjectTo = searchParams.get('send_object_to');

    // Read the raw body bytes from the incoming request
    const buffer = await req.arrayBuffer();

    // Construct the Walrus Publisher URL
    let url = `${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`;
    if (sendObjectTo) {
      url += `&send_object_to=${sendObjectTo}`;
    }

    // Node.js fetch bypasses browser CORS!
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (!res.ok) {
      let errorText = await res.text();
      // Handle Cloudflare HTML errors gracefully (e.g., Staketab 502 Bad Gateway)
      if (res.status >= 500 && errorText.includes('<!DOCTYPE html>')) {
        errorText = "The Walrus Mainnet storage nodes are currently offline or experiencing high traffic (Bad Gateway). Please try again later.";
      }
      console.error('[Walrus Proxy] Upload failed:', res.status, errorText);
      return NextResponse.json({ error: errorText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Walrus Proxy] Internal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
