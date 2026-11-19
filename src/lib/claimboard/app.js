// @ts-nocheck
/* eslint-disable */
/* Client app, ported from the single-page prototype. It renders into the shell in components/Claimboard.tsx. */
let mounted = false;
export function mount(makeSupabase){
if(mounted) return; mounted = true;

const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const money = n => n == null || n === "" || isNaN(n) ? "" : "$" + Number(n).toLocaleString("en-US", {maximumFractionDigits: 0});
const numOrNull = v => { const n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; };
const LS_KEY = "claimboard.v1";

/* ---------- state ---------- */
const EXAMPLES = [
  {year:1958,set:"Topps",num:"1",player:"Ted Williams",grade:"Raw VG",flaws:"corner wear, slight tilt",conf:.93,comp:210,compSrc:"example"},
  {year:1968,set:"Topps",num:"110",player:"Hank Aaron",grade:"Raw VG-EX",flaws:"soft corners",conf:.95,comp:55,compSrc:"example"},
  {year:1959,set:"Topps",num:"439",player:"Brooks Robinson",grade:"Raw GD",flaws:"crease lower left",conf:.9,comp:22,compSrc:"example"},
  {year:1979,set:"Topps",num:"116",player:"Ozzie Smith",variation:"RC",grade:"Raw EX, off-center",flaws:"70/30 left to right",conf:.97,comp:48,compSrc:"example"},
  {year:1960,set:"Topps",num:"",player:"Lot of 14 commons and minor stars",grade:"Raw PR to VG",flaws:"mixed",conf:.6,comp:null,needsBack:true}
].map(c => ({id:uid(),status:"open",example:true,...c}));

let S = { cards: EXAMPLES, solds: [], settings: {discount:15, pay:"PayPal G&S only", ship:"$5 BMWT. PWE $1 on cards under $20, at buyer's risk.", handle:"", title:"", intro:"Prices are shipped-separately. Claim in the comments, then DM. Timestamp photo in the gallery.", showComps:true, share:false, paypal:"", shipFee:5}, radar:{zip:"",radius:50,targets:"",sources:""}, updatedAt:0 };
let cap = {ai:false, auth:false, sb:null, token:null, email:null};
let ui = {dopen:{}, busy:"", scanMsg:"", claimMsg:"", community:null, communityMsg:"", q:"", radarMsg:""};

function loadLocal(){ try{ const r = localStorage.getItem(LS_KEY); if(r){ const d = JSON.parse(r); if(d && Array.isArray(d.cards)) S = merge(d); } }catch(e){} }
function merge(d){ return {...S, ...d, settings:{...S.settings, ...(d.settings||{})}, radar:{...S.radar, ...(d.radar||{})}}; }
let saveT = null, writing = Promise.resolve();
function save(){
  S.updatedAt = Date.now(); ui.dirty = true;
  try{ localStorage.setItem(LS_KEY, JSON.stringify(S)); ui.localAt = S.updatedAt; ui.localErr = ""; }catch(e){ ui.localAt = 0; ui.localErr = "Could not save on this device"; }
  clearTimeout(saveT); saveT = setTimeout(pushCloud, 1200); stat();
}
/* Second copy on the server for signed-in sellers, so a cleared browser or another device still has the work. */
function pushCloud(){
  clearTimeout(saveT);
  if(!cap.token){ ui.cloudMsg = cap.auth ? "Sign in to back up to your account" : ""; return stat(); }
  if(!ui.dirty) return;
  ui.dirty = false;
  const snapshot = JSON.parse(JSON.stringify(S)), at = S.updatedAt;
  ui.cloudMsg = "Backing up"; stat();
  writing = writing.then(() => api("/api/state", {method:"PUT", json:{state: snapshot, updatedAt: at}})).then(() => { ui.cloudMsg = "Backed up to your account " + tm(at); stat(); }, () => { ui.dirty = true; ui.cloudMsg = "Account backup failed. It will retry on your next change"; stat(); });
  if(S.settings.share) writing = writing.then(() => api("/api/solds", {method:"PUT", json:{items: S.solds.map(({year,set,num,player,grade,price,date}) => ({year,set,num,player,grade,price,date}))}})).catch(() => {});
}
function saleDeleted(id){ /* finished sales travel inside the saved state */ }
function saleSaved(sale){ /* finished sales travel inside the saved state */ }
addEventListener("pagehide", pushCloud);
document.addEventListener("visibilitychange", () => { if(document.hidden) pushCloud(); });
async function api(path, {method = "GET", json, form} = {}){
  const headers = {};
  if(cap.token) headers.Authorization = "Bearer " + cap.token;
  if(json) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {method, headers, body: form || (json ? JSON.stringify(json) : undefined)});
  let data = null; try{ data = await res.json(); }catch(e){}
  if(!res.ok){ const err = new Error((data && data.error) || ("Request failed, " + res.status)); err.code = data && data.code; throw err; }
  return data;
}
function ai(task, payload, images){
  const form = new FormData();
  form.append("task", task); form.append("payload", JSON.stringify(payload || {}));
  (images || []).forEach((b, i) => form.append("images", b, "image-" + i + ".jpg"));
  return api("/api/ai", {method:"POST", form});
}
const aiOff = () => cap.auth && !cap.token ? "Sign in at the top of the page to use this." : "AI features are not set up on this server yet.";
async function loadRemote(){
  if(!cap.token) return;
  try{
    const d = await api("/api/state");
    if(d && d.state && d.updatedAt > S.updatedAt){ S = merge(d.state); ui.cloudMsg = "Restored from your account backup"; }
    else if(S.cards.some(c => !c.example)){ ui.dirty = true; pushCloud(); }
  }catch(e){}
  render();
}
function renderAuth(){
  const el = $("#auth"); if(!el) return;
  if(el.contains(document.activeElement)) return;
  el.innerHTML = !cap.auth ? `<span class="note">Local mode. Saved on this device only.</span>`
    : cap.email ? `<span class="note">${esc(cap.email)}</span> <button class="small" data-act="signout">Sign out</button>`
    : `<input id="auth-email" type="email" placeholder="you@example.com" autocomplete="email" aria-label="Email" style="width:190px"> <button class="small" data-act="signin">Email me a sign-in link</button> <span class="note">${esc(ui.authMsg || "")}</span>`;
}
async function init(makeSupabase){
  let cfg = {auth:false, ai:false};
  try{ cfg = await api("/api/config"); }catch(e){}
  cap.auth = !!cfg.auth; cap.ai = !!cfg.ai && !cfg.auth;
  if(cfg.auth){
    cap.sb = makeSupabase(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const apply = session => { cap.token = session ? session.access_token : null; cap.email = session && session.user ? session.user.email : null; cap.ai = !!cfg.ai && !!cap.token; };
    const {data} = await cap.sb.auth.getSession(); apply(data.session);
    cap.sb.auth.onAuthStateChange((_e, session) => { const had = cap.token; apply(session); if(cap.token && !had) loadRemote(); else render(); });
    await loadRemote();
  }
  render();
}

/* ---------- card helpers ---------- */
const title = c => [c.year, c.set, c.num ? "#" + c.num : "", c.player, c.variation ? "(" + c.variation + ")" : ""].filter(Boolean).join(" ");
const roundP = n => n < 25 ? Math.max(1, Math.round(n)) : Math.round(n / 5) * 5;
const aiMid = c => c.aiLow != null && c.aiHigh != null ? (c.aiLow + c.aiHigh) / 2 : null;
const basisOf = c => c.comp != null ? c.comp : aiMid(c);
const priceOf = c => { if(c.price != null) return c.price; const b = basisOf(c); return b != null ? roundP(b * (1 - S.settings.discount / 100)) : null; };
const SORTS = {added:"Order scanned", year:"Year", player:"Player", set:"Set", price:"Price, high to low"};
function ordered(){
  const k = S.settings.sort || "added", a = [...S.cards], s = (x, y) => String(x || "").localeCompare(String(y || ""));
  if(k === "year") a.sort((x, y) => (+x.year || 9999) - (+y.year || 9999) || s(x.set, y.set) || (parseInt(x.num) || 0) - (parseInt(y.num) || 0));
  else if(k === "player") a.sort((x, y) => s(x.player, y.player) || (+x.year || 0) - (+y.year || 0));
  else if(k === "set") a.sort((x, y) => s(x.set, y.set) || (+x.year || 0) - (+y.year || 0) || (parseInt(x.num) || 0) - (parseInt(y.num) || 0));
  else if(k === "price") a.sort((x, y) => (priceOf(y) || 0) - (priceOf(x) || 0));
  const secs = (S.plan && S.plan.sections) || [], si = c => { const i = secs.indexOf(c.section); return i < 0 ? secs.length : i; };
  if(secs.length) a.sort((x, y) => si(x) - si(y));
  return a;
}
/* One big photo of a whole table: cut it into full-resolution crops so each card keeps its detail. */
async function tiles(file, max=1568){
  const bmp = await createImageBitmap(file);
  const cols = Math.min(6, Math.ceil(bmp.width / max)), rows = Math.min(6, Math.ceil(bmp.height / max));
  if(cols * rows === 1) return [await shrink(bmp, max)];
  const tw = bmp.width / cols, th = bmp.height / rows, k = Math.min(1, max / Math.max(tw, th)), out = [];
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
    const cv = document.createElement("canvas"); cv.width = Math.round(tw * k); cv.height = Math.round(th * k);
    cv.getContext("2d").drawImage(bmp, c * tw, r * th, tw, th, 0, 0, cv.width, cv.height);
    out.push(await new Promise(res => cv.toBlob(res, "image/jpeg", .88)));
  }
  return out;
}
const q = c => encodeURIComponent([c.year, c.set, c.player, c.num ? "#" + c.num : "", /^(PSA|SGC|BGS|BVG|CGC)/i.test(c.grade||"") ? c.grade : ""].filter(Boolean).join(" "));
const links = c => `
  <a class="btn small" target="_blank" rel="noopener" href="https://www.ebay.com/sch/i.html?_nkw=${q(c)}&LH_Sold=1&LH_Complete=1">eBay solds</a>
  <a class="btn small" target="_blank" rel="noopener" href="https://www.sportscardspro.com/search-products?q=${q(c)}&type=prices">SportsCardsPro</a>
  <a class="btn small" target="_blank" rel="noopener" href="https://www.reddit.com/r/baseballcards_vintage/search/?q=${encodeURIComponent([c.year,c.player].filter(Boolean).join(" "))}&restrict_sr=1&sort=new">Sub history</a>`;

/* ---------- scanning ---------- */
async function shrink(src, max=1568){
  const bmp = await createImageBitmap(src);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, "image/jpeg", .86));
}
function sharpness(video){
  const w = 160, h = Math.max(1, Math.round(160 * video.videoHeight / video.videoWidth));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", {willReadFrequently:true}); cx.drawImage(video, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for(let i = 0; i < w * h; i++) g[i] = d[i*4] * .3 + d[i*4+1] * .59 + d[i*4+2] * .11;
  let s = 0; for(let y = 1; y < h - 1; y++) for(let x = 1; x < w - 1; x++){ const i = y * w + x; s += Math.abs(4 * g[i] - g[i-1] - g[i+1] - g[i-w] - g[i+w]); }
  return s / (w * h);
}
function seek(v, t){ return new Promise((res, rej) => { const to = setTimeout(() => rej(new Error("seek timeout")), 6000); v.onseeked = () => { clearTimeout(to); res(); }; v.currentTime = t; }); }
/* A video sweep is mostly motion blur. Split it into windows and keep only the sharpest frame from each. */
async function framesFromVideo(file, onStep){
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto";
  const url = URL.createObjectURL(file);
  try{
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("This browser could not open that video. Try photos instead.")); v.src = url; });
    const dur = v.duration; if(!isFinite(dur) || dur <= 0) throw new Error("Could not read the video length. Try photos instead.");
    const windows = Math.max(1, Math.min(12, Math.ceil(dur / 1.5))), span = dur / windows, out = [];
    for(let i = 0; i < windows; i++){
      onStep(`Finding the sharpest frame ${i + 1} of ${windows}`);
      let best = {t: i * span + span / 2, s: -1};
      for(const f of [.2, .4, .6, .8]){ const t = Math.min(dur - .05, i * span + f * span); await seek(v, t); const s = sharpness(v); if(s > best.s) best = {t, s}; }
      await seek(v, best.t); out.push(await shrink(v));
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
async function scan(files){
  if(!cap.ai){ ui.scanMsg = aiOff() + " You can still add rows by hand."; return render(); }
  const set = m => { ui.busy = m; const el = $("#scanmsg"); if(el){ el.textContent = m; el.className = "progress busy"; } };
  try{
    const isVideo = files.length === 1 && files[0].type.startsWith("video/");
    let blobs = [], tiled = false;
    if(isVideo) blobs = await framesFromVideo(files[0], set);
    else for(let i = 0; i < files.length; i++){ set(`Preparing photo ${i + 1} of ${files.length}`); const t = await tiles(files[i]); if(t.length > 1) tiled = true; blobs.push(...t); }
    const per = 3; /* keeps each upload under the 4.5 MB request limit common on serverless hosts */
    const found = [];
    for(let i = 0; i < blobs.length; i += per){
      const batch = blobs.slice(i, i + per);
      set(`Identifying cards, batch ${i / per + 1} of ${Math.ceil(blobs.length / per)}`);
      const r = await ai("scan", {video: isVideo, tiled}, batch);
      for(const c of (r && r.cards) || []) found.push(c);
    }
    const seen = new Map(); let added = 0;
    if(S.cards.every(c => c.example)) S.cards = [];
    for(const c of found){
      const key = [c.year, c.set, c.num, c.player, c.grade].join("|").toLowerCase();
      if(isVideo && seen.has(key)) continue; seen.set(key, 1);
      S.cards.push({id:uid(), status:"open", year:c.year ?? "", set:c.set ?? "", num:c.num ?? "", player:c.player ?? "Unidentified card", variation:c.variation ?? "", grade:c.grade ?? "", flaws:c.flaws ?? "", conf:typeof c.conf === "number" ? c.conf : .5, needsBack:!!c.needsBack, aiLow:numOrNull(c.aiLow), aiHigh:numOrNull(c.aiHigh), where:c.where ?? "", flawsAI:c.flaws ?? "", idWhy:c.idWhy ?? "", valueWhy:c.valueWhy ?? "", comp:null, price:null});
      added++;
    }
    ui.scanMsg = added ? `Added ${added} card${added === 1 ? "" : "s"} from ${blobs.length} ${isVideo ? "video frame" : tiled ? "crop" : "photo"}${blobs.length === 1 ? "" : "s"}. Check anything flagged, then add comps.` : "No cards found in those images. Try closer, flatter photos with less glare.";
    save();
  }catch(e){
    const code = e && e.code;
    ui.scanMsg = code === "unauthorized" ? "Sign in to scan." : code === "rate_limited" ? "Rate limit reached. Wait a minute and scan again." : "Scan failed: " + (e && e.message || code || "unknown error");
  }
  ui.busy = ""; render();
}

/* ---------- views ---------- */
function toDecide(){ return S.cards.filter(c => c.status === "open" && !c.isLot && !c.section); }
function vInventory(){
  if(ui.onlyCheck && !S.cards.some(needsCheck)) ui.onlyCheck = false;
  const list = ui.onlyCheck ? ordered().filter(needsCheck) : ordered().filter(c => c.status === "open" && !c.isLot && !c.section);
  const placed = S.cards.filter(c => !c.example && (c.status !== "open" || c.isLot || c.section)).length;
  const hasEx = S.cards.some(c => c.example), any = S.cards.some(c => !c.example), all = list.length && list.every(x => ui.sel.has(x.id));
  return `<section class="view">
  <div class="panel">
    <h2>${any ? "Add more cards" : "Scan your cards"}</h2>
    <div class="row">
      <input type="file" id="file" accept="image/*,video/*" multiple hidden>
      <button class="primary" data-act="pick" ${ui.busy ? "disabled" : ""}>Take or choose photos</button>
      <button class="small" data-act="add">Add a card by hand</button>
      <label class="inline"><input type="checkbox" id="onecard" ${ui.oneCard ? "checked" : ""}> These photos are all one card</label>
    </div>
    ${ui.busy || ui.scanMsg || !any ? `<p id="scanmsg" class="${ui.busy ? "progress busy" : "note"}">${esc(ui.busy || ui.scanMsg || "One photo of a whole table works. Shoot straight down at full resolution, without glare. A short video works too.")}</p>` : ""}
  </div>
  ${checkPanel()}
  ${groupPanel()}
  ${singlesPanel()}
  ${hasEx ? `<p class="flag">These rows are examples. They clear when you scan, or <a href="#" data-act="clearEx">clear them now</a>.</p>` : ""}
  <div class="panel" id="decide">
    <div class="row" style="justify-content:space-between"><h2>${ui.onlyCheck ? "Cards to check" : "To decide"} <span class="note">${list.length}</span></h2>
      <label class="inline">Sort <select id="set-sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${(S.settings.sort || "added") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <p class="note">Give each card a place: a single, a price page or a lot. Placed cards move to the <a href="#sale">Sale tab</a>${placed ? `, which has ${placed} item${placed === 1 ? "" : "s"} so far` : ""}. Asks are firm: buyers claim at the price shown. To group cards the tool did not suggest, tick them and tap Combine into one lot, or type it in the bar at the top, for example "put the 1961 Post cards in one lot".</p>
    ${list.length ? `<div class="row"><button class="small" data-act="selAll">${all ? "All selected" : "Select all"}</button>${ui.sel.size ? `<button class="small" data-act="selNone">Clear selection</button>` : ""}${ui.onlyCheck ? `<button class="small" data-act="allCards">Show every card to decide</button>` : `<button class="small danger" data-act="clearOpen" data-k="decide">Clear all to decide</button>`}</div>` : ""}
    <ul class="cards">${list.map(rowInv).join("") || `<li><span class="note">${any ? "Every card has a place. Check the Sale tab, then build the post." : "Nothing yet. Scan a photo to start."}</span></li>`}</ul>
    ${selBar()}
  </div>
  ${planFold()}
  <details class="panel"><summary><strong>Pricing</strong></summary>
    <label class="inline">Ask is <input class="money" id="set-discount" type="number" min="0" max="60" value="${esc(S.settings.discount)}" style="width:60px">% under the value or sold comp, because there are no fees on the sub.</label>
  </details>
  </section>`;
}
function planFold(){
  const h = planPanel(), open = ui.planDraft != null || ui.planMsg ? "open" : "";
  if(!h.startsWith('<div class="panel"><h2>Plan the sale</h2>')) return h;
  return h.replace('<div class="panel"><h2>Plan the sale</h2>', `<details class="panel" ${open}><summary><strong>Or describe the whole sale in words</strong></summary>`).replace(/<\/div>\s*$/, "</details>");
}
function rowInv(c){
  const p = priceOf(c), undecided = c.status === "open" && !c.isLot && !c.section, pend = c.flawsAI != null && !c.flawsOk && !c.isLot;
  return `<li data-id="${c.id}">
    <div class="pickrow"><input type="checkbox" data-sel="${c.id}" aria-label="Select ${esc(title(c))}" ${ui.sel.has(c.id) ? "checked" : ""}><div><div class="ttl">${esc(title(c))} ${c.status === "sold" ? `<span class="stamp">SOLD</span>` : c.status === "claimed" ? `<span class="chip ok">claimed</span>` : ""}${c.section ? ` <span class="chip ok">${esc(c.section)}</span>` : ""}</div>
      <div class="meta">${esc([c.grade, c.flaws].filter(Boolean).join(" · "))}</div>
      ${valueLine(c)}${histLine(c)}</div></div>
    <div class="nums"><label>Ask<input class="money" data-f="price" inputmode="decimal" value="${c.price ?? ""}" placeholder="${p != null && c.price == null ? p : "$"}"></label></div>
    ${undecided ? `<div class="links acts"><button class="small primary" data-act="qSingle">Single</button><button class="small" data-act="qPage">${money(numOrNull(ui.pagePrice) || 10)} page</button>${ui.rq[c.id] ? "" : `<button class="small" data-act="backPick">More photos</button>`}</div>` : ""}
    ${needsCheck(c) ? checkBox(c) : ""}
    ${resultBox(c)}
    ${rqBox(c)}
    ${pend ? flawBox(c) : ""}
    <details class="edit"><summary>More: comps, condition, why, edit, delete</summary>
      <div class="fields"><label>Sold comp<input class="money" data-f="comp" inputmode="decimal" value="${c.comp ?? ""}" placeholder="$"></label></div>
      <div class="links">${links(c)}</div>
      ${pend ? "" : flawBox(c)}
      ${whyBox(c)}
      <div class="fields">${[["year","Year"],["set","Set"],["num","Card #"],["player","Player or lot name"],["variation","Variation"],["grade","Grade"],["flaws","Flaws"],["compSrc","Comp source"]].map(([f, l]) => `<label>${l}<input data-f="${f}" value="${esc(c[f] ?? "")}"></label>`).join("")}</div>
      <div class="row"><button class="small danger" data-act="del" aria-label="Delete ${esc(title(c))}">Delete this card</button></div>
    </details>
  </li>`;
}

/* Condition problems a buyer would want to know before claiming. Ordinary corner and edge wear is left to the grade. */
const ISSUE = /creas|wrinkl|paper loss|writing|written|\bpen\b|\bink|pencil|\bmark|stain|trim|tape|pinhole|\bhole|\btear|torn|miscut|off[- ]?cent|\boc\b|\d{2}\/\d{2}|water|scuff|scratch|residue|glue|damage|\bbend|\bbent|chip|\bloss\b|fad(ed|ing)|tilt|diamond cut|rounded|\bding|wax|gum|skinned|rubber band|album|punch/i;
/* Condition notes are stored joined by "; ". Older notes used commas, and some scans wrote whole sentences, so split on whichever the text uses. */
const flawParts = c => {
  const t = String(c.flaws || "").trim(); if(!t) return [];
  const parts = t.includes(";") ? t.split(/;\s*/) : /[a-z0-9)]\.\s+[A-Z]/.test(t) ? t.split(/(?<!\bvs)(?<!\bv)\.\s+(?=[A-Z])/) : t.split(/,\s*/);
  return parts.map(x => x.trim().replace(/\.$/, "")).filter(Boolean);
};
const joinFlaws = list => list.join("; ");
const issuesOf = c => c.isLot ? [] : flawParts(c).filter(x => ISSUE.test(x));
const DEFAULT_COND_NOTE = "Every condition issue I can see is called out in bold and already priced in. Ask for more photos of anything before you claim.";
function condCell(c, callout){
  const clean = x => x.replace(/\|/g, "/");
  if(!callout) return clean([c.grade, c.flaws].filter(Boolean).join(", "));
  if(c.isLot){
    const hit = c.members.filter(m => issuesOf(m).length), kinds = [...new Set(hit.flatMap(issuesOf))].slice(0, 3);
    return clean([c.grade, c.flaws].filter(Boolean).join(", ") + (hit.length ? `. **${hit.length} of ${c.members.length} have visible issues (${kinds.join(", ")})**` : ""));
  }
  const iss = issuesOf(c), minor = flawParts(c).filter(x => !ISSUE.test(x));
  return clean([c.grade, ...minor].filter(Boolean).join(", ") + (iss.length ? (c.grade || minor.length ? ". " : "") + "**" + iss.join(", ") + "**" : ""));
}
function buildPost(){
  const st = S.settings, rows = ordered().filter(c => priceOf(c) != null || c.status !== "open");
  const names = [...S.cards].sort((a, b) => (priceOf(b) || 0) - (priceOf(a) || 0)).slice(0, 3).map(c => [c.year, c.player].filter(Boolean).join(" "));
  const t = st.title.trim() || `[FS] ${names.join(", ")}${S.cards.length > 3 ? " and more" : ""} (${S.cards.length} lots)`;
  const comps = st.showComps && rows.some(c => c.comp != null), callout = st.callout !== false;
  const flagged = rows.filter(c => c.status !== "sold" && (c.isLot ? c.members.some(m => issuesOf(m).length) : issuesOf(c).length)).length;
  let b = (st.intro ? st.intro + "\n\n" : "") + `**Payment:** ${st.pay}  \n**Shipping:** ${st.ship}\n\n`;
  const head = `| # | Card | Condition | Price |${comps ? " Recent comp |" : ""}\n|:-|:-|:-|:-|${comps ? ":-|" : ""}\n`;
  rows.forEach((c, i) => {
    if(i === 0 || (c.section || "") !== (rows[i - 1].section || "")) b += (i ? "\n" : "") + (c.section ? "**" + c.section + "**\n\n" : i ? "**Other cards**\n\n" : "") + head;
    const cond = condCell(c, callout), name = title(c).replace(/\|/g, "/");
    const pr = c.status === "sold" ? "**SOLD**" : c.status === "claimed" ? `${money(priceOf(c))} (pending)` : money(priceOf(c));
    b += `| ${i + 1} | ${c.status === "sold" ? "~~" + name + "~~" : name} | ${cond} | ${pr} |${comps ? " " + (c.comp != null ? money(c.comp) + (c.compSrc && c.compSrc !== "example" ? " " + c.compSrc : "") : "") + " |" : ""}\n`;
  });
  if(comps) b += `\nPrices are about ${st.discount}% under the comp shown, since there are no platform fees here.\n`;
  if(callout && flagged) b += `\n**Condition:** ${st.condNote ?? DEFAULT_COND_NOTE}\n`;
  const backs = rows.filter(c => c.status === "open").reduce((a, c) => a + (c.isLot ? c.members.filter(m => m.needsBack).length : c.needsBack ? 1 : 0), 0);
  return {t, b, flagged, backs, missing: S.cards.filter(c => c.status === "open" && priceOf(c) == null).length};
}
function vPost(){
  const st = S.settings, {t, b, missing, flagged, backs} = buildPost();
  return `<section class="view"><div class="two">
  <div class="panel"><h2>Post settings</h2>
    ${copyBox()}
    <label>Title (leave blank to build it from your top cards)<input id="set-title" value="${esc(st.title)}" placeholder="${esc(t)}"></label>
    <label>Opening lines<textarea id="set-intro" style="min-height:70px;font-family:var(--body)">${esc(st.intro)}</textarea></label>
    <label>Payment<input id="set-pay" value="${esc(st.pay)}"></label>
    <label>Shipping<input id="set-ship" value="${esc(st.ship)}"></label>
    <label class="inline"><input type="checkbox" id="set-showComps" ${st.showComps ? "checked" : ""}> Show the comp beside each price</label>
    <label class="inline"><input type="checkbox" id="set-callout" ${st.callout !== false ? "checked" : ""}> Call out condition issues in bold</label>
    ${st.callout !== false ? `<label>Condition line under the price list<input id="set-condNote" value="${esc(st.condNote ?? DEFAULT_COND_NOTE)}"></label>` : ""}
    ${S.plan && S.plan.photos.length ? `<h3>Photos to take</h3><ol style="margin:0;padding-left:20px">${S.plan.photos.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    <p class="note">Check the subreddit's current posting rules before you post. Title format and timestamp requirements are set by the mods, and this draft does not replace them.</p>
  </div>
  <div class="panel"><h2>Draft</h2>
    ${missing ? `<p class="flag">${missing} row${missing === 1 ? " has" : "s have"} no price and ${missing === 1 ? "is" : "are"} left out of the table.</p>` : ""}
    ${st.callout !== false ? `<p class="note">${flagged ? flagged + " item" + (flagged === 1 ? " has" : "s have") + " a condition issue called out in bold." : "No condition issues were found to call out. If a card has one, add it under Edit details, Flaws."}</p>` : ""}
    ${unconfirmed() ? `<p class="flag">${unconfirmed()} card${unconfirmed() === 1 ? " has" : "s have"} condition notes suggested by the scan that you have not confirmed. Review them on the Inventory tab before posting.</p>` : ""}
    ${S.cards.filter(needsCheck).length ? `<p class="flag">${S.cards.filter(needsCheck).length} card${S.cards.filter(needsCheck).length === 1 ? " has" : "s have"} an identification you have not confirmed. They are marked on the Inventory tab.</p>` : ""}
    ${backs ? `<p class="flag">${backs} card${backs === 1 ? " has" : "s have"} not had the back checked. Look before you post: back damage is the issue buyers most often find undisclosed.</p>` : ""}
    <h3>Title</h3><textarea id="out-title" readonly style="min-height:44px">${esc(t)}</textarea>
    <div class="row"><button class="small" data-copy="out-title">Copy title</button></div>
    <h3>Post body or price comment, Reddit markdown</h3><textarea id="out-body" readonly style="min-height:260px">${esc(b)}</textarea>
    <div class="row"><button class="primary" data-copy="out-body">Copy body</button><span class="note" id="copymsg"></span></div>
  </div></div></section>`;
}

function statusComment(){
  const g = k => S.cards.filter(c => c.status === k);
  const line = c => `${title(c)}${priceOf(c) != null ? " " + money(c.status === "sold" && c.soldPrice != null ? c.soldPrice : priceOf(c)) : ""}`;
  let o = "";
  if(g("open").length) o += "**Still available**\n\n" + g("open").map(c => "- " + line(c)).join("\n") + "\n\n";
  if(g("claimed").length) o += "**Pending**\n\n" + g("claimed").map(c => "- " + title(c) + (c.claimBy ? " (u/" + c.claimBy + ")" : "")).join("\n") + "\n\n";
  if(g("sold").length) o += "**SOLD**\n\n" + g("sold").map(c => "- ~~" + title(c) + "~~").join("\n") + "\n";
  return o.trim();
}
function vClaims(){
  return `<section class="view">
  <div class="panel"><h2>Match claims from the thread</h2>
    <p class="note">Paste the comments in the order they were posted, usernames included. Earlier claims win. Review the result before you reply to anyone.</p>
    <textarea id="claimtext" placeholder="Homely_Corsican: I'll take the 58 Ted Williams.&#10;DGoods021: if the '68 Aaron is still available, I'll take it"></textarea>
    <div class="row"><button class="primary" data-act="match" ${ui.busy ? "disabled" : ""}>Match claims</button><span class="${ui.busy ? "progress busy" : "note"}">${esc(ui.busy || ui.claimMsg)}</span></div>
  </div>
  <div class="panel"><h2>Status by row</h2>
    <ul class="cards">${S.cards.map(c => `<li data-id="${c.id}">
      <div><div class="ttl">${esc(title(c))} ${c.status === "sold" ? `<span class="stamp">SOLD</span>` : ""}</div>
        <div class="meta">${priceOf(c) != null ? "Listed " + money(priceOf(c)) : "Unpriced"}${c.claimAt ? " · claimed " + new Date(c.claimAt).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : ""}${c.claimNote ? " · " + esc(c.claimNote) : ""}</div></div>
      <div class="nums">
        <label>Buyer<input data-f="claimBy" value="${esc(c.claimBy ?? "")}" placeholder="u/" style="width:130px"></label>
        ${c.status === "sold" ? `<label>Sold for<input class="money" data-f="soldPrice" value="${c.soldPrice ?? ""}"></label>` : ""}
        <select data-f="status" aria-label="Status"><option value="open" ${c.status === "open" ? "selected" : ""}>Available</option><option value="claimed" ${c.status === "claimed" ? "selected" : ""}>Claimed</option><option value="sold" ${c.status === "sold" ? "selected" : ""}>Paid, sold</option></select>
      </div></li>`).join("") || `<li><span class="note">No rows yet.</span></li>`}</ul>
  </div>
  ${claimDrafts()}
  <div class="panel"><h2>Status comment</h2><textarea id="out-status" readonly>${esc(statusComment())}</textarea>
    <div class="row"><button data-copy="out-status">Copy comment</button><span class="note">The Post tab also updates with strikethroughs and pending marks.</span></div></div>
  </section>`;
}
async function matchClaims(){
  const text = $("#claimtext").value.trim(); if(!text) return;
  if(!cap.ai){ ui.claimMsg = aiOff() + " You can still set statuses by hand."; return render(); }
  ui.busy = "Reading the thread"; render();
  try{
    const lots = S.cards.map(c => ({id:c.id, card:title(c), price:priceOf(c), status:c.status}));
    const r = await ai("claims", {lots, text});
    let n = 0, late = 0;
    for(const k of (r.claims || [])){ const c = S.cards.find(x => x.id === k.id); if(!c) continue;
      if(c.status === "open"){ c.status = "claimed"; c.claimBy = String(k.user || "").replace(/^u\//, ""); c.claimAt = Date.now(); c.claimNote = k.note || ""; n++; } else { late++; const u = String(k.user || "").replace(/^u\//, ""); if(u && u !== c.claimBy) c.backups = [...new Set([...(c.backups || []), u])]; } }
    ui.claimMsg = `${n} claim${n === 1 ? "" : "s"} matched${late ? ", " + late + " arrived after the lot was taken" : ""}.${(r.other || []).length ? " Needs your eye: " + r.other.join("; ") : ""}`;
    save();
  }catch(e){ ui.claimMsg = "Could not match: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}

function vSold(){
  const mine = S.solds, all = ui.community;
  const hit = r => !ui.q || [r.year, r.set, r.player, r.grade].join(" ").toLowerCase().includes(ui.q.toLowerCase());
  const tbl = rows => rows.length ? `<div class="scroll"><table><thead><tr><th>Card</th><th>Grade</th><th class="num">Sold</th><th class="num">Date</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(title(r))}</td><td>${esc(r.grade || "")}</td><td class="num">${money(r.price)}</td><td class="num">${r.date ? new Date(r.date).toLocaleDateString([], {month:"short",day:"numeric",year:"2-digit"}) : ""}</td></tr>`).join("")}</tbody></table></div>` : "";
  return `<section class="view">
  <div class="panel"><h2>Your sold log</h2>
    <p class="note">Every row you mark paid lands here with its final price. This is the start of a price history that eBay does not have: what cards clear for on the sub.</p>
    ${tbl(mine) || `<p class="note">Nothing sold yet. Mark a row "Paid, sold" on the Claims tab.</p>`}
    <label class="inline"><input type="checkbox" id="set-share" ${S.settings.share ? "checked" : ""} ${cap.token ? "" : "disabled"}> Add my sold prices to the shared index. Card, grade, price and date only. No usernames.</label>
    ${cap.token ? "" : `<p class="note">Sign in to share your sold prices.</p>`}
  </div>
  ${historyPanels()}
  <div class="panel"><div class="row" style="justify-content:space-between"><h2>Shared sub index</h2><button class="small" data-act="loadCommunity">Refresh</button></div>
    <p class="note">Built only from testers who opt in above. Search before you price.</p>
    <input id="q" placeholder="Search, e.g. 1968 Aaron" value="${esc(ui.q)}">
    ${all == null ? `<p class="note">${esc(ui.communityMsg || "Loading the index.")}</p>` : (tbl(all.filter(hit)) || `<p class="note">${all.length ? "No matches." : "No shared sales yet. The first testers to opt in fill this table."}</p>`)}
  </div></section>`;
}
async function loadCommunity(){
  try{
    const d = await api("/api/solds"); const rows = (d && d.items) || [];
    ui.community = rows.sort((a, b) => (b.date || 0) - (a.date || 0));
  }catch(e){ ui.community = null; ui.communityMsg = "Could not load the shared index: " + (e && (e.message || e.code) || "error"); }
  if(location.hash === "#sold") render();
}

