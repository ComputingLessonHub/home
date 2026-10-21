/* ===================================================================
   docs.js — a lesson's Word documents, shown beside the work.

   lesson.docs = { list: [ { id, title, html, outline, font, pt } ],
                   open: true }    // open as the lesson starts

   A document is docked down the right with the lesson on the left, and
   that is the only place it goes: it can fill the screen for a moment or
   be closed, but it cannot be floated off, shrunk to a bubble or moved
   to the left. A worksheet is read alongside the work, and one that can come
   loose ends up dragged over the very task it is for. (Lessons saved when
   a document could be unlocked still say unlock; it is ignored.)

   It borrows the slides window's look (the sl- classes) so the two sit
   together, and keeps its own width, so slides pinned right and a
   document stand side by side rather than on top of each other: the
   document against the edge, the slides inside it. How wide it is, which
   document and how far down is remembered for that lesson on that
   computer only; nothing here is saved to the server.
   =================================================================== */
(function(){
"use strict";

const api = () => (window.HUB && window.HUB.API) || "";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function div(cls, html){ const d = document.createElement("div"); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; }
function btn(cls, html, title){
  const b = document.createElement("button");
  b.type = "button"; b.className = cls; b.innerHTML = html;
  if (title){ b.title = title; b.setAttribute("aria-label", title); }
  return b;
}
function store(k, v){
  try{
    if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
    localStorage.setItem(k, JSON.stringify(v));
  }catch(e){}
  return null;
}
function has(lesson){ return !!(lesson && lesson.docs && Array.isArray(lesson.docs.list) && lesson.docs.list.length); }

/* One document as paper. Pictures arrive as ids and become addresses here,
   the same as everywhere else, so a lesson moved between servers still
   finds them. */
function paper(doc){
  const p = div("dc-paper");
  p.style.color = "#1a1a1a";
  p.style.background = "#fff";
  if (doc.font && !/["<>;]/.test(doc.font)) p.style.setProperty("--dc-font", "'" + doc.font.replace(/'/g, "") + "', var(--body)");
  p.style.setProperty("--dc-pt", String(+doc.pt > 5 && +doc.pt < 40 ? +doc.pt : 11));
  p.innerHTML = doc.html || "";
  p.querySelectorAll("img[data-img]").forEach(im => {
    im.src = api() + "/api/catalog?image=" + encodeURIComponent(im.getAttribute("data-img"));
  });
  /* paper is always white, so its links keep a blue picked against white */
  p.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; a.style.color = "#1F5FB8"; });
  return p;
}

