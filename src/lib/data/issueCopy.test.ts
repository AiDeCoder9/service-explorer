import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GROUP_COPY, GROUP_ORDER, ISSUE_COPY } from './issueCopy';
import { normalizeDataset } from './normalize';
import type { RawDataset } from './types';

describe('issue copy', () => {
  const raw = JSON.parse(readFileSync(new URL('../../../data/task1-service-explorer.json', import.meta.url), 'utf8')) as RawDataset;
  const { issues } = normalizeDataset(raw);

  it('has plain-language copy for every issue the real data produces', () => {
    const missing = issues.map((i) => i.code).filter((c) => !ISSUE_COPY[c]);
    expect(missing).toEqual([]);
  });

  it('puts every entry in a known group', () => {
    for (const c of Object.values(ISSUE_COPY)) {
      expect(GROUP_ORDER).toContain(c.group);
      expect(GROUP_COPY[c.group]).toBeDefined();
    }
  });

  it('keeps technical wording out of the copy', () => {
    const text = Object.values(ISSUE_COPY).map((c) => `${c.title} ${c.found} ${c.seen}`).join(' ');
    expect(text).not.toMatch(/normalize|facet|bitset|\.ts\b|\bID\b|\bAPI\b/i);
  });
});
