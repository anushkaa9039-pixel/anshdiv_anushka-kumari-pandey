import { INTERESTS, EVENT_TYPES, BENEFITS, CITIES, rank, validateEvent, validatePoster, parseMapLink, haversine, makePeople, reach, streak, weekOf, parseEventText, shareKit,
  hueOf, cleanName, affinity, suggestReason, sniffImage, greeting, eventLabel, icsFor, googleCalUrl, icsFilename, inviteLink, safePoster, formatDate, deadlineInfo, formatPrice, formatKm, dateIn } from "./core.js";
import { MODE_TEXT, TABS, CAL_KEYS, sections, keyFacts, whenText, longDate } from "./detail.js";
import { EVENTS } from "./data.js";
import { analyze, loadEvents, publishEvent, loadDoubts, postDoubt } from "./api.js";
import { $, h, msg, toast, showErrors } from "./dom.js";
import { store } from "./store.js";

const LABEL = Object.fromEntries(INTERESTS), people = makePeople(240);
const place = store.get("nk:place", null);
const state = { events: [...EVENTS], origin: place ? { lat: place.lat, lng: place.lng } : null, where: place?.where ?? "", nearbyKm: 25, interest: "all", type: "all", mode: "all", when: "any", price: "any", query: "",
  profile: store.get("nk:profile", null), following: store.get("nk:follow", []), history: store.get("nk:history", []), going: new Set(store.get("nk:going", [])), weeks: store.get("nk:weeks", []), pin: null, poster: null };
const first = () => (state.profile?.name ?? "").split(" ")[0];
const aff = () => (state.history.length ? affinity(state.history) : null);
const why = (e) => { const r = suggestReason(e, state.profile, aff()); return r ? [h("p", { class: "reason" }, `Suggested for you: ${r}`)] : []; };
const placeText = (e) => (e.mode === "online" ? "Online" : `${[e.city, e.state || e.country].filter(Boolean).join(", ")}${e.mode === "hybrid" ? " + online" : ""}`);
const goingCount = (e) => (e.joined ?? 0) + (state.going.has(e.id) ? 1 : 0);

function posterEl(e) {
  if (e.poster) return h("img", { class: "poster", src: e.poster, alt: `Poster for ${e.title}` });
  return h("div", { class: "poster gen", vars: { "--h": hueOf(e.title) }, "aria-hidden": "true" }, LABEL[e.interests[0]] ?? "Event");
}
const tagList = (e, n = 2) => h("p", { class: "tags" }, h("span", { class: "kind" }, eventLabel(e.type)), h("span", { class: "kind" }, MODE_TEXT[e.mode]),
  ...(e.followed ? [h("span", { class: "kind" }, "Following")] : []), ...e.interests.slice(0, n).map((i) => h("span", {}, LABEL[i])));
