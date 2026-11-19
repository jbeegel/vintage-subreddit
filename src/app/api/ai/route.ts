import Anthropic from "@anthropic-ai/sdk";
import { config, db, fail, getCaller } from "@/lib/server/auth";
import { backPrompt, claimsPrompt, editPrompt, extractPrompt, gradePrompt, parseJson, planPrompt, scanPrompt, type Task } from "@/lib/server/prompts";

export const maxDuration = 300;

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 2_000_000;
const TASKS: Task[] = ["scan", "claims", "grade", "plan", "edit", "extract", "back"];

export async function POST(req: Request) {
  if (!config.hasAiKey) return fail(503, "AI features are not set up on this server yet.", "not_configured");
  const caller = await getCaller(req);
  if (!caller) return fail(401, "Sign in to use this.", "unauthorized");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Expected form data.");
  }
  const task = form.get("task") as Task;
  if (!TASKS.includes(task)) return fail(400, "Unknown task.");
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return fail(400, "Payload is not valid JSON.");
  }
  const images = form.getAll("images").filter((f): f is File => f instanceof File);
  if (images.length > MAX_IMAGES) return fail(400, `At most ${MAX_IMAGES} images per request.`);
  if (images.some((f) => f.size > MAX_IMAGE_BYTES || f.type !== "image/jpeg")) return fail(400, "Images must be JPEG and under 2 MB each.");
  if ((task === "scan" || task === "grade" || task === "back") && images.length === 0) return fail(400, "No images were sent.");

  let prompt: string;
  if (task === "scan") prompt = scanPrompt(images.length, payload.video === true, payload.tiled === true);
  else if (task === "grade") prompt = gradePrompt;
  else if (task === "back") prompt = backPrompt(payload.front ?? {});
  else if (task === "extract") {
    const text = String(payload.text ?? "");
    if (!text || text.length > 60_000) return fail(400, "The thread text is missing or too long.");
    prompt = extractPrompt(text);
  } else if (task === "edit") {
    const text = String(payload.text ?? "");
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!text || text.length > 2000 || rows.length > 2000) return fail(400, "The instruction is missing or the inventory is too large.");
    prompt = editPrompt(text, rows, payload.settings ?? {});
  } else if (task === "plan") {
    const text = String(payload.text ?? "");
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!text || text.length > 4000 || rows.length < 2 || rows.length > 2000) return fail(400, "The plan is missing or the inventory is too large.");
    prompt = planPrompt(text, rows, Array.isArray(payload.history) ? payload.history.slice(0, 20) : []);
  } else {
    const text = String(payload.text ?? "");
    const lots = Array.isArray(payload.lots) ? payload.lots : [];
    if (!text || text.length > 40_000 || lots.length > 1000) return fail(400, "Thread text is missing or too long.");
    prompt = claimsPrompt(lots, text);
  }

  // Per-user daily cap, so one account cannot run up the bill.
  const client = db();
  if (client && !caller.local) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await client.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", caller.id).gte("created_at", since);
    if (error) return fail(500, "Could not check usage.");
    if ((count ?? 0) >= config.aiDailyLimit) return fail(429, "Daily AI limit reached. It resets within 24 hours.", "rate_limited");
    await client.from("ai_usage").insert({ user_id: caller.id, task, images: images.length });
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const file of images) {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const anthropic = new Anthropic();
    const message = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: task === "scan" || task === "grade" || task === "back" ? "high" : "medium" },
      messages: [{ role: "user", content }],
    });
    if (message.stop_reason === "refusal") return fail(422, "The model declined this request.", "refused");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return Response.json(parseJson(text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(429, "The AI service is busy. Wait a minute and try again.", "rate_limited");
    if (e instanceof Anthropic.APIError) return fail(502, "The AI service returned an error. Try again.", "upstream");
    if (e instanceof SyntaxError || (e instanceof Error && e.message.includes("JSON"))) return fail(502, "The model's answer could not be read. Try again.", "bad_output");
    throw e;
  }
}
