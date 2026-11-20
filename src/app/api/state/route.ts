import { db, fail, getCaller } from "@/lib/server/auth";

const MAX_STATE_BYTES = 2_000_000;

/** Each seller's working state (inventory, settings, sold log, grade tests) is one JSON document. */
export async function GET(req: Request) {
  const client = db();
  const caller = await getCaller(req);
  if (!client || !caller || caller.local) return fail(401, "Sign in to sync.", "unauthorized");
  const { data, error } = await client.from("benches").select("state, updated_at_ms").eq("user_id", caller.id).maybeSingle();
  if (error) return fail(500, "Could not load your data.");
  return Response.json({ state: data?.state ?? null, updatedAt: data?.updated_at_ms ?? 0 });
}

export async function PUT(req: Request) {
  const client = db();
  const caller = await getCaller(req);
  if (!client || !caller || caller.local) return fail(401, "Sign in to sync.", "unauthorized");
  const raw = await req.text();
  if (raw.length > MAX_STATE_BYTES) return fail(413, "Too much data to save.");
  let body: { state?: unknown; updatedAt?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Body is not valid JSON.");
  }
  if (!body.state || typeof body.state !== "object" || typeof body.updatedAt !== "number") return fail(400, "Missing state.");
  const { error } = await client.from("benches").upsert({ user_id: caller.id, state: body.state, updated_at_ms: body.updatedAt });
  if (error) return fail(500, "Could not save your data.");
  return Response.json({ ok: true });
}
