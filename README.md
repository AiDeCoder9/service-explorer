# MedEx Service Explorer

A page where a customer browses and filters health services grouped by provider, with live facet counts. Built for the MedEx take-home, Task 1.

> The story it is designed around: *"I need a full-body check-up near Bangkok, under 5,000 THB, and I'd like to compare a few hospitals side by side."*
> Try it: `/?place=city:Bangkok&type=package&cur=THB&max=5000`

> **Before you judge the numbers:** some data looks different from the raw file on purpose. Read the **Why some data looks different** page (`/data-issues`, linked from the footer) to see what was hidden or changed, and why.

## Run it

```bash
yarn install
yarn dev              # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `yarn test` | 55 unit tests (data rules, pricing, facet engine, grouping, URL) |
| `yarn typecheck` | TypeScript, strict |
| `yarn build && yarn start -p 3100` then `yarn e2e` | 19 browser checks over Chrome's DevTools protocol (needs Google Chrome; set `CHROME_PATH` elsewhere) |

To see the API failure state, tick **Simulate API failure** in the page footer (it sets a cookie the mock API reads and reloads), then use **Try again**.

Stack: Next.js 16 (App Router), React 19, TypeScript, Vitest, plain CSS. No UI or state library: the interesting logic is the engine, and a library would hide it.

## How it is built

```
data/*.json ─► mock API (latency, can fail) ─► normalize.ts ─► index (bitsets) ─► search ─► results ─► UI
                /api/category/active                 │                              ▲
                /api/providers                       └─► issues ─► /data-issues     └─ view ⇄ URL
                /api/service
```

- `src/lib/data` turns raw API shapes into what the UI can trust. Every judgement call is recorded as an issue.
- `src/lib/engine` is pure TypeScript with no React: the index, `search`, grouping and sorting, and the URL codec. It is shared by anything that needs it and is where almost all the tests are.
- `src/components` is thin: it renders what the engine returns.
- The URL is the single source of truth for filters, sort and page. The view is derived from `useSearchParams` on every render, so reload, share and back/forward restore the same view by construction.

## Decisions and trade-offs

### Facet counts (the part I would defend first)
Each facet's option counts are computed against **every other active filter but not its own**. Selecting "Bangkok" shows how many lab tests there are in Bangkok, and selecting "Lab test" does not make the other types read 0.

To make that cheap, the data is indexed once into bitsets (one bit per service, one bitset per filter option). A query is a few AND/OR passes over about 90 words, and each facet's counts are a popcount of "everyone else's mask AND this option's bits".

I did not trust this by eye. `search.test.ts` checks it against a brute-force oracle (plain loops, no bitsets) on 200 random filter combinations, comparing every option of every facet, and asserts that more than 40 of those combinations had three or more filters active.

### Zero-result options: disabled, not hidden
Hiding moves the rows under the pointer, makes counts jump, and hides the reason a choice is unavailable. Disabled options stay where they are and say why: *"Clear service type to see 11"*, and the line is a button that does it. The option stays focusable (`aria-disabled`) so keyboard and screen-reader users reach the reason too. A zero-count option that is already selected stays toggleable, so you can always undo it.

### Prices across currencies
Prices are in the provider's currency and there are no exchange rates, so nothing is ever summed or converted. The design:
- The price range **belongs to one currency**. If the current results are all one currency (for example after choosing Bangkok), the price filter is simply "Pricing in THB".
- If results span several, the filter says so and asks the customer to choose a currency on purpose, with a result count for each. Choosing one also filters out the others, and says so.
- Price sort never compares across currencies. When a price sort spans several, results come in labelled **currency bands** ("Prices in THB · not compared with other currencies"), largest band first.
- Money is parsed from decimal strings and rounded only for display, to 2 decimals.

### Wellness, free and untrustworthy prices
- Wellness has no single price: the card shows *from* the cheapest valid duration option, with its minutes and the number of durations. The comparison price used for filtering and sorting is that same cheapest option.
- A final price of 0 shows as **Free**.
- A service whose numbers cannot produce a sane price shows **Price on request** and is excluded from price filtering and sorting.

### Relevance, defined
A search-word hit in the title counts 3, a hit in the provider name or category counts 1, a discounted service gets +0.5, and the provider's rating / 10 is the tie-breaker. With no search text this reduces to "discounted and well-rated first". Providers are ordered by their best service.

### Pagination and "View all"
Pagination is over providers (10 per page). "View all N services" expands the card inline; N reflects the active filters.

### Mobile
Filters open in a native `<dialog>` drawer. Choices are pending until applied, and the button reads "Show 1,155 results" using the pending selection, before it is applied.

## UI overhaul: ask, act, simplify

### Why we changed it

The first version worked and was fast, but it was a conventional sidebar plus a list, and two problems showed up in use:

1. **It looked dull and generic.** One flat teal, plain boxes, nothing that said where to start.
2. **It was confusing to use.** Six filter groups (type, category, provider, location, price, home visit) were on screen at once, with roughly 100 checkboxes between them. A first-time visitor had to learn the filters before they could ask a question. The most common intent, "I want X, near Y, under Z", took several clicks across several groups.

The redesign follows three ideas, and each one answers one of those problems.

| Idea | Problem it answers | What it became |
|---|---|---|
| Conversational search | Too many clicks to say what you want | One ask bar that reads a sentence |
| Action-first | Users were left to work out the next step | Suggestions, an empty state that fixes itself, compare |
| Purposeful minimalism | Too much on screen at once | Filters tucked behind pills, simpler cards |

### What changed and the reasoning

- **Ask bar instead of a sidebar.**
  - Plain words still search as you type. A sentence with structure ("thyroid tests in Bangkok under 2000 THB") is read by `src/lib/engine/intent.ts`, shown back as "Understood as" chips, and applied on Enter.
  - *Why local rules and not an LLM:* the app has no backend, the dataset is small and structured, and the README's performance numbers depend on everything running instantly in the browser. A rule-based parser needs no API key, adds no latency or cost, gives the same answer every time, and is unit tested (`intent.test.ts`). `parseIntent` is the single seam where a model could replace it later.
  - *Why wait for Enter on structured sentences:* applying half a sentence while someone types ("under 2" then "under 20") would flash wrong results. Plain words keep the instant, debounced search.
  - *Why show chips before applying:* the user can see what was understood, so a wrong guess is visible and cheap to fix. Anything the parser does not recognise stays a keyword search, so nothing is silently dropped.
- **Filters on demand (pills and sheets).** Type, Where, Price and Home visit are pills, and "All filters" opens the full panel. Each opens a focused sheet (side panel on desktop, bottom sheet on phones). *Why:* most people use one or two filters, so the other four groups were noise. The sheets reuse the existing `FilterPanel` through a new `only` option, so the filter logic, counts and the pending-choice "Show N results" button are unchanged. Zero-count options are still disabled, not hidden.
- **Action-first suggestions.** A row under the bar offers example questions at first, then "Drop X → N results", "Cheapest first" and "Top rated first". *Why:* the engine already knows which single change brings the most results back (`suggestRemovals`), so the interface should offer it instead of making people work it out.
- **Empty state that helps.** It lists ranked ways back plus "Ask differently", which focuses the bar. *Why:* a dead end is the worst moment in a search; this turns it into one tap.
- **Compare tray.** Up to three services side by side. Services priced in different currencies are shown together but never ranked or converted, which keeps the existing "no cross-currency conversion" rule. *Why:* comparing was listed as left out in the first version, and it is the natural next action after finding candidates.
- **Simpler cards.** Provider avatar, one price line per service, less boxing. Chips now show only what the pills do not already show (search text, category, provider). *Why:* less to read per result.
- **Visual system.** New tokens (teal to indigo accent, softer surfaces, layered shadows), a glowing ask bar as the focal point, and light and dark themes with a manual toggle applied before first paint so there is no flash. System fonts are kept so there is no extra request and no layout shift.

### Branding
The header uses the MedEx Health Services logo (`public/medex-logo.png`, downscaled to 640 px wide, with explicit width and height so it causes no layout shift). It is the only thing taken from the company's website: the colours and fonts are unchanged and the dataset is the supplied one. The wordmark is purple on transparent, so in dark mode it sits on a light chip to stay legible.

### What did not change

The engine, data normalisation, URL codec and the API are untouched. The URL is still the single source of truth, so reload, sharing and back/forward behave as before. Currencies are never converted, zero-count facets are never hidden, and the skeleton still matches the card footprint (CLS 0.0000 on the e2e run).

### Verification

- 55 unit tests, including the new parser tests.
- 19 browser checks over the DevTools protocol. They cover the new layout, a sentence turning into URL filters, the compare sheet, mobile overflow and the performance gates (applying a filter to updated results about 14 ms, worst keystroke about 7 ms).
- Not done: a real screen reader pass, a contrast audit, and a check on real phones.

### Development note

Do not run `yarn build` while `yarn dev` is running. They share the `.next` folder, and the dev server then serves a mix of old and new files, which shows up as half-styled pages. Stop dev first, or build elsewhere.

## Data mistakes and what the customer sees

The full list, with live counts from the file, is on the **/data-issues** page (linked from the footer as "Why some data looks different"). It is written in plain language for customers; the rule names and example ids sit behind a collapsed "Technical details" toggle on each card. The rules live in `src/lib/data/normalize.ts` and are tested. In summary:

| Finding | Decision |
| --- | --- |
| 2,853 of 3,200 services are visible | Hidden unless service, provider and category are all active. A service can fail more than one test. |
| 2 inactive providers, 1 inactive category | Dropped from results and from the provider facet |
| "Vitamin D Test": flat discount 600 on a price of 450 | Never show a negative price. Shown as "Price on request" |
| "Free Dental Consultation" priced 0.00 | Shown as "Free" |
| 20 visible services with no category, 1,109 with no subcategory | Kept. Uncategorised gets its own option, so category counts add up to the total |
| 5 providers with no rating or review count | "New on MedEx", never 0.0 |
| Title `"  hba1c   TEST (Diabetes) "` | Whitespace trimmed for display and search |
| Two top-level `ultrasound` categories (package, lab_test) | Everything is keyed by category id, never slug. A small type tag tells them apart |
| 645 provider+title groups appear more than once | **Kept, not collapsed.** I checked: copies differ in price, category and discount (for example one "Teeth Whitening Session" at 9,480 and another at 7,470), so they are different listings. Each row shows its category to tell them apart |

## How I measured performance

- **Engine, Node:** a heavy query (two types, Bangkok, under 5,000 THB, text search) over 2,853 services: median **0.31 ms**, worst 0.51 ms (`search.test.ts`, "speed").
- **Whole page, real Chrome (headless, on my laptop):** `scripts/e2e.mjs` clicks a filter and polls each animation frame until the result count changes: about **30-40 ms** from click to updated results and counts. Typing seven characters into the search box: worst single keystroke about **9-16 ms**. The URL update follows 120 ms later in a transition, so input is never blocked.
- **Layout shift:** cumulative layout shift over the whole scripted session was **0.026**. That comes from the first skeleton-to-results swap. Skeleton cards are sized to match real cards, and results updates after that do not move the layout.

