/* ===================================================================
   docs.js — a lesson's Word documents, shown beside the work.

   lesson.docs = { list: [ { id, title, html, outline, font, pt } ],
                   open: true,     // open as the lesson starts
                   unlock: true }  // a student may unlock it and move it

   The window opens pinned down the right with the lesson on the left, and
   locked there: no dragging it off by accident while scrolling a worksheet
   with a trackpad. The padlock unlocks it, and then it floats, pins left,
   fills the screen or shrinks to a bubble the same way the slides do. A
   teacher can take the padlock away, which keeps every document on the
   right for the whole lesson.

   It borrows the slides window's look (the sl- classes) so the two sit
   together, and keeps its own place, so slides pinned right and a
   document pinned right stand side by side rather than on top of each
   other. Where a student leaves it is remembered for that lesson on that
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
  const canUnlock = docs.unlock !== false;
  const KEY = "hub_docs_view_" + (o.lessonId || "x");
  /* The default for every lesson is the one asked for: on the right, with
     the lesson on the left, locked. A student's own changes are kept for
     this lesson only, so the next lesson starts from the default again. */
  let view = Object.assign({ mode: "right", locked: true, side: 440, w: 460, x: null, y: null, zoom: 1, at: 0, tops: {} }, store(KEY) || {});
  if (!canUnlock){ view.locked = true; if (view.mode !== "full" && view.mode !== "mini") view.mode = "right"; }
  let cur = Math.min(Math.max(0, view.at || 0), list.length - 1);
  let shown = false;
  let lastMode = /^(left|right|float|sheet)$/.test(view.mode) ? view.mode : "right";
  const save = () => store(KEY, view);

  /* ---- the button in the top bar ---- */
  const open = btn("btn-ghost sl-open dc-open no-print",
    '<span class="dc-open-ic" aria-hidden="true"></span><span class="sl-open-word">' + (list.length > 1 ? "Documents" : "Document") + "</span>",
    "Open the " + (list.length > 1 ? "documents" : "document"));
  if (o.before && o.before.parentNode) o.before.parentNode.insertBefore(open, o.before);
  else document.body.appendChild(open);
  open.addEventListener("click", () => { if (shown && view.mode !== "mini") hide(); else show(); });

  /* ---- the window ---- */
  const win = div("sl-win dc-win no-print");
  win.hidden = true;
  win.setAttribute("role", "region");
  win.setAttribute("aria-label", "Document");
  win.tabIndex = -1;
  const bar = div("sl-bar");
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
  const bLock = btn("sl-tool dc-lock", "", "");
  const bLeft = btn("sl-tool", "&#9703;", "Pin to the left");
  const bFloat = btn("sl-tool", "&#10697;", "Float over the page");
  const bRight = btn("sl-tool", "&#9704;", "Pin to the right");
  const bFull = btn("sl-tool", "&#9974;", "Fill the screen");
  const bMini = btn("sl-tool", "&#8212;", "Shrink to a bubble");
  const bClose = btn("sl-tool", "&#10005;", "Close the document");
  [bContents, bSmaller, bBigger, bLock, bLeft, bFloat, bRight, bFull, bMini, bClose].forEach(b => tools.appendChild(b));
  bar.appendChild(name); bar.appendChild(tools);
  const menu = div("dc-menu"); menu.hidden = true;
  const stage = div("dc-stage");
  const sizer = div("sl-sizer"); sizer.title = "Drag to resize";
  const split = div("sl-split"); split.title = "Drag to make the document wider or narrower";
  [bar, menu, stage, sizer, split].forEach(x => win.appendChild(x));
  document.body.appendChild(win);

  /* ---- showing a document ---- */
  function paint(){
    const d = list[cur];
    stage.innerHTML = "";
    const p = paper(d);
    p.style.setProperty("--dc-z", String(view.zoom));
    stage.appendChild(p);
    nameText.textContent = d.title || "Document";
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
  const narrow = () => matchMedia(NARROW).matches;
  function setMode(m, keep){
    if (narrow() && (m === "float" || m === "left" || m === "right")) m = "sheet";
    if (view.locked && (m === "float" || m === "left")) m = "right";
    if (m !== "full" && m !== "mini") lastMode = m;
    view.mode = m;
    if (!keep) save();
    place();
  }
  function place(){
    const m = view.mode;
    win.dataset.mode = m;
    win.classList.toggle("dc-locked", !!view.locked);
    const b = document.body.classList;
    b.toggle("dc-pin-left", shown && m === "left");
    b.toggle("dc-pin-right", shown && m === "right");
    b.toggle("dc-sheet", shown && m === "sheet");
    document.documentElement.style.setProperty("--dc-side", clampSide(view.side) + "px");
    win.style.left = win.style.top = win.style.width = "";
    if (m === "float"){
      const w = Math.min(Math.max(280, view.w || 460), innerWidth - 16);
      win.style.width = w + "px";
      const x = view.x === null ? Math.max(8, (innerWidth - w) / 2) : view.x;
      const y = view.y === null ? 70 : view.y;
      win.style.left = Math.min(Math.max(4, x), innerWidth - Math.min(w, 120)) + "px";
      win.style.top = Math.min(Math.max(4, y), innerHeight - 60) + "px";
    }
    const loose = !view.locked && !narrow();
    bLeft.hidden = bFloat.hidden = bRight.hidden = !loose;
    bLeft.classList.toggle("on", m === "left"); bRight.classList.toggle("on", m === "right");
    bFloat.classList.toggle("on", m === "float"); bFull.classList.toggle("on", m === "full");
    bLock.hidden = !canUnlock || narrow();
    bLock.innerHTML = view.locked ? "&#128274;" : "&#128275;";
    bLock.title = view.locked ? "Unlock it so it can be moved" : "Lock it on the right";
    bLock.setAttribute("aria-label", bLock.title);
    bLock.classList.toggle("on", !!view.locked);
    open.classList.toggle("on", shown);
    open.setAttribute("aria-pressed", shown ? "true" : "false");
    try{ window.dispatchEvent(new Event("resize")); }catch(e){}
  }
  function clampSide(w){ return Math.round(Math.min(Math.max(280, w || 440), Math.max(300, innerWidth - 380))); }
  function show(){
    shown = true;
    win.hidden = false;
    if (view.mode === "mini") view.mode = lastMode;
    setMode(view.mode, true);
    if (!stage.firstElementChild) paint();
  }
  function hide(){
    keepPlace(); save();
    shown = false;
    if (view.mode === "full") view.mode = lastMode;
    win.hidden = true;
    place();
  }
  bLock.addEventListener("click", () => {
    view.locked = !view.locked;
    /* locking puts it back where locked means: on the right */
    if (view.locked && view.mode !== "full" && view.mode !== "mini") view.mode = "right";
    setMode(view.mode);
  });
  bLeft.addEventListener("click", () => setMode("left"));
  bRight.addEventListener("click", () => setMode("right"));
  bFloat.addEventListener("click", () => setMode("float"));
  bFull.addEventListener("click", () => setMode(view.mode === "full" ? lastMode : "full", true));
  bMini.addEventListener("click", () => setMode("mini", true));
  bClose.addEventListener("click", hide);
  win.addEventListener("click", (e) => {
    if (view.mode === "mini" && !e.target.closest(".sl-tools")) setMode(lastMode);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shown && view.mode === "full"){ setMode(lastMode, true); e.preventDefault(); }
  });
  let placeTimer = null;
  addEventListener("resize", () => {
    if (!shown) return;
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => {
      if (narrow() && /^(float|left|right)$/.test(view.mode)) setMode("sheet", true);
      else if (!narrow() && view.mode === "sheet") setMode(lastMode === "sheet" ? "right" : lastMode, true);
    }, 120);
  });

  /* ---- moving it, once unlocked ----
     Locked, the bar is not a handle at all, so reaching for the document
     list or a scroll bar can never tear it off the side. */
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    if (view.locked || e.button !== 0 || e.target.closest("button, select") || narrow()) return;
    if (view.mode === "full" || view.mode === "mini") return;
    const r = win.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false, snap: null };
    bar.setPointerCapture(e.pointerId); e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    if (!drag.moved){
      drag.moved = true;
      win.classList.add("sl-dragging");
      if (view.mode !== "float"){ view.w = Math.min(view.w || 460, 560); drag.dx = Math.min(drag.dx, view.w - 40); drag.dy = 16; setMode("float", true); }
    }
    view.x = e.clientX - drag.dx; view.y = e.clientY - drag.dy;
    win.style.left = Math.min(Math.max(-view.w + 80, view.x), innerWidth - 80) + "px";
    win.style.top = Math.min(Math.max(0, view.y), innerHeight - 40) + "px";
    drag.snap = e.clientX < 28 ? "left" : e.clientX > innerWidth - 28 ? "right" : null;
  });
  const endDrag = () => {
    if (!drag) return;
    win.classList.remove("sl-dragging");
    const { snap, moved } = drag; drag = null;
    if (moved) setMode(snap || "float");
  };
  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);
  function resizer(handle, onMove){
    let start = null;
    handle.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, w: view.w, side: view.side };
      handle.setPointerCapture(e.pointerId); e.preventDefault();
      win.classList.add("sl-dragging");
    });
    handle.addEventListener("pointermove", (e) => { if (start) onMove(e, start); });
    const end = () => { if (!start) return; start = null; win.classList.remove("sl-dragging"); save(); place(); };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  resizer(sizer, (e, s) => { view.w = Math.min(Math.max(280, s.w + (e.clientX - s.x)), innerWidth - 16); win.style.width = view.w + "px"; });
  /* Width is still the student's to choose when locked: locked is about
     where it is, not how much of the screen a worksheet needs. */
  resizer(split, (e, s) => {
    const d = view.mode === "left" ? e.clientX - s.x : s.x - e.clientX;
    view.side = clampSide(s.side + d);
    document.documentElement.style.setProperty("--dc-side", view.side + "px");
  });

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
     phone, where half the screen is too much to take without being asked. */
  /* A tab opened behind the one in front can start with no width at all,
     which reads as the narrowest phone there is. The choice waits until the
     window has a size of its own. */
  const openIfRoom = () => {
    if (!innerWidth){ addEventListener("resize", openIfRoom, { once: true }); return; }
    if (!narrow()) show();
  };
  if (docs.open !== false && !o.quiet) openIfRoom();
  return { show, hide, page, choose };
}

window.hubDocs = { has, viewer, paper };
})();
