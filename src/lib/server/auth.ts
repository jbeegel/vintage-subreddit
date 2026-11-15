import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = {
  supabaseUrl: url ?? null,
  supabaseAnonKey: anonKey ?? null,
  /** Accounts and cloud storage are on only when all three Supabase values are set. */
  auth: Boolean(url && anonKey && serviceKey),
  hasAiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  /** Local development only: lets the AI routes run with no accounts configured. */
  allowAnonAi: process.env.ALLOW_ANON_AI === "true",
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT) || 150,
};

let admin: SupabaseClient | null = null;

/** Service-role client. Every table has row level security on and no policies, so this is the only way in. */
export function db(): SupabaseClient | null {
  if (!config.auth) return null;
  admin ??= createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export type Caller = { id: string; local: boolean };

/** Resolves the signed-in user from the bearer token, or the local stand-in when accounts are off. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const client = db();
  if (!client) return config.allowAnonAi ? { id: "local", local: true } : null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, local: false };
}

export const fail = (status: number, error: string, code?: string) => Response.json({ error, code }, { status });