Not measured: a throttled mid-range laptop or a phone CPU. These are numbers from one machine.

## What I deliberately left out, and what I would do next

- The "How this price is built" popover. (The side-by-side compare tray and example-question chips were added in the UI overhaul.) I chose depth on the three things the brief hints at (counts, currencies, data mistakes) over breadth.
- **First paint is a skeleton, not results.** The data arrives through the mock API, which is how the loading and error states exist at all. This avoids an unfiltered flash, but a crawler gets no results HTML. With more time: server-render the first page from the same pure engine, keep the skeleton for client-side loading.
- **Web Worker for the engine.** Not needed at this size (see the numbers above). If the dataset grew 10x or ran on slow phones, this is the next step, and the engine is already pure so it would move cleanly.
- **Accessibility:** native controls throughout, a skip link, visible focus, labelled groups, a polite live region announcing the result count, and a `<dialog>` for the drawer. I have **not** tested with a real screen reader, and I have not run an automated contrast audit. Treat those as open.
- **Smaller phones:** checked at 390 px width via emulation, not on real devices.
- **Not done:** deployed link and screen recording.

## Where I used AI tools

I used Claude Code throughout: to plan the approach (a design-doc session before any code), to audit the dataset, and to write the code and tests, which I reviewed. Two Claude Code skills were used: `/office-hours` for the planning session (the design doc before any code) and `emil-design-eng` for UI polish (spacing, press feedback, motion). Claude Code subagents also helped with research during planning. The brief's hint about data mistakes shaped the audit; the findings above come from running scripts over the real file, not from guesswork.
