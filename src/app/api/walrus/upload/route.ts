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
    
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    // Vercel Hobby has 4.5MB limit. 
    if (buffer.byteLength > 4.5 * 1024 * 1024) { 
      return NextResponse.json({ error: "File too large for proxy (Vercel 4.5MB limit). Client will switch to direct upload." }, { status: 413 });
    }

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
      let errorText = '';
      try {
        errorText = await res.text();
      } catch {
        errorText = `HTTP ${res.status}`;
      }
      
      // Handle Cloudflare HTML errors gracefully (e.g., Staketab 502 Bad Gateway)
      if (res.status >= 500 && errorText.includes('<!DOCTYPE html>')) {
        errorText = `The storage node (${new URL(publisherUrl).hostname}) returned a Bad Gateway (502/504). This usually means the node is busy or offline.`;
      }
      
      console.warn(`[Walrus Proxy] [${publisherUrl}] failed: ${res.status} - ${errorText.substring(0, 100)}`);
      return NextResponse.json({ error: errorText || `Provider error ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Walrus Proxy] Internal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
