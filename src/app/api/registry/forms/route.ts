/**
 * Walform Forms Registry API
 *
 * - GET  /api/registry/forms?owner=xxx  → returns form blobIds published by owner
 * - POST /api/registry/forms            → register a new form blobId
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TMP_DIR = '/tmp';
const FORMS_FILE = join(TMP_DIR, 'walform-forms.json');

// owner address → Set<formBlobId>
const memForms = new Map<string, Set<string>>();
let memLoaded = false;

function ensureLoaded() {
  if (memLoaded) return;
  memLoaded = true;
  try {
    mkdirSync(TMP_DIR, { recursive: true });
    const raw = readFileSync(FORMS_FILE, 'utf-8');
    const parsed: Record<string, string[]> = JSON.parse(raw);
    for (const [owner, ids] of Object.entries(parsed)) {
      memForms.set(owner, new Set(ids));
    }
  } catch { /* start fresh */ }
}

function persist() {
  try {
    const obj: Record<string, string[]> = {};
    memForms.forEach((ids, owner) => { obj[owner] = [...ids]; });
    writeFileSync(FORMS_FILE, JSON.stringify(obj));
  } catch { /* ignore */ }
}

export async function GET(req: NextRequest) {
  ensureLoaded();
  const owner = req.nextUrl.searchParams.get('owner');
  if (!owner) {
    return NextResponse.json({ error: 'owner required' }, { status: 400 });
  }
  const ids = memForms.get(owner) ?? new Set<string>();
  return NextResponse.json({ owner, formBlobIds: [...ids] });
}

export async function POST(req: NextRequest) {
  ensureLoaded();
  try {
    const { ownerAddress, formBlobId } = await req.json() as { ownerAddress?: string; formBlobId?: string };
    if (!ownerAddress || !formBlobId) {
      return NextResponse.json({ error: 'ownerAddress and formBlobId required' }, { status: 400 });
    }
    const ids = memForms.get(ownerAddress) ?? new Set<string>();
    const isNew = !ids.has(formBlobId);
    ids.add(formBlobId);
    memForms.set(ownerAddress, ids);
    if (isNew) persist();
    return NextResponse.json({ ok: true, count: ids.size });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
