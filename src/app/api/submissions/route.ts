import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const INDEX_PATH = path.resolve(process.cwd(), '.motion-index.json');

export function readIndex(): Record<string, string[]> {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

export function writeIndex(data: Record<string, string[]>) {
  try { fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2), 'utf-8'); }
  catch (e) { console.error('[motion-index] write failed:', e); }
}

// GET /api/submissions?formBlobId=X  → submissions for that form
// GET /api/submissions               → all submission IDs across all forms
export async function GET(req: NextRequest) {
  const formBlobId = req.nextUrl.searchParams.get('formBlobId');
  const index = readIndex();

  if (!formBlobId) {
    // Return ALL submission IDs across every registered form
    const allIds = [...new Set(Object.values(index).flat())];
    return NextResponse.json({ formBlobId: 'all', count: allIds.length, subBlobIds: allIds });
  }

  const ids = index[formBlobId] ?? [];
  return NextResponse.json({ formBlobId, count: ids.length, subBlobIds: ids });
}

// POST /api/submissions  body: { formBlobId, subBlobId }
export async function POST(req: NextRequest) {
  let body: { formBlobId?: string; subBlobId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { formBlobId, subBlobId } = body;
  if (!formBlobId || !subBlobId) {
    return NextResponse.json({ error: 'formBlobId and subBlobId required' }, { status: 400 });
  }

  const index = readIndex();
  const current = index[formBlobId] ?? [];
  if (!current.includes(subBlobId)) {
    index[formBlobId] = [...current, subBlobId];
    writeIndex(index);
  }

  return NextResponse.json({ ok: true, count: (index[formBlobId] ?? []).length });
}
