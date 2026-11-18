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
let ui = {busy:"", scanMsg:"", claimMsg:"", community:null, communityMsg:"", q:"", radarMsg:""};

function loadLocal(){ try{ const r = localStorage.getItem(LS_KEY); if(r){ const d = JSON.parse(r); if(d && Array.isArray(d.cards)) S = merge(d); } }catch(e){} }
function merge(d){ return {...S, ...d, settings:{...S.settings, ...(d.settings||{})}, radar:{...S.radar, ...(d.radar||{})}}; }
let saveT = null, writing = Promise.resolve();
function save(){
  S.updatedAt = Date.now();
  try{ localStorage.setItem(LS_KEY, JSON.stringify(S)); }catch(e){}
  clearTimeout(saveT);
  saveT = setTimeout(() => { if(!cap.token) return;
    const snapshot = JSON.parse(JSON.stringify(S)), at = S.updatedAt;
    writing = writing.then(() => api("/api/state", {method:"PUT", json:{state: snapshot, updatedAt: at}})).catch(() => {});
    if(S.settings.share) writing = writing.then(() => api("/api/solds", {method:"PUT", json:{items: S.solds.map(({year,set,num,player,grade,price,date}) => ({year,set,num,player,grade,price,date}))}})).catch(() => {});
  }, 1200);
}
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
  try{ const d = await api("/api/state"); if(d && d.state && d.updatedAt > S.updatedAt) S = merge(d.state); }catch(e){}
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
      S.cards.push({id:uid(), status:"open", year:c.year ?? "", set:c.set ?? "", num:c.num ?? "", player:c.player ?? "Unidentified card", variation:c.variation ?? "", grade:c.grade ?? "", flaws:c.flaws ?? "", conf:typeof c.conf === "number" ? c.conf : .5, needsBack:!!c.needsBack, aiLow:numOrNull(c.aiLow), aiHigh:numOrNull(c.aiHigh), where:c.where ?? "", comp:null, price:null});
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
function vInventory(){
  const open = S.cards.filter(c => c.status !== "sold");
  const total = S.cards.reduce((a, c) => a + (c.status !== "sold" ? (priceOf(c) || 0) : 0), 0);
  const unpriced = open.filter(c => priceOf(c) == null).length;
  const hasEx = S.cards.some(c => c.example);
  return `<section class="view">
  <div class="panel">
    <h2>Scan a table</h2>
    <div class="drop">
      <p class="grow">Drop in a short video sweep or a batch of photos. A video is cut down to its sharpest frames before anything is read, so move slowly and keep the cards flat.</p>
      <div class="row">
        <input type="file" id="file" accept="image/*,video/*" multiple hidden>
        <button class="primary" data-act="pick" ${ui.busy ? "disabled" : ""}>Choose photos or video</button>
        <button data-act="add">Add a row by hand</button>
      </div>
    </div>
    <p id="scanmsg" class="${ui.busy ? "progress busy" : "note"}">${esc(ui.busy || ui.scanMsg || "One photo of a whole table works: a large photo is cut into full-detail crops and each crop is read. Use your phone's highest resolution, shoot straight down, avoid glare.")}</p>
  </div>
  ${singlesPanel()}
  ${planPanel()}
  ${hasEx ? `<p class="flag">These rows are examples, including the comp figures. They clear when you scan, or <a href="#" data-act="clearEx">clear them now</a>.</p>` : ""}
  <div class="panel">
    <div class="row" style="justify-content:space-between">
      <h2>${S.cards.length} row${S.cards.length === 1 ? "" : "s"} <span class="note">${money(total) || "$0"} listed${unpriced ? ", " + unpriced + " unpriced" : ""}</span></h2>
      <label class="inline">Sort <select id="set-sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${(S.settings.sort || "added") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="inline">Price <input class="money" id="set-discount" type="number" min="0" max="60" value="${esc(S.settings.discount)}" style="width:60px">% under comp</label>
    </div>
    <p class="note">Every scanned card is priced straight away from an AI estimate of recent solds, less your discount. Enter a real sold price under Comp to replace the estimate, or type a sub price to override. The post follows the sort order you pick here.</p>
    <ul class="cards">${ordered().map(rowInv).join("") || `<li><span class="note">Nothing yet. Scan a table or add a row.</span></li>`}</ul>
  </div></section>`;
}
function rowInv(c){
  const low = (c.conf ?? 1) < .75, p = priceOf(c), mid = c.aiLow != null && c.aiHigh != null ? Math.round((c.aiLow + c.aiHigh) / 2) : null;
  return `<li data-id="${c.id}">
    <div><div class="ttl">${esc(title(c))} ${c.status === "sold" ? `<span class="stamp">SOLD</span>` : c.status === "claimed" ? `<span class="chip ok">claimed${c.claimBy ? " u/" + esc(c.claimBy) : ""}</span>` : ""}</div>
      <div class="meta">${esc([c.grade, c.flaws].filter(Boolean).join(" · "))}${c.where ? " · " + esc(c.where) : ""}</div></div>
    <div class="nums">
      <label>Comp<input class="money" data-f="comp" inputmode="decimal" value="${c.comp ?? ""}" placeholder="$"></label>
      <label>Sub price<input class="money" data-f="price" inputmode="decimal" value="${c.price ?? ""}" placeholder="${p != null && c.price == null ? p : "$"}"></label>
    </div>
    <div class="links">
      ${c.isLot ? `<span class="chip ok">lot of ${c.members.length}</span><button class="small" data-act="unlot">Break lot apart</button>` : ""}
      ${c.pin === "single" ? `<span class="chip ok">set aside as a single</span>` : ""}
      ${low ? `<span class="chip warn">low confidence ${Math.round((c.conf || 0) * 100)}%</span>` : ""}
      ${c.needsBack ? `<span class="chip warn">check the back</span>` : ""}
      ${mid != null ? `<span class="chip" title="From the model's general knowledge. Not a sold comp.">${c.comp == null && c.price == null ? "Priced from AI estimate" : "AI estimate"} ${money(c.aiLow)} to ${money(c.aiHigh)}, not a sold comp</span>` : ""}
      ${links(c)}
    </div>
    <details class="edit"><summary>Edit details</summary><div class="fields">
      ${[["year","Year"],["set","Set"],["num","Card #"],["player","Player or lot name"],["variation","Variation"],["grade","Grade"],["flaws","Flaws"],["compSrc","Comp source"]].map(([f, l]) => `<label>${l}<input data-f="${f}" value="${esc(c[f] ?? "")}"></label>`).join("")}
      <button class="small" data-act="del">Remove row</button></div></details>
  </li>`;
}

