'use client';

import { useCallback, useEffect, useState } from 'react';
import { normalizeDataset } from '@/lib/data/normalize';
import type { RawCategory, RawProvider, RawService } from '@/lib/data/types';
import { type SearchIndex, buildIndex } from '@/lib/engine';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: SearchIndex };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 503 ? 'The service list is temporarily unavailable.' : `Request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

let inflight: Promise<SearchIndex> | undefined;

function load(): Promise<SearchIndex> {
  inflight ??= Promise.all([
    getJson<RawCategory[]>('/api/category/active'),
    getJson<RawProvider[]>('/api/providers'),
    getJson<RawService[]>('/api/service'),
  ])
    .then(([categories, providers, services]) => buildIndex(normalizeDataset({ categories, providers, services })))
    .catch((e: unknown) => {
      inflight = undefined; // a failed load must never be cached
      throw e;
    });
  return inflight;
}

/** Loads the three endpoints once, builds the in-memory index, and supports retry. */
export function useExplorerData(): { state: DataState; retry: () => void } {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    load().then(
      (index) => !cancelled && setState({ status: 'ready', index }),
      (e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' }),
    );
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