const channels = (e) => { const c = [["whatsapp", "Community"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["website", "Website"]].filter(([k]) => e[k]).map(([, n]) => n); return c.length ? [h("p", { class: "hint" }, `Also on: ${c.join(" · ")}`)] : []; };

function card(e) {
  const dl = deadlineInfo(e);
  const open = h("button", { class: "btn ghost small", type: "button", "aria-label": `View details for ${e.title}` }, "View details");
  open.addEventListener("click", () => openEvent(e));
  return h("li", { class: "card" }, posterEl(e), e.match != null ? h("span", { class: "badge" }, `${e.match}% match`) : "",
    h("div", { class: "cbody" }, h("h3", {}, e.title), h("p", { class: "meta" }, `${e.host} · ${whenText(e)}`), tagList(e),
      h("p", { class: "meta" }, `${placeText(e)} · ${formatPrice(e.price, e.currency)}`),
      ...(dl.text ? [h("p", { class: `dl ${dl.state}` }, dl.text)] : []), ...channels(e), ...why(e),
      h("div", { class: "cfoot" }, h("strong", {}, e.mode === "online" ? "Online" : formatKm(e.km) || e.city), open)));
}

function renderList() {
  const rows = rank(state.events, { ...state, history: state.history }), n = first(), searching = state.query.trim() !== "";
  const signal = state.profile || state.history.length;
  const picks = signal && !searching ? rows.filter((e) => suggestReason(e, state.profile, aff())).sort((a, b) => (b.match ?? 0) - (a.match ?? 0)).slice(0, 3) : [];
  const pool = rows.filter((e) => !picks.includes(e));
  const near = state.origin && !searching ? pool.filter((e) => e.nearby) : [];
  const rest = pool.filter((e) => !near.includes(e));
  $("#nudge").hidden = !!signal;
  msg("#hello", n ? `${greeting(new Date().getHours())}, ${n}` : "Hey there,");
  $("#picks").hidden = !picks.length;
  msg("#picks-t", n ? `Suggested for you, ${n}` : "Suggested for you");
  $("#picksList").replaceChildren(...picks.map(card));
  $("#nearSec").hidden = !near.length;
  msg("#near-t", `Pinned near you, ${state.where}`);
  $("#nearList").replaceChildren(...near.map(card));
  msg("#rest-t", searching ? `Results for "${state.query.trim()}"` : near.length ? "Explore everywhere" : "All events");
  msg("#restHint", searching || state.origin ? "" : "Choose your city on the left to pin nearby events first.");
  $("#list").replaceChildren(...(rest.length ? rest.map(card) : [h("li", {}, rows.length ? "That's everything for these filters." : "No events match. Try a different search or clear a filter.")]));
  msg("#count", `${rows.length} ${rows.length === 1 ? "event" : "events"} found`);
  msg("#locMsg", state.origin ? `Pinning events within ${state.nearbyKm} km of ${state.where}.` : "Choose your city to pin nearby events.");
  $("#city").value = CITIES.some((c) => c.name === state.where) ? state.where : "";
  const a = $("#navProfile");
  a.textContent = n || "My profile";
  a.setAttribute("aria-label", n ? `My profile, ${n}` : "My profile");
}

const button = (text, onClick) => { const b = h("button", { class: "btn ghost small", type: "button" }, text); b.addEventListener("click", onClick); return b; };
const ext = (href, text) => h("a", { class: "btn ghost small", href, target: "_blank", rel: "noopener noreferrer" }, text);
let calUrl = null; // object URL for the open event's .ics file; released when the dialog closes
const revokeCal = () => { if (calUrl) URL.revokeObjectURL(calUrl); calUrl = null; };
/**
 * Calendar choices shown in place, so this page never navigates. The .ics link is a real download link that the
 * person taps themselves (a script-clicked blob link makes some phone and in-app browsers open the blob instead).
 * Google Calendar is an explicit, labelled new-tab link.
 */
function calendarMenu(e) {
  const trigger = h("button", { class: "btn ghost small", type: "button", "aria-expanded": "false", "aria-controls": "calMenu" }, e.date ? "Add to calendar" : "Remind me before the deadline");
  const menu = h("div", { class: "calmenu", id: "calMenu", hidden: "" });
  trigger.addEventListener("click", () => {
    const opening = menu.hidden;
    if (opening && !menu.children.length) {
      revokeCal();
      calUrl = URL.createObjectURL(new Blob([icsFor(e)], { type: "text/calendar;charset=utf-8" }));
      const file = h("a", { class: "btn small", href: calUrl, download: icsFilename(e) }, "Download calendar file (.ics)");
      file.addEventListener("click", () => toast(e.date ? "Calendar file saved. Open it to add the event." : "Reminder file saved. Open it to add the deadline."));
      menu.append(file, ext(googleCalUrl(e), "Google Calendar (opens a new tab)"), h("p", { class: "hint" }, "The .ics file works with Apple, Outlook and most calendar apps."));
    }
    menu.hidden = !opening; trigger.setAttribute("aria-expanded", String(opening));
  });
  return [trigger, menu];
}
function followBtn(e) {
  const key = e.host.toLowerCase(), on = () => state.following.includes(key);
  const b = h("button", { class: "btn ghost small", type: "button", "aria-pressed": String(on()) }, on() ? "Following host" : "Follow host");
  b.addEventListener("click", () => {
    state.following = on() ? state.following.filter((x) => x !== key) : [...state.following, key];
    store.set("nk:follow", state.following);
    b.setAttribute("aria-pressed", String(on())); b.textContent = on() ? "Following host" : "Follow host";
    toast(on() ? `You'll see ${e.host} first from now on.` : `Unfollowed ${e.host}.`);
    renderList();
  });
  return b;
}

function doubtsBox(e) {
  const list = h("div", { class: "threads" }, h("p", { class: "hint" }, "Loading..."));
  const ta = h("textarea", { rows: "2", maxlength: "300", "aria-label": "Your question or answer" });
  const post = h("button", { class: "btn small", type: "button" }, "Post");
  const note = h("p", { class: "hint", role: "status" });
  let replyTo = null;
  const draw = (items) => list.replaceChildren(...(items.some((x) => x.replyTo === null) ? items.filter((x) => x.replyTo === null).map((q) => h("div", { class: "thread" },
    h("p", {}, h("strong", {}, q.name), ": ", q.text), ...items.filter((r) => r.replyTo === q.id).map((r) => h("p", { class: "reply" }, h("strong", {}, r.name), ": ", r.text)),
    button("Reply", () => { replyTo = q.id; note.textContent = `Replying to ${q.name}`; ta.focus(); }))) : [h("p", { class: "hint" }, "No questions yet. Be the first to ask.")]));
  const load = async () => { const items = await loadDoubts(e.id); items ? draw(items) : list.replaceChildren(h("p", { class: "hint" }, "The discussion is available when the server is running.")); };
  post.addEventListener("click", async () => {
    const text = ta.value.trim();
    if (!text) { note.textContent = "Write something first."; return; }
    post.disabled = true;
    const r = await postDoubt(e.id, { name: first() || "Guest", text, replyTo });
    post.disabled = false;
    if (r?.status !== 201) { note.textContent = r ? "Couldn't post that. Keep it under 300 characters and try again." : "The discussion needs the server running."; return; }
    ta.value = ""; replyTo = null; note.textContent = ""; load();
  });
  load();
  return h("section", { class: "doubts", "aria-labelledby": "dbT" }, h("h3", { id: "dbT" }, "Ask the community"), h("p", { class: "hint" }, "Questions about rules, teams or the venue. Anyone can answer."), list, ta, h("div", { class: "row" }, post), note);
}

const factsDl = (rows) => h("dl", { class: "facts" }, ...rows.flatMap(([k, v, href]) => [h("dt", {}, k), h("dd", {}, href ? h("a", { href }, v) : v)]));
const emptyNote = (t) => (t ? [h("p", { class: "hint empty" }, t)] : []);
const bulletList = (items) => (items.length ? [h("ul", { class: "bullets" }, ...items.map((t) => h("li", {}, t)))] : []);

/** Read-only month calendars with the event's dates marked. The list under them says the same in words. */
function monthCalendar(m) {
  const cell = (c) => {
    if (!c) return h("td", { class: "pad" });
    const label = c.marks.map((x) => x.label).join(", ");
    return h("td", { class: `${c.marks.length ? "mark" : ""} ${c.today ? "today" : ""}`.trim(), ...(label ? { "aria-label": `${longDate(c.iso)}: ${label}` } : {}) },
      h("span", {}, String(c.day)), ...(c.marks.length ? [h("b", { "aria-hidden": "true" }, [...new Set(c.marks.map((x) => x.kind))].join(""))] : []));
  };
  return h("table", { class: "cal" }, h("caption", {}, m.title),
    h("thead", {}, h("tr", {}, ...["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => h("th", { scope: "col", abbr: d }, d[0])))),
    h("tbody", {}, ...m.weeks.map((w) => h("tr", {}, ...w.map(cell)))));
}

/** Accessible tabs (arrow keys, Home and End move between them). `panels` is [[id, title, nodes]]. */
function tabs(panels) {
  const list = h("div", { class: "tabs", role: "tablist", "aria-label": "Event information" });
  const btns = panels.map(([id, title]) => h("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": `panel-${id}` }, title));
  const bodies = panels.map(([id, title, nodes]) => h("div", { role: "tabpanel", id: `panel-${id}`, "aria-labelledby": `tab-${id}`, class: "tabpanel", tabindex: "0" }, ...nodes));
  const show = (i, focus = false) => {
    btns.forEach((b, j) => { b.setAttribute("aria-selected", String(i === j)); b.setAttribute("tabindex", i === j ? "0" : "-1"); bodies[j].hidden = i !== j; });
    if (focus) btns[i].focus();
  };
  btns.forEach((b, i) => b.addEventListener("click", () => show(i)));
  list.addEventListener("keydown", (ev) => {
    const i = btns.indexOf(document.activeElement), last = btns.length - 1;
    const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[ev.key];
    if (i < 0 || to === undefined) return;
    ev.preventDefault(); show(to, true);
  });
  list.append(...btns); show(0);
  return [list, ...bodies];
}

function openEvent(e) {
  const on = () => state.going.has(e.id);
  const join = h("button", { class: "btn", type: "button", "aria-pressed": String(on()) }, on() ? "You're in" : "I'm in");
  join.addEventListener("click", () => { toggle(e); join.setAttribute("aria-pressed", String(on())); join.textContent = on() ? "You're in" : "I'm in"; });
  const o = state.origin, now = new Date(), sec = sections(e, { now, where: state.where, going: goingCount(e) }), dl = deadlineInfo(e, now);
  const kf = h("dl", { class: "kf" }, ...keyFacts(e, now).map((k) => h("div", { class: `kf-item ${k.tone}` }, h("dt", {}, k.label), h("dd", {}, k.value, ...(k.note ? [h("span", { class: "kf-note" }, k.note)] : [])))));
  const when = (it) => h("li", { class: it.past ? "past" : "" }, h("strong", {}, it.label), it.date ? h("time", { datetime: it.date }, it.text) : h("span", {}, it.text),
    ...(it.extra ? [h("span", { class: "hint" }, it.extra)] : []), ...(it.when ? [h("span", { class: "when" }, it.when)] : []));
  const map = e.lat != null ? [h("iframe", { title: `Map showing where ${e.title} happens`, loading: "lazy", referrerpolicy: "no-referrer", sandbox: "allow-scripts allow-same-origin", src: `https://maps.google.com/maps?q=${e.lat},${e.lng}&z=15&output=embed` })] : [];
  const body = {
    details: [factsDl(sec.details.facts), h("h3", {}, "About"), h("p", { class: "pre" }, sec.details.about), ...map],
    dates: [...(sec.dates.note ? [h("p", { class: `dl ${dl.state}` }, sec.dates.note)] : []), h("div", { class: "cals" }, ...sec.dates.months.map(monthCalendar)),
      h("p", { class: "hint legend" }, CAL_KEYS.map(([k, t]) => `${k} = ${t}`).join(" \u00b7 ")), h("ol", { class: "timeline" }, ...sec.dates.schedule.map(when))],
    prizes: [factsDl(sec.prizes.facts), ...(sec.prizes.prizes.length ? [h("h3", {}, "Prizes"), h("ul", { class: "bullets" }, ...sec.prizes.prizes.map((p) => h("li", {}, h("strong", {}, p.place), ": ", p.reward)))] : emptyNote(sec.prizes.empty))],
    rules: [factsDl(sec.rules.facts), ...(sec.rules.bullets.length ? [h("h3", {}, "Rules"), ...bulletList(sec.rules.bullets)] : emptyNote(sec.rules.empty))],
    faqs: [...sec.faqs.faqs.map((f) => h("details", { class: "faq" }, h("summary", {}, f.q), h("p", {}, f.a))), ...emptyNote(sec.faqs.empty), doubtsBox(e)],
    contact: [factsDl(sec.contact.facts), ...emptyNote(sec.contact.empty), ...(sec.contact.links.length ? [h("div", { class: "row" }, ...sec.contact.links.map(([t, href]) => ext(href, t)))] : [])],
  };
  const [trigger, calMenu] = calendarMenu(e);
  $("#dlgBody").replaceChildren(posterEl(e), h("h2", { id: "dlgT" }, e.title), tagList(e, 4), ...why(e), kf,
    h("div", { class: "row" }, join, ...(e.website ? [ext(e.website, "Register")] : []), ...(e.lat != null && o ? [ext(`https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lng}&destination=${e.lat},${e.lng}`, "Get directions")] : []),
      trigger, ext(inviteLink(e, whenText(e)), "Invite a friend"), followBtn(e)), calMenu,
    ...tabs(TABS.map(([id, title]) => [id, title, body[id]])));
  $("#dlg").showModal();
}

function toggle(e) {
  if (state.going.has(e.id)) { state.going.delete(e.id); state.history = state.history.filter((x) => x.id !== e.id); }
  else { state.going.add(e.id); state.history = [...state.history.filter((x) => x.id !== e.id), { id: e.id, interests: e.interests, type: e.type, host: e.host }].slice(-30); }
  const wk = weekOf();
  if (state.going.size && !state.weeks.includes(wk)) state.weeks.push(wk);
  store.set("nk:going", [...state.going]); store.set("nk:weeks", state.weeks); store.set("nk:history", state.history);
  renderTrail(); renderList();
}
function renderTrail() {
  const n = streak(state.weeks);
  msg("#trail-p", n ? `${n}-week streak. Keep showing up.` : 'Say "I\'m in" to an event to earn your first stamp.');
  $("#stamps").replaceChildren(...Array.from({ length: 6 }, (_, i) => h("li", { class: i < n ? "on" : "", "aria-label": `Week ${i + 1} ${i < n ? "stamped" : "open"}` }, String(i + 1))));
}

function chipBoxes(box, name, max, checked = [], onChange = () => {}, list = INTERESTS) {
  box.replaceChildren(...list.map(([id, label]) => {
    const input = h("input", { type: "checkbox", name, value: id });
    input.checked = checked.includes(id);
    input.addEventListener("change", () => { if (box.querySelectorAll("input:checked").length > max) { input.checked = false; return; } onChange(); });
    return h("label", { class: "chip" }, input, h("span", {}, label));
  }));
}
const picked = (form, name) => [...form.querySelectorAll(`[name=${name}]:checked`)].map((i) => i.value);
const options = (sel, items) => sel.replaceChildren(...items.map(([v, t]) => h("option", { value: v }, t)));

function renderReach() {
  const f = $("#hostForm"), interests = picked(f, "interests"), mode = f.elements.mode.value, radius = +$("#reachR").value;
  const ev = { interests, level: f.elements.level.value, ...(state.pin ?? {}) };
  const physical = mode === "offline", r = interests.length ? reach(ev, people, physical ? (state.pin ? radius : -1) : Infinity) : null;
  const all = interests.length ? reach(ev, people, Infinity).count : 0;
  msg("#reachN", String(r && !(physical && !state.pin) ? r.count : 0));
  msg("#reachNote", !interests.length ? "Pick at least one domain to see who you can reach."
    : physical ? (state.pin ? `people within ${radius} km fit this event. Adding an online option would reach ${all} in total.` : "Pin the location to count people nearby.")
      : `people anywhere fit this event${state.pin ? `, ${reach(ev, people, radius).count} of them within ${radius} km` : ""}.`);
  $("#reachBars").replaceChildren(...((physical && !state.pin) || !r ? [] : r.tops.slice(0, 5).map(([id, n]) => h("li", {}, LABEL[id],
    h("span", { class: "bar", role: "img", "aria-label": `${n} people` }, h("i", { vars: { "--w": `${Math.round((100 * n) / Math.max(1, r.count))}%` } })), String(n)))));
}

function setPin(p) {
  state.pin = p;
  msg("#pinStatus", `Pinned ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}${state.origin ? ` · ${formatKm(haversine(state.origin, p))} from ${state.where}` : ""}`);
  $("#mapPrev").replaceChildren(h("iframe", { title: "Map preview of the pinned location", loading: "lazy", referrerpolicy: "no-referrer", sandbox: "allow-scripts allow-same-origin", src: `https://maps.google.com/maps?q=${p.lat},${p.lng}&z=15&output=embed` }));
  renderReach();
}
function setOrigin(o, where) {
  state.origin = { lat: o.lat, lng: o.lng }; state.where = where;
  store.set("nk:place", { ...state.origin, where });
  renderList();
}
const locate = () => new Promise((res, rej) => navigator.geolocation
  ? navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { timeout: 8000 }) : rej(new Error("unsupported")));

function renderKit(e) {
  $("#kitBody").replaceChildren(...Object.entries(shareKit(e, e.date ? formatDate(e.date) : "Date to be announced")).map(([name, text]) => {
    const ta = h("textarea", { readonly: "", rows: "3", "aria-label": `${name} post` }, text);
    const b = h("button", { class: "btn ghost small", type: "button" }, `Copy for ${name}`);
    b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; } catch { ta.select(); b.textContent = "Press Ctrl+C"; } });
    return h("div", { class: "kitrow" }, h("h3", {}, name), ta, b);
  }));
  $("#kit").hidden = false;
}

