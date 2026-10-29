import type { Metadata } from 'next';
import Link from 'next/link';
import { GROUP_COPY, GROUP_ORDER, ISSUE_COPY, type IssueCopy, type IssueGroup } from '@/lib/data/issueCopy';
import { normalizeDataset } from '@/lib/data/normalize';
import type { DataIssue } from '@/lib/data/types';
import { loadRaw } from '@/server/mock';

export const metadata: Metadata = { title: 'Why some data looks different · MedEx Service Explorer' };
export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en');

/** Unknown codes still show up, using the raw decision text, so nothing is silently dropped. */
function copyFor(i: DataIssue): IssueCopy {
  return ISSUE_COPY[i.code] ?? { group: 'details', title: i.code, found: 'Found in the data.', seen: i.decision };
}

function unitFor(c: IssueCopy, count: number) {
  const unit = c.unit ?? 'services';
  return `${n(count)} ${count === 1 ? unit.replace(/s$/, '') : unit}`;
}

export default function DataIssues() {
  const raw = loadRaw();
  const data = normalizeDataset(raw);
  const total = raw.services.length;
  const shown = data.services.length;
  const pct = Math.round((shown / total) * 100);

  const byGroup = new Map<IssueGroup, DataIssue[]>();
  for (const i of data.issues) {
    const g = copyFor(i).group;
    byGroup.set(g, [...(byGroup.get(g) ?? []), i]);
  }

  return (
    <main className="shell issues" id="main">
      <p><Link href="/">← Back to the explorer</Link></p>

      <section className="intro">
        <h1>Why some data looks different</h1>
        <p className="muted">
          Providers type their information in by hand, so some entries are incomplete or odd. Here is what we found
          and what we do about it, so you never see something misleading.
        </p>
      </section>

      <section className="issues-hero" aria-label="Summary">
        <p className="issues-big"><strong>{n(shown)}</strong> <span>of {n(total)} services are shown</span></p>
        <div className="meter" role="img" aria-label={`${pct} percent of services are shown`}><span style={{ width: `${pct}%` }} /></div>
        <p className="muted small">The other {n(total - shown)} are hidden on purpose. Some services fail more than one check, so the counts below can add up to more.</p>
      </section>

      {GROUP_ORDER.map((g) => {
        const rows = byGroup.get(g);
        if (!rows?.length) return null;
        const info = GROUP_COPY[g];
        return (
          <section key={g} className="issue-group" aria-labelledby={`g-${g}`}>
            <div className="issue-group-head">
              <span className="avatar" aria-hidden="true">{info.icon}</span>
              <div>
                <h2 id={`g-${g}`}>{info.title}</h2>
                <p className="muted small">{info.blurb}</p>
              </div>
            </div>
            <div className="cards">
              {rows.map((i) => {
                const c = copyFor(i);
                return (
                  <article key={i.code} className="card issue">
                    <header>
                      <h3>{c.title}</h3>
                      <span className="badge">{unitFor(c, i.count)}</span>
                    </header>
                    <p><span className="k">What we found</span>{c.found}</p>
                    <p>
                      <span className="k">What customers see</span>{c.seen}
                      {c.sample && <span className="sample">{c.sample}</span>}
                    </p>
                    <details className="tech">
                      <summary>Technical details</summary>
                      <dl>
                        <dt>Rule</dt><dd><code>{i.code}</code></dd>
                        <dt>How it is handled</dt><dd>{i.decision}</dd>
                        <dt>Example id</dt><dd><code>{i.examples[0]}</code></dd>
                      </dl>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