const NARROW = "(max-width: 760px)";
function viewer(o){
  const docs = o.docs;
  const list = docs.list;
  const KEY = "hub_docs_view_" + (o.lessonId || "x");
  let view = Object.assign({ mode: "right", side: 440, zoom: 1, at: 0, tops: {} }, store(KEY) || {});
  /* only the right or full screen now; anything else saved from before
     (left, floating, the bubble) is the right */
  if (!/^(right|full)$/.test(view.mode)) view.mode = "right";
  let cur = Math.min(Math.max(0, view.at || 0), list.length - 1);
  let shown = false;
  const save = () => store(KEY, view);
  const narrow = () => matchMedia(NARROW).matches;
  /* where it goes back to from full screen */
  const docked = () => narrow() ? "sheet" : "right";

  /* ---- the button in the top bar ---- */
  const open = btn("btn-ghost sl-open dc-open no-print",
    '<span class="dc-open-ic" aria-hidden="true"></span><span class="sl-open-word">' + (list.length > 1 ? "Documents" : "Document") + "</span>",
    "Open the " + (list.length > 1 ? "documents" : "document"));
  if (o.before && o.before.parentNode) o.before.parentNode.insertBefore(open, o.before);
  else document.body.appendChild(open);
  open.addEventListener("click", () => { if (shown) hide(); else show(); });

  /* ---- the window ---- */
  const win = div("sl-win dc-win no-print");
  win.hidden = true;
  win.setAttribute("role", "region");
  win.setAttribute("aria-label", "Document");
  win.tabIndex = -1;
  const bar = div("sl-bar dc-bar");
  const name = div("sl-grip dc-name");
  const picker = document.createElement("select");
  picker.className = "dc-picker";
  picker.setAttribute("aria-label", "Which document");
  list.forEach((d, i) => picker.appendChild(new Option(d.title || "Document " + (i + 1), String(i))));
  const nameText = document.createElement("span");
  nameText.className = "dc-title";
  name.appendChild(list.length > 1 ? picker : nameText);
  const tools = div("sl-tools");
  const bContents = btn("sl-tool", "&#9776;", "Contents: jump to a part of the document");
  const bSmaller = btn("sl-tool", "A&#8722;", "Smaller writing");
  const bBigger = btn("sl-tool", "A+", "Bigger writing");
  const bFull = btn("sl-tool", "&#9974;", "Fill the screen");
  const bClose = btn("sl-tool", "&#10005;", "Close the document");
  [bContents, bSmaller, bBigger, bFull, bClose].forEach(b => tools.appendChild(b));
  bar.appendChild(name); bar.appendChild(tools);
  const menu = div("dc-menu"); menu.hidden = true;
  const stage = div("dc-stage");
  const split = div("sl-split"); split.title = "Drag to make the document wider or narrower";
  [bar, menu, stage, split].forEach(x => win.appendChild(x));
  document.body.appendChild(win);

  /* ---- showing a document ---- */
  function paint(){
    const d = list[cur];
    stage.innerHTML = "";
    const p = paper(d);
    p.style.setProperty("--dc-z", String(view.zoom));
    stage.appendChild(p);
    nameText.textContent = d.title || "Document";
    nameText.title = d.title || "";
    picker.value = String(cur);
    bContents.hidden = !(d.outline && d.outline.length > 1);
    menu.hidden = true;
    /* where they had got to in this document, for when they come back */
    requestAnimationFrame(() => { stage.scrollTop = (view.tops && view.tops[d.id]) || 0; });
  }
  function choose(i){
    if (i === cur && stage.firstElementChild) return;
    keepPlace();
    cur = Math.min(Math.max(0, i), list.length - 1);
    view.at = cur; save();
    paint();
  }
  function keepPlace(){
    const d = list[cur];
    if (!d || !stage.firstElementChild) return;
    view.tops = view.tops || {};
    view.tops[d.id || cur] = Math.round(stage.scrollTop);
  }
  let scrollTimer = null;
  stage.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => { keepPlace(); save(); }, 400); });
  picker.addEventListener("change", () => choose(parseInt(picker.value, 10)));

  bContents.addEventListener("click", () => {
    if (!menu.hidden){ menu.hidden = true; return; }
    menu.innerHTML = "";
    (list[cur].outline || []).forEach(h => {
      const b = btn("dc-menuitem dc-h" + h.n, esc(h.text));
      b.addEventListener("click", () => {
        const at = stage.querySelector("#" + CSS.escape(h.id));
        if (at) stage.scrollTo({ top: at.offsetTop - 8, behavior: "smooth" });
        menu.hidden = true;
      });
      menu.appendChild(b);
    });
    /* under the bar, however many rows the bar has wrapped onto */
    menu.style.top = (bar.offsetHeight + 4) + "px";
    menu.hidden = false;
  });
  const zoomTo = (z) => {
    view.zoom = Math.round(Math.min(2, Math.max(0.7, z)) * 10) / 10;
    const p = stage.firstElementChild;
    if (p) p.style.setProperty("--dc-z", String(view.zoom));
    bSmaller.disabled = view.zoom <= 0.7; bBigger.disabled = view.zoom >= 2;
    save();
  };
  bSmaller.addEventListener("click", () => zoomTo(view.zoom - 0.1));
  bBigger.addEventListener("click", () => zoomTo(view.zoom + 0.1));

  /* ---- where the window is ---- */
  function setMode(m, keep){
    if (m === "right" || m === "sheet") m = docked();
    view.mode = m === "sheet" ? "right" : m;
    if (!keep) save();
    place(m);
  }
  function place(m){
    m = m || (view.mode === "right" ? docked() : view.mode);
    win.dataset.mode = m;
    const b = document.body.classList;
    b.toggle("dc-pin-right", shown && m === "right");
    b.toggle("dc-sheet", shown && m === "sheet");
    document.documentElement.style.setProperty("--dc-side", clampSide(view.side) + "px");
    bFull.classList.toggle("on", m === "full");
    open.classList.toggle("on", shown);
    open.setAttribute("aria-pressed", shown ? "true" : "false");
    try{ window.dispatchEvent(new Event("resize")); }catch(e){}
  }
  function clampSide(w){ return Math.round(Math.min(Math.max(280, w || 440), Math.max(300, innerWidth - 380))); }
  function show(){
    shown = true;
    win.hidden = false;
    setMode(view.mode, true);
    if (!stage.firstElementChild) paint();
  }
  function hide(){
    keepPlace(); save();
    shown = false;
    if (view.mode === "full") view.mode = "right";
    win.hidden = true;
    place();
  }
  bFull.addEventListener("click", () => setMode(view.mode === "full" ? "right" : "full", true));
  bClose.addEventListener("click", hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shown && view.mode === "full"){ setMode("right", true); e.preventDefault(); }
  });
  /* A phone and a laptop want different docking: a sheet along the bottom,
     or the right-hand side. Turning the screen, or a window made narrow,
     moves it between the two. */
  let placeTimer = null;
  addEventListener("resize", () => {
    if (!shown) return;
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => place(), 120);
  });

  /* The width is the student's to choose: dragging the inside edge. */
  let start = null;
  split.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, side: view.side };
    split.setPointerCapture(e.pointerId); e.preventDefault();
    win.classList.add("sl-dragging");
  });
  split.addEventListener("pointermove", (e) => {
    if (!start) return;
    view.side = clampSide(start.side + (start.x - e.clientX));
    document.documentElement.style.setProperty("--dc-side", view.side + "px");
  });
  const endSplit = () => { if (!start) return; start = null; win.classList.remove("sl-dragging"); save(); place(); };
  split.addEventListener("pointerup", endSplit);
  split.addEventListener("pointercancel", endSplit);

  /* ---- a page can bring a document forward ---- */
  function page(i){
    const id = o.docForPage ? o.docForPage(i) : null;
    const at = id ? list.findIndex(d => d.id === id) : -1;
    open.classList.toggle("sl-hint", at >= 0 && !shown);
    if (at >= 0 && at !== cur) choose(at);
  }

  zoomTo(view.zoom);
  place();
  /* Open as the lesson starts, unless the teacher said not to. Never on a
     phone, where half the screen is too much to take without being asked.
     A tab opened behind the one in front can start with no width at all,
     which reads as the narrowest phone there is, so the choice waits until
     the window has a size of its own. */
  const openIfRoom = () => {
    if (!innerWidth){ addEventListener("resize", openIfRoom, { once: true }); return; }
    if (!narrow()) show();
  };
  if (docs.open !== false && !o.quiet) openIfRoom();
  return { show, hide, page, choose };
}

window.hubDocs = { has, viewer, paper };
})();