const pairRow = (fields) => h("div", { class: "faqrow" }, ...fields.map(([label, name, attrs]) => h("label", {}, label, h("input", { name, autocomplete: "off", ...attrs }))));
const faqRow = () => pairRow([["Question", "faqQ", { maxlength: "120" }], ["Answer", "faqA", { maxlength: "300" }]]);
const dateRow = () => pairRow([["Date name", "tlLabel", { maxlength: "40", placeholder: "Example: Idea submission closes" }], ["Date", "tlDate", { type: "date" }]]);
const prizeRow = () => pairRow([["Position", "pzPlace", { maxlength: "30", placeholder: "Example: Winner" }], ["Reward", "pzReward", { maxlength: "60", placeholder: "Example: \u20b950,000 and an internship interview" }]]);
const resetRows = () => { $("#faqs").replaceChildren(faqRow(), faqRow()); $("#timeline").replaceChildren(dateRow()); $("#prizes").replaceChildren(prizeRow()); };
const rowValues = (sel, a, b) => [...$(sel).querySelectorAll(".faqrow")].map((r) => [r.querySelector(`[name=${a}]`).value, r.querySelector(`[name=${b}]`).value]);
const addRow = (btn, box, make) => $(btn).addEventListener("click", () => { if ($(box).children.length < 5) $(box).append(make()); });

