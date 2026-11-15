# Claimboard

Seller tools for r/baseballcards_vintage. Photograph a table of cards, get an inventory with prices, build the sale post, handle claims, and test the grader against real slabs.

## What it does

| Section | What happens |
|---|---|
| Inventory | Reads cards from photos or a video sweep. A large photo is cut into full-detail crops first. Every card gets a price from an AI estimate, flagged as not a sold comp, until a real comp is entered. |
| Post | Builds the title and a Reddit markdown table in the sort order chosen. |
| Claims | Matches pasted thread comments to lots in posted order, then drafts the thread reply and the DM per buyer. The seller sends them; nothing is sent automatically. |
| Sold comps | Logs each paid sale. Sellers can opt in to a shared index of sold prices with no usernames. |
| Grade test | Predicts the grade of slabbed cards with the label cropped out and scores the predictions against the label. |
| Deal radar | Concept preview with invented example signals, plus a form that collects what testers want hunted. |

## Run it locally

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

```bash
pnpm dev
```

With no environment values set, the app runs in local mode: data stays in the browser and the AI features are off. To try the AI features locally without accounts, set `ANTHROPIC_API_KEY` and `ALLOW_ANON_AI=true` in `.env.local`.

## Go live

1. **Supabase.** Create a project, open the SQL editor and run `supabase/migrations/0001_init.sql`. Under Authentication, add the site's address to the allowed redirect URLs so email sign-in links work.
2. **Environment values.** Set `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` on the host. Leave `ALLOW_ANON_AI` unset.
3. **Deploy.** Any Next.js host works. On Vercel, import the repository and add the values above.

## How it is put together

- `src/lib/claimboard/app.js` is the browser app, ported from the single-page prototype. It renders into the shell in `src/components/Claimboard.tsx`.
- `src/app/api/ai` is the only route that calls Claude. Prompts live on the server in `src/lib/server/prompts.ts`, callers must be signed in, and each account has a daily request cap (`AI_DAILY_LIMIT`).
- `src/app/api/state`, `solds` and `hunt` store data through the Supabase service role. Every table has row level security on and no policies, so the browser cannot reach the tables directly.

## Rules this project keeps

- An AI price estimate is never presented as a sold comp.
- Example and concept data is always labelled as such.
- Nothing is posted or messaged on Reddit automatically. Reddit's terms require written approval for commercial API use and consent for automated messages, so the seller presses send.
- No scraping of sites whose terms forbid it.

## Checks

```bash
pnpm lint
```

```bash
pnpm build
```

## Not built yet

- Licensed sold-price feed (SportsCardsPro needs a commercial licence before use in a product).
- Verified seller stamp that links eBay feedback to a Reddit username.
- Live deal-radar sources.
- Paid tier.
