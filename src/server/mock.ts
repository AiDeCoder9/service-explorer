import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RawDataset } from '@/lib/data/types';

let cached: RawDataset | undefined;

export function loadRaw(): RawDataset {
  cached ??= JSON.parse(readFileSync(path.join(process.cwd(), 'data/task1-service-explorer.json'), 'utf8')) as RawDataset;
  return cached;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Behaves like a real API: some latency, and it can fail on demand. Failure is
 * switched on with the `mock-fail=1` cookie (the footer toggle sets it) or `?fail=1`.
 */
export async function mockResponse(request: Request, pick: (data: RawDataset) => unknown, baseMs: number): Promise<Response> {
  await wait(baseMs + Math.random() * 250);
  const cookie = request.headers.get('cookie') ?? '';
  const failing = /(?:^|;\s*)mock-fail=1/.test(cookie) || new URL(request.url).searchParams.get('fail') === '1';
  if (failing) {
    return Response.json({ message: 'Service temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(pick(loadRaw()), { headers: { 'Cache-Control': 'no-store' } });
}