function bind() {
  options($("#dom"), [["all", "All domains"], ...INTERESTS]);
  options($("#type"), [["all", "All types"], ...EVENT_TYPES.map((t) => [t, eventLabel(t)])]);
  options($("#city"), [["", "Choose a city"], ...CITIES.map((c) => [c.name, `${c.name}, ${c.country}`])]);
  options($("#cities"), CITIES.map((c) => [c.name, ""]));
  $("#q").addEventListener("input", (e) => { state.query = e.target.value; renderList(); });
  for (const [id, key] of [["dom", "interest"], ["mode", "mode"], ["type", "type"], ["when", "when"], ["price", "price"]]) $("#" + id).addEventListener("change", (e) => { state[key] = e.target.value; renderList(); });
  $("#near").addEventListener("change", (e) => { state.nearbyKm = +e.target.value; renderList(); });
  $("#city").addEventListener("change", (e) => { const c = CITIES.find((x) => x.name === e.target.value); if (c) setOrigin(c, c.name); });
  $("#locate").addEventListener("click", async () => {
    msg("#locMsg", "Finding you...");
    try { setOrigin(await locate(), "your location"); toast("Got you! Nearby events are pinned for your location."); }
    catch { msg("#locMsg", "Location is blocked. Choose your city instead."); }
  });
  $("#dlgX").addEventListener("click", () => $("#dlg").close());
  $("#dlg").addEventListener("close", revokeCal);

  const pf = $("#profileForm");
  chipBoxes($("#pInterests"), "interests", 5, state.profile?.interests);
  if (state.profile) { pf.elements.level.value = state.profile.level; pf.elements.name.value = state.profile.name ?? ""; }
  pf.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const interests = picked(pf, "interests"), name = cleanName(pf.elements.name.value);
    showErrors(pf, name ? {} : { name: "Enter your first name using letters only." });
    if (!name) { msg("#profileMsg", ""); return; }
    if (!interests.length) { msg("#profileMsg", "Pick at least one interest."); return; }
    state.profile = { name, interests, level: pf.elements.level.value };
    store.set("nk:profile", state.profile);
    renderList(); msg("#profileMsg", "");
    location.hash = "#discover";
    toast(`Welcome aboard, ${name.split(" ")[0]}! Your feed just got personal.`);
  });

  const hf = $("#hostForm");
  chipBoxes($("#hInterests"), "interests", 4, [], renderReach);
  chipBoxes($("#hBenefits"), "benefits", 6, [], () => {}, BENEFITS);
  resetRows();
  const sync = () => {
    $("#where").hidden = hf.elements.mode.value === "online";
    const tbd = hf.elements.dateMode.value === "tbd";
    $("#fixedDate").hidden = tbd;
    msg("#dlHint", tbd ? "(required while the date is not final)" : "(optional)");
  };
  for (const r of [...hf.elements.mode, ...hf.elements.dateMode]) r.addEventListener("change", () => { sync(); renderReach(); });
  hf.elements.level.addEventListener("change", renderReach);
  hf.elements.city.addEventListener("change", (e) => { const c = CITIES.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase()); if (c) { hf.elements.state.value = c.state; hf.elements.country.value = c.country; } });
  $("#reachR").addEventListener("change", renderReach);
  addRow("#addFaq", "#faqs", faqRow); addRow("#addDate", "#timeline", dateRow); addRow("#addPrize", "#prizes", prizeRow);
  for (const ta of hf.querySelectorAll("textarea[maxlength]")) { // live "123/400" counters help organisers stay within limits
    const c = h("span", { class: "hint ctr", "aria-hidden": "true" }), upd = () => { c.textContent = `${ta.value.length}/${ta.maxLength}`; };
    ta.after(c); ta.addEventListener("input", upd); hf.addEventListener("reset", () => setTimeout(upd)); upd();
  }
  $("#mapLink").addEventListener("change", (ev) => { const p = parseMapLink(ev.target.value); p ? setPin(p) : msg("#pinStatus", "Paste the full link from your browser's address bar, not a shortened one."); });
  $("#useLoc").addEventListener("click", async () => { try { setPin(await locate()); } catch { msg("#pinStatus", "Location is blocked. Paste a Maps link instead."); } });
  const sniff = async (f) => sniffImage(new Uint8Array(await f.slice(0, 12).arrayBuffer())) === f.type;
  $("#poster").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    state.poster = null; $("#posterPrev").replaceChildren(); msg("[data-err=poster]", "");
    if (!f) return;
    const bad = validatePoster(f) || ((await sniff(f)) ? "" : "That file is not a real image.");
    if (bad) { msg("[data-err=poster]", bad); ev.target.value = ""; return; }
    const r = new FileReader();
    r.onload = () => { state.poster = String(r.result); $("#posterPrev").replaceChildren(h("img", { class: "poster", src: state.poster, alt: "Your poster preview" })); };
    r.readAsDataURL(f);
  });

  $("#fill").addEventListener("click", async () => {
    const text = $("#paste").value;
    if (!text.trim()) { msg("#hostMsg", "Paste a message first."); return; }
    msg("#hostMsg", "Reading your message...");
    const d = (await analyze(text)) ?? parseEventText(text);
    if (d.isEvent === false) { msg("#hostMsg", "That doesn't look like an event announcement."); return; }
    hf.elements.title.value = d.title; hf.elements.time.value = d.time; hf.elements.type.value = d.type; hf.elements.mode.value = d.mode;
    const dom = d.domain ?? ({ tech: "software", arts: "art", career: "career", social: "social" }[d.topic] ?? "social");
    hf.querySelectorAll("[name=interests]").forEach((i) => { i.checked = i.value === dom; });
    if (d.day != null) { hf.elements.dateMode.value = "fixed"; hf.elements.date.value = dateIn(d.day); }
    sync(); renderReach(); msg("#hostMsg", "Filled. Check the details, then publish.");
  });

  hf.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = { ...Object.fromEntries(new FormData(hf)), interests: picked(hf, "interests"), benefits: picked(hf, "benefits"), lat: state.pin?.lat, lng: state.pin?.lng,
      faqs: rowValues("#faqs", "faqQ", "faqA").map(([q, a]) => ({ q, a })), timeline: rowValues("#timeline", "tlLabel", "tlDate").map(([label, date]) => ({ label, date })),
      prizes: rowValues("#prizes", "pzPlace", "pzReward").map(([place, reward]) => ({ place, reward })) };
    const res = validateEvent(input);
    showErrors(hf, res.errors);
    if (!res.ok) { msg("#hostMsg", "Fix the highlighted fields."); return; }
    const btn = ev.submitter; btn.disabled = true;
    const out = await publishEvent(input, state.poster);
    btn.disabled = false;
    if (out?.status === 422) { msg("#hostMsg", "This doesn't look like a real event. Check the title and description."); return; }
    if (out && out.status !== 201) { msg("#hostMsg", "Couldn't publish right now. Please try again."); return; }
    const e = out ? { ...res.value, ...out.event, poster: safePoster(out.event.poster) } : { id: Date.now(), ...res.value, poster: state.poster }; // no server: this device only
    state.events.unshift(e); renderList(); renderKit(e);
    hf.reset(); state.pin = null; state.poster = null; resetRows();
    $("#mapPrev").replaceChildren(); $("#posterPrev").replaceChildren(); msg("#pinStatus", "No pin yet.");
    chipBoxes($("#hInterests"), "interests", 4, [], renderReach); chipBoxes($("#hBenefits"), "benefits", 6, [], () => {}, BENEFITS);
    sync(); renderReach();
    msg("#hostMsg", ""); toast(out ? "Live! Your event is on Discover for everyone." : "Saved on this device. Start the server to share it with others.");
  });
  sync();
}

const VIEWS = ["discover", "profile", "host", "how"];
const TITLES = { discover: "Discover", profile: "My profile", host: "Post an event", how: "How it works" };
function route() {
  const id = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "discover";
  document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.id !== id));
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = `Nukkad: ${TITLES[id]}`;
  scrollTo(0, 0);
  $("#main").focus({ preventScroll: true });
}

bind(); renderList(); renderTrail(); renderReach(); route();
addEventListener("hashchange", route);
loadEvents().then((list) => {
  if (!Array.isArray(list)) return;
  const shared = list.flatMap((e) => { const v = validateEvent({ ...e, dateMode: e.date ? "fixed" : "tbd" }); return v.ok ? [{ ...v.value, id: Number(e.id), joined: Number(e.joined) || 0, poster: safePoster(e.poster) }] : []; });
  state.events = [...shared, ...EVENTS];
  renderList();
});