const SIGNALS = [
  {score:91, d:12, a:40, src:"Estate sale listing", t:'"Box of old 80s baseball cards"', why:"Photo 7 shows black borders in the stack, the 1971 Topps design. Listed era is wrong by a decade.", tags:["mislabeled era","image clue","opens Friday 9am"]},
  {score:84, d:34, a:200, src:"Online estate auction", t:'"Misc sports cards and ephemera, lot 212"', why:"One photo shows horizontal card backs with early 1950s layouts. Three bids, closes in two days, local pickup only.", tags:["vague title","pickup only","low bid count"]},
  {score:66, d:21, a:300, src:"Local marketplace", t:'"Grandpa\'s cards, shoebox, $60 OBO"', why:"No fronts shown. Rubber-banded stacks and a 1960s team-issue envelope in frame. Worth two questions before driving.", tags:["needs questions","message drafted"]},
  {score:31, d:44, a:110, src:"Thrift auction site", t:'"1975 Topps Mini lot (40)"', why:"Correctly labeled, and the current bid is already near what these clear for on the sub. Skip.", tags:["fairly priced"]}
];
function vRadar(){
  const R = 120, r = S.radar;
  const dots = SIGNALS.map(s => { const k = s.d / 50 * R, x = 140 + k * Math.cos(s.a * Math.PI / 180), y = 140 + k * Math.sin(s.a * Math.PI / 180); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${4 + s.score / 16}" class="${s.score > 80 ? "dot-hi" : s.score > 50 ? "dot-mid" : "dot-lo"}"><title>${esc(s.t)} score ${s.score}</title></circle><text x="${(x + 12).toFixed(1)}" y="${(y + 3).toFixed(1)}">${s.score}</text>`; }).join("");
  return `<section class="view">
  <p class="flag">Concept preview. The four signals below are invented examples that show how the paid engine would score and explain a lead. No live sources are connected yet.</p>
  <div class="two">
    <div class="panel"><h2>Within 50 miles</h2>
      <svg viewBox="0 0 280 280" role="img" aria-label="Example radar of four scored leads by distance" style="max-width:320px;width:100%">
        <circle class="ring" cx="140" cy="140" r="120"/><circle class="ring" cx="140" cy="140" r="72"/><circle class="ring" cx="140" cy="140" r="24"/>
        <text x="144" y="18">50 mi</text><text x="144" y="66">30</text><text x="144" y="114">10</text>
        <circle class="me" cx="140" cy="140" r="3"/>${dots}</svg>
      <p class="note">Dot size and color follow the score. Score blends how wrong the listing is, how sure the image read is, expected margin against sub sold prices, and how few people have seen it.</p>
    </div>
    <div class="panel"><h2>Example signals</h2>
      ${SIGNALS.map(s => `<div class="sig"><div class="score ${s.score > 80 ? "hi" : s.score < 50 ? "lo" : ""}">${s.score}</div><div><div class="ttl">${esc(s.t)}</div><div class="meta">${esc(s.src)} · ${s.d} mi</div><p style="font-size:14px;margin-top:4px">${esc(s.why)}</p><div class="row" style="gap:5px;margin-top:6px">${s.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div></div></div>`).join("")}
    </div>
  </div>
  <div class="panel"><h2>Tell the engine what to hunt</h2>
    <p class="note">Testers: this goes to the person running the prototype and decides which sources get built first.</p>
    <div class="row">
      <label>ZIP<input id="rad-zip" value="${esc(r.zip)}" style="width:100px" inputmode="numeric"></label>
      <label>Drive radius, miles<input id="rad-radius" type="number" value="${esc(r.radius)}" style="width:100px"></label>
      <label class="grow">What you want found<input id="rad-targets" value="${esc(r.targets)}" placeholder="1950s Topps stars, low-grade HOF lots, T206 commons"></label>
    </div>
    <label>Where you look today<input id="rad-sources" value="${esc(r.sources)}" placeholder="estate sale sites, local auctions, marketplace apps"></label>
    <div class="row"><button class="primary" data-act="radarSave">Send my hunt profile</button><span class="note">${esc(ui.radarMsg)}</span></div>
  </div></section>`;
}

/* ---------- sort cards by hand: singles, a year lot, or a per-card price page ---------- */
ui.sel = new Set(); ui.pagePrice = 10; ui.selMsg = "";
function valueLine(c){
  if(c.isLot) return "";
  const p = priceOf(c), ask = p != null ? " · Reddit ask " + money(p) : "";
  if(c.comp != null) return `<div class="val">Sold comp ${money(c.comp)}${ask}</div>`;
  if(c.aiLow != null && c.aiHigh != null) return `<div class="val">Raw value in this condition ${money(c.aiLow)} to ${money(c.aiHigh)}${ask} <span class="note">AI estimate, not a sold comp</span></div>`;
  return `<div class="val note">No value yet. Enter a sold comp or an ask${p != null ? " (ask is " + money(p) + ")" : ""}.</div>`;
}
const secRank = n => /single/i.test(n) ? 0 : /per card|each/i.test(n) ? 1 : 2;
function ensureSection(name){
  S.plan = S.plan || {text:"", sections:[], photos:[], gaps:[]};
  const s = S.plan.sections; if(s.includes(name)) return;
  const pageNum = x => parseFloat(String(x).replace(/[^0-9.]/g, "")) || 0;
  let i = s.findIndex(x => secRank(x) > secRank(name) || (secRank(x) === 1 && secRank(name) === 1 && pageNum(x) < pageNum(name)));
  if(i < 0) i = s.length;
  s.splice(i, 0, name);
}
function detach(c){
  if(c.pin === "page"){ c.price = c.prevPrice ?? null; delete c.prevPrice; }
  delete c.pin; delete c.manual;
}
function resetPages(){ S.cards.forEach(c => { if(c.status === "open" && !c.manual && c.pin === "page") detach(c); }); }
const selected = () => S.cards.filter(c => ui.sel.has(c.id) && c.status === "open" && !c.isLot);
function assignSingles(){
  const cs = selected();
  cs.forEach(c => { detach(c); c.pin = "single"; c.manual = true; c.section = "Singles"; });
  if(cs.length) ensureSection("Singles");
  return cs.length + " set as singles.";
}
function assignPage(price){
  if(!(price > 0)) return "Enter a price per card first.";
  const cs = selected(), name = "$" + price + " per card";
  cs.forEach(c => { detach(c); c.prevPrice = c.price ?? null; c.price = price; c.pin = "page"; c.manual = true; c.section = name; });
  if(cs.length) ensureSection(name);
  const over = cs.filter(c => { const b = basisOf(c); return b != null && b * (1 - S.settings.discount / 100) >= price * 1.5; }).length;
  return cs.length + " put on the " + name + " page." + (over ? " " + over + (over === 1 ? " of them looks" : " of them look") + " worth well over that. Check before posting." : "");
}
function describeLot(lot){
  const top = [...lot.members].sort((a, b) => (priceOf(b) || 0) - (priceOf(a) || 0)).slice(0, 4).map(c => c.player).filter(Boolean);
  lot.flaws = top.length ? "includes " + top.join(", ") : "";
  const g = [...new Set(lot.members.map(c => c.grade).filter(Boolean))];
  lot.grade = g.length <= 2 ? g.join(", ") : "mixed condition";
}
function assignYearLots(){
  const cs = selected(), groups = new Map(); let made = 0, alone = 0;
  cs.forEach(c => { const k = [c.year || "Unknown year", c.set || ""].join(" ").trim(); if(!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  for(const [k, list] of groups){
    let lot = S.cards.find(x => x.isLot && x.manual && x.key === k && x.status === "open");
    if(!lot && list.length < 2){ alone++; continue; }
    list.forEach(c => { detach(c); c.pin = "lot"; c.section = "Lots by year"; });
    S.cards = S.cards.filter(x => !list.includes(x));
    if(!lot){ lot = {id:uid(), status:"open", isLot:true, manual:true, key:k, members:[], section:"Lots by year", year:"", set:"", num:"", player:k + " lot (0 cards)", grade:"", flaws:"", conf:1, comp:null, price:null}; S.cards.push(lot); }
    lot.members.push(...list); describeLot(lot); relot(lot); made++;
  }
  if(made) ensureSection("Lots by year");
  return [made ? made + " year lot" + (made === 1 ? "" : "s") + " built." : "", alone ? alone + " card" + (alone === 1 ? " has" : "s have") + " no other selected card from the same year and set, so " + (alone === 1 ? "it was" : "they were") + " left alone." : ""].filter(Boolean).join(" ");
}
function combineLot(){
  const cs = selected(); if(cs.length < 2) return "Tick at least two cards to combine.";
  const same = f => cs.every(c => String(c[f] ?? "").toLowerCase() === String(cs[0][f] ?? "").toLowerCase() && cs[0][f]);
  const name = same("year") && same("set") ? `${cs[0].year} ${cs[0].set} lot` : same("player") ? `${cs[0].player} lot` : same("year") ? `${cs[0].year} lot` : "Mixed lot";
  if(!applyOps([{op:"lot", name, ids:cs.map(c => c.id), section:"Lots"}])) return "Those cards could not be combined.";
  const lot = S.cards[S.cards.length - 1]; if(lot && lot.isLot) lot.why = "You combined these by hand.";
  return `Combined ${cs.length} cards into ${name} at ${money(priceOf(lot)) || "no price yet"}. It is on the Sale tab, where you can change the price or the name.`;
}
function selBar(){
  const n = selected().length, all = S.cards.filter(c => ui.sel.has(c.id)).length, off = n ? "" : "disabled";
  if(!all) return ui.selMsg ? `<p class="note">${esc(ui.selMsg)}</p>` : "";
  return `<div class="bar"><strong>${all} selected</strong>
    <button class="small primary" data-act="asLot" ${all >= 2 && n === all ? "" : "disabled"}>Combine into one lot</button>
    <button class="small danger" data-act="delSel">Delete</button>
    <button class="small" data-act="asSingles" ${off}>Sell as singles</button>
    <button class="small" data-act="asYearLot" ${off}>Year lots</button>
    <span class="row" style="gap:6px"><button class="small" data-act="asPage" ${off}>Put on a page at</button><span>$</span><input class="money" id="pageprice" inputmode="decimal" value="${esc(ui.pagePrice)}" aria-label="Price per card"><span>per card</span></span>
  </div>`;
}

/* ---------- evidence trail: every value, ask and placement can be opened to see where it came from ---------- */
function whyLines(c){
  const out = [], d = Number(S.settings.discount) || 0, p = priceOf(c);
  if(c.isLot){
    const sum = c.members.reduce((a, m) => a + (priceOf(m) || 0), 0), b = Number(S.settings.lotDiscount ?? 10);
    out.push(["In this lot", c.members.map(m => title(m) + (priceOf(m) != null ? " " + money(priceOf(m)) : " (no price)")).join("; ")]);
    out.push(["Lot price", c.members.some(m => priceOf(m) == null) ? "Not set, because at least one card inside has no price." : `The cards' asks add up to ${money(sum)}. Less the ${b}% bundle discount and rounded, that is ${money(roundP(sum * (1 - b / 100)))}.` + (p !== roundP(sum * (1 - b / 100)) ? ` You changed it to ${money(p)}.` : "")]);
    out.push(["Why a lot", c.why || (c.manual ? "You grouped these by hand." : "Grouped by the sale plan.")]);
    return out;
  }
  out.push(["Identified as", title(c) + (c.conf != null ? `, ${Math.round(c.conf * 100)}% confidence.` : ".") + (c.idWhy ? " " + c.idWhy : "") + (c.needsBack ? " The back should be checked to confirm." : "")]);
  out.push(["Condition", ([c.grade, c.flaws].filter(Boolean).join(". ") || "Not recorded.") + (c.flawsAI != null ? (c.flawsOk ? ". Reviewed by you." : ". Suggested by the scan and not yet confirmed by you.") + (c.flawsAI && c.flawsAI !== c.flaws ? " The scan first suggested: " + c.flawsAI + "." : "") : "")]);
  const pck = S.priceCheck && S.priceCheck.items[c.id];
  if(pck) out.push(["Price check", `${pck.used ? "Suggestion used" : pck.verdict === "ok" ? "Looks right" : pck.verdict === "raise" ? "Could go higher" : "Could go lower"}${Number(pck.suggest) > 0 ? ", suggested " + money(Number(pck.suggest)) : ""}. ${pck.why || ""} ${(pck.evidence || []).slice(0, 3).map(e => [e.source, e.price != null ? money(Number(e.price)) : "", e.note].filter(Boolean).join(" ")).join("; ")}`.trim()]);
  if(c.photosSeen) out.push(["Extra photos", `${c.photosSeen} photo${c.photosSeen === 1 ? "" : "s"} of this card were checked${c.recheckNote ? ", after you asked: " + c.recheckNote : ""}. ${c.recheckSummary || ""}`.trim()]);
  if(c.comp != null) out.push(["Value", `Sold comp of ${money(c.comp)} that you entered${c.compSrc && c.compSrc !== "example" ? " (" + c.compSrc + ")" : c.compSrc === "example" ? " (example figure)" : ""}.`]);
  else if(c.aiLow != null && c.aiHigh != null) out.push(["Value", `${money(c.aiLow)} to ${money(c.aiHigh)} raw in this condition. ${c.valueWhy || ""} This is an AI estimate from general knowledge, not a record of actual sales. Use the eBay solds and SportsCardsPro links to confirm.`]);
  else out.push(["Value", "None yet."]);
  const basis = basisOf(c), auto = basis != null ? roundP(basis * (1 - d / 100)) : null;
  if(c.pin === "page") out.push(["Reddit ask", `${money(p)}, the page price.` + (auto != null ? ` Priced alone it would be ${money(auto)}.` : "")]);
  else if(c.price != null) out.push(["Reddit ask", `${money(p)}, typed by you.` + (auto != null ? ` The worked-out ask would be ${money(auto)}.` : "")]);
  else if(basis != null) out.push(["Reddit ask", `${c.comp != null ? "Sold comp" : "Midpoint of the value range"} ${money(Math.round(basis))}, less ${d}% because there are no platform fees, rounded to ${money(auto)}.`]);
  histWhy(c).forEach(x => out.push(x));
  const min = singleMin();
  if(c.section || c.pin) out.push(["Placement", c.pin === "page" ? `On the ${c.section} page${c.manual ? ", placed by you" : ", placed by the sale plan"}.` : c.pin === "single" ? `A single${c.manual ? ", placed by you" : ", agreed by you from the suggestions"}.` : c.pin === "lot" ? "Kept for a lot, your choice." : `In "${c.section}", placed by the sale plan.`]);
  else if(min && (p || 0) >= min) out.push(["Suggestion", `Sell as a single: its ask of ${money(p)} is at or above your ${money(min)} line.`]);
  else if(min && p != null) out.push(["Suggestion", `Lot or page candidate: its ask of ${money(p)} is under your ${money(min)} line for singles.`]);
  return out;
}
const whyBox = c => `<details class="edit why"><summary>Why this ${c.isLot ? "lot and price" : "value and ask"}</summary><dl>${whyLines(c).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details>`;

/* ---------- condition notes are suggestions: the seller keeps, drops, restores or adds each one ---------- */
function flawBox(c){
  if(c.isLot || c.status !== "open") return "";
  const parts = flawParts(c), have = parts.map(x => x.toLowerCase());
  const dropped = flawParts({flaws:c.flawsAI}).filter(x => !have.includes(x.toLowerCase()));
  const pending = c.flawsAI != null && !c.flawsOk;
  return `<div class="links flaws"><span class="note">Condition notes${pending ? ", suggested from the photo" : ""}:</span>
      ${parts.map((x, i) => `<button class="chipbtn ${ISSUE.test(x) ? "warn" : ""}" data-act="flawDrop" data-i="${i}" aria-label="Remove note: ${esc(x)}">${esc(x)} ×</button>`).join("")}
      ${dropped.map(x => `<button class="chipbtn off" data-act="flawBack" data-v="${esc(x)}" aria-label="Restore note: ${esc(x)}">${esc(x)} +</button>`).join("")}
      <input data-f="flawAdd" placeholder="Add your own note" aria-label="Add a condition note" style="width:170px">
      ${pending ? `<button class="small" data-act="flawOk">Looks right</button>` : c.flawsOk ? `<span class="chip ok">condition confirmed</span>` : ""}
      ${c.backSeen ? `<span class="chip ok">back checked</span>` : ""}
    </div>`;
}
const unconfirmed = () => S.cards.filter(c => c.status === "open").reduce((a, c) => a + (c.isLot ? c.members : [c]).filter(m => m.flawsAI != null && !m.flawsOk).length, 0);

/* ---------- identification checks: unsure reads are flagged, and a back photo or a typed fix settles them ---------- */
function checkReasons(c){
  const out = [];
  if(c.isLot || c.status !== "open" || c.idOk || c.flawsAI == null) return out;
  if((c.conf ?? 1) < .75) out.push(`the scan is only ${Math.round((c.conf || 0) * 100)}% sure what this is`);
  if(c.needsBack) out.push("the back is needed to confirm it");
  if(!c.year) out.push("the year could not be read");
  if(!c.player) out.push("the player could not be read");
  return out;
}
const needsCheck = c => checkReasons(c).length > 0;
function checkBox(c){
  const why = checkReasons(c);
  if(!why.length) return c.backMsg ? `<div class="check ok"><span>${esc(c.backMsg)}</span></div>` : "";
  return `<div class="check"><span><strong>Check this card:</strong> ${esc(why.join(", "))}.${c.num ? "" : " The card number was not read."} Add photos of the back or close-ups, fix the details here, or confirm it.</span>
      <div class="row"><button class="small primary" data-act="backPick" ${ui.busy ? "disabled" : ""}>Add photos</button>
        <label>Year<input data-f="year" inputmode="numeric" value="${esc(c.year ?? "")}" style="width:72px"></label>
        <label>Card #<input data-f="num" value="${esc(c.num ?? "")}" style="width:72px"></label>
        <label class="grow">Player<input data-f="player" value="${esc(c.player ?? "")}"></label>
        <button class="small" data-act="idOk">It is right</button></div>
      ${c.backMsg ? `<span>${esc(c.backMsg)}</span>` : ""}</div>`;
}
function checkPanel(){
  const n = S.cards.filter(needsCheck).length;
  if(!n){ ui.onlyCheck = false; return ""; }
  return `<div class="panel pick"><div class="row" style="justify-content:space-between"><h2>${n} card${n === 1 ? " needs" : "s need"} a check</h2>
    <label class="inline"><input type="checkbox" id="onlycheck" ${ui.onlyCheck ? "checked" : ""}> Show only these</label></div>
    <p class="note">The scan was not sure what these are, or needs the back to tell. Each one is marked in the list below. Add a back photo, fix the year and number, or confirm it is right.</p></div>`;
}
async function readBack(file, id){
  const f = findCard(id); if(!f) return;
  const c = f.c;
  if(!cap.ai){ c.backMsg = aiOff(); return render(); }
  ui.busy = "Reading the back"; c.backMsg = "Reading the back"; render();
  try{
    const img = await shrink(file), front = {year:c.year, set:c.set, num:c.num, player:c.player, variation:c.variation, grade:c.grade, flaws:c.flaws};
    const r = (await ai("back", {front}, [img])) || {};
    if(r.matches === false) c.backMsg = "That back does not look like the same card as the front, so nothing was changed.";
    else {
      const before = title(c);
      for(const k of ["year", "set", "num", "player", "variation"]) if(r[k] != null && r[k] !== "") c[k] = r[k];
      if(typeof r.conf === "number") c.conf = r.conf;
      if(r.idWhy) c.idWhy = String(r.idWhy);
      if(r.grade) c.grade = String(r.grade);
      if(r.aiLow != null && r.aiHigh != null){ c.aiLow = numOrNull(r.aiLow); c.aiHigh = numOrNull(r.aiHigh); if(r.valueWhy) c.valueWhy = String(r.valueWhy); }
      const have = flawParts(c).map(x => x.toLowerCase()), add = (Array.isArray(r.backFlaws) ? r.backFlaws : []).map(String).filter(x => x && !have.includes(x.toLowerCase()));
      if(add.length){ c.flaws = joinFlaws([...flawParts(c), ...add]); c.flawsAI = joinFlaws([...flawParts({flaws:c.flawsAI}), ...add]); c.flawsOk = false; }
      c.needsBack = false; c.backSeen = true; c.idOk = (c.conf ?? 0) >= .75;
      c.backMsg = (title(c) !== before ? `The back changed this to ${title(c)}.` : "The back confirms it.") + (add.length ? ` New condition notes from the back: ${add.join(", ")}.` : "") + (c.idOk ? "" : " It is still not certain, so check the details.");
      if(c.example) delete c.example;
      if(f.lot){ if(f.lot.manual) describeLot(f.lot); relot(f.lot); }
      save();
    }
  }catch(e){ c.backMsg = "The back could not be read: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}

/* ---------- grouping suggestions: one player, one graded set, or a run of low-value cards from one set ---------- */
ui.grpPrice = {};
const SLAB = /^(PSA|SGC|BGS|BVG|CGC|HGA|CSG)\b/i;
const looseCards = () => S.cards.filter(c => c.status === "open" && !c.isLot && !c.manual && !c.section && c.pin !== "single" && c.pin !== "page" && !c.example);
function groupSuggestions(){
  const cs = looseCards(), skip = new Set(S.grpSkip || []), out = [], norm = v => String(v ?? "").trim().toLowerCase(), min = singleMin() || 20;
  const by = f => { const m = new Map(); cs.forEach(c => { const k = f(c); if(!k) return; if(!m.has(k)) m.set(k, []); m.get(k).push(c); }); return m; };
  const add = (key, name, why, list) => { if(!skip.has(key)) out.push({key, name, why, ids:list.map(c => c.id), cards:list}); };
  for(const [k, list] of by(c => /\b(lot|unidentified|unknown)\b/.test(norm(c.player)) ? "" : norm(c.player)))
    if(list.length >= 3) add("p:" + k, list[0].player + " lot", `${list.length} ${list[0].player} cards. A player lot brings in that player's collectors.`, list);
  for(const [, list] of by(c => SLAB.test(c.grade || "") && c.year ? norm(c.year) + "|" + norm(c.set) : ""))
    if(list.length >= 3) add("s:" + norm(list[0].year) + "|" + norm(list[0].set), `${list[0].year} ${list[0].set} graded lot`, `${list.length} graded ${list[0].year} ${list[0].set} cards. A matching run of slabs sells well together.`, list);
  for(const [, list] of by(c => c.year && !SLAB.test(c.grade || "") && (priceOf(c) ?? 0) < min ? norm(c.year) + "|" + norm(c.set) : ""))
    if(list.length >= 3) add("y:" + norm(list[0].year) + "|" + norm(list[0].set), `${list[0].year} ${list[0].set} lot`, `${list.length} cards from ${list[0].year} ${list[0].set}, each asking under ${money(min)}. Low-value cards from one set sell faster as a lot.`, list);
  return out.sort((a, b) => b.cards.length - a.cards.length);
}
function groupPanel(){
  const gs = groupSuggestions(); if(!gs.length) return "";
  const d = Number(S.settings.lotDiscount ?? 10);
  return `<div class="panel pick" id="groups"><h2>Suggested groupings <span class="note">${gs.length}</span></h2>
    <p class="note">Cards that usually sell better together. Check the cards and the price, then make the lot in one tap. A card can show up in more than one suggestion until you choose.</p>
    <ul class="cards">${gs.slice(0, 8).map(g => {
      const sum = g.cards.reduce((a, c) => a + (priceOf(c) || 0), 0), un = g.cards.filter(c => priceOf(c) == null).length;
      const sug = sum && !un ? roundP(sum * (1 - d / 100)) : null;
      return `<li data-gkey="${esc(g.key)}"><div><div class="ttl">${esc(g.name)} (${g.cards.length} cards)</div>
        <div class="meta">${esc(g.cards.map(c => title(c) + (priceOf(c) != null ? " " + money(priceOf(c)) : "")).join("; "))}</div>
        <div class="meta">Why: ${esc(g.why)} ${un ? esc(un + (un === 1 ? " card has" : " cards have") + " no ask yet, so type a lot price.") : esc("Their asks add up to " + money(sum) + ". " + d + "% off for taking the group is " + money(sug) + ".")}</div></div>
        <div class="nums"><label>Lot price<input class="money" data-gp="${esc(g.key)}" inputmode="decimal" value="${esc(ui.grpPrice[g.key] ?? sug ?? "")}"></label>
          <button class="primary" data-act="grpMake">Make this lot</button><button class="small" data-act="grpSkip">Not now</button></div></li>`; }).join("")}</ul>
  </div>`;
}

/* ---------- more photos of one card: angles, the back, close-ups; all read as the same card ---------- */
ui.rq = {};
const RQ_MAX = 6;
async function queuePhotos(id, files){
  const q = ui.rq[id] = ui.rq[id] || {blobs:[], urls:[], note:"", msg:""};
  q.msg = "";
  for(const f of files){
    if(q.blobs.length >= RQ_MAX){ q.msg = `${RQ_MAX} photos is the most one recheck can use.`; break; }
    try{ const b = await shrink(f); q.blobs.push(b); q.urls.push(URL.createObjectURL(b)); }catch(e){ q.msg = "One file could not be opened as a photo."; }
  }
  render();
}
function dropRq(id){ const q = ui.rq[id]; if(q) q.urls.forEach(u => URL.revokeObjectURL(u)); delete ui.rq[id]; }
function rqBox(c){
  const q = ui.rq[c.id]; if(!q) return "";
  return `<div class="check rq"><span><strong>Recheck with ${q.blobs.length} photo${q.blobs.length === 1 ? "" : "s"}.</strong> Every photo is read as this one card: the back, close-ups of corners or creases, other angles, better light.</span>
    <div class="row">${q.urls.map(u => `<img src="${u}" alt="" class="rqthumb">`).join("")}<button class="small" data-act="backPick" ${q.blobs.length >= RQ_MAX ? "disabled" : ""}>Add another photo</button></div>
    <label>What should it look at? Optional.<input data-rq="${c.id}" value="${esc(q.note)}" placeholder="I think it is a 1959, and the corners look better than it says"></label>
    <div class="row"><button class="primary" data-act="recheck" ${ui.busy || !q.blobs.length ? "disabled" : ""}>Recheck now</button><button class="small" data-act="rqCancel">Cancel</button>${q.msg ? `<span>${esc(q.msg)}</span>` : ""}</div></div>`;
}
const flawList = v => (Array.isArray(v) ? v : String(v || "").split(/,\s*/)).map(x => String(x).trim()).filter(Boolean);
async function askOneCard(card, note, blobs){ return (await ai("recheck", {card, note}, blobs)) || {}; }
async function recheck(id){
  const f = findCard(id), q = ui.rq[id]; if(!f || !q || !q.blobs.length) return;
  const c = f.c;
  if(!cap.ai){ q.msg = aiOff(); return render(); }
  ui.busy = "Rechecking"; q.msg = "Looking at every photo"; render();
  try{
    const card = {year:c.year, set:c.set, num:c.num, player:c.player, variation:c.variation, grade:c.grade, flaws:c.flaws, valueLow:c.aiLow, valueHigh:c.aiHigh, soldComp:c.comp, ask:priceOf(c)};
    const r = await askOneCard(card, q.note, q.blobs);
    if(r.mixed){ q.msg = (r.summary ? String(r.summary) + " " : "") + "Nothing was changed. Remove the photos of the other card and try again."; ui.busy = ""; return render(); }
    const before = title(c), n = q.blobs.length, b0 = checkSnap(c);
    for(const k of ["year", "set", "num", "player", "variation"]) if(r[k] != null && r[k] !== "") c[k] = r[k];
    if(typeof r.conf === "number") c.conf = r.conf;
    if(r.idWhy) c.idWhy = String(r.idWhy);
    if(r.grade) c.grade = String(r.grade);
    if(r.aiLow != null && r.aiHigh != null){ c.aiLow = numOrNull(r.aiLow); c.aiHigh = numOrNull(r.aiHigh); if(r.valueWhy) c.valueWhy = String(r.valueWhy); }
    const have = flawParts(c).map(x => x.toLowerCase()), add = flawList(r.flaws).filter(x => !have.includes(x.toLowerCase()));
    if(add.length){ c.flaws = joinFlaws([...flawParts(c), ...add]); c.flawsAI = joinFlaws([...flawParts({flaws:c.flawsAI}), ...add]); c.flawsOk = false; }
    if(r.sawBack){ c.backSeen = true; c.needsBack = false; }
    c.idOk = (c.conf ?? 0) >= .75;
    c.photosSeen = (c.photosSeen || 0) + n; c.recheckNote = q.note || ""; c.recheckSummary = String(r.summary || "");
    c.backMsg = `Rechecked with ${n} photo${n === 1 ? "" : "s"}. ` + (c.recheckSummary || (title(c) !== before ? "" : "The photos confirm it.")) + (title(c) !== before ? ` Now ${title(c)}.` : "") + (add.length ? ` New condition notes: ${add.join(", ")}.` : "");
    if(c.example) delete c.example;
    if(f.lot){ if(f.lot.manual) describeLot(f.lot); relot(f.lot); }
    c.lastCheck = {before:b0, after:checkSnap(c)}; c.checkSeen = false; ui.cmdMsg = title(c) + " rechecked. The result is on the card.";
    dropRq(id); save();
  }catch(e){ q.msg = "The recheck did not work: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
async function scanOne(files){
  if(!cap.ai){ ui.scanMsg = aiOff(); return render(); }
  ui.busy = "Reading the photos of one card"; render();
  try{
    const blobs = []; for(const f of files.slice(0, RQ_MAX)) blobs.push(await shrink(f));
    const r = await askOneCard({}, "This is a new card for the inventory. Identify it from these photos.", blobs);
    if(r.mixed) ui.scanMsg = (r.summary ? String(r.summary) + " " : "") + "Turn off \"These photos are all one card\" to scan them as separate cards.";
    else {
      if(S.cards.every(c => c.example)) S.cards = [];
      const fl = joinFlaws(flawList(r.flaws));
      const c = {id:uid(), status:"open", year:r.year ?? "", set:r.set ?? "", num:r.num ?? "", player:r.player ?? "Unidentified card", variation:r.variation ?? "", grade:r.grade ?? "", flaws:fl, flawsAI:fl, conf:typeof r.conf === "number" ? r.conf : .5, needsBack:false, backSeen:!!r.sawBack, aiLow:numOrNull(r.aiLow), aiHigh:numOrNull(r.aiHigh), idWhy:String(r.idWhy || ""), valueWhy:String(r.valueWhy || ""), where:`${blobs.length} photos of one card`, photosSeen:blobs.length, comp:null, price:null};
      S.cards.push(c);
      ui.scanMsg = `Added ${title(c)} from ${blobs.length} photo${blobs.length === 1 ? "" : "s"} of one card.` + (files.length > RQ_MAX ? ` Only the first ${RQ_MAX} photos were used.` : "");
      save();
    }
  }catch(e){ ui.scanMsg = "That did not work: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}

/* ---------- single suggestions: cards worth selling alone are pulled out for a one-tap decision ---------- */
const singleMin = () => Number(S.settings.singleMin ?? 20) || 0;
function singleCandidates(){
  const min = singleMin(), out = [];
  if(!min) return out;
  for(const c of S.cards){
    if(c.status !== "open") continue;
    if(c.isLot){
      const tot = (c.members || []).reduce((a, m) => a + (priceOf(m) || 0), 0);
      // a card worth selling alone, or one carrying most of a small lot's value
      for(const m of c.members || []) if(!m.pin && ((priceOf(m) || 0) >= min || (tot && (priceOf(m) || 0) >= 10 && (priceOf(m) || 0) / tot >= .4))) out.push({c:m, lot:c});
    }
    else if(!c.pin && !c.section && (priceOf(c) || 0) >= min) out.push({c, target:anchorTarget(c)});
  }
  return out;
}
const sameRun = (a, b) => String(a.year || "") === String(b.year || "") && String(a.set || "").toLowerCase() === String(b.set || "").toLowerCase() && a.year;
const anchorTarget = c => S.cards.find(l => l.isLot && l.status === "open" && (l.members || []).some(m => sameRun(m, c))) || null;
/* sell-through from the seller's finished sales: [listed, sold] */
function sellThrough(kind, p){
  let n = 0, s = 0; const band = [[0, 10], [10, 25], [25, 75], [75, 1e9]].find(b => p >= b[0] && p < b[1]) || [0, 1e9];
  (S.sales || []).forEach(sale => sale.items.forEach(i => { if(i.kind !== kind) return; if(kind === "single" && !(i.ask >= band[0] && i.ask < band[1])) return; n++; if(i.sold != null) s++; }));
  return {n, s, rate:n ? s / n : null, band};
}
/* the recommendation: positive points favor selling alone, negative favor keeping it as the lot's anchor */
function pullAdvice(x){
  const c = x.c, lot = x.lot || x.target, p = priceOf(c) || 0, min = singleMin(), d = Number(S.settings.lotDiscount ?? 10) / 100;
  const others = lot ? lot.members.filter(m => m !== c) : [], rest = others.reduce((a, m) => a + (priceOf(m) || 0), 0);
  const withIt = lot ? (x.lot && lot.fixed ? priceOf(lot) : roundP((rest + p) * (1 - d))) : null, without = others.length >= 2 ? roundP(rest * (1 - d)) : null;
  const share = lot && rest + p ? p / (rest + p) : 0, top = others.reduce((a, m) => Math.max(a, priceOf(m) || 0), 0);
  const why = []; let score = 0;
  const h = historyFor(c), g = r => r.grade ? " (" + r.grade + ")" : "";
  const soldAlone = [...h.mine.map(r => ({...r, src:"You sold one alone"})), ...h.sub.filter(r => r.sold).map(r => ({...r, src:"Sold on the sub"}))].filter(r => r.price >= p * .8);
  if(soldAlone.length){ score += 2; why.push(`${soldAlone[0].src} for ${money(soldAlone[0].price)}${g(soldAlone[0])}${soldAlone[0].date ? " on " + dshort(soldAlone[0].date) : ""}${soldAlone.length > 1 ? ", and " + (soldAlone.length - 1) + " more at that level" : ""}.`); }
  const flop = h.unsold.filter(r => r.price <= p * 1.1);
  if(flop.length){ score -= 2; why.push(`It did not sell alone at ${money(flop[0].price)} on ${dshort(flop[0].date)}.`); }
  const pc = S.priceCheck && S.priceCheck.items[c.id], ev = pc ? (pc.evidence || []).filter(e => Number(e.price) > 0) : [];
  if(ev.length){ const hi = ev.filter(e => Number(e.price) >= p).length; if(hi * 2 >= ev.length){ score += 1; } why.push(`Recent sales from the price check: ${ev.slice(0, 3).map(e => [e.source, money(Number(e.price)), e.note].filter(Boolean).join(" ")).join("; ")}.`); }
  if(min && p >= min * 2){ score += 1; why.push(`At ${money(p)} it is well over your ${money(min)} singles line.`); }
  else if(min && p >= min) score += .5;
  if(lot){
    const weak = others.length >= 2 && top < Math.max(5, min / 2);
    if(!weak && share >= .6){ score += 1; why.push(`It is ${Math.round(share * 100)}% of the lot's value, so lot buyers would mostly be paying for this one card.`); }
    if(weak && share >= .15){ score -= 1.5; why.push(`The other ${others.length} cards are all ${money(Math.max(1, top))} or less. Without it the lot is ${money(without)} of lower cards, and one strong card is what draws buyers to a lot like that.`); }
    if(p && d) why.push(`${x.lot ? "Kept in" : "Added to"} the lot, the ${Math.round(d * 100)}% bundle discount gives away about ${money(Math.max(1, Math.round(p * d)))} on this card.`);
  }
  const st = sellThrough("single", p), sl = sellThrough("lot", 0);
  if(st.n >= 3){ if(st.rate >= .6) score += 1; else if(st.rate <= .35) score -= 1; why.push(`Your singles asked ${money(st.band[0])} to ${st.band[1] > 1e8 ? "up" : money(st.band[1])}: ${st.s} of ${st.n} sold.`); }
  if(sl.n >= 3 && st.n >= 3 && sl.rate > st.rate + .2){ score -= 1; why.push(`Your lots sell through better: ${sl.s} of ${sl.n} sold.`); }
  if(!soldAlone.length && !flop.length && !ev.length && st.n < 3) why.push("No sales history or comps for this card yet, so this is based on its value and the rest of the lot. Run Double-check prices on the Sale tab for recent sales.");
  const rec = !lot || score > 0 ? "single" : "anchor";
  return {rec, strong:Math.abs(score) >= 2, why, withIt, without, others:others.length, lot};
}
function findCard(id){
  for(const c of S.cards){ if(c.id === id) return {c}; if(c.isLot){ const m = (c.members || []).find(x => x.id === id); if(m) return {c:m, lot:c}; } }
  return null;
}
function relot(lot){
  const sum = lot.members.reduce((a, c) => a + (priceOf(c) || 0), 0), unpriced = lot.members.some(c => priceOf(c) == null);
  if(!lot.fixed) lot.price = sum && !unpriced ? roundP(sum * (1 - Number(S.settings.lotDiscount ?? 10) / 100)) : null;
  lot.player = lot.player.replace(/\(\d+ cards\)$/, "(" + lot.members.length + " cards)");
}
function setAside(id, choice){
  const f = findCard(id); if(!f) return;
  f.c.pin = choice;
  if(choice !== "single") return;
  if(!f.lot){ f.c.section = "Singles"; ensureSection("Singles"); return; }
  const lot = f.lot;
  lot.members = lot.members.filter(m => m !== f.c);
  let sec = "";
  if(S.plan){
    const firstSingle = S.cards.find(x => x.status === "open" && !x.isLot && x.section);
    sec = firstSingle ? firstSingle.section : "Singles";
    if(!S.plan.sections.includes(sec)) S.plan.sections.unshift(sec);
  }
  if(!sec){ sec = "Singles"; ensureSection(sec); }
  f.c.section = sec;
  if(lot.members.length < 2){ lot.members.forEach(m => { m.section = lot.section; }); S.cards.splice(S.cards.indexOf(lot), 1, ...lot.members); }
  else relot(lot);
  let at = -1; S.cards.forEach((x, k) => { if(!x.isLot && x.section === sec && x.status === "open") at = k; });
  S.cards.splice(at + 1, 0, f.c);
}
function singlesPanel(){
  if(!S.cards.some(c => c.status === "open")) return "";
  const cs = singleCandidates(), min = singleMin();
  return `<div class="panel pick"><div class="row" style="justify-content:space-between"><h2>Single or lot anchor?${cs.length ? ` <span class="note">${cs.length} to decide</span>` : ""}</h2>
    <label class="inline">Suggest at $<input class="money" id="set-singleMin" inputmode="decimal" value="${esc(S.settings.singleMin ?? 20)}" style="width:64px"> and up</label></div>
    ${cs.length ? `<p class="note">A big card can sell well alone, or it can anchor a lot and make the whole thing move. Each one has both options priced out and a recommendation from your past sales, sub prices and comps. You decide.</p>
    <ul class="cards">${cs.map(x => { const c = x.c, a = pullAdvice(x), lot = a.lot, solo = a.rec === "single";
      const lotName = lot ? lot.player.replace(/\s*\(\d+ cards?\)$/, "") : "";
      return `<li data-sid="${c.id}"><div><div class="ttl">${esc(title(c))} <span class="chip ok">${money(priceOf(c))}</span></div><div class="meta">${esc([c.grade, x.lot ? "now in " + x.lot.player : x.target ? "on its own; could anchor " + lotName : c.where].filter(Boolean).join(" · "))}</div>
        <div class="meta"><strong>Recommended: ${solo ? "sell it alone" : "keep it as the lot's anchor"}</strong>${a.strong ? "" : " (a close call)"}</div>
        ${a.why.length ? `<ul class="chg meta">${a.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</div>
      <div class="nums"><button class="${solo ? "primary" : "small"}" data-act="single">Sell alone at ${money(priceOf(c))}${x.lot ? a.without != null ? `, lot becomes ${money(a.without)}` : ", the rest go loose" : ""}</button>
        ${x.lot ? `<button class="${solo ? "small" : "primary"}" data-act="keeplot">Keep as anchor, lot ${money(a.withIt)}</button>` : x.target ? `<button class="${solo ? "small" : "primary"}" data-act="anchorIn">Add to ${esc(lotName)} as its anchor, lot ${money(a.withIt)}</button>` : ""}</div></li>`; }).join("")}</ul>
    ${cs.length > 1 ? `<div class="row"><button data-act="singleAll">Follow all ${cs.length} recommendations</button></div>` : ""}`
    : `<p class="note">No undecided cards at $${min} or more right now.</p>`}
  </div>`;
}
function anchorInto(c, lot){
  const i = S.cards.indexOf(c); if(i < 0) return;
  S.cards.splice(i, 1); detach(c); c.pin = "lot"; c.section = lot.section;
  lot.members.unshift(c); describeLot(lot); relot(lot);
  ui.cmdMsg = `${title(c)} now anchors ${lot.player}, which asks ${money(priceOf(lot))}.`;
}

/* ---------- history: finished sales are kept, and past results feed the suggestions ---------- */
const hkey = x => [x.year, x.set, x.player].map(v => String(v ?? "").trim().toLowerCase()).join("|");
const dshort = t => t ? new Date(t).toLocaleDateString([], {month:"short", day:"numeric", year:"numeric"}) : "";
function historyFor(c){
  const out = {mine:[], unsold:[], sub:[]};
  if(c.isLot || !c.player || !c.year) return out;
  const k = hkey(c);
  S.solds.forEach(s => { if(s.cardId !== c.id && hkey(s) === k) out.mine.push({price:s.price, date:s.date, grade:s.grade}); });
  (S.sales || []).forEach(sale => sale.items.forEach(i => { if(i.kind !== "lot" && i.sold == null && i.ask != null && hkey(i) === k) out.unsold.push({price:i.ask, date:sale.date, grade:i.g}); }));
  (S.subComps || []).forEach(s => { if(hkey(s) === k) out.sub.push(s); });
  for(const n in out) out[n].sort((a, b) => (b.date || 0) - (a.date || 0));
  return out;
}
function histWhy(c){
  const h = historyFor(c), out = [], g = x => x.grade ? " (" + x.grade + ")" : "";
  if(h.mine.length) out.push(["Your past sales", h.mine.slice(0, 5).map(x => `${money(x.price)} on ${dshort(x.date)}${g(x)}`).join("; ") + "."]);
  if(h.unsold.length) out.push(["Did not sell", h.unsold.slice(0, 5).map(x => `at ${money(x.price)} on ${dshort(x.date)}`).join("; ") + ". Consider a lower ask, a price page or a lot."]);
  if(h.sub.length) out.push(["Seen on the sub", h.sub.slice(0, 5).map(x => `${x.sold ? "sold" : "listed"} ${money(x.price)}${g(x)}, noted ${dshort(x.date)}`).join("; ") + ". From threads you pasted in."]);
  return out;
}
function histLine(c){
  if(c.status !== "open" || c.isLot) return "";
  const h = historyFor(c), bits = [], g = x => x.grade ? " (" + esc(x.grade) + ")" : "";
  if(h.mine[0]) bits.push(`You sold one for ${money(h.mine[0].price)} on ${dshort(h.mine[0].date)}${g(h.mine[0])}${h.mine.length > 1 ? ", and " + (h.mine.length - 1) + " more" : ""}. <button class="small" data-act="useHist" data-v="${h.mine[0].price}">Ask ${money(h.mine[0].price)}</button>`);
  if(h.unsold[0]) bits.push(`Did not sell at ${money(h.unsold[0].price)} on ${dshort(h.unsold[0].date)}.`);
  const ss = h.sub.filter(s => s.sold);
  if(ss[0]) bits.push(`On the sub: sold ${money(ss[0].price)}${g(ss[0])}${ss.length > 1 ? ", and " + (ss.length - 1) + " more" : ""}.`);
  else if(h.sub[0]) bits.push(`On the sub: listed at ${money(h.sub[0].price)}${g(h.sub[0])}.`);
  return bits.length ? `<div class="val hist">${bits.join(" ")}</div>` : "";
}
function insights(){
  const out = [], by = {single:[0, 0], page:[0, 0], lot:[0, 0]}, bands = [["under $10", 0, 10], ["$10 to $25", 10, 25], ["$25 to $75", 25, 75], ["$75 and up", 75, 1e9]].map(b => [...b, 0, 0]);
  let under = 0, n = 0;
  (S.sales || []).forEach(s => s.items.forEach(i => {
    const b = by[i.kind] || by.single; b[0]++; if(i.sold != null) b[1]++;
    if(i.kind === "single" && i.ask != null){ const band = bands.find(x => i.ask >= x[1] && i.ask < x[2]); if(band){ band[3]++; if(i.sold != null) band[4]++; } }
    if(i.sold != null && i.ask){ n++; under += (i.ask - i.sold) / i.ask; }
  }));
  const lab = {single:"Singles", page:"Price-page cards", lot:"Lots"}, pct = (a, b) => Math.round(a / b * 100) + "%";
  for(const k in by) if(by[k][0] >= 3) out.push(`${lab[k]}: ${by[k][1]} of ${by[k][0]} sold (${pct(by[k][1], by[k][0])})`);
  bands.forEach(b => { if(b[3] >= 3) out.push(`Singles asked ${b[0]}: ${b[4]} of ${b[3]} sold (${pct(b[4], b[3])})`); });
  if(n >= 3 && Math.abs(under / n) >= .03) out.push(`Sold items went for ${Math.round(Math.abs(under / n) * 100)}% ${under > 0 ? "under" : "over"} ask on average`);
  return out;
}
function closeSale(){
  const rows = S.cards.filter(c => !c.example);
  if(!rows.length) return "There is nothing in the current sale to close out.";
  const waiting = shipOrders().filter(x => !x.o.shippedAt).length;
  if(waiting) return `${waiting} paid order${waiting === 1 ? " has" : "s have"} not been marked shipped. Finish those on the Ship tab first, so they are not lost.`;
  const kind = c => c.isLot ? "lot" : c.pin === "page" ? "page" : "single";
  const items = rows.map(c => ({t:title(c), year:c.year, set:c.set, num:c.num, player:c.player, g:c.grade || "", f:c.flaws || "", kind:kind(c), n:c.isLot ? c.members.length : 1, section:c.section || "", ask:priceOf(c), sold:c.status === "sold" ? c.soldPrice ?? null : null, soldAt:c.soldAt || null}));
  const sale = {id:uid(), date:Date.now(), name:(S.settings.title || "").trim() || "Sale of " + new Date().toLocaleDateString([], {month:"long", day:"numeric"}), plan:S.plan ? S.plan.text : "", items};
  S.sales = [sale, ...(S.sales || [])];
  S.cards = S.cards.filter(c => c.status !== "sold" && !c.example);
  S.cards.forEach(c => { c.status = "open"; c.claimBy = ""; c.claimAt = null; c.backups = []; c.relist = (c.relist || 0) + 1; });
  S.orders = {}; S.settings.title = ""; S.postedAt = null;
  saleSaved(sale);
  const sold = items.filter(i => i.sold != null).length;
  return `Saved. ${sold} of ${items.length} sold. ${S.cards.length} unsold item${S.cards.length === 1 ? " stays" : "s stay"} in your inventory for next time.`;
}
async function learnThread(){
  const text = (($("#subtext") || {}).value || "").trim().slice(0, 60000); if(!text) return;
  if(!cap.ai){ ui.learnMsg = aiOff(); return render(); }
  ui.busy = "Reading the thread"; render();
  try{
    const r = (await ai("extract", {text})) || {};
    const items = (r.items || []).filter(i => i && i.player && Number(i.price) > 0).map(i => ({year:i.year ?? "", set:i.set ?? "", num:i.num ?? "", player:String(i.player), grade:String(i.grade || ""), price:Number(i.price), sold:!!i.sold, date:Date.now()}));
    S.subComps = [...items, ...(S.subComps || [])].slice(0, 4000);
    ui.learnMsg = items.length ? `Added ${items.length} price${items.length === 1 ? "" : "s"}, ${items.filter(i => i.sold).length} marked sold.` : "No priced cards were found in that text.";
    if(items.length) save();
  }catch(e){ ui.learnMsg = "Could not read that: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function historyPanels(){
  const sales = S.sales || [], subs = S.subComps || [], ins = insights();
  const hit = r => !ui.q || [r.year, r.set, r.player, r.grade].join(" ").toLowerCase().includes(ui.q.toLowerCase());
  return `<div class="panel"><h2>Finished sales</h2>
    <p class="note">Close out a sale when it is done. It is kept as a record, sold cards leave your inventory and unsold ones stay for next time. Past results then appear as notes on matching cards and steer the next plan.</p>
    <div class="row"><button class="primary" data-act="closeSale">Close out the current sale</button>${(S.sales || []).length ? `<button class="small danger" data-act="clearOpen" data-k="history">Clear history</button>` : ""}<span class="note">${esc(ui.histMsg || "")}</span></div>
    ${ins.length ? `<h3>What your sales show</h3><p>${ins.map(esc).join(" · ")}</p>` : ""}
    ${sales.map(s => { const sold = s.items.filter(i => i.sold != null); return `<details class="edit"><summary>${esc(dshort(s.date))} · ${esc(s.name)} · ${sold.length} of ${s.items.length} sold · ${money(sold.reduce((a, i) => a + i.sold, 0)) || "$0"}</summary>
      <div class="scroll"><table><thead><tr><th>Item</th><th>Sold as</th><th class="num">Ask</th><th class="num">Sold</th></tr></thead><tbody>${s.items.map(i => `<tr><td>${esc(i.t)}</td><td>${esc(i.section || i.kind)}</td><td class="num">${money(i.ask)}</td><td class="num">${i.sold != null ? money(i.sold) : "unsold"}</td></tr>`).join("")}</tbody></table></div><div class="row" style="padding-top:8px"><button class="small danger" data-act="delSale" data-sid="${s.id}">Delete this record</button></div></details>`; }).join("") || `<p class="note">No finished sales yet.</p>`}
  </div>
  <div class="panel"><h2>Sub sales you have read</h2>
    <p class="note">Paste the text of any sale thread from the sub, price list and comments included. The tool pulls out each card, its price and whether it sold, and shows them as reference notes on your matching cards. They stay private to you and usernames are not kept.</p>
    <textarea id="subtext" placeholder="Paste a sale post and its comments here"></textarea>
    <div class="row"><button class="primary" data-act="learn" ${ui.busy ? "disabled" : ""}>Add to my reference</button><span class="${ui.busy ? "progress busy" : "note"}">${esc(ui.busy || ui.learnMsg || "")}</span></div>
    ${subs.length ? `<p class="note">${subs.length} prices collected, ${subs.filter(s => s.sold).length} marked sold. The search box below filters this list too. <button class="small danger" data-act="clearSubs">Clear them all</button></p>
      <div class="scroll"><table><thead><tr><th>Card</th><th>Grade</th><th class="num">Price</th><th>Result</th></tr></thead><tbody>${subs.filter(hit).slice(0, 150).map(r => `<tr><td>${esc(title(r))}</td><td>${esc(r.grade)}</td><td class="num">${money(r.price)}</td><td>${r.sold ? "sold" : "listed"}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </div>`;
}
const tm = t => new Date(t).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
function stat(){ const el = $("#savestat"); if(el) el.textContent = [ui.localErr || (ui.localAt ? "Saved on this device " + tm(ui.localAt) : ""), ui.cloudMsg || ""].filter(Boolean).join(" · "); }

/* ---------- sale plan: the seller describes the sale, the tool shapes singles, lots, title and photo list around it ---------- */
const PRESETS = [
  "A page or two of singles first, best cards up top. Everything else in lots, mostly by year.",
  "Best cards as singles. $10 and $5 per card pages for the middle. Year lots for the rest.",
  "All singles, highest price first.",
  "Stars and Hall of Famers as singles. Commons bundled into lots by set and year.",
  "Team lots where I have five or more of a team. Singles for the rest."
];
function unlotAll(){
  const out = [];
  for(const c of S.cards){ if(c.isLot && c.status === "open" && !c.manual && Array.isArray(c.members)) out.push(...c.members); else out.push(c); }
  S.cards = out;
}
function applyPlan(r, text){
  const open = new Map(S.cards.filter(c => c.status === "open" && !c.manual).map(c => [c.id, c]));
  const rest = S.cards.filter(c => c.status !== "open" || c.manual), out = [], names = [], pinned = [];
  const bundle = 1 - Number(S.settings.lotDiscount ?? 10) / 100;
  for(const sec of (r.sections || [])){
    const name = String(sec.name || "Cards"); names.push(name);
    for(const id of (sec.rows || [])){ const c = open.get(id); if(c){ open.delete(id); c.section = name; if(sec.perCard > 0){ c.prevPrice = c.price ?? null; c.price = Number(sec.perCard); c.pin = "page"; } out.push(c); } }
    for(const lot of (sec.lots || [])){
      const members = (lot.rows || []).map(id => { const c = open.get(id); if(c) open.delete(id); return c; }).filter(Boolean);
      const pulled = members.filter(c => c.pin === "single");
      if(pulled.length){ pinned.push(...pulled); pulled.forEach(c => members.splice(members.indexOf(c), 1)); }
      if(!members.length) continue;
      if(members.length === 1){ members[0].section = name; out.push(members[0]); continue; }
      const sum = members.reduce((a, c) => a + (priceOf(c) || 0), 0), unpriced = members.some(c => priceOf(c) == null);
      out.push({id:uid(), status:"open", isLot:true, members, section:name, year:"", set:"", num:"", player:String(lot.name || "Lot") + " (" + members.length + " cards)", grade:String(lot.condition || ""), flaws:lot.highlights ? "includes " + lot.highlights : "", why:String(lot.why || ""), conf:1, comp:null, price: sum && !unpriced ? roundP(sum * bundle) : null});
    }
  }
  if(pinned.length){
    const sec = names.find(n => out.some(c => !c.isLot && c.section === n)) || "Singles";
    if(!names.includes(sec)) names.unshift(sec);
    pinned.forEach(c => { c.section = sec; out.push(c); });
  }
  if(open.size){ names.push("Other"); for(const c of open.values()){ c.section = "Other"; out.push(c); } }
  S.cards = [...out, ...rest];
  S.plan = {text, sections:names.filter((n, i) => names.indexOf(n) === i), photos:(r.photos || []).map(String), gaps:(r.gaps || []).map(String)};
  rest.forEach(c => { if(c.manual && c.section) ensureSection(c.section); });
  if(r.title) S.settings.title = String(r.title);
  if(r.intro) S.settings.intro = String(r.intro);
  S.settings.sort = "added";
}
async function runPlan(){
  const text = (($("#plantext") || {}).value || "").trim();
  if(!text){ ui.planMsg = "Describe the sale first, or tap a starting point above."; return render(); }
  if(!cap.ai){ ui.planMsg = aiOff(); return render(); }
  ui.planDraft = text; ui.busy = ui.planMsg = "Sorting your cards into the plan"; render();
  try{
    unlotAll(); resetPages();
    const rows = S.cards.filter(c => c.status === "open" && !c.manual).map(c => ({id:c.id, card:title(c), grade:c.grade || "", price:priceOf(c), pin:c.pin || null}));
    const r = await ai("plan", {text, rows, history: insights()});
    applyPlan(r || {}, text);
    const lots = S.cards.filter(c => c.isLot).length;
    ui.planMsg = `Done: ${S.plan.sections.length} section${S.plan.sections.length === 1 ? "" : "s"}, ${lots} lot${lots === 1 ? "" : "s"}. Check the lots and prices below, then open the Post tab.`;
    save();
  }catch(e){ ui.planMsg = "Could not build the plan: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function planPanel(){
  const p = S.plan, n = S.cards.filter(c => c.status === "open").length;
  return `<div class="panel"><h2>Plan the sale</h2>
    <p class="note">Say how you want to run it, in your own words. The tool sorts every open card into singles and lots to match, prices the lots, writes the title and opening lines, and lists the photos to take. Scan your cards first.</p>
    <div class="row">${PRESETS.map((t, i) => `<button class="small" data-act="preset" data-i="${i}">${esc(t.split(".")[0])}</button>`).join("")}</div>
    <textarea id="plantext" style="min-height:84px;font-family:var(--body)" placeholder="A page or two of singles, then everything else in lots, mostly by year but maybe some other groupings.">${esc(ui.planDraft ?? (p ? p.text : ""))}</textarea>
    <div class="row"><button class="primary" data-act="plan" ${ui.busy || n < 2 ? "disabled" : ""}>${p ? "Rebuild the sale" : "Build the sale"}</button>
      <label class="inline">Lots priced <input class="money" id="set-lotDiscount" type="number" min="0" max="60" value="${esc(S.settings.lotDiscount ?? 10)}" style="width:60px">% under the cards' total</label>
      ${p ? `<button class="small" data-act="unplan">Undo plan</button>` : ""}</div>
    ${ui.planMsg ? `<p class="${ui.busy ? "progress busy" : "note"}">${esc(ui.planMsg)}</p>` : ""}
    ${insights().length ? `<h3>From your past sales</h3><p class="note">${insights().map(esc).join(" · ")}</p>` : ""}
    ${p ? `<h3>Sections</h3><p>${p.sections.map(s => esc(s) + " (" + S.cards.filter(c => c.section === s).length + ")").join(" · ")}</p>
      ${p.photos.length ? `<h3>Photos to take</h3><ol style="margin:0;padding-left:20px">${p.photos.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      ${p.gaps.length ? `<p class="flag">${p.gaps.map(esc).join(" ")}</p>` : ""}` : ""}
  </div>`;
}

/* ---------- claim assistant: drafts the public reply and the DM, the seller sends them ---------- */
function dmText(user, cards){
  const st = S.settings, sub = cards.reduce((a, c) => a + (priceOf(c) || 0), 0), ship = Number(st.shipFee) || 0;
  return `Hi u/${user}, thanks for the claim. Here is your total:\n\n${cards.map(c => `- ${title(c)}: ${money(priceOf(c)) || "price to confirm"}`).join("\n")}\n\nShipping: ${money(ship) || "$0"}\nTotal: ${money(sub + ship)}\n\nPayPal Goods & Services to: ${st.paypal || "[add your PayPal address above]"}\nPlease put your shipping address in the PayPal note. I will mark these sold in the thread once payment arrives, then send tracking.`;
}
function claimDrafts(){
  const st = S.settings, m = new Map();
  S.cards.filter(c => c.status === "claimed" && c.claimBy).forEach(c => { if(!m.has(c.claimBy)) m.set(c.claimBy, []); m.get(c.claimBy).push(c); });
  const backups = S.cards.filter(c => c.status !== "open" && (c.backups || []).length).map(c => c.backups.map(u => `u/${u}, ${c.status === "sold" ? "that one has sold" : "u/" + c.claimBy + " has first claim"} on the ${title(c)}. ${c.status === "sold" ? "Sorry about that." : "You are next in line if it falls through."}`).join("\n")).join("\n");
  const groups = [...m].map(([user, cards], i) => {
    const dm = dmText(user, cards), total = cards.reduce((a, c) => a + (priceOf(c) || 0), 0) + (Number(st.shipFee) || 0);
    const reply = `Yours, u/${user}${cards.length > 1 ? " (" + cards.map(title).join("; ") + ")" : ""}. Sending a DM now.`;
    const href = `https://www.reddit.com/message/compose/?to=${encodeURIComponent(user)}&subject=${encodeURIComponent("Your claim: " + title(cards[0]) + (cards.length > 1 ? " and " + (cards.length - 1) + " more" : ""))}&message=${encodeURIComponent(dm)}`;
    return `<div class="sig" style="grid-template-columns:minmax(0,1fr)">
      <div class="ttl">u/${esc(user)} <span class="note">${cards.length} lot${cards.length === 1 ? "" : "s"}, ${money(total)} with shipping</span></div>
      <h3>Reply in the thread</h3><textarea id="rp-${i}" style="min-height:48px">${esc(reply)}</textarea>
      <h3>Direct message</h3><textarea id="dm-${i}" style="min-height:190px">${esc(dm)}</textarea>
      <div class="row"><button class="small" data-copy="rp-${i}">Copy reply</button><button class="small" data-copy="dm-${i}">Copy DM</button><button class="small" data-act="paid" data-o="${esc(user)}">Mark paid</button><a class="btn small" target="_blank" rel="noopener" href="${esc(href)}">Open a prefilled Reddit message</a></div></div>`;
  }).join("");
  return `<div class="panel"><h2>Replies and DMs</h2>
    <p class="note">One draft per buyer, with their lots added up. Nothing is sent for you: copy it, or open the prefilled Reddit message and press send. When the payment lands, press Mark paid and the order moves to the Ship tab.</p>
    <div class="row">
      <label class="grow">Your PayPal address or PayPal.me link<input id="set-paypal" value="${esc(st.paypal)}" placeholder="name@example.com"></label>
      <label>Shipping per order<input class="money" id="set-shipFee" inputmode="decimal" value="${esc(st.shipFee)}"></label>
    </div>
    ${groups || `<p class="note">No claimed lots yet. Match claims above, or type a buyer on a row.</p>`}
    ${backups ? `<h3>Replies to later claims</h3><textarea id="rp-backup" style="min-height:70px">${esc(backups)}</textarea><div class="row"><button class="small" data-copy="rp-backup">Copy</button></div>` : ""}
  </div>`;
}

/* ---------- grading test: predict blind on slabbed cards, score against the label ---------- */
const GRADE_METHOD = "v1: one front photo, label cropped out";
ui.pending = []; ui.hide = 22; ui.gradeMsg = "";
function gradeStats(rows){
  const n = rows.length; if(!n) return null;
  const err = rows.map(r => r.best - r.truth);
  return {n, mae: err.reduce((a, e) => a + Math.abs(e), 0) / n, bias: err.reduce((a, e) => a + e, 0) / n,
    within1: rows.filter(r => Math.abs(r.best - r.truth) <= 1).length / n, inRange: rows.filter(r => r.truth >= r.low && r.truth <= r.high).length / n};
}
async function cropTop(file, pct){
  const bmp = await createImageBitmap(file), cut = Math.round(bmp.height * pct / 100), h = bmp.height - cut, k = Math.min(1, 1568 / Math.max(bmp.width, h));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(h * k);
  cv.getContext("2d").drawImage(bmp, 0, cut, bmp.width, h, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, "image/jpeg", .9));
}
async function runGrades(){
  const todo = ui.pending.filter(p => p.truth != null);
  if(!todo.length){ ui.gradeMsg = "Enter the label grade for at least one photo first."; return render(); }
  if(!cap.ai){ ui.gradeMsg = aiOff(); return render(); }
  let done = 0, failed = 0;
  for(const p of todo){
    ui.busy = `Grading ${done + failed + 1} of ${todo.length} blind`; render();
    try{
      const img = await cropTop(p.file, ui.hide);
      const r = await ai("grade", {}, [img]);
      const best = numOrNull(r.best); if(best == null) throw new Error("no grade returned");
      S.grades = [{id:uid(), name:p.name, truth:p.truth, best, low:numOrNull(r.low) ?? best, high:numOrNull(r.high) ?? best, centering:r.centering || "", reasons:r.reasons || "", method:GRADE_METHOD, date:Date.now()}, ...(S.grades || [])];
      ui.pending = ui.pending.filter(x => x !== p); done++;
    }catch(e){ failed++; if(e && (e.code === "unauthorized" || e.code === "rate_limited")){ ui.gradeMsg = e.code === "rate_limited" ? "Rate limit reached. Wait a minute, then run the rest." : "Sign in to run the grading test."; break; } }
  }
  if(done || failed) ui.gradeMsg = (ui.gradeMsg ? ui.gradeMsg + " " : "") + `${done} graded${failed ? ", " + failed + " failed and stay in the queue" : ""}.`;
  ui.busy = ""; save(); render();
}
function vGrade(){
  const rows = S.grades || [], s = gradeStats(rows), pct = x => Math.round(x * 100) + "%";
  return `<section class="view">
  <div class="panel"><h2>Test the grader against real slabs</h2>
    <p class="note">Photograph the front of a graded card, type the grade on its label, and the tool predicts the grade without seeing the label. Every run is scored, so changes to the method can be judged by numbers and not by feel. Shoot straight on, fill the frame, no glare.</p>
    <div class="row">
      <input type="file" id="gfile" accept="image/*" multiple hidden>
      <button class="primary" data-act="gpick" ${ui.busy ? "disabled" : ""}>Add slab photos</button>
      <label class="inline">Hide the top <input id="g-hide" type="number" min="0" max="50" value="${ui.hide}" style="width:64px">% of each photo (the label)</label>
    </div>
    ${ui.pending.length ? `<ul class="cards">${ui.pending.map(p => `<li><div class="ttl">${esc(p.name)}</div><div class="nums"><label>Grade on the label<input class="money" data-p="${p.id}" inputmode="decimal" value="${p.truth ?? ""}" placeholder="4"></label></div></li>`).join("")}</ul>
    <div class="row"><button class="primary" data-act="grun" ${ui.busy ? "disabled" : ""}>Run blind test</button><span class="${ui.busy ? "progress busy" : "note"}">${esc(ui.busy || ui.gradeMsg)}</span></div>` : `<p class="note">${esc(ui.gradeMsg || "No photos queued.")}</p>`}
  </div>
  <div class="panel"><div class="row" style="justify-content:space-between"><h2>Scoreboard</h2>${rows.length ? `<button class="small" data-act="gclear">Clear results</button>` : ""}</div>
    <p class="note">Method: ${esc(GRADE_METHOD)}.</p>
    ${s ? `<div class="scroll"><table><thead><tr><th class="num">Cards</th><th class="num">Avg miss</th><th class="num">Within 1 grade</th><th class="num">Label inside range</th><th class="num">Lean</th></tr></thead>
      <tbody><tr><td class="num">${s.n}</td><td class="num">${s.mae.toFixed(2)}</td><td class="num">${pct(s.within1)}</td><td class="num">${pct(s.inRange)}</td><td class="num">${s.bias > 0 ? "+" : ""}${s.bias.toFixed(2)}</td></tr></tbody></table></div>
      <p class="note">Avg miss is the mean gap in grades between prediction and label. Lean above zero means it grades too generously. Under about 30 cards these numbers are noise.</p>
      <div class="scroll"><table><thead><tr><th>Photo</th><th class="num">Label</th><th class="num">Predicted</th><th class="num">Range</th><th>Centering</th><th>Why</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.truth}</td><td class="num">${r.best}</td><td class="num">${r.low} to ${r.high}</td><td>${esc(r.centering)}</td><td>${esc(r.reasons)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="note">No runs yet. Results appear here once you test your first slab.</p>`}
  </div></section>`;
}

/* ---------- shipping: export paid orders for Pirate Ship, then draft the shipped and delivered messages ---------- */
const DAY = 86400000, KEEP_ADDR_DAYS = 60;
function purgeAddresses(){
  /* buyers' home addresses are wiped 60 days after an order ships */
  for(const o of Object.values(S.orders || {})) if(o.addr && o.shippedAt && Date.now() - o.shippedAt > KEEP_ADDR_DAYS * DAY) o.addr = "";
}
function parseAddr(text){
  let lines = String(text || "").split("\n").map(x => x.trim()).filter(Boolean);
  if(lines.length === 1) lines = lines[0].split(",").map(x => x.trim()).filter(Boolean).reduce((a, x, i, all) => { if(i >= all.length - 2 && a.length > 2) a[a.length - 1] += ", " + x; else a.push(x); return a; }, []);
  const m = lines.length >= 3 && lines[lines.length - 1].match(/^(.*?)[,\s]+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)$/);
  if(!m) return null;
  return {name: lines[0], a1: lines[1], a2: lines.slice(2, -1).join(" "), city: m[1].replace(/,$/, "").trim(), state: m[2].toUpperCase(), zip: m[3]};
}
function shipOrders(){
  S.orders = S.orders || {};
  const m = new Map();
  S.cards.filter(c => c.status === "sold" && c.claimBy).forEach(c => { if(!m.has(c.claimBy)) m.set(c.claimBy, []); m.get(c.claimBy).push(c); });
  return [...m].map(([user, cards]) => {
    const o = S.orders[user] || {}, total = cards.reduce((a, c) => a + (c.soldPrice ?? priceOf(c) ?? 0), 0);
    const pkg = o.pkg || (total < (Number(S.settings.pweMax) || 20) && cards.length <= 3 ? "pwe" : "mailer");
    const oz = o.oz || (pkg === "pwe" ? 1 : Math.max(3, Math.round(2 + cards.length * 0.5)));
    return {user, cards, o, total, pkg, oz, addr: parseAddr(o.addr)};
  });
}
const csvCell = v => /[",\n]/.test(String(v ?? "")) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? "");
function shipCsv(list){
  const head = ["Name","Company","Address 1","Address 2","City","State","Zip","Country","Order ID","Weight (oz)","Length","Width","Height","Description"];
  const rows = list.map(x => [x.addr.name, "", x.addr.a1, x.addr.a2, x.addr.city, x.addr.state, x.addr.zip, "US", "u/" + x.user, x.oz, x.pkg === "pwe" ? "" : 9, x.pkg === "pwe" ? "" : 6, x.pkg === "pwe" ? "" : 0.5, x.cards.length + " trading card" + (x.cards.length === 1 ? "" : "s")]);
  return [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}
function downloadText(name, text){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type: "text/csv"})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const compose = (user, subject, body) => `https://www.reddit.com/message/compose/?to=${encodeURIComponent(user)}&subject=${encodeURIComponent(subject)}&message=${encodeURIComponent(body)}`;
function vShip(){
  const list = shipOrders(), ready = list.filter(x => x.addr && !x.o.shippedAt);
  const noBuyer = S.cards.filter(c => c.status === "sold" && !c.claimBy).length;
  return `<section class="view">
  <div class="panel"><h2>Paid orders</h2>
    <p class="note">One order per buyer, built from the lots you marked paid. Paste the address from the PayPal note, export the batch, and buy the labels in Pirate Ship. Addresses are wiped ${KEEP_ADDR_DAYS} days after an order ships.</p>
    <div class="row">
      <label class="inline">Plain envelope for orders under $<input class="money" id="set-pweMax" inputmode="decimal" value="${esc(S.settings.pweMax ?? 20)}" style="width:64px"></label>
      <button class="primary" data-act="csv" ${ready.length ? "" : "disabled"}>Download ${ready.length || ""} order${ready.length === 1 ? "" : "s"} for Pirate Ship</button>
    </div>
    <p class="note">The file is a standard spreadsheet (name, address, weight, size). Pirate Ship asks you to match the columns the first time you import one.</p>
    ${noBuyer ? `<p class="flag">${noBuyer} sold lot${noBuyer === 1 ? " has" : "s have"} no buyer set, so ${noBuyer === 1 ? "it is" : "they are"} not in an order. Add the buyer on the Claims tab.</p>` : ""}
    ${list.length ? "" : `<p class="note">No paid orders yet. Mark a lot "Paid, sold" on the Claims tab and it appears here.</p>`}
  </div>
  ${list.map((x, i) => {
    const u = esc(x.user), items = x.cards.map(title).join("; ");
    const trackUrl = x.o.tracking ? "https://tools.usps.com/go/TrackConfirmAction?tLabels=" + encodeURIComponent(x.o.tracking) : "";
    const shipped = `Hi u/${x.user}, your cards shipped${x.o.tracking ? ". Tracking: " + x.o.tracking + "\n" + trackUrl : x.pkg === "pwe" ? " by plain envelope, so there is no tracking number." : "."}\n\nIn the package: ${items}\n\nLet me know when they land.`;
    const delivered = `Hi u/${x.user}, ${x.o.tracking ? "tracking shows your cards were delivered" : "your cards should have arrived by now"}. I hope they look great in hand. If everything is right, feedback on r/SportsCardTracker is appreciated, and I will leave yours too.`;
    return `<div class="panel">
      <div class="row" style="justify-content:space-between"><h2>u/${u} <span class="note">${x.cards.length} lot${x.cards.length === 1 ? "" : "s"}, ${money(x.total)}</span></h2>
        ${x.o.delivered ? `<span class="chip ok">delivered</span>` : x.o.shippedAt ? `<span class="chip ok">shipped ${new Date(x.o.shippedAt).toLocaleDateString([], {month:"short", day:"numeric"})}</span>` : `<span class="chip">to ship</span>`}</div>
      <p class="meta">${esc(items)}</p>
      <div class="two">
        <label>Ship to (paste from the PayPal note)<textarea data-o="${u}" data-of="addr" style="min-height:92px;font-family:var(--body)" placeholder="Name&#10;Street&#10;City, ST 12345">${esc(x.o.addr || "")}</textarea>
          ${x.o.addr && !x.addr ? `<span class="chip warn" style="align-self:flex-start">Could not read this. Use name, street, then city, state and ZIP on separate lines.</span>` : x.addr ? `<span class="note">${esc([x.addr.name, x.addr.a1, x.addr.a2, x.addr.city + ", " + x.addr.state + " " + x.addr.zip].filter(Boolean).join(" · "))}</span>` : ""}</label>
        <div class="row" style="align-items:flex-end">
          <label>Package<select data-o="${u}" data-of="pkg"><option value="pwe" ${x.pkg === "pwe" ? "selected" : ""}>Plain envelope</option><option value="mailer" ${x.pkg === "mailer" ? "selected" : ""}>Bubble mailer, tracked</option></select></label>
          <label>Weight, oz<input class="money" data-o="${u}" data-of="oz" inputmode="decimal" value="${x.oz}" style="width:64px"></label>
          <label class="grow">Tracking number<input data-o="${u}" data-of="tracking" value="${esc(x.o.tracking || "")}" placeholder="Paste after buying the label"></label>
          ${x.o.shippedAt ? "" : `<button class="small" data-act="shipped" data-o="${u}">Mark shipped</button>`}
          ${x.o.shippedAt && !x.o.delivered ? `<button class="small" data-act="delivered" data-o="${u}">Mark delivered</button>` : ""}
        </div>
      </div>
      ${x.o.shippedAt ? `<h3>${x.o.delivered ? "Delivered message" : "Shipped message"}</h3><textarea id="sm-${i}" style="min-height:110px;font-family:var(--body)">${esc(x.o.delivered ? delivered : shipped)}</textarea>
      <div class="row"><button class="small" data-copy="sm-${i}">Copy</button><a class="btn small" target="_blank" rel="noopener" href="${esc(compose(x.user, x.o.delivered ? "Your cards were delivered" : "Your cards shipped", x.o.delivered ? delivered : shipped))}">Open a prefilled Reddit message</a>${trackUrl ? `<a class="btn small" target="_blank" rel="noopener" href="${esc(trackUrl)}">Check USPS tracking</a>` : ""}</div>` : ""}
    </div>`; }).join("")}
  </section>`;
}

/* ---------- say it in words: a typed instruction becomes a set of edits, applied together and undoable ---------- */
ui.cmd = ""; ui.cmdMsg = ""; ui.undo = null;
function take(id){
  const f = findCard(id); if(!f) return [];
  if(f.c.isLot){ S.cards = S.cards.filter(x => x !== f.c); f.c.members.forEach(m => { detach(m); delete m.section; }); return f.c.members; }
  if(f.lot){
    const lot = f.lot; lot.members = lot.members.filter(m => m !== f.c);
    if(lot.members.length < 2){ lot.members.forEach(m => { detach(m); m.section = lot.section; }); S.cards.splice(S.cards.indexOf(lot), 1, ...lot.members); }
    else { if(lot.manual) describeLot(lot); relot(lot); }
  } else S.cards = S.cards.filter(x => x !== f.c);
  detach(f.c); delete f.c.section;
  return [f.c];
}
function applyOps(ops){
  let n = 0;
  const A = x => Array.isArray(x) ? x.map(String) : [];
  const isOpen = id => { const f = findCard(id); return f && (f.lot ? f.lot.status : f.c.status) === "open"; };
  for(const o of Array.isArray(ops) ? ops : []){
    const all = A(o.ids), ids = all.filter(isOpen);
    if(o.op === "lot"){
      const cards = ids.flatMap(take);
      if(cards.length < 2){ S.cards.push(...cards); continue; }
      const sec = String(o.section || "Lots");
      cards.forEach(c => { c.pin = "lot"; c.section = sec; });
      const lot = {id:uid(), status:"open", isLot:true, manual:true, members:cards, section:sec, year:"", set:"", num:"", player:String(o.name || "Lot") + " (" + cards.length + " cards)", grade:"", flaws:"", why:"You asked for this group.", conf:1, comp:null, price:null};
      describeLot(lot);
      if(Number(o.price) > 0){ lot.price = Number(o.price); lot.fixed = true; } else relot(lot);
      S.cards.push(lot); ensureSection(sec); n++;
    } else if(o.op === "single"){
      const cards = ids.flatMap(take);
      cards.forEach(c => { c.pin = "single"; c.manual = true; c.section = "Singles"; });
      S.cards.push(...cards); if(cards.length){ ensureSection("Singles"); n++; }
    } else if(o.op === "page" && Number(o.perCard) > 0){
      const cards = ids.flatMap(take), name = "$" + Number(o.perCard) + " per card";
      cards.forEach(c => { c.prevPrice = c.price ?? null; c.price = Number(o.perCard); c.pin = "page"; c.manual = true; c.section = name; });
      S.cards.push(...cards); if(cards.length){ ensureSection(name); n++; }
    } else if(o.op === "price" || o.op === "adjust"){
      for(const id of ids){
        const f = findCard(id); if(!f) continue;
        const cur = priceOf(f.c), v = o.op === "price" ? Number(o.price) : cur != null ? roundP(cur * (1 + Number(o.pct) / 100)) : null;
        if(!(v > 0)) continue;
        f.c.price = v; if(f.c.isLot) f.c.fixed = true; if(f.lot) relot(f.lot); n++;
      }
    } else if(o.op === "edit"){
      const f = findCard(String(o.id)); if(!f || !o.fields) continue;
      for(const k of ["year","set","num","player","variation","grade","flaws"]) if(o.fields[k] != null) f.c[k] = o.fields[k];
      delete f.c.example; if(f.lot && f.lot.manual) describeLot(f.lot); n++;
    } else if(o.op === "remove"){
      ids.forEach(id => { if(take(id).length) n++; });
    } else if(o.op === "breakLot"){
      ids.forEach(id => { const f = findCard(id); if(f && f.c.isLot){ const i = S.cards.indexOf(f.c); f.c.members.forEach(m => { detach(m); delete m.section; }); S.cards.splice(i, 1, ...f.c.members); n++; } });
    } else if(o.op === "section" && o.name){
      const name = String(o.name);
      ids.forEach(id => { const f = findCard(id); if(f && !f.lot){ f.c.section = name; f.c.manual = true; n++; } });
      ensureSection(name);
    } else if(o.op === "sectionOrder"){
      const names = A(o.names); S.plan = S.plan || {text:"", sections:[], photos:[], gaps:[]};
      const cur = S.plan.sections; S.plan.sections = [...names.filter(x => cur.includes(x)), ...cur.filter(x => !names.includes(x))]; n++;
    } else if(o.op === "status" && ["open","claimed","sold"].includes(o.status)){
      all.forEach(id => {
        const f = findCard(id); if(!f || f.lot) return; const c = f.c;
        c.status = o.status;
        if(o.status === "open"){ c.claimBy = ""; c.claimAt = null; }
        else { if(o.buyer) c.claimBy = String(o.buyer).replace(/^u\//, ""); c.claimAt = c.claimAt || Date.now(); }
        S.solds = S.solds.filter(s => s.cardId !== c.id);
        if(o.status === "sold"){
          c.soldPrice = Number(o.soldPrice) > 0 ? Number(o.soldPrice) : c.soldPrice ?? priceOf(c); c.soldAt = Date.now();
          if(c.soldPrice != null && !c.example) S.solds.unshift({cardId:c.id, year:c.year, set:c.set, num:c.num, player:c.player, variation:c.variation, grade:c.grade, price:c.soldPrice, date:c.soldAt});
        }
        n++;
      });
    } else if(o.op === "skipStep"){
      skipNext(); n++;
    } else if(o.op === "settings" && o.fields){
      const f = o.fields, st = S.settings;
      for(const k of ["discount","lotDiscount","singleMin","shipFee","pweMax"]) if(f[k] != null && !isNaN(Number(f[k]))) st[k] = Number(f[k]);
      for(const k of ["pay","ship","title","intro","condNote","paypal"]) if(typeof f[k] === "string") st[k] = f[k];
      for(const k of ["showComps","callout"]) if(typeof f[k] === "boolean") st[k] = f[k];
      if(SORTS[f.sort]) st.sort = f.sort;
      n++;
    }
  }
  return n;
}
async function runCmd(){
  const text = ui.cmd.trim(); if(!text) return;
  if(!cap.ai){ ui.cmdMsg = aiOff(); return render(); }
  ui.busy = ui.cmdMsg = "Working on it"; render();
  try{
    const rows = S.cards.map(c => ({id:c.id, card:title(c), grade:c.grade || "", flaws:c.isLot ? "" : c.flaws || "", ask:priceOf(c), section:c.section || "", status:c.status, buyer:c.claimBy || "", inside:c.isLot ? c.members.map(m => ({id:m.id, card:title(m), grade:m.grade || "", ask:priceOf(m)})) : undefined}));
    const st = S.settings, settings = {discount:st.discount, lotDiscount:st.lotDiscount ?? 10, singleMin:st.singleMin ?? 20, shipFee:st.shipFee, pay:st.pay, ship:st.ship, title:st.title, intro:st.intro, sections:(S.plan && S.plan.sections) || []};
    const r = (await ai("edit", {text, rows, settings, next:ui.nextText || ""})) || {};
    const before = JSON.stringify(S), n = applyOps(r.ops);
    if(n){ ui.undo = before; ui.cmd = ""; ui.sel.clear(); save(); }
    ui.cmdMsg = !n && Array.isArray(r.ops) && r.ops.length ? "Nothing in your inventory matched that, so nothing changed." : r.say ? String(r.say) : n ? "Done." : "Nothing changed.";
  }catch(e){ ui.cmdMsg = "That did not work: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function cmdBar(){
  return `<div class="panel cmd"><div class="row"><input id="cmd" class="grow" value="${esc(ui.cmd)}" placeholder="Tell it what to change, or push back on the next step" aria-label="Instruction" ${ui.busy ? "disabled" : ""}>
    <button class="primary" data-act="cmd" ${ui.busy ? "disabled" : ""}>Do it</button>${ui.undo ? `<button class="small" data-act="undo">Undo</button>` : ""}</div>
    ${ui.cmdMsg ? `<p class="${ui.busy ? "progress busy" : "note"}">${esc(ui.cmdMsg)}</p>` : ""}</div>`;
}

/* ---------- sale photos: headline, notes, number and price tags and a username stamp drawn onto the picture ---------- */
ui.photo = null;
function photoTargets(){
  const rows = ordered().filter(c => priceOf(c) != null || c.status !== "open"), num = c => rows.indexOf(c) + 1;
  const out = [{key:"", label:"Something else (type your own)", title:"", note:"", queue:[]}];
  for(const s of [...new Set(rows.map(c => c.section || ""))]){
    const list = rows.filter(c => (c.section || "") === s && c.status === "open"); if(!list.length) continue;
    const page = list.every(c => c.pin === "page"), name = s || "Cards for sale";
    out.push({key:"s:" + s, label:name + " (" + list.length + ")", title:page ? name.toUpperCase() : name, note:page ? list.length + " cards. Claim by name in the comments." : "", queue:page ? [] : list.map(c => c.isLot ? lotTagText(c, priceOf(c)) : c.tagText || money(priceOf(c)))});
    for(const c of list) if(c.isLot) out.push({key:"l:" + c.id, label:"Lot: " + c.player, title:c.player, note:lotTagText(c, priceOf(c)), queue:[]});
  }
  return out;
}
function setPhotoTarget(key){
  const ph = ui.photo, t = photoTargets().find(x => x.key === key) || photoTargets()[0];
  ph.key = t.key; ph.title = t.title; ph.note = t.note; ph.qi = 0; ph.tagText = null; ph.out = null;
}
const photoQueue = () => (photoTargets().find(x => x.key === ui.photo.key) || {queue:[]}).queue;
const nextTag = () => ui.photo.tagText ?? photoQueue()[ui.photo.qi] ?? "";
/* Photos and their labels are kept in the browser's own database on this device, so a refresh or an update does not lose them. */
function idb(op, arg){
  return new Promise(res => {
    try{
      const open = indexedDB.open("rst-photos", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("photos", {keyPath:"id"});
      open.onerror = () => res(null);
      open.onsuccess = () => {
        try{
          const db = open.result, tx = db.transaction("photos", op === "all" ? "readonly" : "readwrite"), st = tx.objectStore("photos");
          const rq = op === "all" ? st.getAll() : op === "put" ? st.put(arg) : st.delete(arg);
          tx.oncomplete = () => { res(op === "all" ? rq.result : true); db.close(); };
          tx.onerror = tx.onabort = () => { res(null); db.close(); };
        }catch(e){ res(null); }
      };
    }catch(e){ res(null); }
  });
}
function keepPhoto(){
  const ph = ui.photo; if(!ph || !ph.blob) return;
  clearTimeout(ui.photoT);
  ui.photoT = setTimeout(() => idb("put", photoRecord(ph)).then(ok => { if(ui.photoKept !== !!ok){ ui.photoKept = !!ok; if(location.hash === "#photos" && !ui.drag) render(); } }), 300);
}
async function loadPhotos(){
  const all = await idb("all");
  const mem = ui.photos || [], have = new Set(mem.map(x => x.id));
  ui.photos = [...mem, ...(all || []).filter(r => !have.has(r.id)).map(r => ({...r, tagText:null, out:null, msg:""}))].sort((a, b) => (a.ord ?? a.at) - (b.ord ?? b.at));
  ui.photoKept = all != null;
  if(location.hash === "#photos") render();
}
async function openPhoto(id){
  const ph = (ui.photos || []).find(x => x.id === id); if(!ph) return;
  try{ if(!ph.bmp) ph.bmp = await createImageBitmap(ph.blob); ui.photo = ph; }catch(e){ ui.photoErr = "That saved photo could not be opened."; }
  render();
}
const thumbUrl = x => ((ui.thumbs = ui.thumbs || {})[x.id] = ui.thumbs[x.id] || URL.createObjectURL(x.blob));
async function loadPhoto(file, quiet){
  try{
    const src = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(src.width, src.height)), w = Math.round(src.width * k), h = Math.round(src.height * k);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(src, 0, 0, w, h);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .9));
    ui.photo = {id:uid(), at:Date.now(), blob, bmp:await createImageBitmap(blob), w, h, scale:Number(S.settings.tagScale) || 1, color:S.settings.tagColor || "white", tags:[], key:"", title:"", note:"", qi:0, tagText:null, out:null, msg:""};
    setPhotoTarget(""); /* no headline by default: a band across the top would cover the handwritten note */
    ui.photo.ord = Date.now() + (ui.photos || []).length; ui.photos = [...(ui.photos || []), ui.photo]; ui.photoErr = "";
  }catch(e){ if(quiet) return null; ui.photo = null; ui.photoErr = "That file could not be opened as a photo."; }
  if(quiet) return ui.photo;
  render();
}
function fitText(g, text, x, y, maxW, px, weight){
  let size = px;
  do { g.font = `${weight} ${size}px Archivo, "Arial Narrow", Arial, sans-serif`; size *= .94; } while(g.measureText(text).width > maxW && size > px * .4);
  g.fillText(text, x, y);
}
function drawPhoto(cvArg, phArg){
  const ph = phArg || ui.photo, cv = cvArg || $("#pcanvas"); if(!ph || !cv) return;
  cv.width = ph.w; cv.height = ph.h;
  const g = cv.getContext("2d"), u = Math.max(ph.w, ph.h) / 100, pad = 1.6 * u;
  g.drawImage(ph.bmp, 0, 0, ph.w, ph.h); g.textBaseline = "top";
  if(ph.title || ph.note){
    const hT = ph.title ? 4.4 * u : 0, hN = ph.note ? 2.6 * u : 0, H = pad * 2 + hT + hN + (hT && hN ? .8 * u : 0);
    g.fillStyle = "rgba(10,18,15,.84)"; g.fillRect(0, 0, ph.w, H); g.fillStyle = "#fff";
    if(ph.title) fitText(g, ph.title, pad, pad, ph.w - 2 * pad, hT, 800);
    if(ph.note) fitText(g, ph.note, pad, pad + hT + (hT ? .8 * u : 0), ph.w - 2 * pad, hN, 500);
  }
  const stamp = [S.settings.handle ? "u/" + String(S.settings.handle).replace(/^u\//, "") : "", new Date().toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"})].filter(Boolean).join(" · ");
  g.font = `600 ${2.4 * u}px Archivo, "Arial Narrow", Arial, sans-serif`;
  const sw = g.measureText(stamp).width + 2 * u, sh = 4 * u;
  g.fillStyle = "rgba(10,18,15,.84)"; g.fillRect(ph.w - sw, ph.h - sh, sw, sh); g.fillStyle = "#fff"; g.fillText(stamp, ph.w - sw + u, ph.h - sh + .8 * u);
  for(const t of ph.tags){
    const s = (t.s || 3) * tagScale(ph), k = s / 3, col = TAG_COLORS[tagColor(ph)];
    g.font = `800 ${s * u}px Archivo, "Arial Narrow", Arial, sans-serif`;
    const w = g.measureText(t.text).width + 1.8 * u * k, h = 4.6 * u * k, x = Math.min(ph.w - w, Math.max(0, t.x * ph.w - w / 2)), y = Math.min(ph.h - h, Math.max(0, t.y * ph.h - h / 2));
    const on = !phArg && t.ref && (ph.selRefs || []).includes(t.ref);
    g.fillStyle = on ? "#dff3fb" : col[0]; g.strokeStyle = on ? "#0073a2" : col[2]; g.lineWidth = (on ? .7 : .35) * u * k;
    t.box = {x, y, w, h};
    const draft = !phArg && ph.applied === false;
    g.globalAlpha = draft && !on ? .62 : 1; g.setLineDash(draft ? [u * k, .6 * u * k] : []);
    g.beginPath(); g.roundRect(x, y, w, h, .8 * u * k); g.fill(); g.stroke();
    g.fillStyle = on ? "#0a120f" : col[1]; g.fillText(t.text, x + .9 * u * k, y + .9 * u * k);
    g.globalAlpha = 1; g.setLineDash([]);
  }
  if(!phArg) keepPhoto();
}
/* Drag a tag to move it. A press that starts on a tag never places a new one. */
function tagAt(pt){
  const ph = ui.photo, cv = $("#pcanvas"); if(!ph || !cv) return null;
  const r = cv.getBoundingClientRect(), k = ph.w / r.width, x = (pt.clientX - r.left) * k, y = (pt.clientY - r.top) * k, m = Math.max(ph.w, ph.h) / 100 * 1.5;
  for(let i = ph.tags.length - 1; i >= 0; i--){ const b = ph.tags[i].box; if(b && x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m) return ph.tags[i]; }
  return null;
}
document.addEventListener("pointerdown", e => {
  if(e.target.id !== "pcanvas") return;
  const t = tagAt(e); if(!t) return;
  if(ui.photoSelect){ if(t.ref){ const ph = ui.photo; ph.selRefs = ph.selRefs || []; const i = ph.selRefs.indexOf(t.ref); if(i < 0) ph.selRefs.push(t.ref); else ph.selRefs.splice(i, 1); ui.photoAsk = null; ui.photoText = null; } ui.skipTap = true; render(); return; }
  ui.drag = t; ui.skipTap = true;
  try{ e.target.setPointerCapture(e.pointerId); }catch(err){}
});
document.addEventListener("pointermove", e => {
  const t = ui.drag, cv = $("#pcanvas"); if(!t || !cv) return;
  const r = cv.getBoundingClientRect();
  t.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); t.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  ui.photo.out = null; drawPhoto();
});
const endDrag = () => { if(!ui.drag) return; ui.drag = null; setTimeout(() => { ui.skipTap = false; }, 350); };
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);
document.addEventListener("touchstart", e => { if(e.target.id === "pcanvas" && e.touches[0] && tagAt(e.touches[0])) e.preventDefault(); }, {passive:false});
function photoTap(e){
  if(ui.skipTap){ ui.skipTap = false; return; }
  if(ui.photoSelect) return;
  const ph = ui.photo, text = String(nextTag()).trim(); if(!ph) return;
  if(ph.cards && ph.cards.length && !ui.dopen.ptag) return;
  if(!text){ ph.msg = "Type what the tag should say first."; return render(); }
  const r = e.target.getBoundingClientRect();
  ph.tags.push({x:(e.clientX - r.left) / r.width, y:(e.clientY - r.top) / r.height, text});
  if(ph.tagText == null) ph.qi++; else ph.tagText = null;
  ph.out = null; ph.msg = ""; render();
}
async function savePhoto(){
  const ph = ui.photo, cv = $("#pcanvas"); if(!ph || !cv) return;
  const name = "sale-photo-" + (String(ph.title || "labeled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "labeled") + ".jpg";
  try{
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .92));
    const file = new File([blob], name, {type: "image/jpeg"});
    if(navigator.canShare && navigator.canShare({files: [file]})) await navigator.share({files: [file]});
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    ph.out = null; ph.msg = "Saved " + name + ".";
  }catch(e){ ph.out = cv.toDataURL("image/jpeg", .9); ph.msg = "It could not be saved as a file here. Press and hold the copy below and choose Save."; }
  render();
}
function vPhotos(){
  const ph = ui.photo, ts = photoTargets(), n = (ui.photos || []).length, have = S.cards.filter(c => !c.example && c.status !== "sold").length;
  const dk = (k, open) => `data-dk="${k}" ${(ui.dopen[k] ?? open) ? "open" : ""}`;
  return `<section class="view"><div class="panel"><h2>Label a sale photo</h2>
    <p class="note">${have ? "Take one picture or upload a batch. Tap Price every card. Cards already in your Review list get the asks you set there, and anything new gets an estimate you can check." : "Take the picture and tap Price every card. The tool finds each card, estimates an ask and adds it to Review, so a sale can start from a photo."} Then type any change, like "the bottom row is one lot at $40".</p>
    <div class="row"><input type="file" id="pfile" accept="image/*" multiple hidden><button class="${ph ? "small" : "primary"}" data-act="ppick">${n ? "Add more photos" : "Take or choose photos"}</button>${n ? `<button class="small danger" data-act="clearOpen" data-k="photos">Delete all photos</button>` : ""}
      ${ui.photoErr && !ph ? `<span class="note">${esc(ui.photoErr)}</span>` : ""}</div>
    ${n ? `${photoStrip()}
    ${n > 1 ? `<div class="row"><button class="small" data-act="pSaveAll" ${ui.busy ? "disabled" : ""}>Save all ${n} in order</button><button class="small" data-act="pSaveAllPlain" ${ui.busy ? "disabled" : ""}>Save all without labels</button></div>` : ""}
    <p class="note">${ui.photoKept === false ? "This browser would not store photos, so they last only until the page closes. Save each labeled photo before moving on." : "Photos and their labels are kept on this device until you delete them. They are not part of the account backup."}</p>` : ""}
    ${ph ? `
    <div class="row"><button class="${ph.cards ? "small" : "primary"}" data-act="pauto" ${ui.busy ? "disabled" : ""}>${ph.page ? (ph.cards ? "Price this page again" : `Price this page (${pagePhotos(ph).length} photos)`) : ph.cards ? "Price every card again" : "Price every card"}</button>${ph.page ? `<span class="chip">${esc(ph.page.name)} · photo ${pagePhotos(ph).indexOf(ph) + 1} of ${pagePhotos(ph).length}</span>` : ""}${ui.busy ? `<span class="progress busy">${esc(ui.busy)}</span>` : ""}</div>
    <canvas id="pcanvas" style="width:100%;height:auto;border-radius:6px;touch-action:manipulation" aria-label="Photo with price tags. Drag a tag to move it."></canvas>
    ${ph.applied === false && ph.cards && ph.cards.length ? `<div class="row">${applyBtn(ph)}<span class="note">Draft prices are faded. Nothing is final until you apply.</span></div>` : ""}
    ${photoSayBox(ph)}
    <div class="row"><button class="${ph.applied === false ? "small" : "primary"}" data-act="psave">Save labeled photo</button><button class="small" data-act="pMove" data-d="-1" ${(ui.photos || []).indexOf(ph) > 0 ? "" : "disabled"}>Move earlier</button><button class="small" data-act="pMove" data-d="1" ${(ui.photos || []).indexOf(ph) < n - 1 ? "" : "disabled"}>Move later</button><button class="small" data-act="pdel">Delete this photo</button></div>
    ${orderAskBox()}
    ${ph.out ? `<img src="${ph.out}" alt="Labeled sale photo" style="border-radius:6px">` : ""}
    ${photoAddBox(ph)}
    ${photoHintBox(ph)}
    ${photoList(ph)}
    ${ph.cards && ph.cards.length ? `<details class="more" ${dk("psel", false)}><summary>Select tags by tapping</summary>${photoEditBox(ph)}</details>` : ""}
    <details class="more" ${dk("ptag", !ph.cards)}><summary>Place tags by hand</summary>
      <div class="row"><label class="grow">Next tag. Tap the photo to place it.<input id="ph-tag" value="${esc(nextTag())}" placeholder="$25"></label>
        <button class="small" data-act="ptagUndo" ${ph.tags.length ? "" : "disabled"}>Undo last tag</button><button class="small" data-act="ptagClear" ${ph.tags.length ? "" : "disabled"}>Clear tags</button></div>
      <p class="note">${photoQueue().length ? (ph.qi < photoQueue().length ? `Tap each card in price-list order: ${ph.qi} of ${photoQueue().length} placed. The tag fills in by itself, or type your own.` : "Every item in this section has a tag. Type your own to add more.") : "Type a tag, then tap where it goes."} While this is open, a tap on the photo places a tag.</p></details>
    <details class="more" ${dk("plook", false)}><summary>Tag size and color</summary>${styleRow(ph)}</details>
    <details class="more" ${dk("phead", false)}><summary>Headline, second line and username stamp</summary><div class="two">
      <label>This photo shows<select id="ph-target">${ts.map(t => `<option value="${esc(t.key)}" ${t.key === ph.key ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
      <label>Your Reddit username, for the stamp<input id="set-handle" value="${esc(S.settings.handle || "")}" placeholder="username"></label>
      <label>Headline<input id="ph-title" value="${esc(ph.title)}" placeholder="$10 PER CARD"></label>
      <label>Second line<input id="ph-note" value="${esc(ph.note)}" placeholder="Claim by number"></label>
    </div></details>
    <p class="note">A typed username and date may not count as proof of possession on every subreddit. Keep a handwritten note in the shot until the mods confirm a printed stamp is accepted.</p>` : ""}
  </div></section>`;
}

/* ---------- guided flow: where the sale stands, what to do next, and the sale as it is being built ---------- */
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const inSale = c => !c.example && (c.status !== "open" || c.isLot || !!c.section);
function checkSnap(c){ return {t:title(c), grade:c.grade || "", val:c.aiLow != null && c.aiHigh != null ? money(c.aiLow) + " to " + money(c.aiHigh) : "", ask:money(priceOf(c)) || ""}; }
function resultBox(c){
  if(c.isLot || !c.photosSeen || c.checkSeen) return "";
  const L = c.lastCheck, row = (k, a, b) => a === b ? "" : `<li>${k}: ${esc(a || "none")} → <strong>${esc(b || "none")}</strong></li>`;
  const changes = L ? row("Card", L.before.t, L.after.t) + row("Grade", L.before.grade, L.after.grade) + row("Value", L.before.val, L.after.val) + row("Ask", L.before.ask, L.after.ask) : "";
  const basis = basisOf(c), auto = basis != null ? roundP(basis * (1 - (Number(S.settings.discount) || 0) / 100)) : null;
  return `<div class="check result"><span><strong>Recheck applied</strong> from ${plural(c.photosSeen, "photo", "photos")}.${c.recheckNote ? " You asked: " + esc(c.recheckNote) : ""}</span>
    ${changes ? `<ul class="chg">${changes}</ul>` : L ? `<span>Nothing changed. The photos confirm what was there.</span>` : ""}
    ${c.recheckSummary ? `<span>${esc(c.recheckSummary)}</span>` : ""}
    <span>Now: ${esc(c.grade || "no grade")} · value ${esc(c.aiLow != null && c.aiHigh != null ? money(c.aiLow) + " to " + money(c.aiHigh) : "not set")} · ask <strong>${esc(money(priceOf(c)) || "not set")}</strong></span>
    <div class="row">${c.price != null && auto != null && auto !== c.price ? `<button class="small primary" data-act="useAuto">Use the new ask ${money(auto)}</button><span>Your typed ask of ${money(c.price)} was kept.</span>` : ""}<button class="small" data-act="checkSeen">Got it</button></div></div>`;
}
function rowSale(c){
  const p = priceOf(c);
  return `<li data-id="${c.id}"><div><div class="ttl">${esc(title(c))} ${c.status === "sold" ? `<span class="stamp">SOLD</span>` : c.status === "claimed" ? `<span class="chip ok">claimed${c.claimBy ? " u/" + esc(c.claimBy) : ""}</span>` : ""}</div>
      <div class="meta">${esc([c.grade, c.flaws].filter(Boolean).join(" · "))}</div></div>
    <div class="nums"><label>Ask<input class="money" data-f="price" inputmode="decimal" value="${c.price ?? ""}" placeholder="${p != null && c.price == null ? p : "$"}" ${c.status === "open" ? "" : "disabled"}></label>
      ${c.status !== "open" ? "" : c.isLot ? `<button class="small" data-act="unlot">Break apart</button>` : `<button class="small" data-act="takeOut">Take out</button>${ui.rq[c.id] ? "" : `<button class="small" data-act="backPick">More photos</button>`}`}</div>
    ${resultBox(c)}
    ${rqBox(c)}
    ${whyBox(c)}
    ${c.isLot && c.status === "open" ? `<details class="edit"><summary>Rename this lot</summary><div class="fields"><label>Lot name<input data-f="player" value="${esc(c.player)}"></label></div></details>` : ""}
  </li>`;
}
function vSale(){
  const items = ordered().filter(inSale), secs = [...new Set(items.map(c => c.section || "Other cards"))];
  const live = items.filter(c => c.status !== "sold"), total = live.reduce((a, c) => a + (priceOf(c) || 0), 0);
  const cards = items.reduce((a, c) => a + (c.isLot ? c.members.length : 1), 0), unpriced = items.filter(c => priceOf(c) == null).length, decide = toDecide().filter(c => !c.example).length;
  return `<section class="view"><div class="panel"><h2>Your sale so far</h2>
    <p class="note">Everything you have agreed to, in the order it will appear in the post. Asks are firm: buyers claim at the price shown.</p>
    <p><strong>${plural(items.length, "item", "items")}</strong> · ${plural(cards, "card", "cards")} · <strong>${money(total) || "$0"}</strong> asking${unpriced ? ` · <span class="chip warn">${unpriced} without a price</span>` : ""}</p>
    ${decide ? `<p class="flag">${plural(decide, "card still needs", "cards still need")} a place. <a href="#inventory">Decide ${decide === 1 ? "it" : "them"}</a></p>` : ""}
    <div class="row"><a class="btn primary" href="#post">Build the post</a><button class="small" data-act="goComment">Price comment</button>${items.length ? `<button class="small danger" data-act="clearOpen" data-k="sale">Clear the sale</button>` : ""}</div></div>
    ${priceCheckPanel()}
    ${items.length ? secs.map(s => { const list = items.filter(c => (c.section || "Other cards") === s), t = list.filter(c => c.status !== "sold").reduce((a, c) => a + (priceOf(c) || 0), 0);
      return `<div class="panel"><h2>${esc(s)} <span class="note">${list.length} · ${money(t) || "$0"}</span></h2><ul class="cards">${list.map(rowSale).join("")}</ul></div>`; }).join("")
      : `<div class="panel"><p class="note">Nothing is in the sale yet. On the Review tab, make cards singles, put them on a price page, or accept a grouping, and they collect here.</p></div>`}
  </section>`;
}
function go(h, then){ if(location.hash === h) render(); else location.hash = h; if(then) setTimeout(then, 80); }
function progressBar(){
  const real = S.cards.filter(c => !c.example), checks = S.cards.filter(needsCheck).length, decide = toDecide().filter(c => !c.example).length;
  const items = S.cards.filter(inSale), groups = groupSuggestions().length, claimed = S.cards.filter(c => c.status === "claimed").length, sold = S.cards.filter(c => c.status === "sold").length;
  const toShip = shipOrders().filter(x => !x.o.shippedAt).length, total = items.filter(c => c.status !== "sold").reduce((a, c) => a + (priceOf(c) || 0), 0);
  const reviewed = real.length > 0 && !checks && !decide;
  const steps = [
    {k:"Scan", d:real.length > 0, t:real.length ? plural(real.reduce((a, c) => a + (c.isLot ? c.members.length : 1), 0), "card", "cards") : "not started", h:"#inventory"},
    {k:"Review", d:reviewed, t:checks || decide ? [checks ? checks + " to check" : "", decide ? decide + " to decide" : ""].filter(Boolean).join(", ") : real.length ? "done" : "", h:"#inventory"},
    {k:"Sale", d:reviewed && items.length > 0, t:items.length ? plural(items.length, "item", "items") + " · " + (money(total) || "$0") : "empty", h:"#sale"},
    {k:"Post", d:!!S.postedAt, t:S.postedAt ? "posted" : "not yet", h:"#post"},
    {k:"Claims", d:!!S.postedAt && sold > 0 && !claimed, t:claimed || sold ? [claimed ? claimed + " waiting" : "", sold ? sold + " paid" : ""].filter(Boolean).join(", ") : "none yet", h:"#claims"},
    {k:"Ship", d:sold > 0 && !toShip, t:toShip ? toShip + " to ship" : sold ? "all shipped" : "", h:"#ship"},
  ];
  const cur = steps.findIndex(s => !s.d), view = location.hash.slice(1) || "inventory";
  const unchecked = items.filter(c => c.status === "open" && !(S.priceCheck && S.priceCheck.items[c.id])).length, labeled = (ui.photos || []).filter(x => (x.tags || []).length).length;
  const cands = [
    ["scan", !real.length, 0, "Scan a photo of your cards, or start from a sale photo on the Photos tab.", view === "inventory" ? {act:"pick", label:"Take or choose photos"} : {href:"#inventory", label:"Start scanning"}],
    ["checks", checks, checks, `${plural(checks, "card needs", "cards need")} a check before pricing.`, {act:"showChecks", label:"Show them"}],
    ["groups", groups, groups, `${plural(groups, "grouping suggestion is", "grouping suggestions are")} waiting.`, {act:"goGroups", label:"See them"}],
    ["decide", decide, decide, `${plural(decide, "card still needs", "cards still need")} a place: single, price page or lot.`, {act:"goDecide", label:"Decide"}],
    ["pricecheck", !S.postedAt && unchecked, unchecked, `Double-check ${unchecked === items.filter(c => c.status === "open").length ? "the asks" : plural(unchecked, "ask", "asks")} against recent sales before you post.`, {act:"pcGo", label:"Double-check prices"}],
    ["photos", !S.postedAt && items.length && !labeled, items.length, "Put the asks on your sale photos so buyers see every price.", {href:"#photos", label:"Label photos"}],
    ["post", !S.postedAt, 0, "Everything has a place. Look over the sale, then build and copy the post.", {href:view === "sale" ? "#post" : "#sale", label:view === "sale" ? "Build the post" : "Open the sale"}],
    ["claims", claimed, claimed, `${plural(claimed, "claim is", "claims are")} waiting for payment.`, {href:"#claims", label:"Claims"}],
    ["ship", toShip, toShip, `${plural(toShip, "paid order", "paid orders")} to ship.`, {href:"#ship", label:"Ship"}],
    ["close", sold, sold, "Everything paid has shipped. Close out the sale on History when you are done.", {href:"#sold", label:"History"}],
  ];
  const sk = S.skipNext || {}, pick = cands.find(x => x[1] && sk[x[0]] !== String(x[2])) || ["live", true, 0, "The post is out. Paste new comments on the Claims tab as claims come in.", {href:"#claims", label:"Claims"}];
  const next = [pick[3], pick[4]], skipped = cands.filter(x => x[1] && sk[x[0]] === String(x[2])).length;
  ui.nextKey = ["live", "post", "scan"].includes(pick[0]) ? "" : pick[0]; ui.nextSig = String(pick[2]); ui.nextText = pick[3];
  const b = next[1], btn = b.href ? `<a class="btn small primary" href="${b.href}">${b.label}</a>` : `<button class="small primary" data-act="${b.act}">${b.label}</button>`;
  return `<input type="file" id="backfile" accept="image/*" multiple hidden><div class="panel prog"><ol class="steps">${steps.map((s, i) => `<li class="${s.d ? "done" : i === cur ? "now" : ""}"><a href="${s.h}"><b>${s.k}</b><span>${esc(s.t)}</span></a></li>`).join("")}</ol>
    <div class="next"><span><strong>Next:</strong> ${esc(next[0])}</span><span class="row" style="gap:6px">${btn}${ui.nextKey ? `<button class="small" data-act="nextSkip">Not now</button>` : ""}<button class="small" data-act="clearOpen">Clear…</button><button class="small danger" data-act="startOver">Start over</button></span></div>
    ${skipped ? `<p class="note">${plural(skipped, "step is", "steps are")} set aside. <button class="small" data-act="nextBack">Bring ${skipped === 1 ? "it" : "them"} back</button></p>` : `<p class="note">Disagree? Say so in the box below, for example "skip the price check, I priced these from my own comps".</p>`}</div>`;
}

/* ---------- clear things out: any part of the tool's data, chosen by tick box, with Undo ---------- */
const CLEARS = [
  ["decide", "Cards still to decide", () => toDecide().length],
  ["sale", "The sale: every item on the Sale tab, with its claims and orders", () => S.cards.filter(inSale).length],
  ["orders", "Shipping details: buyer addresses and tracking numbers", () => Object.keys(S.orders || {}).length],
  ["plan", "The sale plan and post title", () => (S.plan ? 1 : 0) + (S.settings.title ? 1 : 0)],
  ["sold", "Your sold log", () => (S.solds || []).length],
  ["history", "Finished sales history", () => (S.sales || []).length],
  ["subs", "Sub prices you collected", () => (S.subComps || []).length],
  ["photos", "Labeled photos on this device", () => (ui.photos || []).length],
];
function clearPanel(){
  if(!ui.clearOpen) return "";
  const pick = ui.clearPick || {}, chosen = CLEARS.filter(([k, , n]) => pick[k] && n());
  return `<div class="panel pick" id="clearpanel"><div class="row" style="justify-content:space-between"><h2>Clear things out</h2><button class="small" data-act="clearClose">Close</button></div>
    <p class="note">Tick what to remove. Undo brings everything back right after, except photos.</p>
    <div class="clearlist">${CLEARS.map(([k, label, n]) => { const c = n(); return `<label class="inline"><input type="checkbox" data-clr="${k}" ${pick[k] && c ? "checked" : ""} ${c ? "" : "disabled"}> ${esc(label)} <span class="note">${c || "empty"}</span></label>`; }).join("")}</div>
    ${ui.clearConfirm
      ? `<p class="flag">Remove ${esc(chosen.map(x => x[1].split(":")[0].toLowerCase()).join(", "))}? ${pick.photos ? "Photos cannot be brought back." : "Undo brings it back."}</p><div class="row"><button class="small danger" data-act="clearGo">Yes, clear</button><button class="small" data-act="clearNo">Cancel</button></div>`
      : `<div class="row"><button class="small" data-act="clearAll">Tick everything</button><button class="small danger" data-act="clearAsk" ${chosen.length ? "" : "disabled"}>Clear${chosen.length ? " " + chosen.length + " selected" : ""}</button></div>`}
  </div>`;
}
async function clearChosen(){
  const n0 = Object.fromEntries(CLEARS.map(([k, , n]) => [k, n()])), p = Object.fromEntries(Object.entries(ui.clearPick || {}).filter(([k, v]) => v && n0[k])), done = [];
  ui.undo = JSON.stringify(S);
  if(p.decide){ const n = toDecide().length; S.cards = S.cards.filter(c => !(c.status === "open" && !c.isLot && !c.section)); if(n) done.push(plural(n, "card to decide", "cards to decide")); }
  if(p.sale){ const n = S.cards.filter(inSale).length; S.cards = S.cards.filter(c => !inSale(c)); S.orders = {}; S.postedAt = null; if(n) done.push(plural(n, "sale item", "sale items")); }
  if(p.orders){ S.orders = {}; if(n0.orders) done.push("shipping details"); }
  if(p.plan){ S.plan = null; S.settings.title = ""; done.push("the plan and title"); }
  if(p.sold){ S.solds = []; done.push("the sold log"); }
  if(p.history){ (S.sales || []).forEach(s => saleDeleted(s.id)); S.sales = []; done.push("finished sales"); }
  if(p.subs){ S.subComps = []; done.push("collected sub prices"); }
  if(p.photos){
    for(const x of ui.photos || []){ await idb("del", x.id); if(ui.thumbs && ui.thumbs[x.id]) URL.revokeObjectURL(ui.thumbs[x.id]); }
    ui.photos = []; ui.photo = null; ui.thumbs = {}; done.push("photos");
  }
  ui.sel.clear();
  if(!done.length) return "Nothing was cleared.";
  return "Cleared " + done.join(", ") + "." + (done.length === 1 && p.photos ? "" : " Undo brings it back" + (p.photos ? ", except photos." : "."));
}

/* tag colors: background, text and outline */
const TAG_COLORS = {white:["#ffffff", "#0a120f", "#0a120f"], black:["#0a120f", "#ffffff", "#ffffff"], yellow:["#ffd400", "#0a120f", "#0a120f"], orange:["#fc7313", "#ffffff", "#ffffff"], green:["#1b6a49", "#ffffff", "#ffffff"], blue:["#0073a2", "#ffffff", "#ffffff"], red:["#c62828", "#ffffff", "#ffffff"]};
const tagScale = ph => Math.min(2, Math.max(.5, Number(ph && ph.scale) || 1));
const tagColor = ph => TAG_COLORS[ph && ph.color] ? ph.color : "white";
function setTagStyle(scale, color){
  const ph = ui.photo; if(!ph) return;
  if(scale != null && !isNaN(scale)) ph.scale = Math.min(2, Math.max(.5, Math.round(Number(scale) * 10) / 10));
  if(color && TAG_COLORS[color]) ph.color = color;
  S.settings.tagScale = ph.scale || 1; S.settings.tagColor = tagColor(ph);
  if(ph.cards) relabel(); else ph.out = null;
  save();
}
function styleRow(ph){
  return `<div class="row tagstyle"><label class="inline">Tag size <input type="range" id="ptagsize" min="0.5" max="2" step="0.1" value="${tagScale(ph)}" aria-label="Tag size"> <span class="note">${Math.round(tagScale(ph) * 100)}%</span></label>
    <span class="row" style="gap:6px">${Object.entries(TAG_COLORS).map(([k, c]) => `<button class="swatch ${tagColor(ph) === k ? "on" : ""}" data-act="pColor" data-c="${k}" style="background:${c[0]};color:${c[1]}" aria-label="${k} tags" title="${k}">$</button>`).join("")}</span></div>`;
}

/* ---------- photo tags as data: each found card, the lots on the photo, and what is hidden ---------- */
const pcard = id => (ui.photo.cards || []).find(c => c.id === id);
const lotDisc = () => 1 - Number(S.settings.lotDiscount ?? 10) / 100;
const photoExtra = ph => (ph && ph.cards || []).filter(pc => !pc.invId && !(ph.hidden || []).includes(pc.id));
function saleNum(c){ const rows = ordered().filter(x => priceOf(x) != null || x.status !== "open"); return rows.indexOf(c) + 1; }
function cardAsk(pc){ if(pc.price != null) return pc.price; const f = pc.invId && findCard(pc.invId); return f ? priceOf(f.c) : pc.est; }
function cardNum(pc){ const f = pc.invId && findCard(pc.invId); return f && !f.lot ? saleNum(f.c) : 0; }
const groupLot = g => g.lotId ? S.cards.find(c => c.id === g.lotId && c.isLot) : null;
function groupAsk(g){
  if(g.price != null) return g.price;
  const lot = groupLot(g); if(lot) return priceOf(lot);
  const asks = g.ids.map(id => pcard(id)).filter(Boolean).map(cardAsk);
  return asks.length && asks.every(a => a != null) ? roundP(asks.reduce((a, b) => a + b, 0) * lotDisc()) : null;
}
function relabel(){
  const ph = ui.photo; if(!ph || !ph.cards) return;
  ph.groups = (ph.groups || []).filter(g => g.ids.length >= 2);
  const inGroup = new Set(ph.groups.flatMap(g => g.ids)), hidden = new Set(ph.hidden || []), items = [];
  for(const pc of ph.cards){
    if(inGroup.has(pc.id) || hidden.has(pc.id)) continue;
    const a = cardAsk(pc), f = pc.invId && findCard(pc.invId);
    items.push({ref:pc.id, box:pc.box, text:pc.text || (f && f.c.tagText) || (a != null ? money(a) : "ask?")});
  }
  let letter = 0;
  const ar = b => (b.x1 - b.x0) * (b.y1 - b.y0);
  for(const g of ph.groups){
    const ms = g.ids.map(pcard).filter(Boolean), bs = ms.map(c => c.box); if(!bs.length) continue;
    const box = {x0:Math.min(...bs.map(b => b.x0)), y0:Math.min(...bs.map(b => b.y0)), x1:Math.max(...bs.map(b => b.x1)), y1:Math.max(...bs.map(b => b.y1))};
    const lot = groupLot(g), a = groupAsk(g), say = g.text || (lot && lot.tagText) || "All " + g.ids.length + " for " + (a != null ? money(a) : "ask?");
    /* a lot whose cards are spread around the photo gets a lettered tag on each card instead of one tag nowhere near them */
    if(ar(box) > bs.reduce((s, b) => s + ar(b), 0) * 2.5){ g.letter = "Lot " + String.fromCharCode(65 + letter++); ms.forEach(pc => items.push({ref:"g:" + g.id, box:pc.box, text:g.letter + " " + (g.text || (lot && lot.tagText) || (a != null ? money(a) : "ask?"))})); continue; }
    g.letter = "";
    items.push({ref:"g:" + g.id, box, text:say});
  }
  ph.tags = layoutTags(items); ph.qi = photoQueue().length; ph.tagText = null; ph.out = null;
}
function lotNameFor(list){
  const same = f => list.every(c => String(c[f] ?? "").toLowerCase() === String(list[0][f] ?? "").toLowerCase()) && list[0][f];
  return same("year") && same("set") ? `${list[0].year} ${list[0].set} lot` : same("player") ? `${list[0].player} lot` : same("year") ? `${list[0].year} lot` : "Lot";
}
/* make the inventory lot too, when every card is a loose card in the inventory */
function mirrorGroup(g){
  if(g.lotId && groupLot(g)) return true;
  const inv = g.ids.map(id => (pcard(id) || {}).invId);
  if(inv.length < 2 || !inv.every(i => { const f = i && findCard(i); return f && !f.lot && f.c.status === "open"; })) return false;
  const name = g.label || lotNameFor(inv.map(i => findCard(i).c));
  if(!applyOps([{op:"lot", name, ids:inv, price:g.price > 0 ? g.price : undefined, section:"Lots"}])) return false;
  const lot = S.cards[S.cards.length - 1]; lot.why = "You made this lot on a sale photo."; g.lotId = lot.id; if(g.text) lot.tagText = g.text;
  return true;
}
function photoGroup(ids, price, label, text){
  const ph = ui.photo;
  ids = [...new Set(ids)].filter(id => pcard(id));
  if(ids.length < 2) return "Pick at least two cards for a lot.";
  ph.groups = ph.groups.filter(g => !g.ids.some(id => ids.includes(id)) || (g.ids = g.ids.filter(id => !ids.includes(id))).length >= 2);
  ph.hidden = (ph.hidden || []).filter(id => !ids.includes(id));
  const g = {id:uid(), ids, price:price > 0 ? price : null, label:label || lotNameFor(ids.map(id => pcard(id).f || {})), lotId:null, text:""};
  ph.groups.push(g);
  const inSaleToo = mirrorGroup(g);
  if(text) photoText(["g:" + g.id], text);
  return `${plural(ids.length, "card is", "cards are")} now one lot${groupAsk(g) != null ? " at " + money(groupAsk(g)) : ""}.` + (inSaleToo ? " It is on the Sale tab too." : " It is on this photo only until its cards are added to Review, then it becomes a lot in your sale too.");
}
function photoText(refs, text){
  text = String(text || "").trim().slice(0, 40); let n = 0;
  for(const r of refs){
    const g = ui.photo.groups.find(x => "g:" + x.id === r || x.id === r);
    if(g){ g.text = text; const lot = groupLot(g); if(lot) lot.tagText = text; n++; continue; }
    const pc = pcard(r); if(!pc) continue;
    pc.text = text; const f = pc.invId && findCard(pc.invId); if(f && !f.lot) f.c.tagText = text; n++;
  }
  return n ? (text ? `Tag wording set to "${text}". The price comment uses it too.` : "Tag wording reset to the plain ask.") : "";
}
function photoUngroup(gids){
  const ph = ui.photo; let n = 0;
  for(const gid of gids){
    const g = ph.groups.find(x => x.id === gid); if(!g) continue;
    const lot = groupLot(g);
    if(lot && lot.status === "open"){ const i = S.cards.indexOf(lot); lot.members.forEach(m => { detach(m); delete m.section; }); S.cards.splice(i, 1, ...lot.members); }
    ph.groups = ph.groups.filter(x => x !== g); n++;
  }
  return n ? `Split ${plural(n, "lot", "lots")} back into single tags. Those cards are back on Review.` : "";
}
function photoPrice(ids, price){
  if(!(price > 0)) return "Type an ask first.";
  let n = 0;
  for(const id of ids){
    const g = ui.photo.groups.find(x => x.id === id || "g:" + x.id === id);
    if(g){ g.price = price; g.text = ""; const lot = groupLot(g); if(lot){ lot.price = price; lot.fixed = true; lot.tagText = ""; } n++; continue; }
    const pc = pcard(id); if(!pc) continue;
    pc.price = price; pc.text = ""; const f = pc.invId && findCard(pc.invId); if(f && !f.lot){ f.c.price = price; f.c.tagText = ""; } n++;
  }
  return n ? `Set the ask to ${money(price)} on ${plural(n, "tag", "tags")}.` : "";
}
const selIds = () => { const ph = ui.photo; return (ph.selRefs || []).flatMap(r => r.startsWith("g:") ? (ph.groups.find(g => "g:" + g.id === r) || {ids:[]}).ids : [r]); };
const selGroups = () => (ui.photo.selRefs || []).filter(r => r.startsWith("g:")).map(r => r.slice(2));
function photoEditBox(ph){
  if(!ph.cards || !ph.cards.length) return "";
  const sel = ph.selRefs || [], ids = selIds(), asks = ids.map(id => cardAsk(pcard(id) || {}));
  const suggest = sel.length === 1 ? (sel[0].startsWith("g:") ? groupAsk(ph.groups.find(g => "g:" + g.id === sel[0]) || {ids:[]}) : cardAsk(pcard(sel[0]) || {})) : asks.length && asks.every(a => a != null) ? roundP(asks.reduce((a, b) => a + b, 0) * lotDisc()) : null;
  const val = ui.photoAsk ?? (suggest ?? "");
  return `<div class="check rq"><span>Turn this on, tap tags on the photo to pick them, then combine them into one lot, set an ask, change the wording, split a lot or remove a tag.</span>
    <div class="row"><label class="inline"><input type="checkbox" id="pselmode" ${ui.photoSelect ? "checked" : ""}> Select tags by tapping</label>${sel.length ? `<strong>${sel.length} selected</strong><button class="small" data-act="pSelNone">Clear</button>` : ""}</div>
    ${sel.length ? `<div class="row"><label class="inline">Ask $<input class="money" id="paskval" inputmode="decimal" value="${esc(val)}"></label>
      <button class="small primary" data-act="pCombine" ${ids.length >= 2 ? "" : "disabled"}>Combine into one lot</button>
      <button class="small" data-act="pSetAsk">Set ask</button></div>
      <div class="row"><label class="inline grow">Tag says <input id="ptagtext" class="grow" value="${esc(ui.photoText ?? (sel.length === 1 ? ((ph.tags.find(t => t.ref === sel[0]) || {}).text || "") : ""))}" placeholder="All 6 for $160, $35 total, $50 shipped"></label><button class="small" data-act="pSetText">Set wording</button>${selGroups().length ? `<button class="small" data-act="pSplit">Split lot</button>` : ""}<button class="small danger" data-act="pHide">Remove tag</button></div>` : ""}
  </div>`;
}
async function photoInstr(){
  const ph = ui.photo, text = String(ui.photoInstr || "").trim(); if(!ph || !text) return;
  if(!cap.ai){ ph.msg = aiOff(); return render(); }
  ui.busy = "Working on it"; render();
  try{
    const r3 = v => Math.round(v * 1000) / 1000;
    const cards = ph.cards.map(pc => ({id:pc.id, name:pc.invId && findCard(pc.invId) ? lineName(findCard(pc.invId).c) : pc.name, box:{x0:r3(pc.box.x0), y0:r3(pc.box.y0), x1:r3(pc.box.x1), y1:r3(pc.box.y1)}, ask:cardAsk(pc), hidden:(ph.hidden || []).includes(pc.id) || undefined}));
    const groups = ph.groups.map(g => ({id:g.id, ids:g.ids, ask:groupAsk(g)}));
    const r = (await ai("phototag", {text, cards, groups})) || {}, said = [];
    for(const o of Array.isArray(r.ops) ? r.ops : []){
      const ids = Array.isArray(o.ids) ? o.ids.map(String) : [];
      if(o.op === "group") said.push(photoGroup(ids, Number(o.price), o.label ? String(o.label) : "", o.tag ? String(o.tag) : ""));
      else if(o.op === "tag") said.push(photoText(ids.map(id => ph.groups.some(g => g.id === id) ? "g:" + id : id), String(o.text || "")));
      else if(o.op === "ungroup") said.push(photoUngroup(ids));
      else if(o.op === "price") said.push(photoPrice(ids, Number(o.price)));
      else if(o.op === "adjust" && Number(o.pct)){ let k = 0; ids.forEach(id => { const ref = ph.groups.some(g => g.id === id) ? "g:" + id : id, a = refAsk(ref); if(a != null){ photoPrice([ref], roundP(a * (1 + Number(o.pct) / 100))); k++; } }); said.push(`${Number(o.pct) > 0 ? "Raised" : "Lowered"} ${plural(k, "ask", "asks")} by ${Math.abs(Number(o.pct))}%.`); }
      else if(o.op === "hide"){ ph.hidden = [...new Set([...(ph.hidden || []), ...ids.filter(id => pcard(id))])]; ph.groups.forEach(g => { g.ids = g.ids.filter(id => !ids.includes(id)); }); }
      else if(o.op === "show") ph.hidden = (ph.hidden || []).filter(id => !ids.includes(id));
      else if(o.op === "style"){ setTagStyle(o.scale != null ? Number(o.scale) * tagScale(ph) : null, o.color ? String(o.color).toLowerCase() : null); said.push("Tags restyled."); }
    }
    ph.undoSheet = ph.undoSheet || null; ph.selRefs = []; ui.photoInstr = ""; ui.photoAsk = null; relabel(); save();
    const done = said.filter(Boolean);
    ph.msg = done.length ? done.join(" ") + (ph.applied === false ? " Still a draft until you apply." : "") : r.say ? String(r.say) : "Nothing changed.";
  }catch(e){ ph.msg = "That did not work: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}

/* ---------- auto-price a photo: find each card, match it to the inventory, size and place a tag under it ---------- */
function layoutTags(items){
  const ph = ui.photo, u = Math.max(ph.w, ph.h) / 100, g = document.createElement("canvas").getContext("2d"), placed = [], out = [];
  const sc = tagScale(ph), meas = (txt, s0) => { const s = s0 * sc; g.font = `800 ${s * u}px Archivo, "Arial Narrow", Arial, sans-serif`; return {w:g.measureText(txt).width + .6 * s * u, h:1.53 * s * u}; };
  const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const rects = items.map(it => ({x:it.box.x0 * ph.w, y:it.box.y0 * ph.h, w:(it.box.x1 - it.box.x0) * ph.w, h:(it.box.y1 - it.box.y0) * ph.h}));
  for(const [i, it] of items.entries()){
    const others = rects.filter((_, j) => j !== i);
    const bx = it.box.x0 * ph.w, bw = (it.box.x1 - it.box.x0) * ph.w, by0 = it.box.y0 * ph.h, by1 = it.box.y1 * ph.h;
    let s = 3; while(s > 1.4 && meas(it.text, s).w > bw * 1.1) s = Math.round((s - .2) * 10) / 10;
    const m = meas(it.text, s), cx = bx + bw / 2, gap = .5 * u;
    const at = (x, y) => ({x:Math.min(ph.w - m.w, Math.max(0, x - m.w / 2)), y:Math.min(ph.h - m.h, Math.max(0, y - m.h / 2)), w:m.w, h:m.h});
    /* candidates in order of preference: under the card, under and shifted, lower still, then on the card's own bottom or top edge */
    const tries = [at(cx, by1 + gap + m.h / 2), at(cx - m.w * .6, by1 + gap + m.h / 2), at(cx + m.w * .6, by1 + gap + m.h / 2), at(cx, by1 + gap * 2 + m.h * 1.5), at(cx, by1 - gap - m.h / 2), at(cx, by0 + gap + m.h / 2)];
    /* score: covering another tag is ruled out, covering another card costs by how much, covering its own card costs a fixed amount */
    const score = (t, k) => { const ar = t.w * t.h; return placed.reduce((a, p) => a + area(p, t), 0) / ar * 100 + others.reduce((a, o) => a + area(o, t), 0) / ar * 8 + k * .6 + (k >= 4 ? 1.5 : 0); };
    const r = tries.map((t, k) => [t, score(t, k)]).sort((x, y) => x[1] - y[1])[0][0];
    placed.push(r);
    out.push({x:(r.x + m.w / 2) / ph.w, y:(r.y + m.h / 2) / ph.h, text:it.text, s, ref:it.ref});
  }
  return out;
}
async function autoPrice(){
  const ph = ui.photo; if(!ph) return;
  if(!cap.ai){ ph.msg = aiOff(); return render(); }
  ui.busy = ph.msg = "Finding every card and matching it to your Review list. This takes about a minute."; render();
  try{
    const pool = [];
    S.cards.forEach(c => { if(c.example || c.status === "sold") return; if(c.isLot) c.members.forEach(m => pool.push({c:m, lot:c})); else pool.push({c}); });
    const inv = pool.slice(0, 500).map(p => ({id:p.c.id, card:lineName(p.c), grade:p.c.grade || "", ask:priceOf(p.c)}));
    const img = await shrink(ph.blob);
    const r = (await ai("locate", {inv}, [img])) || {};
    const found = (Array.isArray(r.cards) ? r.cards : []).filter(f => f && f.box && f.box.x1 > f.box.x0 && f.box.y1 > f.box.y0);
    const norm = v => String(v ?? "").trim().toLowerCase(), last = v => norm(v).split(/\s+/).pop(), used = new Set(), byId = new Map(pool.map(p => [p.c.id, p]));
    const match = f => {
      let best = f.inv ? byId.get(String(f.inv)) : null;
      if(best && used.has(best.c.id)) best = null;
      if(!best){
        const cand = pool.filter(p => !used.has(p.c.id) && norm(p.c.player) && (norm(p.c.player) === norm(f.player) || (last(f.player).length > 3 && last(p.c.player) === last(f.player))) && (!f.year || !p.c.year || String(p.c.year) === String(f.year)));
        best = cand.find(p => f.num && p.c.num && String(p.c.num) === String(f.num)) || cand.find(p => norm(p.c.player) === norm(f.player)) || cand[0] || null;
      }
      if(best) used.add(best.c.id);
      return best;
    };
    const disc = Number(S.settings.discount) || 0;
    ph.cards = found.map((f, i) => {
      const m = match(f), mid = f.aiLow != null && f.aiHigh != null ? (Number(f.aiLow) + Number(f.aiHigh)) / 2 : null;
      return {id:"p" + i, box:f.box, name:[f.year, f.set, f.num ? "#" + f.num : "", f.player].filter(Boolean).join(" "), f, invId:m ? m.c.id : null, matched:!!m, inLot:m && m.lot ? m.lot.id : null, price:null, est:mid != null ? roundP(mid * (1 - disc / 100)) : null};
    });
    const byLot = new Map();
    ph.cards.forEach(pc => { if(pc.inLot){ if(!byLot.has(pc.inLot)) byLot.set(pc.inLot, []); byLot.get(pc.inLot).push(pc.id); } });
    ph.groups = [...byLot].map(([lotId, ids], i) => ({id:"g" + i, ids, lotId, price:null, label:""}));
    ph.hidden = []; ph.selRefs = []; ph.hintSkip = []; ph.applied = false; ph.listResult = null; ph.undoSheet = null;
    relabel();
    const matched = ph.cards.filter(pc => pc.invId).length, extra = photoExtra(ph), hadInv = pool.some(p => p.c.where !== "from a sale photo");
    if(extra.length && !hadInv) addFoundCards();
    ph.askAdd = extra.length > 0 && hadInv;
    ph.msg = !found.length ? "No cards were found in this photo." : [`Found ${plural(found.length, "card", "cards")}.`,
      matched ? `${matched} matched your Review list, so ${matched === 1 ? "its tag uses" : "their tags use"} the ask you set there.` : "",
      extra.length ? (hadInv ? `${plural(extra.length, "card is", "cards are")} not in your Review list, so ${extra.length === 1 ? "its tag is an estimate" : "their tags are estimates"}.` : `${plural(extra.length, "card was", "cards were")} added to Review, priced from an estimate.`) : "",
      ph.cards.length ? "These are draft prices, shown faded. Go over the price sheet below, paste your own list if you have one, then tap Put these prices on the photo." : ""].filter(Boolean).join(" ");
  }catch(e){ ph.msg = "Auto-pricing did not work: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function addFoundCards(){
  const ph = ui.photo, extra = photoExtra(ph); if(!extra.length) return "";
  if(S.cards.every(c => c.example)) S.cards = [];
  const sib = pagePhotos(ph).filter(x => x !== ph).flatMap(x => x.cards || []).filter(x => x.invId && findCard(x.invId));
  for(const pc of extra){
    const same = sib.find(x => String(x.name || "").toLowerCase() === String(pc.name || "").toLowerCase() && !ph.cards.some(y => y !== pc && y.invId === x.invId));
    if(same){ pc.invId = same.invId; continue; }
    const f = pc.f || {}, fl = joinFlaws(flawList(f.flaws)), id = uid();
    S.cards.push({id, status:"open", year:f.year ?? "", set:f.set ?? "", num:f.num ?? "", player:f.player ?? "Unidentified card", variation:f.variation ?? "", grade:f.grade ?? "", flaws:fl, flawsAI:fl, conf:typeof f.conf === "number" ? f.conf : .5, needsBack:false, aiLow:numOrNull(f.aiLow), aiHigh:numOrNull(f.aiHigh), where:"from a sale photo", comp:null, price:pc.price ?? null});
    pc.invId = id;
  }
  const made = ph.groups.filter(g => !g.lotId && mirrorGroup(g)).length;
  relabel();
  return `Added ${plural(extra.length, "card", "cards")} from the photo to Review.` + (made ? ` ${plural(made, "lot", "lots")} from this photo ${made === 1 ? "was" : "were"} made in your sale too.` : "");
}

/* ---------- the Reddit price comment: the sale in order, one line per card, lots listed card by card ---------- */
function condShort(c){
  const g = String(c.grade || "").replace(/^raw\s+/i, ""), parts = flawParts(c);
  const pick = [...parts.filter(x => ISSUE.test(x)), ...parts.filter(x => !ISSUE.test(x))].slice(0, 2).map(x => x.replace(/\s*\([^)]*\)/g, "").trim().replace(/^./, ch => ch.toLowerCase()));
  return [g, ...pick].filter(Boolean).join(", ");
}
const lineName = c => [c.year, c.set, c.num ? "#" + c.num : "", c.player, c.variation ? "(" + c.variation + ")" : ""].filter(Boolean).join(" ");
const lotTagText = (c, a) => c.tagText || "All " + c.members.length + " for " + (a != null ? money(a) : "a price to come");
function priceComment(){
  const st = S.settings, items = ordered().filter(inSale);
  const strike = (t, c) => c.status === "sold" ? "~~" + t + "~~ **SOLD**" : c.status === "claimed" ? t + " (pending)" : t;
  const block = c => {
    const a = priceOf(c);
    if(!c.isLot) return "- " + strike(`${lineName(c)}${condShort(c) ? " - " + condShort(c) : ""} - **${c.tagText || money(a) || "price to come"}**`, c) + "\n";
    const n = c.members.length, name = c.player.replace(/\s*\(\d+ cards?\)$/, "");
    let t = "\n" + strike(`**${name}, ${n} cards - ${lotTagText(c, a)}**`, c) + "\n\n";
    for(const m of c.members) t += `- ${lineName(m)}${condShort(m) ? " - " + condShort(m) : ""}\n`;
    const grades = [...new Set(c.members.map(m => String(m.grade || "").replace(/^raw\s+/i, "")).filter(Boolean))], hits = c.members.filter(m => issuesOf(m).length);
    t += "\n" + (grades.length ? "Grades in this lot: " + grades.join(", ") + ". " : "") + (hits.length
      ? `${hits.length} of ${n} ${hits.length === 1 ? "has an issue" : "have issues"} worth knowing: ${hits.slice(0, 5).map(m => (c.members.every(x => x.player === m.player) ? [m.num ? "#" + m.num : "", m.variation].filter(Boolean).join(" ") || lineName(m) : m.player || lineName(m)) + " (" + issuesOf(m)[0].replace(/^./, ch => ch.toLowerCase()) + ")").join("; ")}${hits.length > 5 ? "; more in the photos" : ""}.`
      : "No creases, writing or paper loss that I can see.") + "\n\n";
    return t;
  };
  let out = "";
  const pics = S.settings.commentByPhoto ? photosWithCards() : [];
  if(pics.length){
    const done = new Set(), secs = new Map();
    pics.forEach((x, i) => {
      const cs = [...(x.cards || [])].filter(pc => pc.invId && !(x.hidden || []).includes(pc.id)).sort((a, b) => ((a.box.y0 + a.box.y1) - (b.box.y0 + b.box.y1)) || (a.box.x0 - b.box.x0));
      const rows = []; let cur = null;
      for(const pc of cs){ const yc = (pc.box.y0 + pc.box.y1) / 2, h = pc.box.y1 - pc.box.y0; if(!cur || yc - cur.yc > h * .5){ cur = {yc, list:[]}; rows.push(cur); } cur.list.push(pc); }
      const seq = [];
      rows.forEach(r => r.list.sort((a, b) => a.box.x0 - b.box.x0).forEach(pc => { const f = findCard(pc.invId); const top = f && (f.lot || f.c); if(top && inSale(top) && !done.has(top.id)){ done.add(top.id); seq.push(top); } }));
      const key = x.page ? "pg:" + x.page.id : x.id;
      if(!secs.has(key)) secs.set(key, {name:x.page ? x.page.name : "Photo " + (ui.photos.indexOf(x) + 1), seq:[]});
      secs.get(key).seq.push(...seq);
    });
    for(const v of secs.values()) if(v.seq.length) out += `**${v.name}**\n\n` + v.seq.map(block).join("") + "\n";
    const rest = items.filter(c => !done.has(c.id));
    if(rest.length) out += "**Other cards**\n\n" + rest.map(block).join("") + "\n";
  } else {
    for(const s of [...new Set(items.map(c => c.section || "Other cards"))]) out += `**${s}**\n\n` + items.filter(c => (c.section || "Other cards") === s).map(block).join("") + "\n";
  }
  out += `**Payment:** ${st.pay}  \n**Shipping:** ${st.ship}\n\nAsks are firm. Condition is noted on every line and already priced in. Ask for more photos of anything before you claim.\n`;
  return out.replace(/\n{3,}/g, "\n\n");
}
function commentPanel(){
  if(!S.cards.some(inSale)) return `<div class="panel" id="pricecomment"><h2>Reddit price comment</h2><p class="note">Nothing is in the sale yet. Place cards on the Review tab, and the comment builds itself here.</p></div>`;
  return `<div class="panel" id="pricecomment"><h2>Reddit price comment</h2>
    <p class="note">The whole sale in order: year, set, number and name, a short condition summary and the ask. Lots list every card, their grades and any issues. It updates whenever the sale changes.</p>
    ${photosWithCards().length ? `<label class="inline"><input type="checkbox" id="set-commentByPhoto" ${S.settings.commentByPhoto ? "checked" : ""}> Order by photo (photo 1 first, cards left to right)</label>` : ""}
    <textarea id="out-comment" readonly style="min-height:320px">${esc(priceComment())}</textarea>
    <div class="row"><button class="primary" data-copy="out-comment">Copy price comment</button></div></div>`;
}
const vPostAll = () => vPost().replace(/<\/section>\s*$/, commentPanel() + "</section>");

/* ---------- double-check prices: every ask against web comps, the seller's history and collected sub prices ---------- */
function checkItems(only){
  return (only || S.cards.filter(c => inSale(c) && c.status === "open")).map(c => {
    const h = c.isLot ? null : historyFor(c);
    return {id:c.id, kind:c.isLot ? "lot" : c.pin === "page" ? "price page card" : "single", card:c.isLot ? c.player : lineName(c), grade:c.grade || "", flaws:c.isLot ? "" : c.flaws || "", ask:priceOf(c),
      value:c.aiLow != null && c.aiHigh != null ? [c.aiLow, c.aiHigh] : null, soldComp:c.comp ?? null,
      cards:c.isLot ? c.members.map(m => ({card:lineName(m), grade:m.grade || "", ask:priceOf(m)})) : undefined,
      mySales:h && h.mine.length ? h.mine.slice(0, 3).map(x => ({price:x.price, grade:x.grade, date:new Date(x.date).toISOString().slice(0, 10)})) : undefined,
      subPrices:h && h.sub.length ? h.sub.slice(0, 3).map(x => ({price:x.price, sold:x.sold, grade:x.grade})) : undefined};
  });
}
async function runCheck(only, photo){
  const items = checkItems(only);
  if(!items.length){ ui.cmdMsg = "Nothing in the sale to check yet. Place cards on Review first."; return render(); }
  if(!cap.ai){ ui.cmdMsg = aiOff(); return render(); }
  const res = {}, notes = [], discount = Number(S.settings.discount) || 0;
  try{
    for(let i = 0; i < items.length; i += 15){
      const chunk = items.slice(i, i + 15);
      ui.busy = `Double-checking prices, ${Math.min(i + 15, items.length)} of ${items.length}. Looking up recent sales can take a minute or two.`; render();
      const r = (await ai("pricecheck", {items:chunk, discount})) || {};
      (Array.isArray(r.items) ? r.items : []).forEach(x => { if(x && x.id) res[x.id] = x; });
      if(r.summary) notes.push(String(r.summary));
    }
    S.priceCheck = {at:Date.now(), items:{...(S.priceCheck && S.priceCheck.items || {}), ...res}, summary:notes.join(" ")};
    const off = Object.values(res).filter(x => x.verdict !== "ok").length;
    ui.cmdMsg = `Price check done: ${off ? plural(off, "ask looks", "asks look") + " off." : "every ask looks right."}${photo ? " Suggestions are in the list under the photo." : " The results are at the top of the Sale tab."}`;
    if(photo && ui.photo) ui.photo.msg = ui.cmdMsg;
    save();
  }catch(e){ ui.cmdMsg = "The price check did not work: " + (e && (e.message || e.code) || "unknown error"); if(photo && ui.photo) ui.photo.msg = ui.cmdMsg; }
  ui.busy = ""; render();
}
const evidenceList = r => (r.evidence || []).length ? `<div class="meta">Evidence: ${(r.evidence || []).slice(0, 3).map(e => esc([e.source, e.price != null && !isNaN(Number(e.price)) ? money(Number(e.price)) : "", e.note].filter(Boolean).join(" ")) + (/^https?:\/\//.test(String(e.url || "")) ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">see it</a>` : "")).join(" · ")}</div>` : "";
function priceCheckPanel(){
  const pc = S.priceCheck, busy = ui.busy ? "disabled" : "";
  if(!pc) return `<div class="panel" id="pricecheck"><div class="row" style="justify-content:space-between"><h2>Double-check prices</h2><button class="primary" data-act="pcRun" ${busy}>Double-check prices</button></div>
    <p class="note">Compares every ask with recent sold prices on the web, your own past sales and the sub prices you collected, then suggests where to raise or lower. Nothing changes until you tap Use.</p>${ui.busy ? `<p class="progress busy">${esc(ui.busy)}</p>` : ""}</div>`;
  const rows = S.cards.filter(c => inSale(c) && pc.items[c.id]).map(c => [c, pc.items[c.id]]);
  const flagged = rows.filter(([c, r]) => r.verdict !== "ok" && Number(r.suggest) > 0 && Number(r.suggest) !== priceOf(c));
  return `<div class="panel pick" id="pricecheck"><div class="row" style="justify-content:space-between"><h2>Price check <span class="note">${esc(dshort(pc.at))}</span></h2>
      <span class="row" style="gap:6px"><button class="small" data-act="pcRun" ${busy}>Run again</button><button class="small" data-act="pcClear">Dismiss</button></span></div>
    ${pc.summary ? `<p>${esc(pc.summary)}</p>` : ""}
    <p class="note">${flagged.length ? plural(flagged.length, "ask looks", "asks look") + " off." : "Every ask looks right."} ${rows.length - flagged.length ? plural(rows.length - flagged.length, "item checks", "items check") + " out." : ""} Each card's Why panel keeps its result and evidence.</p>
    ${flagged.length ? `<ul class="cards">${flagged.map(([c, r]) => `<li data-id="${c.id}"><div><div class="ttl">${esc(title(c))} <span class="chip ${r.verdict === "raise" ? "ok" : "warn"}">${r.verdict === "raise" ? "raise" : "lower"}</span></div>
        <div class="meta">Ask ${money(priceOf(c))} → suggested <strong>${money(Number(r.suggest))}</strong>. ${esc(r.why || "")}</div>${evidenceList(r)}</div>
        <div class="nums"><button class="small primary" data-act="pcUse" data-v="${Number(r.suggest)}">Use ${money(Number(r.suggest))}</button><button class="small" data-act="pcKeep">Keep ${money(priceOf(c))}</button></div></li>`).join("")}</ul>
      ${flagged.length > 1 ? `<div class="row"><button class="primary" data-act="pcAll">Use all ${flagged.length} suggestions</button></div>` : ""}` : ""}
    ${ui.busy ? `<p class="progress busy">${esc(ui.busy)}</p>` : ""}
  </div>`;
}
function useSuggestion(c, v){
  if(!(v > 0)) return;
  c.price = v; if(c.isLot) c.fixed = true;
  const r = S.priceCheck && S.priceCheck.items[c.id]; if(r){ r.verdict = "ok"; r.used = true; }
}

/* ---------- title and description, written on demand from the sale as it stands ---------- */
async function writeCopy(){
  const items = ordered().filter(inSale).filter(c => c.status !== "sold");
  if(!items.length){ ui.cmdMsg = "Place some cards in the sale first."; return render(); }
  if(!cap.ai){ ui.cmdMsg = aiOff(); return render(); }
  ui.busy = "Writing the title and description"; render();
  try{
    const sale = items.slice(0, 40).map(c => ({item:c.isLot ? c.player : lineName(c), kind:c.isLot ? "lot of " + c.members.length : c.pin === "page" ? "price page card" : "single", grade:c.isLot ? "" : c.grade || "", ask:priceOf(c)}));
    const plan = S.plan && S.plan.text ? String(S.plan.text) : "";
    const r = (await ai("postcopy", {sale, plan})) || {};
    ui.copyOpts = {titles:(Array.isArray(r.titles) ? r.titles : []).map(String).filter(Boolean).slice(0, 3), intro:String(r.intro || "")};
  }catch(e){ ui.cmdMsg = "That did not work: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function copyBox(){
  const o = ui.copyOpts;
  return `<div class="row"><button class="small primary" data-act="pcopy" ${ui.busy ? "disabled" : ""}>${o ? "Write new options" : "Write title and description"}</button>${ui.busy === "Writing the title and description" ? `<span class="progress busy">Writing</span>` : ""}</div>
    ${o ? `<div class="copyopts">${o.titles.map((t, i) => `<button class="small opt" data-act="useTitle" data-i="${i}">${esc(t)}</button>`).join("")}${o.intro ? `<button class="small opt" data-act="useIntro">${esc(o.intro)}</button>` : ""}<span class="note">Tap a title or the description to use it. You can still edit it below.</span></div>` : ""}`;
}

/* ---------- photo order: numbered strip, move earlier or later, save every photo in order ---------- */
function photoRecord(ph){
  return {id:ph.id, at:ph.at, ord:ph.ord ?? ph.at, blob:ph.blob, w:ph.w, h:ph.h, key:ph.key, title:ph.title, note:ph.note, qi:ph.qi, tags:(ph.tags || []).map(({x, y, text, s, ref}) => ({x, y, text, s, ref})), cards:ph.cards || null, groups:ph.groups || null, hidden:ph.hidden || null, scale:ph.scale || 1, color:ph.color || "white", applied:ph.applied, page:ph.page || null};
}
const photosWithCards = () => (ui.photos || []).filter(x => (x.cards || []).some(pc => pc.invId));
function movePhoto(d){
  const list = ui.photos || [], i = list.findIndex(x => ui.photo && x.id === ui.photo.id), j = i + d;
  if(i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => { x.ord = k + 1; idb("put", photoRecord(x)); });
  if(photosWithCards().length){
    if(S.settings.commentByPhoto) ui.cmdMsg = "Photo order changed. The price comment follows it.";
    else ui.photoOrderAsk = true;
  }
}
async function renderedBlob(x, plain){
  if(!x.bmp) x.bmp = await createImageBitmap(x.blob);
  const cv = document.createElement("canvas");
  drawPhoto(cv, plain ? {...x, tags:[], title:"", note:""} : {...x, applied:true});
  return new Promise(r => cv.toBlob(r, "image/jpeg", .92));
}
async function saveAllPhotos(plain){
  const list = ui.photos || []; if(!list.length) return;
  ui.busy = "Preparing the photos"; render();
  try{
    const files = [];
    for(const [i, x] of list.entries()){
      const name = String(i + 1).padStart(2, "0") + "-" + (String(x.title || "photo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo") + (plain ? "-plain" : "") + ".jpg";
      files.push(new File([await renderedBlob(x, plain)], name, {type:"image/jpeg"}));
    }
    if(navigator.canShare && navigator.canShare({files})) await navigator.share({files});
    else for(const f of files){ const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    ui.cmdMsg = `Saved ${plural(files.length, "photo", "photos")} in order${plain ? " without labels" : ""}.`;
  }catch(e){ ui.cmdMsg = "The photos could not be saved here: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function orderAskBox(){
  if(!ui.photoOrderAsk) return "";
  return `<div class="check rq"><span><strong>Photo order changed.</strong> Put the price comment in the same order as the photos, so photo 1's cards come first?</span>
    <div class="row"><button class="small primary" data-act="orderYes">Yes, follow the photos</button><button class="small" data-act="orderNo">No, keep it by section</button></div></div>`;
}

/* ---------- the photo, tied to Review: what is on it, row by row, where each ask came from, and what to fix ---------- */
function photoRows(ph){
  const vis = (ph.cards || []).filter(pc => !(ph.hidden || []).includes(pc.id));
  const sorted = [...vis].sort((a, b) => (a.box.y0 + a.box.y1) - (b.box.y0 + b.box.y1)), rows = []; let cur = null;
  for(const pc of sorted){ const yc = (pc.box.y0 + pc.box.y1) / 2, h = pc.box.y1 - pc.box.y0; if(!cur || yc - cur.yc > h * .5){ cur = {yc, list:[]}; rows.push(cur); } cur.list.push(pc); }
  const out = [], seen = new Set();
  rows.forEach((r, ri) => r.list.sort((a, b) => a.box.x0 - b.box.x0).forEach(pc => {
    const g = (ph.groups || []).find(x => x.ids.includes(pc.id));
    if(g){ if(!seen.has(g.id)){ seen.add(g.id); out.push({g, row:ri}); } } else out.push({pc, row:ri});
  }));
  return out;
}
function photoCheckCards(){
  const ph = ui.photo, out = []; if(!ph || !ph.cards) return out;
  ph.cards.forEach(pc => { if((ph.hidden || []).includes(pc.id)) return; const f = pc.invId && findCard(pc.invId), top = f && (f.lot || f.c); if(top && top.status === "open" && !out.includes(top)) out.push(top); });
  return out;
}
function photoHints(ph){
  if(!ph || !ph.cards) return [];
  const free = ph.cards.filter(pc => !(ph.hidden || []).includes(pc.id) && !(ph.groups || []).some(g => g.ids.includes(pc.id)));
  const card = pc => { const f = pc.invId && findCard(pc.invId); return f ? f.c : pc.f || {}; };
  const norm = v => String(v ?? "").trim().toLowerCase(), skip = new Set(ph.hintSkip || []), out = [], used = new Set(), min = singleMin() || 20;
  const by = key => { const m = new Map(); free.forEach(pc => { if(used.has(pc.id)) return; const k = key(pc); if(!k) return; if(!m.has(k)) m.set(k, []); m.get(k).push(pc); }); return m; };
  for(const [k, list] of by(pc => norm(card(pc).player))) if(list.length >= 3 && !skip.has("p:" + k)){ out.push({k:"p:" + k, ids:list.map(x => x.id), label:card(list[0]).player + " lot", text:`${list.length} ${card(list[0]).player} cards`}); list.forEach(x => used.add(x.id)); }
  for(const [k, list] of by(pc => { const c = card(pc); return c.year && c.set ? c.year + " " + norm(c.set) : ""; })){
    const cheap = list.filter(pc => (cardAsk(pc) ?? 0) < min), c = cheap[0] && card(cheap[0]);
    if(cheap.length >= 3 && !skip.has("s:" + k)) out.push({k:"s:" + k, ids:cheap.map(x => x.id), label:`${c.year} ${c.set} lot`, text:`${cheap.length} ${c.year} ${c.set} cards under ${money(min)}`});
  }
  return out.map(h => { const a = h.ids.map(id => cardAsk(pcard(id))); return {...h, ask:a.every(x => x != null) ? roundP(a.reduce((s, x) => s + x, 0) * lotDisc()) : null}; });
}
function photoHintBox(ph){
  const hs = photoHints(ph); if(!hs.length) return "";
  return `<div class="check rq"><strong>Sell some of these together?</strong>${hs.map(h => `<div class="row"><span class="grow">${esc(h.text)} on this photo. One tag for all of them${h.ask != null ? " at " + money(h.ask) : ""}?</span><button class="small primary" data-act="pHintYes" data-k="${esc(h.k)}">Make it one lot</button><button class="small" data-act="pHintNo" data-k="${esc(h.k)}">Keep separate</button></div>`).join("")}<span class="note">Set the lot's price or wording after, in the box under the photo.</span></div>`;
}
function photoAddBox(ph){
  const ex = photoExtra(ph); if(!ex.length || !ph.askAdd) return "";
  return `<div class="check"><span><strong>${plural(ex.length, "card is", "cards are")} not in your Review list:</strong> ${esc(ex.slice(0, 6).map(pc => pc.name || "unidentified").join(", "))}${ex.length > 6 ? ", and more" : ""}. Their tags use an estimate. Add them so they are part of the sale, or keep them on this photo only. If the tool misread a card you already have, pick the right one in the list below instead.</span>
    <div class="row"><button class="small primary" data-act="pAddNew">Add ${ex.length} to Review</button><button class="small" data-act="pAddNo">Photo only</button></div></div>`;
}
function photoSayBox(ph){
  const on = !!(ph.cards && ph.cards.length), rows = on ? photoRows(ph) : [], first = rows.find(x => x.pc && cardAsk(x.pc) != null), lastRow = rows.length ? rows[rows.length - 1].row : 0;
  const nm = first ? ((first.pc.invId && findCard(first.pc.invId) || {c:first.pc.f || {}}).c.player || "") : "";
  const ex = on ? [lastRow > 0 ? "The bottom row is one lot at $40" : "All of these are one lot at $40", nm ? `Make the ${nm} $` : "", "No tag on the slabbed card", "Everything over $100 down 10%", "Bigger yellow tags"].filter(Boolean) : [];
  return `<div class="say"><label for="pinstr"><strong>Tell it what to change</strong></label>
    <div class="row"><input id="pinstr" class="grow" value="${esc(ui.photoInstr || "")}" placeholder="${on ? "The bottom row of Teds is one lot at $160" : "Tap Price every card first"}" ${on ? "" : "disabled"}><button class="small primary" data-act="pInstr" ${ui.busy || !on ? "disabled" : ""}>Do it</button></div>
    ${ex.length ? `<div class="exs"><span class="note">Try:</span>${ex.map(x => `<button class="chipbtn" data-act="pEx" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
    ${ph.msg && !ui.busy ? `<p class="note">${esc(ph.msg)}</p>` : ""}
    ${(ph.hidden || []).length ? `<div class="row"><button class="small" data-act="pShowAll">Bring back ${plural(ph.hidden.length, "removed tag", "removed tags")}</button></div>` : ""}
  </div>`;
}
function photoList(ph){
  if(!ph.cards || !ph.cards.length) return "";
  const rows = photoRows(ph), last = rows.length ? rows[rows.length - 1].row : 0, pool = [];
  S.cards.forEach(c => { if(c.example || c.status === "sold") return; (c.isLot ? c.members : [c]).forEach(m => pool.push(m)); });
  const linked = new Set(ph.cards.map(pc => pc.invId).filter(Boolean)), nCheck = photoCheckCards().length;
  const rowName = r => r === 0 ? (last ? "Top row" : "") : r === last ? "Bottom row" : "Row " + (r + 1);
  const check = top => { const r = top && S.priceCheck && S.priceCheck.items[top.id]; return r && r.verdict !== "ok" && Number(r.suggest) > 0 && Number(r.suggest) !== priceOf(top) ? `<div class="meta"><span class="chip ${r.verdict === "raise" ? "ok" : "warn"}">check says ${money(Number(r.suggest))}</span> ${esc(r.why || "")} <button class="small" data-act="pPcUse" data-cid="${top.id}" data-v="${Number(r.suggest)}">Use ${money(Number(r.suggest))}</button></div>${evidenceList(r)}` : ""; };
  let prev = -1;
  const body = rows.map(x => {
    const head = x.row !== prev && rowName(x.row) ? `<li class="rowhead"><h3>${rowName(x.row)}</h3></li>` : ""; prev = x.row;
    if(x.g){
      const g = x.g, lot = groupLot(g), names = g.ids.map(pcard).filter(Boolean).map(pc => { const f = pc.invId && findCard(pc.invId); return f ? lineName(f.c) : pc.name; });
      return head + `<li><div><div class="ttl">${esc((g.letter ? g.letter + ": " : "") + (g.label || (lot && lot.player) || "Lot"))} <span class="chip">${g.ids.length} cards, one ask</span></div><div class="meta">${esc(names.join("; "))}</div>${check(lot)}</div>
        <div class="nums"><label>Ask<input class="money" data-pref="g:${g.id}" inputmode="decimal" value="${groupAsk(g) ?? ""}" placeholder="$"></label><button class="small" data-act="pSplitOne" data-g="${g.id}">Split</button></div></li>`;
    }
    const pc = x.pc, f = pc.invId && findCard(pc.invId), a = cardAsk(pc);
    const src = pc.matched ? "your ask from Review" : f ? "estimate, added to Review" : "estimate, not in Review";
    return head + `<li><div><div class="ttl">${esc(f ? lineName(f.c) : pc.name || "Unidentified card")} <span class="chip ${pc.matched ? "ok" : "warn"}">${src}</span></div>
      <div class="meta">${esc([f ? f.c.grade : pc.f && pc.f.grade, f && f.lot ? "in " + f.lot.player : ""].filter(Boolean).join(" · "))}</div>${check(f && (f.lot || f.c))}
      <label class="inline">This card is <select data-plink="${pc.id}"><option value="">${f && pc.matched ? "not in my Review list" : "not one of my Review cards"}</option>${pool.filter(m => m.id === pc.invId || !linked.has(m.id)).map(m => `<option value="${m.id}" ${m.id === pc.invId ? "selected" : ""}>${esc(lineName(m))}${priceOf(m) != null ? " · " + money(priceOf(m)) : ""}</option>`).join("")}</select></label></div>
      <div class="nums"><label>Ask<input class="money" data-pref="${pc.id}" inputmode="decimal" value="${a ?? ""}" placeholder="$"></label><button class="small" data-act="pHideOne" data-ref="${pc.id}">No tag</button></div></li>`;
  }).join("");
  return `<div class="plist"><div class="row" style="justify-content:space-between"><h2>Price sheet</h2>${nCheck ? `<button class="small primary" data-act="pCheck" ${ui.busy ? "disabled" : ""}>Double-check ${plural(nCheck, "price", "prices")}</button>` : ""}</div>
    <p class="note">In the order they sit, top row first. Change an ask here and the tag, Review and the price comment all follow. If the tool read a card wrong, pick the right one from your Review list.</p>
    ${sheetTools(ph)}
    <ul class="cards">${body}</ul>
    ${applyBtn(ph) ? `<div class="row">${applyBtn(ph)}</div>` : ""}</div>`;
}
function skipNext(){ if(ui.nextKey) S.skipNext = {...(S.skipNext || {}), [ui.nextKey]:ui.nextSig}; }

/* ---------- prices first: a draft price sheet, the seller's own list, then Apply puts it on the photo ---------- */
function sheetRefs(ph){ return photoRows(ph).map(x => x.g ? "g:" + x.g.id : x.pc.id); }
const refAsk = r => { const ph = ui.photo; if(r.startsWith("g:")){ const g = ph.groups.find(x => "g:" + x.id === r); return g ? groupAsk(g) : null; } return cardAsk(pcard(r) || {}); };
function photoSnap(){ return {S:JSON.stringify(S), photos:pagePhotos(ui.photo).map(x => ({id:x.id, cards:JSON.stringify(x.cards || null), groups:JSON.stringify(x.groups || []), hidden:JSON.stringify(x.hidden || [])}))}; }
function photoRestore(snap){
  if(!snap) return; S = merge(JSON.parse(snap.S)); const keep = ui.photo;
  for(const p of snap.photos){ const x = (ui.photos || []).find(y => y.id === p.id); if(!x) continue; x.cards = JSON.parse(p.cards); x.groups = JSON.parse(p.groups); x.hidden = JSON.parse(p.hidden); ui.photo = x; if(x.cards) relabel(); idb("put", photoRecord(x)); }
  ui.photo = keep;
}
async function bulkAdjust(pct){
  const ph = ui.photo; if(!ph || !ph.cards) return;
  const undo = photoSnap(); let n = 0;
  const seen = new Set(); /* the same card on two photos of a page changes once */
  await onPage(x => { if(!x.cards) return; for(const r of sheetRefs(x)){ const g = r.startsWith("g:") && x.groups.find(y => "g:" + y.id === r), pc = !g && pcard(r), key = g ? g.lotId || x.id + r : pc && pc.invId ? pc.invId : x.id + r; if(seen.has(key)) continue; seen.add(key); const a = refAsk(r); if(a != null){ photoPrice([r], roundP(a * (1 + pct / 100))); n++; } } relabel(); });
  await onPage(x => { if(x.cards) relabel(); });
  ph.undoSheet = undo; save();
  ph.msg = `${pct > 0 ? "Raised" : "Lowered"} ${plural(n, "ask", "asks")} by ${Math.abs(pct)}%${ph.page ? " across " + ph.page.name : ""}, rounded the usual way. Undo is in the price sheet.`;
  render();
}
async function priceList(files){
  const ph = ui.photo; if(!ph || !ph.cards) return;
  const text = String(ui.listText || "").trim().slice(0, 20000);
  if(!text && !(files && files.length)){ ph.msg = "Paste your list or upload a photo of it first."; return render(); }
  if(!cap.ai){ ph.msg = aiOff(); return render(); }
  ui.busy = "Matching your list to the cards"; render();
  try{
    const imgs = []; for(const f of (files || []).slice(0, 2)) imgs.push(await shrink(f));
    const undo = photoSnap(), changed = [], miss = [], keep = ph, list = pagePhotos(ph).filter(x => x.cards);
    /* one call for the whole page: ids carry the photo's place in the page, "2:p4" */
    const cards = [], groups = [], images = imgs.length;
    for(const [pi, px] of list.entries()){
      photoRows(px).forEach((x, i) => { if(x.pc) cards.push({id:pi + 1 + ":" + x.pc.id, photo:pi + 1, pos:i + 1, row:x.row + 1, name:x.pc.invId && findCard(x.pc.invId) ? lineName(findCard(x.pc.invId).c) : x.pc.name, ask:cardAsk(x.pc)}); else x.g.ids.forEach(id => { const pc = px.cards.find(c => c.id === id); if(pc) cards.push({id:pi + 1 + ":" + id, photo:pi + 1, pos:i + 1, row:x.row + 1, name:pc.name, ask:cardAsk(pc), inLot:pi + 1 + ":" + x.g.id}); }); });
      px.groups.forEach(g => groups.push({id:pi + 1 + ":" + g.id, ids:g.ids.map(id => pi + 1 + ":" + id), ask:groupAsk(g)}));
    }
    const r = (await ai("pricelist", {cards, groups, text}, imgs)) || {};
    const split = v => { const m = /^(\d+):(.+)$/.exec(String(v || "")); return m ? [list[Number(m[1]) - 1], m[2]] : [list[0], String(v || "")]; };
    for(const x of Array.isArray(r.prices) ? r.prices : []){
      const [px, id] = split(x.id), v = Number(x.price); if(!px || !(v > 0)) continue;
      await usePhoto(px);
      const ref = px.groups.some(g => g.id === id) ? "g:" + id : id;
      if(!sheetRefs(px).includes(ref) && !pcard(id)) continue;
      const was = refAsk(ref); photoPrice([ref], v); relabel();
      changed.push({line:(list.length > 1 ? "Photo " + ((ui.photos || []).indexOf(px) + 1) + ": " : "") + String(x.line || ""), was, now:v});
    }
    for(const x of Array.isArray(r.groups) ? r.groups : []){
      const parts = (Array.isArray(x.ids) ? x.ids : []).map(split), px = parts[0] && parts[0][0];
      if(!px) continue;
      await usePhoto(px);
      const ids = parts.filter(q => q[0] === px).map(q => q[1]).filter(id => pcard(id));
      if(ids.length < 2) continue;
      photoGroup(ids, Number(x.price), "", ""); relabel();
      changed.push({line:String(x.line || ""), was:null, now:Number(x.price) || null, lot:ids.length});
    }
    list.forEach(px => idb("put", photoRecord(px)));
    ui.photo = keep; save(); ph.undoSheet = undo;
    const unmatched = (Array.isArray(r.unmatched) ? r.unmatched : []).map(String), said = String(r.say || "");
    ph.listResult = {changed, unmatched:unmatched.slice(0, 20), say:list.length > 1 ? `Matched across all ${list.length} photos of ${ph.page.name}. ${said}`.trim() : said};
    ph.msg = `Matched ${plural(changed.length, "line", "lines")} from your list${ph.listResult.unmatched.length ? `, ${ph.listResult.unmatched.length} did not match anything` : ""}. Check the price sheet, then apply.`;
    ui.listText = "";
  }catch(e){ ui.photo = ph; ph.msg = "The list could not be read: " + (e && (e.message || e.code) || "unknown error"); }
  ui.busy = ""; render();
}
function listResultBox(ph){
  const L = ph.listResult; if(!L) return "";
  return `<div class="check result"><span><strong>From your list</strong>${L.say ? ": " + esc(L.say) : ""}</span>
    ${L.changed.length ? `<ul class="chg">${L.changed.map(c => `<li>${esc(c.line || "a line")} → ${c.lot ? `${c.lot} cards as one lot${c.now ? " at " + money(c.now) : ""}` : `<strong>${money(c.now)}</strong>${c.was != null && c.was !== c.now ? ` (was ${money(c.was)})` : ""}`}</li>`).join("")}</ul>` : ""}
    ${L.unmatched.length ? `<span>Not matched: ${esc(L.unmatched.join("; "))}. Type these in the box under the photo, or edit the rows below.</span>` : ""}
    <div class="row">${ph.undoSheet ? `<button class="small" data-act="pSheetUndo">Undo the list</button>` : ""}<button class="small" data-act="pListDone">Got it</button></div></div>`;
}
function sheetTools(ph){
  const refs = sheetRefs(ph), total = refs.reduce((a, r) => a + (refAsk(r) || 0), 0), none = refs.filter(r => refAsk(r) == null).length;
  const pp = pagePhotos(ph).filter(x => x.cards && x !== ph), keep = ui.photo;
  let pT = total, pN = refs.length; for(const x of pp){ ui.photo = x; const rs = sheetRefs(x); pN += rs.length; pT += rs.reduce((a, r) => a + (refAsk(r) || 0), 0); } ui.photo = keep;
  return `<p><strong>${plural(refs.length, "tag", "tags")}</strong> · <strong>${money(total) || "$0"}</strong> on this photo${none ? ` · <span class="chip warn">${none} without a price</span>` : ""}${ph.page ? `<br><span class="note">${esc(ph.page.name)}: ${plural(pN, "tag", "tags")} · ${money(pT) || "$0"} across ${plural(pagePhotos(ph).length, "photo", "photos")}. Your list, the Everything buttons and Apply cover the whole page.</span>` : ""}</p>
    <div class="row"><span class="note">Everything:</span><button class="small" data-act="pBulk" data-p="-20">Down 20%</button><button class="small" data-act="pBulk" data-p="-10">Down 10%</button><button class="small" data-act="pBulk" data-p="10">Up 10%</button>${ph.undoSheet && !ph.listResult ? `<button class="small" data-act="pSheetUndo">Undo</button>` : ""}</div>
    <details class="more" ${(ui.dopen.plist ?? ph.applied === false) ? "open" : ""} data-dk="plist"><summary>Use my own price list</summary>
      <p class="note">Paste it in any format, or upload a photo of a handwritten or printed list. Each line is matched to its card, and lines like "Teds lot 35" become a lot.</p>
      <textarea id="plisttext" placeholder="69 Aaron 45&#10;Gibson $40&#10;Teds lot 35" style="min-height:90px">${esc(ui.listText || "")}</textarea>
      <div class="row"><button class="small primary" data-act="pListGo" ${ui.busy ? "disabled" : ""}>Match my list to the cards</button><input type="file" id="plistfile" accept="image/*" multiple hidden><button class="small" data-act="pListPick" ${ui.busy ? "disabled" : ""}>Upload a photo of my list</button></div></details>
    ${listResultBox(ph)}`;
}
const applyBtn = ph => pagePhotos(ph).some(x => x.applied === false && x.cards && x.cards.length) ? `<button class="primary" data-act="pApply">${ph.page ? `Put these prices on ${pagePhotos(ph).length === 2 ? "both" : "all " + pagePhotos(ph).length} photos` : "Put these prices on the photo"}</button>` : "";

/* ---------- many photos: a queue with a status each, and pages of photos handled as one ---------- */
const pagePhotos = ph => ph && ph.page ? (ui.photos || []).filter(x => x.page && x.page.id === ph.page.id) : ph ? [ph] : [];
const photoState = x => !x.cards ? "waiting" : x.applied === false ? "draft" : (x.tags || []).length ? "labeled" : "priced";
async function usePhoto(x){ if(!x.bmp) x.bmp = await createImageBitmap(x.blob); ui.photo = x; }
async function loadMany(files){
  const before = (ui.photos || []).length, added = [];
  ui.busy = `Adding ${plural(files.length, "photo", "photos")}`; render();
  for(const f of files){ const x = await loadPhoto(f, true); if(x){ added.push(x); idb("put", photoRecord(x)); } }
  ui.busy = "";
  if(added.length){
    ui.photo = added[0];
    if(added.length > 1) added[0].msg = `Added ${plural(added.length, "photo", "photos")}. They wait in the strip above. Tap Price all waiting, or group some into one page first if they belong together.`;
  }
  if(!added.length && before === (ui.photos || []).length) ui.photoErr = "Those files could not be opened as photos.";
  render();
}
async function runQueue(list, label){
  list = list.filter(Boolean); if(!list.length) return;
  if(!cap.ai){ if(ui.photo) ui.photo.msg = aiOff(); return render(); }
  const first = list[0];
  for(const [i, x] of list.entries()){
    await usePhoto(x);
    ui.queueNote = `${label || "Pricing photos"}: ${i + 1} of ${list.length}.`;
    await autoPrice();
    idb("put", photoRecord(x));
  }
  ui.queueNote = "";
  await usePhoto(first);
  if(list.length > 1) first.msg = `Priced ${plural(list.length, "photo", "photos")}. Each is a draft until you apply its prices. ${list.reduce((a, x) => a + (x.cards || []).length, 0)} cards found in all.` + (first.page ? " The price sheet, your price list and the Everything buttons work across the whole page." : " Open each one from the strip to check it.");
  render();
}
async function onPage(fn){
  const keep = ui.photo, list = pagePhotos(keep);
  for(const x of list){ await usePhoto(x); await fn(x); idb("put", photoRecord(x)); }
  ui.photo = keep;
}
function makePage(){
  const picked = (ui.photos || []).filter(x => (ui.picked || []).includes(x.id)); if(picked.length < 2) return;
  const n = new Set((ui.photos || []).filter(x => x.page).map(x => x.page.id)).size;
  const page = {id:uid(), name:String(ui.pageName || "").trim().slice(0, 60) || "Page " + (n + 1)};
  picked.forEach(x => { x.page = page; });
  /* keep a page's photos next to each other, where its first photo was */
  const out = []; let done = false;
  for(const x of ui.photos){ if(picked.includes(x)){ if(!done){ out.push(...picked); done = true; } } else out.push(x); }
  ui.photos = out; out.forEach((x, k) => { x.ord = k + 1; idb("put", photoRecord(x)); });
  const t = picked.find(x => x.title || x.note); if(t) picked.forEach(x => { x.title = t.title; x.note = t.note; x.out = null; });
  ui.picked = []; ui.pickPhotos = false; ui.pageName = "";
  ui.photo = picked[0];
  picked[0].msg = `${picked.length} photos are now "${page.name}". Price them together with Price this page; the price sheet, your price list, the Everything buttons, Apply and the headline work across all of them, and the price comment lists the page as one section.`;
}
function unPage(){
  (ui.photos || []).filter(x => (ui.picked || []).includes(x.id)).forEach(x => { x.page = null; idb("put", photoRecord(x)); });
  ui.picked = [];
}
function photoStrip(){
  const list = ui.photos || [], n = list.length; if(!n) return "";
  const st = list.map(photoState), waiting = st.filter(x => x === "waiting").length, drafts = st.filter(x => x === "draft").length, done = st.filter(x => x === "labeled").length, picked = ui.picked || [];
  const lab = {waiting:"waiting", draft:"draft", labeled:"labeled", priced:"priced"};
  return `<div class="row" style="justify-content:space-between"><span class="note">${[plural(n, "photo", "photos"), waiting ? waiting + " waiting" : "", drafts ? drafts + " in draft" : "", done ? done + " labeled" : ""].filter(Boolean).join(" · ")}${ui.queueNote ? " · " + esc(ui.queueNote) : ""}</span>
      <span class="row" style="gap:6px">${waiting ? `<button class="small primary" data-act="pQueue" ${ui.busy ? "disabled" : ""}>Price all ${waiting} waiting</button>` : ""}${n > 1 ? `<button class="small" data-act="pPickMode">${ui.pickPhotos ? "Done" : "Group photos into a page"}</button>` : ""}</span></div>
    <div class="row thumbs">${list.map((x, i) => { const s = st[i], pk = picked.includes(x.id);
      return `<button class="thumb ${ui.photo && x.id === ui.photo.id && !ui.pickPhotos ? "on" : ""} ${pk ? "picked" : ""}" data-act="${ui.pickPhotos ? "pPickOne" : "popen"}" data-pid="${x.id}" aria-label="${ui.pickPhotos ? (pk ? "Unpick" : "Pick") : "Open"} photo ${i + 1}" ${ui.pickPhotos ? `aria-pressed="${pk}"` : ""}><img src="${thumbUrl(x)}" alt=""><span>${ui.pickPhotos ? (pk ? "✓ " : "") : ""}${i + 1}. ${esc(x.title || "Untitled")}</span><span class="chip ${s === "labeled" ? "ok" : s === "draft" ? "warn" : ""}">${lab[s]}</span>${x.page ? `<span class="pg">${esc(x.page.name)}</span>` : ""}</button>`; }).join("")}</div>
    ${ui.pickPhotos ? `<div class="check rq"><span>Tap the photos that belong together, like a front and a close-up, or several shots of one price page. A page is priced and checked as one: shared headline, one price list, one section in the price comment.</span>
      <div class="row"><input id="pagename" class="grow" value="${esc(ui.pageName || "")}" placeholder="Page name, like 1959 Fleer page or $10 per card"><button class="small primary" data-act="pMakePage" ${picked.length >= 2 ? "" : "disabled"}>Make ${picked.length >= 2 ? picked.length + " photos" : "them"} one page</button>${list.some(x => picked.includes(x.id) && x.page) ? `<button class="small" data-act="pUnpage">Take them off their page</button>` : ""}</div></div>` : ""}`;
}

/* ---------- start over: one tap clears the current sale and its photos, keeps what the tool has learned, Undo brings it back ---------- */
async function startOver(){
  const cards = S.cards.filter(c => !c.example).reduce((a, c) => a + (c.isLot ? c.members.length : 1), 0), photos = ui.photos || [];
  ui.undo = JSON.stringify(S);
  S.cards = []; S.orders = {}; S.postedAt = null; S.plan = null; S.priceCheck = null; S.skipNext = {}; S.grpSkip = []; S.settings.title = "";
  ui.undoPhotos = photos; ui.undoPhotosFor = ui.undo;
  for(const x of photos) await idb("del", x.id);
  ui.photos = []; ui.photo = null; ui.sel.clear(); ui.copyOpts = null; ui.clearOpen = false; ui.photoInstr = ""; ui.listText = "";
  save();
  ui.cmdMsg = `Started over. Removed ${plural(cards, "card", "cards")}${photos.length ? " and " + plural(photos.length, "photo", "photos") : ""}, the plan and the post title. Your history, sold log, sub prices and settings are kept. Undo brings it all back.`;
  if(location.hash !== "#inventory") location.hash = "#inventory"; else render();
}

/* ---------- render + events ---------- */
const VIEWS = {inventory:vInventory, sale:vSale, post:vPostAll, photos:vPhotos, claims:vClaims, sold:vSold, ship:vShip, grade:vGrade, radar:vRadar};
function render(){
  const name = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "inventory";
  document.querySelectorAll("#nav a").forEach(a => a.getAttribute("href") === "#" + name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  $("#n-inv").textContent = toDecide().length || "";
  const ns = $("#n-sale"); if(ns) ns.textContent = S.cards.filter(inSale).length || "";
  $("#n-claims").textContent = S.cards.filter(c => c.status === "claimed").length || "";
  S.cards.forEach(c => { if(c.status === "open" && !c.isLot && c.pin === "single" && !c.section){ c.section = "Singles"; ensureSection("Singles"); } });
  $("#main").innerHTML = progressBar() + clearPanel() + (name === "photos" && ui.photo ? "" : cmdBar()) + VIEWS[name]();
  stat();
  if(name === "photos") drawPhoto();
  renderAuth();
  if(name === "sold" && ui.community == null && !ui.communityMsg) loadCommunity();
}
addEventListener("hashchange", render);

document.addEventListener("click", async e => {
  if(e.target.id === "pcanvas") return photoTap(e);
  const cp = e.target.closest("[data-copy]");
  if(cp && (cp.dataset.copy === "out-body" || cp.dataset.copy === "out-comment") && !S.postedAt){ S.postedAt = Date.now(); save(); }
  if(cp){ const ta = $("#" + cp.dataset.copy); try{ await navigator.clipboard.writeText(ta.value); cp.textContent = "Copied"; }catch(_){ ta.focus(); ta.select(); cp.textContent = "Selected, press copy"; } return; }
  const el = e.target.closest("[data-act]"); if(!el) return;
  const act = el.dataset.act, li = el.closest("li[data-id]"), c = li && S.cards.find(x => x.id === li.dataset.id);
  if(act === "pick") return $("#file").click();
  if(act === "backPick"){ const row = el.closest("li[data-id]"); if(row){ ui.backFor = row.dataset.id; $("#backfile").click(); } return; }
  if(act === "ppick") return $("#pfile").click();
  if(act === "gpick") return $("#gfile").click();
  if(act === "signin"){ const em = $("#auth-email").value.trim(); if(!em) return; ui.authMsg = "Sending"; const {error} = await cap.sb.auth.signInWithOtp({email: em, options:{emailRedirectTo: location.origin}}); ui.authMsg = error ? "Could not send: " + error.message : "Check your email for the link."; document.activeElement && document.activeElement.blur(); return renderAuth(); }
  if(act === "signout"){ await cap.sb.auth.signOut(); return; }
  if(act === "grun") return runGrades();
  e.preventDefault();
  if(act === "add"){ if(S.cards.every(x => x.example)) S.cards = []; S.cards.push({id:uid(), status:"open", year:"", set:"", num:"", player:"New card", grade:"", flaws:"", conf:1, comp:null, price:null}); }
  else if(act === "clearEx"){ S.cards = S.cards.filter(x => !x.example); }
  else if(act === "del" && c){ ui.undo = JSON.stringify(S); S.cards = S.cards.filter(x => x !== c); ui.sel.delete(c.id); ui.cmdMsg = "Deleted " + title(c) + ". Undo brings it back."; }
  else if(act === "match") return matchClaims();
  else if(act === "plan") return runPlan();
  else if(act === "clearOpen"){
    ui.clearOpen = true; ui.clearConfirm = false; ui.clearPick = el.dataset.k ? {[el.dataset.k]: true} : (ui.clearPick || {});
    render(); const d = document.getElementById("clearpanel"); if(d) d.scrollIntoView({behavior:"smooth"}); return;
  }
  else if(act === "clearClose"){ ui.clearOpen = false; ui.clearConfirm = false; ui.clearPick = {}; }
  else if(act === "clearAll"){ ui.clearPick = Object.fromEntries(CLEARS.map(([k]) => [k, true])); ui.clearConfirm = false; }
  else if(act === "clearAsk"){ ui.clearConfirm = true; }
  else if(act === "clearNo"){ ui.clearConfirm = false; }
  else if(act === "clearGo"){ ui.cmdMsg = await clearChosen(); ui.clearOpen = false; ui.clearConfirm = false; ui.clearPick = {}; window.scrollTo(0, 0); }
  else if(act === "qSingle" || act === "qPage"){
    if(!c) return; const keep = ui.sel; ui.sel = new Set([c.id]);
    const m = act === "qSingle" ? assignSingles() : assignPage(numOrNull(ui.pagePrice) || 10);
    ui.sel = keep; keep.delete(c.id); ui.cmdMsg = title(c) + (act === "qSingle" ? " is now a single." : " is on the " + c.section + " page.") + " It is on the Sale tab.";
    if(m.startsWith("Enter")) ui.cmdMsg = m;
  }
  else if(act === "takeOut" && c){ detach(c); delete c.section; ui.cmdMsg = title(c) + " is back on the Review tab, waiting for a place."; }
  else if(act === "checkSeen" && c){ c.checkSeen = true; }
  else if(act === "useAuto" && c){ c.price = null; c.checkSeen = true; ui.cmdMsg = title(c) + " now asks " + money(priceOf(c)) + "."; }
  else if(act === "showChecks"){ ui.onlyCheck = true; return go("#inventory", () => { const d = document.getElementById("decide"); if(d) d.scrollIntoView({behavior:"smooth"}); }); }
  else if(act === "allCards"){ ui.onlyCheck = false; }
  else if(act === "goGroups"){ ui.onlyCheck = false; return go("#inventory", () => { const d = document.getElementById("groups"); if(d) d.scrollIntoView({behavior:"smooth"}); }); }
  else if(act === "goDecide"){ ui.onlyCheck = false; return go("#inventory", () => { const d = document.getElementById("decide"); if(d) d.scrollIntoView({behavior:"smooth"}); }); }
  else if(act === "grpMake" || act === "grpSkip"){
    const k = el.closest("[data-gkey]").dataset.gkey, g = groupSuggestions().find(x => x.key === k);
    if(g && act === "grpSkip") S.grpSkip = [...(S.grpSkip || []), k];
    if(g && act === "grpMake"){
      const before = JSON.stringify(S), p = numOrNull(ui.grpPrice[k]);
      if(applyOps([{op:"lot", name:g.name, ids:g.ids, price:p > 0 ? p : undefined, section:"Lots"}])){
        const lot = S.cards[S.cards.length - 1]; if(lot && lot.isLot) lot.why = "Suggested grouping. " + g.why;
        ui.undo = before; ui.cmdMsg = `Made ${g.name} from ${g.cards.length} cards at ${money(priceOf(lot)) || "no price yet"}. Undo brings the cards back.`;
      }
      delete ui.grpPrice[k];
    }
  }
  else if(act === "recheck" && c) return recheck(c.id);
  else if(act === "rqCancel" && c){ dropRq(c.id); }
  else if(act === "idOk" && c){ c.idOk = true; c.backMsg = ""; }
  else if(act === "delSel"){
    const gone = S.cards.filter(x => ui.sel.has(x.id));
    if(gone.length){ ui.undo = JSON.stringify(S); S.cards = S.cards.filter(x => !ui.sel.has(x.id)); ui.selMsg = ""; ui.cmdMsg = `Deleted ${gone.length} item${gone.length === 1 ? "" : "s"}. Undo brings ${gone.length === 1 ? "it" : "them"} back.`; }
    ui.sel.clear();
  }
  else if(act === "delSale"){ ui.undo = JSON.stringify(S); S.sales = (S.sales || []).filter(x => x.id !== el.dataset.sid); saleDeleted(el.dataset.sid); ui.cmdMsg = "Deleted that finished sale. Undo brings it back."; }
  else if(act === "clearSubs"){ ui.undo = JSON.stringify(S); S.subComps = []; ui.cmdMsg = "Cleared the collected sub prices. Undo brings them back."; }
  else if(act === "delSold"){ ui.undo = JSON.stringify(S); S.solds = S.solds.filter((x, i) => String(i) !== el.dataset.i); ui.cmdMsg = "Deleted that sold-log entry. Undo brings it back."; }
  else if(act === "closeSale"){ ui.histMsg = closeSale(); }
  else if(act === "learn") return learnThread();
  else if(act === "useHist" && c){ c.price = Number(el.dataset.v); }
  else if(act === "psave") return savePhoto();
  else if(act === "startOver") return startOver();
  else if(act === "pauto") return ui.photo && ui.photo.page ? runQueue(pagePhotos(ui.photo), "Pricing " + ui.photo.page.name) : autoPrice();
  else if(act === "pQueue") return runQueue((ui.photos || []).filter(x => !x.cards), "Pricing photos");
  else if(act === "pPickMode"){ ui.pickPhotos = !ui.pickPhotos; ui.picked = []; }
  else if(act === "pPickOne"){ const id = el.dataset.pid, p = ui.picked = ui.picked || []; const i = p.indexOf(id); if(i < 0) p.push(id); else p.splice(i, 1); return render(); }
  else if(act === "pMakePage") makePage();
  else if(act === "pUnpage") unPage();
  else if(act === "pApply" && ui.photo){ const pp = pagePhotos(ui.photo); pp.forEach(x => { x.applied = true; x.out = null; if(x !== ui.photo) idb("put", photoRecord(x)); }); ui.photo.msg = (pp.length > 1 ? `The prices are on ${pp.length === 2 ? "both" : "all " + pp.length} photos of ${ui.photo.page.name}.` : "The prices are on the photo.") + " Drag any tag to move it, and keep changing prices or wording any time: the tags follow."; }
  else if(act === "pBulk" && ui.photo) return bulkAdjust(Number(el.dataset.p));
  else if(act === "pSheetUndo" && ui.photo){ photoRestore(ui.photo.undoSheet); ui.photo.undoSheet = null; ui.photo.listResult = null; ui.photo.msg = "Undone."; }
  else if(act === "pListDone" && ui.photo){ ui.photo.listResult = null; }
  else if(act === "pListGo") return priceList([]);
  else if(act === "pListPick") return $("#plistfile").click();
  else if(act === "pEx"){ ui.photoInstr = el.dataset.v; render(); const i = $("#pinstr"); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } return; }
  else if(act === "pAddNew" && ui.photo){ ui.photo.msg = addFoundCards(); ui.photo.askAdd = false; }
  else if(act === "pAddNo" && ui.photo){ ui.photo.askAdd = false; ui.photo.msg = "The new cards stay on this photo only. Link or add them any time from the list."; }
  else if(act === "pHintYes" && ui.photo){ const h = photoHints(ui.photo).find(x => x.k === el.dataset.k); if(h){ ui.photo.msg = photoGroup(h.ids, 0, h.label); relabel(); } }
  else if(act === "pHintNo" && ui.photo){ ui.photo.hintSkip = [...(ui.photo.hintSkip || []), el.dataset.k]; }
  else if(act === "pHideOne" && ui.photo){ ui.photo.hidden = [...new Set([...(ui.photo.hidden || []), el.dataset.ref])]; relabel(); }
  else if(act === "pSplitOne" && ui.photo){ ui.photo.msg = photoUngroup([el.dataset.g]); relabel(); }
  else if(act === "pCheck") return runCheck(photoCheckCards(), true);
  else if(act === "pPcUse"){ const f = findCard(el.dataset.cid); if(f){ useSuggestion(f.c, Number(el.dataset.v)); if(f.lot) relot(f.lot); if(ui.photo) relabel(); } }
  else if(act === "nextSkip"){ skipNext(); ui.cmdMsg = "Set aside. Bring it back any time from the bar above."; }
  else if(act === "nextBack"){ S.skipNext = {}; }
  else if(act === "pcRun") return runCheck();
  else if(act === "pcGo"){ go("#sale"); return runCheck(); }
  else if(act === "pcClear"){ S.priceCheck = null; }
  else if(act === "pcUse" && c){ useSuggestion(c, Number(el.dataset.v)); ui.cmdMsg = title(c) + " now asks " + money(priceOf(c)) + "."; }
  else if(act === "pcKeep" && c){ const r = S.priceCheck && S.priceCheck.items[c.id]; if(r) r.verdict = "ok"; }
  else if(act === "pcAll"){ let n = 0; for(const x of S.cards){ const r = S.priceCheck && S.priceCheck.items[x.id]; if(r && r.verdict !== "ok" && Number(r.suggest) > 0 && inSale(x)){ useSuggestion(x, Number(r.suggest)); n++; } } ui.cmdMsg = `Updated ${plural(n, "ask", "asks")}.`; }
  else if(act === "pcopy") return writeCopy();
  else if(act === "useTitle" && ui.copyOpts){ S.settings.title = ui.copyOpts.titles[+el.dataset.i] || S.settings.title; }
  else if(act === "useIntro" && ui.copyOpts){ S.settings.intro = ui.copyOpts.intro || S.settings.intro; }
  else if(act === "pMove"){ movePhoto(+el.dataset.d); return render(); }
  else if(act === "pSaveAll") return saveAllPhotos(false);
  else if(act === "pSaveAllPlain") return saveAllPhotos(true);
  else if(act === "orderYes"){ S.settings.commentByPhoto = true; ui.photoOrderAsk = false; ui.cmdMsg = "The price comment now follows the photo order."; }
  else if(act === "orderNo"){ ui.photoOrderAsk = false; }
  else if(act === "pColor"){ setTagStyle(null, el.dataset.c); }
  else if(act === "goComment") return go("#post", () => { const d = document.getElementById("pricecomment"); if(d) d.scrollIntoView({behavior:"smooth"}); });
  else if(act === "pSetText"){ ui.photo.msg = photoText(ui.photo.selRefs || [], String(ui.photoText ?? $("#ptagtext").value)); ui.photo.selRefs = []; ui.photoText = null; relabel(); }
  else if(act === "pSelNone"){ ui.photo.selRefs = []; ui.photoAsk = null; ui.photoText = null; }
  else if(act === "pCombine"){ ui.photo.msg = photoGroup(selIds(), numOrNull(ui.photoAsk ?? $("#paskval").value), ""); ui.photo.selRefs = []; ui.photoAsk = null; relabel(); }
  else if(act === "pSetAsk"){ ui.photo.msg = photoPrice(ui.photo.selRefs || [], numOrNull(ui.photoAsk ?? $("#paskval").value)); ui.photo.selRefs = []; ui.photoAsk = null; relabel(); }
  else if(act === "pSplit"){ ui.photo.msg = photoUngroup(selGroups()); ui.photo.selRefs = []; relabel(); }
  else if(act === "pHide"){ const ids = selIds(); ui.photo.hidden = [...new Set([...(ui.photo.hidden || []), ...ids])]; ui.photo.groups.forEach(g => { g.ids = g.ids.filter(id => !ids.includes(id)); }); ui.photo.selRefs = []; relabel(); ui.photo.msg = `Removed ${plural(ids.length, "tag", "tags")}.`; }
  else if(act === "pShowAll"){ ui.photo.hidden = []; relabel(); }
  else if(act === "pInstr") return photoInstr();
  else if(act === "pfoundAdd"){ ui.cmdMsg = addFoundCards(); }
  else if(act === "popen") return openPhoto(el.dataset.pid);
  else if(act === "pdel" && ui.photo){
    const id = ui.photo.id; clearTimeout(ui.photoT); await idb("del", id);
    ui.photos = (ui.photos || []).filter(x => x.id !== id);
    if(ui.thumbs && ui.thumbs[id]){ URL.revokeObjectURL(ui.thumbs[id]); delete ui.thumbs[id]; }
    ui.photo = null; return render();
  }
  else if(act === "ptagUndo" && ui.photo){ const t = ui.photo.tags.pop(); if(t && ui.photo.qi > 0 && photoQueue()[ui.photo.qi - 1] === t.text) ui.photo.qi--; ui.photo.out = null; return render(); }
  else if(act === "ptagClear" && ui.photo){ ui.photo.tags = []; ui.photo.qi = 0; ui.photo.out = null; return render(); }
  else if(act === "flawDrop" && c){ const p = flawParts(c); p.splice(+el.dataset.i, 1); c.flaws = joinFlaws(p); c.flawsOk = true; }
  else if(act === "flawBack" && c){ c.flaws = joinFlaws([...flawParts(c), el.dataset.v]); c.flawsOk = true; }
  else if(act === "flawOk" && c){ c.flawsOk = true; }
  else if(act === "cmd") return runCmd();
  else if(act === "undo"){ if(ui.undoPhotos && ui.undoPhotosFor === ui.undo){ ui.photos = ui.undoPhotos; ui.photos.forEach(x => idb("put", photoRecord(x))); } ui.undoPhotos = null; S = merge(JSON.parse(ui.undo)); (S.sales || []).forEach(saleSaved); ui.undo = null; ui.cmdMsg = "Undone."; ui.sel.clear(); }
  else if(act === "selAll"){ (ui.onlyCheck ? S.cards.filter(needsCheck) : toDecide()).forEach(x => ui.sel.add(x.id)); return render(); }
  else if(act === "selNone"){ ui.sel.clear(); return render(); }
  else if(act === "asLot"){ ui.undo = JSON.stringify(S); ui.cmdMsg = combineLot(); ui.selMsg = ""; ui.sel.clear(); }
  else if(act === "asSingles" || act === "asYearLot" || act === "asPage"){
    ui.selMsg = act === "asSingles" ? assignSingles() : act === "asYearLot" ? assignYearLots() : assignPage(numOrNull(ui.pagePrice));
    if(!ui.selMsg.startsWith("Enter")) ui.sel.clear();
  }
  else if(act === "single" || act === "keeplot"){ const h = el.closest("[data-sid]"); if(h) setAside(h.dataset.sid, act === "single" ? "single" : "lot"); }
  else if(act === "anchorIn"){ const h = el.closest("[data-sid]"), f = h && findCard(h.dataset.sid), lot = f && !f.lot && anchorTarget(f.c); if(lot) anchorInto(f.c, lot); }
  else if(act === "singleAll"){ singleCandidates().map(x => [x, pullAdvice(x)]).forEach(([x, a]) => { if(a.rec === "single") setAside(x.c.id, "single"); else if(x.lot) setAside(x.c.id, "lot"); else if(x.target) anchorInto(x.c, x.target); }); }
  else if(act === "preset"){ ui.planDraft = PRESETS[+el.dataset.i]; return render(); }
  else if(act === "unplan"){ S.cards.forEach(x => { if(x.isLot) x.manual = false; }); unlotAll(); S.cards.forEach(x => { if(x.status === "open"){ detach(x); delete x.section; } }); S.plan = null; ui.planMsg = ui.selMsg = ""; ui.sel.clear(); }
  else if(act === "unlot" && c && c.isLot){ const i = S.cards.indexOf(c); c.members.forEach(m => { detach(m); delete m.section; }); S.cards.splice(i, 1, ...c.members); }
  else if(act === "gclear"){ S.grades = []; }
  else if(act === "paid"){
    S.cards.filter(c => c.status === "claimed" && c.claimBy === el.dataset.o).forEach(c => {
      c.status = "sold"; c.soldPrice = c.soldPrice ?? priceOf(c); c.soldAt = Date.now();
      S.solds = S.solds.filter(s => s.cardId !== c.id);
      if(c.soldPrice != null && !c.example) S.solds.unshift({cardId:c.id, year:c.year, set:c.set, num:c.num, player:c.player, variation:c.variation, grade:c.grade, price:c.soldPrice, date:c.soldAt});
    });
  }
  else if(act === "csv"){ const ready = shipOrders().filter(x => x.addr && !x.o.shippedAt); if(ready.length) downloadText("reddit-sales-orders-" + new Date().toISOString().slice(0, 10) + ".csv", shipCsv(ready)); return; }
  else if(act === "shipped" || act === "delivered"){ const o = (S.orders = S.orders || {})[el.dataset.o] = S.orders[el.dataset.o] || {}; if(act === "shipped") o.shippedAt = Date.now(); else o.delivered = true; }
  else if(act === "loadCommunity"){ ui.community = null; ui.communityMsg = ""; return render(); }
  else if(act === "radarSave"){
    if(!cap.token){ ui.radarMsg = "Saved on this device. Sign in to send it."; }
    else { try{ await api("/api/hunt", {method:"POST", json:S.radar}); ui.radarMsg = "Sent."; }catch(err){ ui.radarMsg = "Saved on this device, but it could not be sent."; } }
  }
  save(); render();
});
document.addEventListener("change", e => {
  const t = e.target;
  if(t.id === "file"){ const f = [...t.files]; t.value = ""; if(f.length) (ui.oneCard ? scanOne(f) : scan(f)); return; }
  if(t.dataset.sel){ if(t.checked) ui.sel.add(t.dataset.sel); else ui.sel.delete(t.dataset.sel); return render(); }
  if(t.id === "pageprice"){ ui.pagePrice = t.value; return; }
  if(t.id === "plistfile"){ const fs = [...t.files]; t.value = ""; if(fs.length) priceList(fs); return; }
  if(t.id === "plisttext"){ ui.listText = t.value; return; }
  if(t.id === "pagename"){ ui.pageName = t.value; return; }
  if(t.id === "pfile"){ const fs = [...t.files]; t.value = ""; if(fs.length > 1) loadMany(fs); else if(fs[0]) loadPhoto(fs[0]); return; }
  if(t.id === "ph-target" && ui.photo){ setPhotoTarget(t.value); return render(); }
  if((t.id === "ph-title" || t.id === "ph-note") && ui.photo){ for(const x of pagePhotos(ui.photo)){ x[t.id.slice(3)] = t.value; x.out = null; if(x !== ui.photo) idb("put", photoRecord(x)); } return render(); }
  if(t.id === "ph-tag" && ui.photo){ ui.photo.tagText = t.value === (photoQueue()[ui.photo.qi] ?? "") ? null : t.value; return; }
  if(t.id === "backfile"){ const fs = [...t.files]; t.value = ""; if(fs.length && ui.backFor) queuePhotos(ui.backFor, fs); return; }
  if(t.id === "onecard"){ ui.oneCard = t.checked; return; }
  if(t.dataset.gp){ ui.grpPrice[t.dataset.gp] = t.value; return; }
  if(t.dataset.rq){ const q = ui.rq[t.dataset.rq]; if(q) q.note = t.value; return; }
  if(t.id === "onlycheck"){ ui.onlyCheck = t.checked; return render(); }
  if(t.dataset.clr){ (ui.clearPick = ui.clearPick || {})[t.dataset.clr] = t.checked; ui.clearConfirm = false; return render(); }
  if(t.dataset.plink && ui.photo){ const pc = pcard(t.dataset.plink); if(pc){ pc.invId = t.value || null; pc.matched = !!t.value; pc.price = null; pc.text = ""; ui.photo.askAdd = ui.photo.askAdd && photoExtra(ui.photo).length > 0; relabel(); ui.photo.msg = t.value ? "Linked to your Review card. The tag now uses that ask." : "Unlinked from Review."; save(); } return render(); }
  if(t.dataset.pref && ui.photo){ const v = Number(String(t.value).replace(/[^0-9.]/g, "")); ui.photo.msg = photoPrice([t.dataset.pref], v); relabel(); save(); return render(); }
  if(t.id === "pselmode"){ ui.photoSelect = t.checked; if(!t.checked && ui.photo) ui.photo.selRefs = []; return render(); }
  if(t.id === "paskval"){ ui.photoAsk = t.value; return; }
  if(t.id === "pinstr"){ ui.photoInstr = t.value; return; }
  if(t.id === "ptagsize"){ setTagStyle(Number(t.value), null); return render(); }
  if(t.id === "ptagtext"){ ui.photoText = t.value; return; }
  if(t.id === "plantext"){ ui.planDraft = t.value; return; }
  if(t.id === "q") { ui.q = t.value; return render(); }
  if(t.id === "gfile"){ for(const f of t.files) ui.pending.push({id:uid(), file:f, name:f.name, truth:null}); t.value = ""; ui.gradeMsg = ""; return render(); }
  if(t.id === "g-hide"){ ui.hide = Math.max(0, Math.min(50, numOrNull(t.value) ?? 22)); return; }
  if(t.dataset.o){
    const o = (S.orders = S.orders || {})[t.dataset.o] = S.orders[t.dataset.o] || {}, f = t.dataset.of;
    o[f] = f === "oz" ? numOrNull(t.value) : t.value.trim();
    if(f === "tracking" && o.tracking && !o.shippedAt) o.shippedAt = Date.now();
    save(); return render();
  }
  if(t.dataset.p){ const p = ui.pending.find(x => x.id === t.dataset.p); if(p) p.truth = numOrNull(t.value); return; }
  if(t.id && t.id.startsWith("set-")){ const k = t.id.slice(4); S.settings[k] = t.type === "checkbox" ? t.checked : k === "discount" ? Math.max(0, Math.min(60, numOrNull(t.value) ?? 15)) : t.value; save(); return render(); }
  if(t.id && t.id.startsWith("rad-")){ S.radar[t.id.slice(4)] = t.value; save(); return; }
  const li = t.closest("li[data-id]"), c = li && S.cards.find(x => x.id === li.dataset.id), f = t.dataset.f;
  if(!c || !f) return;
  if(["comp","price","soldPrice"].includes(f)) c[f] = numOrNull(t.value);
  else if(f === "flawAdd"){ if(t.value.trim()){ c.flaws = joinFlaws([...flawParts(c), t.value.trim()]); c.flawsOk = true; } }
  else if(f === "claimBy"){ c.claimBy = t.value.replace(/^u\//, "").trim(); if(c.claimBy && c.status === "open"){ c.status = "claimed"; c.claimAt = Date.now(); } }
  else if(f === "status"){
    const was = c.status; c.status = t.value;
    if(t.value === "claimed" && !c.claimAt) c.claimAt = Date.now();
    if(t.value === "open"){ c.claimBy = ""; c.claimAt = null; c.claimNote = ""; }
    if(t.value === "sold" && was !== "sold"){ c.soldPrice = c.soldPrice ?? priceOf(c); c.soldAt = Date.now(); }
  } else c[f] = t.value;
  if(c.example && f !== "status") delete c.example;
  /* keep the sold log in step with rows marked paid */
  S.solds = S.solds.filter(s => s.cardId !== c.id);
  if(c.status === "sold" && c.soldPrice != null && !c.example) S.solds.unshift({cardId:c.id, year:c.year, set:c.set, num:c.num, player:c.player, variation:c.variation, grade:c.grade, price:c.soldPrice, date:c.soldAt || Date.now()});
  save(); render();
});

document.addEventListener("input", e => { if(e.target.id === "cmd") ui.cmd = e.target.value; else if(e.target.dataset && e.target.dataset.rq){ const q = ui.rq[e.target.dataset.rq]; if(q) q.note = e.target.value; } else if(e.target.dataset && e.target.dataset.gp) ui.grpPrice[e.target.dataset.gp] = e.target.value; else if(e.target.id === "pinstr") ui.photoInstr = e.target.value; else if(e.target.id === "plisttext") ui.listText = e.target.value; else if(e.target.id === "pagename") ui.pageName = e.target.value; else if(e.target.id === "paskval") ui.photoAsk = e.target.value; else if(e.target.id === "ptagtext") ui.photoText = e.target.value; else if(e.target.id === "ptagsize" && ui.photo){ ui.photo.scale = Number(e.target.value); drawPhoto(); const n = e.target.parentNode.querySelector(".note"); if(n) n.textContent = Math.round(ui.photo.scale * 100) + "%"; } });
document.addEventListener("click", e => { const sm = e.target.closest && e.target.closest("summary"), d = sm && sm.parentElement; if(d && d.dataset && d.dataset.dk) ui.dopen[d.dataset.dk] = !d.open; }, true);
document.addEventListener("keydown", e => { if(e.target.id === "pinstr" && e.key === "Enter"){ e.preventDefault(); ui.photoInstr = e.target.value; photoInstr(); return; } if(e.target.id === "cmd" && e.key === "Enter"){ e.preventDefault(); ui.cmd = e.target.value; runCmd(); } });
loadLocal(); purgeAddresses(); render(); loadPhotos(); init(makeSupabase);
}
