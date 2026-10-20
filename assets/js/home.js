import { august, describe, isoOf, summerLabel } from "./august.js";

const PAGE = 20;
const KINDS = Object.fromEntries([...document.querySelectorAll("#kinds .chip[data-kind]")].map((b) => [b.dataset.kind, b.textContent]));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const params = new URLSearchParams(location.search);
const state = {
  q: params.get("q") || "",
  summer: params.get("summer") || "",
  sort: params.get("sort") || "desc",
  tag: params.get("tag") || "",
  kind: params.get("kind") || "",
  day: params.get("day") || "",
  shown: PAGE,
};

const now = new Date();
const todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());

const res = await fetch("/posts.json");
const entries = await res.json();
const byDate = new Map();
for (const e of entries) {
  if (!byDate.has(e.date)) byDate.set(e.date, []);
  byDate.get(e.date).push(e);
}

// ---------- カレンダー ----------
let [calY, calM] = (() => {
  const p = params.get("month");
  if (p && /^\d{4}-\d{1,2}$/.test(p)) return p.split("-").map(Number);
  if (state.day) return state.day.split("-").slice(0, 2).map(Number);
  return [now.getFullYear(), now.getMonth() + 1];
})();

// 日記のある月 + 今月を選択肢に
function monthOptions() {
  const counts = new Map();
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const cur = `${calY}-${String(calM).padStart(2, "0")}`;
  const thisMonth = todayIso.slice(0, 7);
  for (const k of [cur, thisMonth]) if (!counts.has(k)) counts.set(k, 0);
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function renderCalendar() {
  const sel = $("cal-month");
  const cur = `${calY}-${String(calM).padStart(2, "0")}`;
  sel.innerHTML = monthOptions()
    .map(([k, n]) => {
      const [y, m] = k.split("-").map(Number);
      return `<option value="${k}"${k === cur ? " selected" : ""}>${y}年${m}月${n ? `（${n}）` : ""}</option>`;
    })
    .join("");

  const first = new Date(Date.UTC(calY, calM - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(calY, calM, 0)).getUTCDate();
  let html = "";
  let cell = 0;
  for (let row = 0; cell < first + days; row++) {
    html += "<tr>";
    for (let c = 0; c < 7; c++, cell++) {
      const d = cell - first + 1;
      if (d < 1 || d > days) {
        html += `<td><span class="cal-cell out"></span></td>`;
        continue;
      }
      const iso = isoOf(calY, calM, d);
      const has = byDate.get(iso);
      const cls = ["cal-cell", has && "has", iso === todayIso && "today", iso === state.day && "selected"].filter(Boolean).join(" ");
      const au = august(calY, calM, d).day;
      const label = `${calM}月${d}日（8月${au}日）${has ? "・記事あり" : ""}`;
      const inner = `<span class="cal-day">${d}</span><span class="cal-au">${au}</span>`;
      html += has
        ? `<td><button type="button" class="${cls}" data-date="${iso}" aria-label="${label}">${inner}</button></td>`
        : `<td><span class="${cls}" aria-label="${label}">${inner}</span></td>`;
    }
    html += "</tr>";
  }
  $("cal-body").innerHTML = html;
}

function shiftMonth(step) {
  calM += step;
  if (calM < 1) { calM = 12; calY--; }
  if (calM > 12) { calM = 1; calY++; }
  renderCalendar();
}

$("calendar").addEventListener("click", (ev) => {
  const nav = ev.target.closest(".cal-nav");
  if (nav) return shiftMonth(Number(nav.dataset.step));
  const cell = ev.target.closest(".cal-cell.has");
  if (!cell) return;
  const list = byDate.get(cell.dataset.date);
  if (list.length === 1) {
    location.href = list[0].url;
  } else {
    state.day = state.day === cell.dataset.date ? "" : cell.dataset.date;
    update();
  }
});
$("cal-month").addEventListener("change", (ev) => {
  [calY, calM] = ev.target.value.split("-").map(Number);
  renderCalendar();
});

// ---------- 絞り込み ----------
const summers = [...new Set(entries.map((e) => e.summer))].sort((a, b) => b - a);
$("summer").innerHTML += summers
  .map((s) => `<option value="${s}">${summerLabel(s)}（${s}.8 – ${s + 1}.7）</option>`)
  .join("");

const tagCounts = new Map();
for (const e of entries) for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
$("tags").innerHTML = tags
  .map(([t, n]) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)} <small>${n}</small></button>`)
  .join("");

$("q").value = state.q;
$("summer").value = state.summer;
$("sort").value = state.sort;

$("q").addEventListener("input", (ev) => { state.q = ev.target.value.trim(); state.shown = PAGE; update(); });
$("summer").addEventListener("change", (ev) => { state.summer = ev.target.value; state.shown = PAGE; update(); });
$("sort").addEventListener("change", (ev) => { state.sort = ev.target.value; state.shown = PAGE; update(); });
$("tags").addEventListener("click", (ev) => {
  const b = ev.target.closest(".chip");
  if (!b) return;
  state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag;
  state.shown = PAGE;
  update();
});
$("kinds").addEventListener("click", (ev) => {
  const b = ev.target.closest(".chip");
  if (!b) return;
  state.kind = b.dataset.kind;
  state.shown = PAGE;
  update();
});
$("more").addEventListener("click", () => { state.shown += PAGE; renderList(); });
$("status").addEventListener("click", (ev) => {
  if (ev.target.closest("[data-clear]")) {
    Object.assign(state, { q: "", summer: "", tag: "", kind: "", day: "", shown: PAGE });
    $("q").value = "";
    $("summer").value = "";
    update();
  }
});

function filtered() {
  const q = state.q.toLowerCase();
  const out = entries.filter(
    (e) =>
      (!state.summer || String(e.summer) === state.summer) &&
      (!state.tag || e.tags.includes(state.tag)) &&
      (!state.kind || e.kind === state.kind) &&
      (!state.day || e.date === state.day) &&
      (!q || e.text.toLowerCase().includes(q) || e.heading.toLowerCase().includes(q)),
  );
  return state.sort === "asc" ? out : out.reverse();
}

// 検索語のまわりを抜き出して強調する
function snippet(e) {
  if (!state.q) return esc(e.excerpt);
  const i = e.text.toLowerCase().indexOf(state.q.toLowerCase());
  if (i < 0) return esc(e.excerpt);
  const start = Math.max(0, i - 40);
  const s = e.text.slice(start, i + state.q.length + 70);
  const j = i - start;
  return (
    (start ? "…" : "") +
    esc(s.slice(0, j)) +
    `<mark>${esc(s.slice(j, j + state.q.length))}</mark>` +
    esc(s.slice(j + state.q.length)) +
    "…"
  );
}

function renderList() {
  const list = filtered();
  $("list").innerHTML = list
    .slice(0, state.shown)
    .map((e) => {
      const [y, m, d] = e.date.split("-").map(Number);
      return `<li class="entry-card"><a href="${e.url}">
        <span class="card-au">${e.kind !== "diary" ? `<small class="card-kind">${esc(KINDS[e.kind] || e.kind)}</small>` : ""}${esc(e.heading)}</span>
        <span class="card-date">${e.kind !== "diary" ? `8月${e.au}日 · ` : ""}${y}.${m}.${d} ${e.wd}</span>
        <span class="card-excerpt">${snippet(e)}</span>
        ${e.tags.length ? `<span class="card-tags">${e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>` : ""}
      </a></li>`;
    })
    .join("");
  $("more").hidden = list.length <= state.shown;

  const conds = [];
  if (state.day) { const t = describe(state.day); conds.push(`${t.m}月${t.d}日`); }
  if (state.summer) conds.push(summerLabel(Number(state.summer)));
  if (state.kind) conds.push(KINDS[state.kind] || state.kind);
  if (state.tag) conds.push(state.tag);
  if (state.q) conds.push(`「${state.q}」`);
  $("status").innerHTML = conds.length
    ? `${conds.map(esc).join(" · ")} — ${list.length}件 <button type="button" data-clear>解除</button>`
    : `${entries.length}件の記事`;
}

function syncUrl() {
  const p = new URLSearchParams();
  for (const k of ["q", "kind", "summer", "tag", "day"]) if (state[k]) p.set(k, state[k]);
  if (state.sort !== "desc") p.set("sort", state.sort);
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
}

function update() {
  for (const b of $("tags").querySelectorAll(".chip")) b.setAttribute("aria-pressed", String(b.dataset.tag === state.tag));
  for (const b of $("kinds").querySelectorAll(".chip")) b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind));
  renderCalendar();
  renderList();
  syncUrl();
}

update();
