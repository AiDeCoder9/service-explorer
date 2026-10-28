import type { Metadata } from 'next';
import Link from 'next/link';
import { normalizeDataset } from '@/lib/data/normalize';
import { loadRaw } from '@/server/mock';

export const metadata: Metadata = { title: 'Data issues · MedEx Service Explorer' };
export const dynamic = 'force-dynamic';

const GROUPS: { title: string; blurb: string; match: (code: string) => boolean }[] = [
  { title: 'Hidden from customers', blurb: 'A service is shown only if the service, its provider and its category are all active.', match: (c) => c.startsWith('hidden-') },
  { title: 'Prices', blurb: 'Prices we could not trust or that need special wording. We never show a made-up number.', match: (c) => c.startsWith('price-') || c.startsWith('wellness-') },
  { title: 'Missing or inconsistent fields', blurb: 'Kept in the results, with a defined fallback.', match: (c) => ['no-category', 'no-subcategory', 'subcategory-mismatch', 'provider-unrated', 'title-whitespace'].includes(c) },
  { title: 'Judgement calls', blurb: 'Things that look like mistakes but are not.', match: (c) => c === 'same-title-listings' },
];

export default function DataIssues() {
  const raw = loadRaw();
  const data = normalizeDataset(raw);
  return (
    <main className="shell prose" id="main">
      <p><Link href="/">← Back to the explorer</Link></p>
      <h1>Data issues</h1>
      <p className="muted">
        Providers enter this data by hand. Of {raw.services.length.toLocaleString('en')} services, {data.services.length.toLocaleString('en')} are
        visible to customers. Each row below is a rule in <code>normalize.ts</code>, with a count from the real file and what a customer sees instead.
      </p>
      {GROUPS.map((g) => {
        const rows = data.issues.filter((i) => g.match(i.code));
        if (rows.length === 0) return null;
        return (
          <section key={g.title}>
            <h2>{g.title}</h2>
            <p className="muted">{g.blurb}</p>
            <table>
              <thead><tr><th scope="col">Rule</th><th scope="col" className="num">Count</th><th scope="col">What the customer gets</th><th scope="col">Example id</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.code}>
                    <th scope="row"><code>{i.code}</code></th>
                    <td className="num">{i.count.toLocaleString('en')}</td>
                    <td>{i.decision}</td>
                    <td><code className="small">{i.examples[0]}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
