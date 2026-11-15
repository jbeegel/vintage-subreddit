import { db, fail, getCaller } from "@/lib/server/auth";

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

/** A tester's deal-hunting wish list: where they are and what they want found. */
export async function POST(req: Request) {
  const client = db();
  const caller = await getCaller(req);
  if (!client || !caller || caller.local) return fail(401, "Sign in to send this.", "unauthorized");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Body is not valid JSON.");
  }
  const radius = Number(body.radius);
  const { error } = await client.from("hunt_profiles").upsert({
    user_id: caller.id,
    zip: str(body.zip, 12),
    radius_miles: Number.isFinite(radius) ? Math.max(0, Math.min(500, Math.round(radius))) : null,
    targets: str(body.targets, 1000),
    sources: str(body.sources, 1000),
    updated_at: new Date().toISOString(),
  });
  if (error) return fail(500, "Could not save your hunt profile.");
  return Response.json({ ok: true });
}
