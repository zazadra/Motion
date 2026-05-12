/**
 * Walform Submission Registry API
 *
 * Simple server-side registry: formBlobId → [submissionBlobIds]
 * - GET  /api/registry?formId=xxx      → returns submission blobIds for a form
 * - POST /api/registry                  → register a new submission blobId
 *
 * Data is kept in-memory (fast) and also persisted to /tmp/walform-registry.json
 * so it survives across warm Lambda invocations (resets only on cold start / redeploy).
 * The submitter's browser also caches in localStorage as a secondary source.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TMP_DIR = '/tmp';
const REGISTRY_FILE = join(TMP_DIR, 'walform-registry.json');

// In-memory store: formBlobId → Set<submissionBlobId>
const memRegistry = new Map<string, Set<string>>();
let memLoaded = false;

function ensureLoaded() {
  if (memLoaded) return;
  memLoaded = true;
  try {
    mkdirSync(TMP_DIR, { recursive: true });
    const raw = readFileSync(REGISTRY_FILE, 'utf-8');
    const parsed: Record<string, string[]> = JSON.parse(raw);
    for (const [formId, ids] of Object.entries(parsed)) {
      memRegistry.set(formId, new Set(ids));
    }
    console.log(`[Registry] Loaded ${Object.keys(parsed).length} forms from disk`);
  } catch {
    // File doesn't exist yet — start fresh
  }
}

function persist() {
  try {
    const obj: Record<string, string[]> = {};
    memRegistry.forEach((ids, formId) => { obj[formId] = [...ids]; });
    writeFileSync(REGISTRY_FILE, JSON.stringify(obj));
  } catch (e) {
    console.warn('[Registry] Failed to persist to disk:', e);
  }
}

// ---------------------------------------------------------------------------
// GET /api/registry?formId=xxx
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  ensureLoaded();
  const formId = req.nextUrl.searchParams.get('formId');

  if (!formId) {
    // Return all registry data (for admin full-sync)
    const all: Record<string, string[]> = {};
    memRegistry.forEach((ids, fId) => { all[fId] = [...ids]; });
    return NextResponse.json({ registry: all });
  }

  const ids = memRegistry.get(formId) ?? new Set<string>();
  return NextResponse.json({ formId, submissionBlobIds: [...ids] });
}

// ---------------------------------------------------------------------------
// POST /api/registry
// Body: { formBlobId: string, submissionBlobId: string }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  ensureLoaded();
  try {
    const body = await req.json();
    const { formBlobId, submissionBlobId } = body as { formBlobId?: string; submissionBlobId?: string };

    if (!formBlobId || !submissionBlobId) {
      return NextResponse.json({ error: 'formBlobId and submissionBlobId are required' }, { status: 400 });
    }

    const ids = memRegistry.get(formBlobId) ?? new Set<string>();
    const isNew = !ids.has(submissionBlobId);
    ids.add(submissionBlobId);
    memRegistry.set(formBlobId, ids);

    if (isNew) persist();

    return NextResponse.json({ ok: true, count: ids.size });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
