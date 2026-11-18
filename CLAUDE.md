# CLAUDE.md

Reddit Sales Tool: seller tools for r/baseballcards_vintage. Read `README.md` first.

- Package manager is pnpm. `pnpm lint` and `pnpm build` must stay green.
- Never present an AI price estimate as a sold comp, and label all example or concept data.
- Nothing is sent to Reddit automatically. Drafts only; the seller sends.
- Prompts stay on the server (`src/lib/server/prompts.ts`). The AI route must require a signed-in caller.
- Tables keep row level security on with no policies; all access goes through server routes.

@AGENTS.md
