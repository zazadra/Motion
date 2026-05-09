import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const epochs = searchParams.get('epochs') || '1';
    const sendObjectTo = searchParams.get('send_object_to');
    const publisherUrl = searchParams.get('publisher');

    if (!publisherUrl) {
      return NextResponse.json({ error: "Missing 'publisher' URL in query params" }, { status: 400 });
    }

    // Read the raw body bytes from the incoming request
    const buffer = await req.arrayBuffer();

    let url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
    if (sendObjectTo) {
      url += `&send_object_to=${sendObjectTo}`;
    }

    console.log(`[Walrus Proxy] Proxying upload to: ${publisherUrl}`);

    // Node.js fetch bypasses browser CORS!
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
      signal: AbortSignal.timeout(30000) 
    });

    if (!res.ok) {
      let errorText = await res.text();
      // Handle Cloudflare HTML errors gracefully (e.g., Staketab 502 Bad Gateway)
      if (res.status >= 500 && errorText.includes('<!DOCTYPE html>')) {
        errorText = `The storage node (${new URL(publisherUrl).hostname}) returned a Bad Gateway HTML response.`;
      }
      console.warn(`[Walrus Proxy] [${publisherUrl}] failed: ${res.status} - ${errorText.substring(0, 100)}`);
      return NextResponse.json({ error: errorText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Walrus Proxy] Internal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