function buildPost(){
  const st = S.settings, rows = ordered().filter(c => priceOf(c) != null || c.status !== "open");
  const names = [...S.cards].sort((a, b) => (priceOf(b) || 0) - (priceOf(a) || 0)).slice(0, 3).map(c => [c.year, c.player].filter(Boolean).join(" "));
  const t = st.title.trim() || `[FS] ${names.join(", ")}${S.cards.length > 3 ? " and more" : ""} (${S.cards.length} lots)`;
  const comps = st.showComps && rows.some(c => c.comp != null);
  let b = (st.intro ? st.intro + "\n\n" : "") + `**Payment:** ${st.pay}  \n**Shipping:** ${st.ship}\n\n`;
  const head = `| # | Card | Condition | Price |${comps ? " Recent comp |" : ""}\n|:-|:-|:-|:-|${comps ? ":-|" : ""}\n`;
  rows.forEach((c, i) => {
    if(i === 0 || (c.section || "") !== (rows[i - 1].section || "")) b += (i ? "\n" : "") + (c.section ? "**" + c.section + "**\n\n" : "") + head;
    const cond = [c.grade, c.flaws].filter(Boolean).join(", ").replace(/\|/g, "/"), name = title(c).replace(/\|/g, "/");
    const pr = c.status === "sold" ? "**SOLD**" : c.status === "claimed" ? `${money(priceOf(c))} (pending)` : money(priceOf(c));
    b += `| ${i + 1} | ${c.status === "sold" ? "~~" + name + "~~" : name} | ${cond} | ${pr} |${comps ? " " + (c.comp != null ? money(c.comp) + (c.compSrc && c.compSrc !== "example" ? " " + c.compSrc : "") : "") + " |" : ""}\n`;
  });
  if(comps) b += `\nPrices are about ${st.discount}% under the comp shown, since there are no platform fees here.\n`;
  return {t, b, missing: S.cards.filter(c => c.status === "open" && priceOf(c) == null).length};
}
function vPost(){
  const st = S.settings, {t, b, missing} = buildPost();
  return `<section class="view"><div class="two">
  <div class="panel"><h2>Post settings</h2>
    <label>Title (leave blank to build it from your top cards)<input id="set-title" value="${esc(st.title)}" placeholder="${esc(t)}"></label>
    <label>Opening lines<textarea id="set-intro" style="min-height:70px;font-family:var(--body)">${esc(st.intro)}</textarea></label>
    <label>Payment<input id="set-pay" value="${esc(st.pay)}"></label>
    <label>Shipping<input id="set-ship" value="${esc(st.ship)}"></label>
    <label class="inline"><input type="checkbox" id="set-showComps" ${st.showComps ? "checked" : ""}> Show the comp beside each price</label>
    ${S.plan && S.plan.photos.length ? `<h3>Photos to take</h3><ol style="margin:0;padding-left:20px">${S.plan.photos.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    <p class="note">Check the subreddit's current posting rules before you post. Title format and timestamp requirements are set by the mods, and this draft does not replace them.</p>
  </div>
  <div class="panel"><h2>Draft</h2>
    ${missing ? `<p class="flag">${missing} row${missing === 1 ? " has" : "s have"} no price and ${missing === 1 ? "is" : "are"} left out of the table.</p>` : ""}
    <h3>Title</h3><textarea id="out-title" readonly style="min-height:44px">${esc(t)}</textarea>
    <div class="row"><button class="small" data-copy="out-title">Copy title</button></div>
    <h3>Body, Reddit markdown</h3><textarea id="out-body" readonly style="min-height:260px">${esc(b)}</textarea>
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

/* ---------- single suggestions: cards worth selling alone are pulled out for a one-tap decision ---------- */
const singleMin = () => Number(S.settings.singleMin ?? 20) || 0;
function singleCandidates(){
  const min = singleMin(), out = [];
  if(!min) return out;
  for(const c of S.cards){
    if(c.status !== "open") continue;
    if(c.isLot){ for(const m of c.members || []) if(!m.pin && (priceOf(m) || 0) >= min) out.push({c:m, lot:c}); }
    else if(!c.pin && !c.section && (priceOf(c) || 0) >= min) out.push({c});
  }
  return out;
}
function findCard(id){
  for(const c of S.cards){ if(c.id === id) return {c}; if(c.isLot){ const m = (c.members || []).find(x => x.id === id); if(m) return {c:m, lot:c}; } }
  return null;
}
function relot(lot){
  const sum = lot.members.reduce((a, c) => a + (priceOf(c) || 0), 0), unpriced = lot.members.some(c => priceOf(c) == null);
  lot.price = sum && !unpriced ? roundP(sum * (1 - Number(S.settings.lotDiscount ?? 10) / 100)) : null;
  lot.player = lot.player.replace(/\(\d+ cards\)$/, "(" + lot.members.length + " cards)");
}
function setAside(id, choice){
  const f = findCard(id); if(!f) return;
  f.c.pin = choice;
  if(choice !== "single" || !f.lot) return;
  const lot = f.lot;
  lot.members = lot.members.filter(m => m !== f.c);
  let sec = "";
  if(S.plan){
    const firstSingle = S.cards.find(x => x.status === "open" && !x.isLot && x.section);
    sec = firstSingle ? firstSingle.section : "Singles";
    if(!S.plan.sections.includes(sec)) S.plan.sections.unshift(sec);
  }
  f.c.section = sec;
  if(lot.members.length < 2){ lot.members.forEach(m => { m.section = lot.section; }); S.cards.splice(S.cards.indexOf(lot), 1, ...lot.members); }
  else relot(lot);
  let at = -1; S.cards.forEach((x, k) => { if(!x.isLot && x.section === sec && x.status === "open") at = k; });
  S.cards.splice(at + 1, 0, f.c);
}
function singlesPanel(){
  if(!S.cards.some(c => c.status === "open")) return "";
  const cs = singleCandidates(), min = singleMin();
  return `<div class="panel pick"><div class="row" style="justify-content:space-between"><h2>Set aside as singles${cs.length ? ` <span class="note">${cs.length} suggested</span>` : ""}</h2>
    <label class="inline">Suggest at $<input class="money" id="set-singleMin" inputmode="decimal" value="${esc(S.settings.singleMin ?? 20)}" style="width:64px"> and up</label></div>
    ${cs.length ? `<p class="note">These are worth enough to sell on their own. Agree and the tool keeps them out of the lots.</p>
    <ul class="cards">${cs.map(({c, lot}) => `<li data-sid="${c.id}"><div><div class="ttl">${esc(title(c))} <span class="chip ok">${money(priceOf(c))}</span></div><div class="meta">${esc([c.grade, lot ? "now in " + lot.player : c.where].filter(Boolean).join(" · "))}</div></div>
      <div class="nums"><button class="primary" data-act="single">Make it a single</button><button class="small" data-act="keeplot">Keep in the lot</button></div></li>`).join("")}</ul>
    ${cs.length > 1 ? `<div class="row"><button data-act="singleAll">Agree to all ${cs.length}</button></div>` : ""}`
    : `<p class="note">No undecided cards at $${min} or more right now.</p>`}
  </div>`;
}

/* ---------- sale plan: the seller describes the sale, the tool shapes singles, lots, title and photo list around it ---------- */
const PRESETS = [
  "A page or two of singles first, best cards up top. Everything else in lots, mostly by year.",
  "All singles, highest price first.",
  "Stars and Hall of Famers as singles. Commons bundled into lots by set and year.",
  "Team lots where I have five or more of a team. Singles for the rest."
];
function unlotAll(){
  const out = [];
  for(const c of S.cards){ if(c.isLot && c.status === "open" && Array.isArray(c.members)) out.push(...c.members); else out.push(c); }
  S.cards = out;
}
function applyPlan(r, text){
  const open = new Map(S.cards.filter(c => c.status === "open").map(c => [c.id, c]));
  const rest = S.cards.filter(c => c.status !== "open"), out = [], names = [], pinned = [];
  const bundle = 1 - Number(S.settings.lotDiscount ?? 10) / 100;
  for(const sec of (r.sections || [])){
    const name = String(sec.name || "Cards"); names.push(name);
    for(const id of (sec.rows || [])){ const c = open.get(id); if(c){ open.delete(id); c.section = name; out.push(c); } }
    for(const lot of (sec.lots || [])){
      const members = (lot.rows || []).map(id => { const c = open.get(id); if(c) open.delete(id); return c; }).filter(Boolean);
      const pulled = members.filter(c => c.pin === "single");
      if(pulled.length){ pinned.push(...pulled); pulled.forEach(c => members.splice(members.indexOf(c), 1)); }
      if(!members.length) continue;
      if(members.length === 1){ members[0].section = name; out.push(members[0]); continue; }
      const sum = members.reduce((a, c) => a + (priceOf(c) || 0), 0), unpriced = members.some(c => priceOf(c) == null);
      out.push({id:uid(), status:"open", isLot:true, members, section:name, year:"", set:"", num:"", player:String(lot.name || "Lot") + " (" + members.length + " cards)", grade:String(lot.condition || ""), flaws:lot.highlights ? "includes " + lot.highlights : "", conf:1, comp:null, price: sum && !unpriced ? roundP(sum * bundle) : null});
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
    unlotAll();
    const rows = S.cards.filter(c => c.status === "open").map(c => ({id:c.id, card:title(c), grade:c.grade || "", price:priceOf(c), pin:c.pin || null}));
    const r = await ai("plan", {text, rows});
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

/* ---------- render + events ---------- */
const VIEWS = {inventory:vInventory, post:vPost, claims:vClaims, sold:vSold, ship:vShip, grade:vGrade, radar:vRadar};
function render(){
  const name = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "inventory";
  document.querySelectorAll("#nav a").forEach(a => a.getAttribute("href") === "#" + name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  $("#n-inv").textContent = S.cards.length || "";
  $("#n-claims").textContent = S.cards.filter(c => c.status === "claimed").length || "";
  $("#main").innerHTML = VIEWS[name]();
  renderAuth();
  if(name === "sold" && ui.community == null && !ui.communityMsg) loadCommunity();
}
addEventListener("hashchange", render);

document.addEventListener("click", async e => {
  const cp = e.target.closest("[data-copy]");
  if(cp){ const ta = $("#" + cp.dataset.copy); try{ await navigator.clipboard.writeText(ta.value); cp.textContent = "Copied"; }catch(_){ ta.focus(); ta.select(); cp.textContent = "Selected, press copy"; } return; }
  const el = e.target.closest("[data-act]"); if(!el) return;
  const act = el.dataset.act, li = el.closest("li[data-id]"), c = li && S.cards.find(x => x.id === li.dataset.id);
  if(act === "pick") return $("#file").click();
  if(act === "gpick") return $("#gfile").click();
  if(act === "signin"){ const em = $("#auth-email").value.trim(); if(!em) return; ui.authMsg = "Sending"; const {error} = await cap.sb.auth.signInWithOtp({email: em, options:{emailRedirectTo: location.origin}}); ui.authMsg = error ? "Could not send: " + error.message : "Check your email for the link."; document.activeElement && document.activeElement.blur(); return renderAuth(); }
  if(act === "signout"){ await cap.sb.auth.signOut(); return; }
  if(act === "grun") return runGrades();
  e.preventDefault();
  if(act === "add"){ if(S.cards.every(x => x.example)) S.cards = []; S.cards.push({id:uid(), status:"open", year:"", set:"", num:"", player:"New card", grade:"", flaws:"", conf:1, comp:null, price:null}); }
  else if(act === "clearEx"){ S.cards = S.cards.filter(x => !x.example); }
  else if(act === "del" && c){ S.cards = S.cards.filter(x => x !== c); }
  else if(act === "match") return matchClaims();
  else if(act === "plan") return runPlan();
  else if(act === "single" || act === "keeplot"){ const h = el.closest("[data-sid]"); if(h) setAside(h.dataset.sid, act === "single" ? "single" : "lot"); }
  else if(act === "singleAll"){ singleCandidates().forEach(x => setAside(x.c.id, "single")); }
  else if(act === "preset"){ ui.planDraft = PRESETS[+el.dataset.i]; return render(); }
  else if(act === "unplan"){ unlotAll(); S.cards.forEach(x => { delete x.section; }); S.plan = null; ui.planMsg = ""; }
  else if(act === "unlot" && c && c.isLot){ const i = S.cards.indexOf(c); S.cards.splice(i, 1, ...c.members); }
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
  if(t.id === "file"){ const f = [...t.files]; t.value = ""; if(f.length) scan(f); return; }
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

loadLocal(); purgeAddresses(); render(); init(makeSupabase);
}
