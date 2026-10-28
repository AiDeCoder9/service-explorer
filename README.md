# MedEx Service Explorer

A page where a customer browses and filters health services grouped by provider, with live facet counts. Built for the MedEx take-home, Task 1.

> The story it is designed around: *"I need a full-body check-up near Bangkok, under 5,000 THB, and I'd like to compare a few hospitals side by side."*
> Try it: `/?place=city:Bangkok&type=package&cur=THB&max=5000`

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm test` | 48 unit tests (data rules, pricing, facet engine, grouping, URL) |
| `npm run typecheck` | TypeScript, strict |
| `npm run build && npm start -- -p 3100` then `npm run e2e` | 17 browser checks over Chrome's DevTools protocol (needs Google Chrome; set `CHROME_PATH` elsewhere) |

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

## Data mistakes and what the customer sees

The full list, with live counts from the file, is on the **/data-issues** page (linked from the footer). The rules live in `src/lib/data/normalize.ts` and are tested. In summary:

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

- **Side-by-side compare tray**, the "How this price is built" popover, and story chips such as "Full-body check-up near Bangkok". I chose depth on the three things the brief hints at (counts, currencies, data mistakes) over breadth.
- **First paint is a skeleton, not results.** The data arrives through the mock API, which is how the loading and error states exist at all. This avoids an unfiltered flash, but a crawler gets no results HTML. With more time: server-render the first page from the same pure engine, keep the skeleton for client-side loading.
- **Web Worker for the engine.** Not needed at this size (see the numbers above). If the dataset grew 10x or ran on slow phones, this is the next step, and the engine is already pure so it would move cleanly.
- **Accessibility:** native controls throughout, a skip link, visible focus, labelled groups, a polite live region announcing the result count, and a `<dialog>` for the drawer. I have **not** tested with a real screen reader, and I have not run an automated contrast audit. Treat those as open.
- **Smaller phones:** checked at 390 px width via emulation, not on real devices.
- **Not done:** deployed link and screen recording.

## Where I used AI tools

I used Claude Code throughout: to plan the approach (a design-doc session before any code), to audit the dataset, and to write the code and tests, which I reviewed. The brief's hint about data mistakes shaped the audit; the findings above come from running scripts over the real file, not from guesswork.
