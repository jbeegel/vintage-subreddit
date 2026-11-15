import { connection } from "next/server";
import { config } from "@/lib/server/auth";

/** Tells the browser which features this deployment has switched on. Only public values are returned. */
export async function GET() {
  await connection(); // read at request time, never prerendered
  return Response.json({
    auth: config.auth,
    ai: config.hasAiKey && (config.auth || config.allowAnonAi),
    supabaseUrl: config.auth ? config.supabaseUrl : null,
    supabaseAnonKey: config.auth ? config.supabaseAnonKey : null,
  });
}
