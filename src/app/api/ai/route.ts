import Anthropic from "@anthropic-ai/sdk";
import { config, db, fail, getCaller } from "@/lib/server/auth";
import { handoffPrompt, lotPricePrompt, backNumsPrompt, backPrompt, claimsPrompt, locatePrompt, photoTagPrompt, learnPostPrompt, postCopyPrompt, priceCheckPrompt, priceListPrompt, withReference, recheckPrompt, editPrompt, extractPrompt, gradePrompt, parseJson, planPrompt, scanPrompt, type Task } from "@/lib/server/prompts";

export const maxDuration = 300;

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 2_000_000;
const TASKS: Task[] = ["scan", "claims", "grade", "plan", "edit", "extract", "back", "recheck", "locate", "phototag", "pricecheck", "postcopy", "pricelist", "learnpost", "backnums", "lotprice", "handoff"];

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
  if ((task === "scan" || task === "grade" || task === "back" || task === "recheck" || task === "locate" || task === "backnums") && images.length === 0) return fail(400, "No images were sent.");

  let prompt: string;
  if (task === "scan") prompt = scanPrompt(images.length, payload.video === true, payload.tiled === true);
  else if (task === "grade") prompt = gradePrompt;
  else if (task === "back") prompt = backPrompt(payload.front ?? {});
  else if (task === "handoff") {
    const doc = String(payload.text ?? "").slice(0, 60000);
    if (doc.trim().length < 40) return fail(400, "Paste the price list first.");
    prompt = handoffPrompt(doc);
  }
  else if (task === "lotprice") {
    if (!payload.lot || typeof payload.lot !== "object") return fail(400, "Send the lot to price.");
    prompt = lotPricePrompt(payload.lot, Math.min(60, Math.max(0, Number(payload.discount) || 0)), true);
  }
  else if (task === "backnums") prompt = backNumsPrompt(String(payload.year ?? "").slice(0, 4), String(payload.set ?? "").slice(0, 40), Math.max(0, Math.min(1000, Number(payload.size) || 0)));
  else if (task === "locate") prompt = locatePrompt(Array.isArray(payload.inv) ? payload.inv.slice(0, 600) : []);
  else if (task === "pricecheck") {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length || items.length > 30) return fail(400, "Send between 1 and 30 items to check.");
    prompt = priceCheckPrompt(items, Math.min(60, Math.max(0, Number(payload.discount) || 0)), true);
  } else if (task === "postcopy") {
    const sale = Array.isArray(payload.sale) ? payload.sale : [];
    if (!sale.length || sale.length > 60) return fail(400, "The sale is empty or too large.");
    prompt = postCopyPrompt(sale, String(payload.plan ?? "").slice(0, 2000));
  } else if (task === "learnpost") {
    const post = String(payload.text ?? "").slice(0, 30000);
    if (!post.trim()) return fail(400, "Paste a post first.");
    prompt = learnPostPrompt(post, String(payload.known ?? "").slice(0, 4000));
  } else if (task === "pricelist") {
    const cards = Array.isArray(payload.cards) ? payload.cards : [], listText = String(payload.text ?? "").slice(0, 20000);
    if (!cards.length || cards.length > 500) return fail(400, "The photo has no cards or too many.");
    if (!listText.trim() && images.length < 1) return fail(400, "Paste a price list or send a photo of one.");
    prompt = priceListPrompt(cards, Array.isArray(payload.groups) ? payload.groups : [], listText, images.length);
  } else if (task === "phototag") {
    const text = String(payload.text ?? "");
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    if (!text || text.length > 2000 || cards.length > 500) return fail(400, "The instruction is missing or the photo has too many cards.");
    prompt = photoTagPrompt(text, cards, Array.isArray(payload.groups) ? payload.groups : []);
  }
  else if (task === "recheck") prompt = recheckPrompt(payload.card ?? {}, String(payload.note ?? "").slice(0, 1000), images.length);
  else if (task === "extract") {
    const text = String(payload.text ?? "");
    if (!text || text.length > 60_000) return fail(400, "The thread text is missing or too long.");
    prompt = extractPrompt(text);
  } else if (task === "edit") {
    const text = String(payload.text ?? "");
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!text || text.length > 2000 || rows.length > 2000) return fail(400, "The instruction is missing or the inventory is too large.");
    prompt = editPrompt(text, rows, payload.settings ?? {}, String(payload.next ?? "").slice(0, 400));
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
  prompt = withReference(task, prompt, payload);

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
    // The price check may search the web; a long search can pause the turn, so send the partial answer back to finish it.
    const tools = task === "pricecheck" || task === "lotprice" ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 12 }] : undefined;
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content }];
    let message = null as Anthropic.Beta.Messages.BetaMessage | null;
    for (let round = 0; round < 4; round++) {
      message = await anthropic.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: task === "scan" || task === "grade" || task === "back" || task === "recheck" || task === "locate" || task === "backnums" ? "high" : "medium" },
        ...(tools ? { tools } : {}),
        messages,
      });
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }
    if (!message) return fail(502, "No answer came back.");
    if (message.stop_reason === "refusal") return fail(422, "The model declined this request.", "refused");
    const texts = message.content.flatMap((b) => (b.type === "text" ? [b.text] : []));
    const last = [...texts].reverse().find((t) => t.includes("{"));
    try {
      return Response.json(parseJson(last ?? texts.join("")));
    } catch {
      return Response.json(parseJson(texts.join("")));
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(429, "The AI service is busy. Wait a minute and try again.", "rate_limited");
    if (e instanceof Anthropic.APIError) return fail(502, "The AI service returned an error. Try again.", "upstream");
    if (e instanceof SyntaxError || (e instanceof Error && e.message.includes("JSON"))) return fail(502, "The model's answer could not be read. Try again.", "bad_output");
    throw e;
  }
}
