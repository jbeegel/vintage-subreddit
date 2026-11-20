import { connection } from "next/server";
import { db, fail, getCaller } from "@/lib/server/auth";

type Item = { year?: unknown; set?: unknown; num?: unknown; player?: unknown; grade?: unknown; price?: unknown; date?: unknown };
const str = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max));

/** The shared index of sold prices. Rows carry no username, and nobody can read who contributed a row. */
export async function GET() {
  await connection(); // read at request time, never prerendered
  const client = db();
  if (!client) return Response.json({ items: [] });
  const { data, error } = await client.from("sold_prices").select("year, set_name, num, player, grade, price, sold_at").order("sold_at", { ascending: false }).limit(5000);
  if (error) return fail(500, "Could not load the shared index.");
  return Response.json({
    items: (data ?? []).map((r) => ({ year: r.year, set: r.set_name, num: r.num, player: r.player, grade: r.grade, price: Number(r.price), date: new Date(r.sold_at).getTime() })),
  });
}

/** Replaces the caller's contributed rows with their current sold log. */
export async function PUT(req: Request) {
  const client = db();
  const caller = await getCaller(req);
  if (!client || !caller || caller.local) return fail(401, "Sign in to share.", "unauthorized");
  let items: Item[];
  try {
    const body = await req.json();
    items = Array.isArray(body.items) ? body.items.slice(0, 2000) : [];
  } catch {
    return fail(400, "Body is not valid JSON.");
  }
  const rows = items.flatMap((i) => {
    const price = Number(i.price);
    const year = Number(i.year);
    const date = new Date(Number(i.date));
    if (!i.player || !Number.isFinite(price) || price <= 0 || price > 1_000_000 || isNaN(date.getTime())) return [];
    return [{ user_id: caller.id, year: Number.isInteger(year) && year > 1850 && year < 1990 ? year : null, set_name: str(i.set, 80), num: str(i.num, 20), player: str(i.player, 160), grade: str(i.grade, 60), price, sold_at: date.toISOString() }];
  });
  const del = await client.from("sold_prices").delete().eq("user_id", caller.id);
  if (del.error) return fail(500, "Could not update the shared index.");
  if (rows.length) {
    const ins = await client.from("sold_prices").insert(rows);
    if (ins.error) return fail(500, "Could not update the shared index.");
  }
  return Response.json({ ok: true, count: rows.length });
}
