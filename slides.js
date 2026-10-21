/* ===================================================================
   slides.js — a lesson's slides: drawing one, the window a student keeps
   them in beside their work, and the full screen a teacher presents from.

   A deck belongs to a lesson, as lesson.slides:
     { ratio: 1.778, hpt: 405, list: [ slide, ... ] }
   ratio is width over height. hpt is the slide's height in points, which
   is what a PowerPoint text size is measured against, so 24pt text is
   24/405 of the slide's height whatever size the window is.

   A slide is one of three kinds:
     pptx  read out of a PowerPoint file by slides-import.js: el is a list
           of boxes, pictures and lines, each placed in percent of the slide
     pic   one picture filling the slide (PowerPoint's Export as PNG)
     text  a title and a formatting box, written in the builder
   and every one may have an id, a title, notes for the teacher, and bg.

   Pictures travel as their id (imgId), the same as everywhere else, and
   become an address only when drawn.

   Nothing a student does here is saved to the server or handed in. The
   window's place and the experiments in Settings are display choices kept
   in the browser, and Scribble keeps its strokes on this computer only.
   =================================================================== */
(function(){
"use strict";

const api = () => (window.HUB && window.HUB.API) || "";
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

/* There used to be a Settings section of experiments here. Following the
   lesson is now always on and the rest were taken out, so a slidesLab
   left in someone's hub_prefs is simply never read. */

/* ---------------- drawing one slide ---------------- */
function picSrc(p){
  if (!p) return "";
  if (p.imgId) return api() + "/api/catalog?image=" + encodeURIComponent(p.imgId);
  const s = String(p.src || "");
  return /^(https?:\/\/|data:image\/|images\/)/i.test(s) ? s : "";
}
function has(lesson){ return !!(lesson && lesson.slides && Array.isArray(lesson.slides.list) && lesson.slides.list.length); }
function ratioOf(deck){ const r = deck && +deck.ratio; return r > 0.3 && r < 4 ? r : 16 / 9; }
function hptOf(deck){ const h = deck && +deck.hpt; return h > 50 && h < 5000 ? h : 405; }

function draw(slide, deck){
  const d = div("sl-slide");
  d.style.setProperty("--r", ratioOf(deck));
  d.style.setProperty("--hpt", hptOf(deck));
  const c = div("sl-canvas");
  d.appendChild(c);
  if (!slide) return d;
  const kind = slide.kind || "text";
  if (slide.bg && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\)|linear-gradient\([^;{}<>]*\))$/i.test(slide.bg)) c.style.background = slide.bg;
  if (slide.bgPic){
    const im = document.createElement("img");
    im.className = "sl-bgpic"; im.alt = ""; im.src = picSrc(slide.bgPic);
    c.appendChild(im);
  }
  if (kind === "pptx"){
    /* PowerPoint's own colours, not the site's theme: a slide looks the
       same in dark mode as it did on the projector */
    c.style.color = "#000";
    if (!slide.bg && !slide.bgPic) c.style.background = "#fff";
    (slide.el || []).forEach(e => { const n = element(e, deck); if (n) c.appendChild(n); });
  } else if (kind === "pic"){
    c.classList.add("sl-picslide");
    const im = document.createElement("img");
    im.alt = slide.title || "Slide"; im.src = picSrc(slide); im.draggable = false;
    c.appendChild(im);
  } else {
    c.classList.add("sl-plain");
    const pic = picSrc(slide);
    if (pic) c.classList.add("with-pic");
    if (slide.title){ const h = document.createElement("h2"); h.textContent = slide.title; c.appendChild(h); }
    const body = div("sl-plainbody");
    body.innerHTML = slide.html || "";
    if (typeof window.fillPictures === "function"){ try{ window.fillPictures(body); }catch(e){} }
    c.appendChild(body);
    if (pic){
      const f = div("sl-plainpic");
      const im = document.createElement("img"); im.src = pic; im.alt = ""; im.draggable = false;
      f.appendChild(im); c.appendChild(f);
    }
  }
  return d;
}
function element(e, deck){
  if (!e || typeof e !== "object") return null;
  const n = div("sl-el sl-" + (e.t === "pic" ? "pic" : e.t === "line" ? "line" : "box"));
  n.style.left = (+e.x || 0) + "%"; n.style.top = (+e.y || 0) + "%";
  n.style.width = Math.max(0, +e.w || 0) + "%"; n.style.height = Math.max(0, +e.h || 0) + "%";
  const tf = [];
  if (e.rot) tf.push("rotate(" + (+e.rot) + "deg)");
  if (e.flipH && e.t !== "line") tf.push("scaleX(-1)");
  if (e.flipV && e.t !== "line") tf.push("scaleY(-1)");
  if (tf.length) n.style.transform = tf.join(" ");
  const r = ratioOf(deck);
  if (e.geom === "ellipse") n.style.borderRadius = "50%";
  else if (e.geom === "roundRect") n.style.borderRadius = (Math.min((+e.w || 0) * r, +e.h || 0) * 0.1667).toFixed(2) + "cqh";
  if (e.line && e.t !== "line") n.style.border = "calc(var(--u) * " + (+e.line.w || 0.75) + ") " + (e.line.dash ? "dashed " : "solid ") + safeColour(e.line.c);

  if (e.t === "line"){
    const x1 = e.flipH ? 100 : 0, x2 = e.flipH ? 0 : 100, y1 = e.flipV ? 100 : 0, y2 = e.flipV ? 0 : 100;
    n.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="' + x1 + '" y1="' + y1 +
      '" x2="' + x2 + '" y2="' + y2 + '" vector-effect="non-scaling-stroke" style="stroke:' + safeColour(e.c) +
      ';stroke-width:calc(var(--u) * ' + (+e.lw || 0.75) + ')"/></svg>';
    return n;
  }
  if (e.t === "pic"){
    const im = document.createElement("img");
    im.alt = ""; im.draggable = false; im.src = picSrc(e);
    if (Array.isArray(e.crop) && e.crop.length === 4){
      const [l, t, rr, b] = e.crop.map(v => +v || 0);
      const w = 100 - l - rr, h = 100 - t - b;
      if (w > 0 && h > 0){
        im.style.position = "absolute";
        im.style.width = (100 / w * 100) + "%"; im.style.height = (100 / h * 100) + "%";
        im.style.left = (-l / w * 100) + "%"; im.style.top = (-t / h * 100) + "%";
        im.style.maxWidth = "none";
      }
    }
    n.appendChild(im);
    return n;
  }
  if (e.fill) n.style.background = safeColour(e.fill, true);
  if (e.html){
    const tx = div("sl-tx" + (e.table ? " sl-tabled" : ""));
    tx.innerHTML = e.html;
    if (Array.isArray(e.pad)) tx.style.padding = (+e.pad[1] || 0) + "cqh " + (+e.pad[2] || 0) + "cqw " + (+e.pad[3] || 0) + "cqh " + (+e.pad[0] || 0) + "cqw";
    if (e.anchor === "ctr") tx.style.justifyContent = "center";
    else if (e.anchor === "b") tx.style.justifyContent = "flex-end";
    if (e.vert) tx.style.writingMode = "vertical-rl";
    if (e.nowrap) tx.classList.add("sl-nowrap");
    /* links on a slide open beside the lesson, never in place of it */
    tx.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
    n.appendChild(tx);
  }
  return n;
}
function safeColour(c, gradient){
  const s = String(c || "");
  if (/^#[0-9a-f]{3,8}$/i.test(s) || /^rgba?\([\d.,\s]+\)$/i.test(s)) return s;
  if (gradient && /^linear-gradient\([^;{}<>]*\)$/i.test(s)) return s;
  return "transparent";
}
/* The words on a slide, for reading aloud and for finding it in a list. */
function words(slide){
  if (!slide) return "";
  const bits = [];
  if (slide.title) bits.push(slide.title);
  const strip = (h) => { const t = document.createElement("div"); t.innerHTML = h || ""; return t.textContent || ""; };
  if (slide.kind === "pptx") (slide.el || []).forEach(e => { if (e.html) bits.push(strip(e.html.replace(/<\/p>/g, ".</p> "))); });
  else if (slide.html) bits.push(strip(slide.html));
  const out = bits.join(". ").replace(/\s+/g, " ").replace(/(\.\s*){2,}/g, ". ").trim();
  return slide.title && out.indexOf(slide.title + ". " + slide.title) === 0 ? out.slice(slide.title.length + 2) : out;
}

/* ---------------- moving between slides ----------------
   One holder, two slides in it for the moment of the change, then one. */
function swapInto(holder, next, dir){
  const old = holder.firstElementChild;
  holder.appendChild(next);
  if (!old || !dir || matchMedia("(prefers-reduced-motion: reduce)").matches){ if (old) old.remove(); return; }
  holder.classList.add("sl-moving");
  old.classList.add("sl-out", "sl-glide", dir > 0 ? "sl-fwd" : "sl-back");
  next.classList.add("sl-in", "sl-glide", dir > 0 ? "sl-fwd" : "sl-back");
  setTimeout(() => {
    old.remove();
    next.classList.remove("sl-in", "sl-glide", "sl-fwd", "sl-back");
    holder.classList.remove("sl-moving");
  }, 300);
}

/* ---------------- the student's slides window ----------------
   Opened from a button in the lesson's top bar. It floats over the work
   and can be dragged anywhere and resized from any corner, pinned down the
   right so the work moves over to make room, or filled to the whole
   screen. On a phone there is not the room to float, so it is a sheet
   along the bottom instead.

   Nothing here is ever in the way of carrying on: it never opens itself,
   the work underneath stays usable in every mode but full screen, and
   Escape always brings it back down. */
const NARROW = "(max-width: 760px)";
function viewer(o){
  const deck = o.deck;
  const list = deck.list;
  const lessonKey = o.lessonId || "x";
  const AT_KEY = "hub_slides_at_" + lessonKey;
  const VIEW_KEY = "hub_slides_view";
  let view = Object.assign({ mode: "float", x: null, y: null, w: 440, side: 420 }, store(VIEW_KEY) || {});
  /* The slides pin to the right only, where the documents pin too, and
     there is no bubble any more. A place remembered from before either of
     those went is the right, or floating. */
  if (view.mode === "left") view.mode = "right";
  if (view.mode === "mini") view.mode = "float";
  let cur = Math.min(Math.max(0, +store(AT_KEY) || 0), list.length - 1);
  let shown = false, lastMode = view.mode === "full" ? "float" : view.mode;

  /* ---- the button in the top bar ---- */
  const open = btn("btn-ghost sl-open no-print", '<span class="sl-open-ic" aria-hidden="true"></span><span class="sl-open-word">Slides</span>', "Open the slides");
  if (o.before && o.before.parentNode) o.before.parentNode.insertBefore(open, o.before);
  else document.body.appendChild(open);
  open.addEventListener("click", () => { if (shown) hide(); else show(); });

  /* ---- the window ---- */
  const win = div("sl-win no-print");
  win.hidden = true;
  win.setAttribute("role", "region");
  win.setAttribute("aria-label", "Slides");
  win.tabIndex = -1;
  win.style.setProperty("--r", ratioOf(deck));
  const bar = div("sl-bar");
  const grip = div("sl-grip", '<span class="sl-count"></span>');
  const tools = div("sl-tools");
  const bFloat = btn("sl-tool", "&#10697;", "Float over the page");
  const bRight = btn("sl-tool", "&#9704;", "Pin to the right");
  const bFull = btn("sl-tool", "&#9974;", "Fill the screen");
  const bClose = btn("sl-tool", "&#10005;", "Close the slides");
  /* only for a teacher: the whole screen, with the laser, pen and notes */
  const bShow = btn("sl-tool sl-tool-text", "&#9654; Present", "Present these slides to the class");
  bShow.hidden = !o.present;
  bShow.addEventListener("click", () => o.present(cur));
  [bShow, bFloat, bRight, bFull, bClose].forEach(b => tools.appendChild(b));
  bar.appendChild(grip); bar.appendChild(tools);

  const stage = div("sl-stage");
  const holder = div("sl-hold");
  stage.appendChild(holder);

  const foot = div("sl-foot");
  const bPrev = btn("sl-step", "&#8592;", "Previous slide");
  const track = div("sl-track"); const fill = div("sl-trackfill"); track.appendChild(fill);
  const bThumbs = btn("sl-tool sl-tool-text", "All slides", "Show every slide");
  const bNext = btn("sl-step", "&#8594;", "Next slide");
  [bPrev, track, bThumbs, bNext].forEach(x => foot.appendChild(x));
  const thumbs = div("sl-thumbs"); thumbs.hidden = true;
  /* A handle in each corner while it floats. Drawn as two short lines and
     only while the pointer is over the window, so they say "this can be
     resized" without sitting on top of the slide the rest of the time. */
  const corners = ["nw", "ne", "sw", "se"].map(c => {
    const h = div("sl-corner sl-corner-" + c);
    h.dataset.corner = c;
    h.title = "Drag to resize";
    return h;
  });
  const split = div("sl-split"); split.title = "Drag to make the slides wider or narrower";
  const snapHint = div("sl-snaphint no-print"); snapHint.hidden = true;

  [bar, stage, foot, thumbs, split].concat(corners).forEach(x => win.appendChild(x));
  document.body.appendChild(win);
  document.body.appendChild(snapHint);

  /* ---- showing a slide ---- */
  function paint(dir){
    const s = list[cur];
    swapInto(holder, draw(s, deck), dir);
    grip.querySelector(".sl-count").textContent = (cur + 1) + " / " + list.length;
    fill.style.width = ((cur + 1) / list.length * 100) + "%";
    bPrev.disabled = cur === 0; bNext.disabled = cur === list.length - 1;
    thumbs.querySelectorAll(".sl-thumb").forEach((t, i) => t.classList.toggle("on", i === cur));
    const on = thumbs.querySelector(".sl-thumb.on");
    if (on && !thumbs.hidden) on.scrollIntoView({ block: "nearest", inline: "nearest" });
    store(AT_KEY, cur);
  }
  function go(n){
    n = Math.min(Math.max(0, n), list.length - 1);
    if (n === cur && holder.firstElementChild) return;
    const dir = n > cur ? 1 : -1;
    cur = n;
    paint(dir);
  }
  const step = (d) => go(cur + d);
  bPrev.addEventListener("click", () => step(-1));
  bNext.addEventListener("click", () => step(1));
  track.addEventListener("click", (e) => {
    const r = track.getBoundingClientRect();
    go(Math.floor((e.clientX - r.left) / r.width * list.length));
  });

  /* ---- every slide at once ---- */
  function buildThumbs(){
    if (thumbs.childElementCount) return;
    list.forEach((s, i) => {
      const t = btn("sl-thumb", "", "Slide " + (i + 1) + (s.title ? ": " + s.title : ""));
      t.appendChild(draw(s, deck));
      t.appendChild(div("sl-thumbn", String(i + 1)));
      t.addEventListener("click", () => go(i));
      thumbs.appendChild(t);
    });
  }
  bThumbs.addEventListener("click", () => {
    buildThumbs();
    thumbs.hidden = !thumbs.hidden;
    bThumbs.classList.toggle("on", !thumbs.hidden);
    if (view.mode === "right"){ view.noThumbs = thumbs.hidden; store(VIEW_KEY, view); }
    paint(0);
  });

  /* ---- where the window is ---- */
  const narrow = () => matchMedia(NARROW).matches;
  function setMode(m, keep){
    if (m === "left") m = "right";
    if (narrow() && (m === "float" || m === "right")) m = "sheet";
    if (m !== "full") lastMode = m;
    /* pinned, there is a column of room under the slide: every slide goes
       in it, unless they have been put away while pinned before */
    if (m === "right" && thumbs.hidden && !view.noThumbs){
      buildThumbs(); thumbs.hidden = false; bThumbs.classList.add("on");
    }
    view.mode = m;
    if (!keep) store(VIEW_KEY, view);
    place();
  }
  function place(){
    const m = view.mode;
    win.dataset.mode = m;
    const b = document.body.classList;
    b.toggle("sl-pin-right", shown && m === "right");
    b.toggle("sl-sheet", shown && m === "sheet");
    document.documentElement.style.setProperty("--sl-side", clampSide(view.side) + "px");
    win.style.left = win.style.top = win.style.width = "";
    if (m === "float"){
      const w = Math.min(Math.max(260, view.w || 440), innerWidth - 16);
      win.style.width = w + "px";
      const h = win.offsetHeight || w / ratioOf(deck) + 90;
      const x = view.x === null ? innerWidth - w - 20 : view.x;
      const y = view.y === null ? 70 : view.y;
      win.style.left = Math.min(Math.max(4, x), innerWidth - Math.min(w, 120)) + "px";
      win.style.top = Math.min(Math.max(4, y), innerHeight - Math.min(h, 60)) + "px";
    }
    bRight.classList.toggle("on", m === "right");
    bFloat.classList.toggle("on", m === "float"); bFull.classList.toggle("on", m === "full");
    [bRight, bFloat].forEach(x => { x.hidden = narrow(); });
    open.classList.toggle("on", shown);
    open.setAttribute("aria-pressed", shown ? "true" : "false");
    /* the page's own layout has just changed width */
    try{ window.dispatchEvent(new Event("resize")); }catch(e){}
  }
  function clampSide(w){ return Math.round(Math.min(Math.max(260, w || 420), Math.max(280, innerWidth - 380))); }
  function show(){
    shown = true;
    win.hidden = false;
    setMode(view.mode);
    if (!holder.firstElementChild) paint(0);
    paintPage();
    win.focus({ preventScroll: true });
  }
  function hide(){
    shown = false;
    if (view.mode === "full") view.mode = lastMode;
    win.hidden = true;
    place();
    paintPage();
  }
  bRight.addEventListener("click", () => setMode("right"));
  bFloat.addEventListener("click", () => setMode("float"));
  bFull.addEventListener("click", () => setMode(view.mode === "full" ? lastMode : "full", true));
  bClose.addEventListener("click", hide);
  addEventListener("resize", () => { if (shown) placeSoon(); });
  let placeTimer = null;
  function placeSoon(){
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => {
      if (narrow() && /^(float|right)$/.test(view.mode)) setMode("sheet", true);
      else if (!narrow() && view.mode === "sheet") setMode(lastMode === "sheet" ? "float" : lastMode, true);
      else win.dataset.mode = view.mode;
    }, 120);
  }

  /* ---- dragging it about ----
     The bar is the handle. Pulled to the right edge it pins
     there, to the top it fills the screen, and pulled away from a pinned
     edge it comes loose and floats under the pointer. */
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    if (view.mode === "full" || view.mode === "sheet") return;
    const r = win.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, from: view.mode, moved: false, snap: null };
    bar.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    if (!drag.moved){
      drag.moved = true;
      win.classList.add("sl-dragging");
      if (drag.from !== "float"){
        /* off the edge: float at the size it was, with the pointer still
           on the bar where it took hold */
        view.w = Math.min(view.w || 440, 520);
        drag.dx = Math.min(drag.dx, view.w - 40);
        drag.dy = 16;
        setMode("float", true);
      }
    }
    view.x = e.clientX - drag.dx; view.y = e.clientY - drag.dy;
    win.style.left = Math.min(Math.max(-view.w + 80, view.x), innerWidth - 80) + "px";
    win.style.top = Math.min(Math.max(0, view.y), innerHeight - 40) + "px";
    const edge = 28;
    drag.snap = e.clientX > innerWidth - edge ? "right" : e.clientY < 10 ? "full" : null;
    snapHint.hidden = !drag.snap;
    if (drag.snap) snapHint.dataset.side = drag.snap;
  });
  const endDrag = () => {
    if (!drag) return;
    win.classList.remove("sl-dragging");
    snapHint.hidden = true;
    const snap = drag.snap, moved = drag.moved;
    drag = null;
    if (!moved) return;
    if (snap === "full") setMode("full", true);
    else if (snap) setMode(snap);
    else setMode("float");
  };
  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);
  bar.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    setMode(view.mode === "full" ? lastMode : "full", true);
  });

  /* resizing: any corner when floating, the inside edge when pinned */
  function resizer(handle, onMove){
    let start = null;
    handle.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, y: e.clientY, side: view.side, rect: win.getBoundingClientRect() };
      handle.setPointerCapture(e.pointerId); e.preventDefault();
      win.classList.add("sl-dragging");
    });
    handle.addEventListener("pointermove", (e) => { if (start) onMove(e, start); });
    const end = () => { if (!start) return; start = null; win.classList.remove("sl-dragging"); store(VIEW_KEY, view); place(); };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  /* The slide keeps its shape, so a corner only decides the width; the
     height follows. The corner opposite the one held stays where it is,
     which means a left corner moves the window's left edge and a top
     corner its top, measured once the new height is known. */
  corners.forEach(h => {
    const c = h.dataset.corner;
    resizer(h, (e, s) => {
      const dx = e.clientX - s.x;
      view.w = Math.round(Math.min(Math.max(260, s.rect.width + (c.includes("e") ? dx : -dx)), innerWidth - 16));
      win.style.width = view.w + "px";
      view.x = Math.round(c.includes("w") ? s.rect.right - view.w : s.rect.left);
      view.y = Math.round(c.includes("n") ? s.rect.bottom - win.offsetHeight : s.rect.top);
      win.style.left = view.x + "px";
      win.style.top = view.y + "px";
    });
  });
  resizer(split, (e, s) => {
    view.side = clampSide(s.side + (s.x - e.clientX));
    document.documentElement.style.setProperty("--sl-side", view.side + "px");
  });

  /* ---- the keyboard ----
     Only when the slides are being used: the pointer over them, focus in
     them, or the whole screen. Arrow keys in a code box or an answer are
     the student's, never the slides'. */
  let over = false;
  win.addEventListener("pointerenter", () => { over = true; });
  win.addEventListener("pointerleave", () => { over = false; });
  function onKey(e){
    if (!shown || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const using = over || view.mode === "full" || win.contains(document.activeElement);
    if (e.key === "Escape" && view.mode === "full"){ setMode(lastMode, true); e.preventDefault(); return; }
    if (!using) return;
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " "){ step(1); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === "PageUp"){ step(-1); e.preventDefault(); }
    else if (k === "Home"){ go(0); e.preventDefault(); }
    else if (k === "End"){ go(list.length - 1); e.preventDefault(); }
  }
  document.addEventListener("keydown", onKey);

  /* ---- a finger swipes ---- */
  let swipe = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    swipe = { x: e.clientX, y: e.clientY };
  });
  stage.addEventListener("pointerup", (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
  });

  /* ---- following the lesson ----
     The builder can match a slide to a page. Changing page moves the
     slides there, and the Slides button glows on a page that has one, as
     a nudge rather than an interruption. This was a Settings experiment
     and is now simply how the slides behave. */
  let pageIdx = null;
  function paintPage(){
    const id = pageIdx !== null && o.slideForPage ? o.slideForPage(pageIdx) : null;
    const at = id ? list.findIndex(s => s.id === id) : -1;
    open.classList.toggle("sl-hint", at >= 0 && !shown);
    return at;
  }
  function page(i){
    pageIdx = i;
    const at = paintPage();
    if (at >= 0) go(at);
  }

  place();
  return { show, hide, go, page, get index(){ return cur; } };
}

/* ---------------- the presenter ----------------
   The whole screen, for the front of the room. Keys: arrows or space to
   move, B for a black screen, W for a white one, L for the laser, P for
   the pen, C to clear the pen, N for the notes in a window of their own,
   Escape to leave. It is for the projector only: students' slides do not
   follow it. */
function present(deck, o){
  o = o || {};
  const list = deck.list;
  let cur = Math.min(Math.max(0, o.start || 0), list.length - 1);
  let tool = null, blank = null, notesWin = null;
  const t0 = Date.now();
  const ink = {};

  const root = div("sl-present");
  root.style.setProperty("--r", ratioOf(deck));
  const holder = div("sl-hold");
  const stage = div("sl-pstage"); stage.appendChild(holder);
  const canvas = document.createElement("canvas"); canvas.className = "sl-pink";
  const trail = document.createElement("canvas"); trail.className = "sl-ptrail";
  const cover = div("sl-cover"); cover.hidden = true;
  const hud = div("sl-hud");
  const bPrev = btn("sl-hudb", "&#8592;", "Previous slide");
  const count = div("sl-hudcount");
  const bNext = btn("sl-hudb", "&#8594;", "Next slide");
  const bLaser = btn("sl-hudb", "&#9679;", "Laser pointer (L)");
  const bPen = btn("sl-hudb", "&#9998;", "Pen (P)");
  const bClear = btn("sl-hudb", "&#9003;", "Clear the pen (C)");
  const bBlack = btn("sl-hudb", "&#9632;", "Black screen (B)");
  const bWhite = btn("sl-hudb", "&#9633;", "White screen (W)");
  const bNotes = btn("sl-hudb", "&#128221;", "Notes in their own window (N)");
  const clock = div("sl-hudclock");
  const bExit = btn("sl-hudb", "&#10005;", "Stop presenting (Esc)");
  [bPrev, count, bNext, bLaser, bPen, bClear, bBlack, bWhite, bNotes, clock, bExit].forEach(x => hud.appendChild(x));
  [stage, canvas, trail, cover, hud].forEach(x => root.appendChild(x));
  document.body.appendChild(root);
  document.body.classList.add("sl-presenting");
  try{ if (o.fullscreen !== false && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }catch(e){}

  function paint(dir){
    swapInto(holder, draw(list[cur], deck), dir);
    count.textContent = (cur + 1) + " / " + list.length;
    bPrev.disabled = cur === 0; bNext.disabled = cur === list.length - 1;
    requestAnimationFrame(drawPen);
    paintNotes();
  }
  function go(n){
    n = Math.min(Math.max(0, n), list.length - 1);
    if (n === cur) return;
    const dir = n > cur ? 1 : -1; cur = n; paint(dir);
  }
  bPrev.addEventListener("click", () => go(cur - 1));
  bNext.addEventListener("click", () => go(cur + 1));

  function setTool(t){
    tool = tool === t ? null : t;
    bLaser.classList.toggle("on", tool === "laser");
    bPen.classList.toggle("on", tool === "pen");
    root.dataset.tool = tool || "";
  }
  function setBlank(c){
    blank = blank === c ? null : c;
    cover.hidden = !blank;
    cover.dataset.c = blank || "";
    bBlack.classList.toggle("on", blank === "black"); bWhite.classList.toggle("on", blank === "white");
  }
  bLaser.addEventListener("click", () => setTool("laser"));
  bPen.addEventListener("click", () => setTool("pen"));
  bClear.addEventListener("click", () => { delete ink[cur]; drawPen(); });
  bBlack.addEventListener("click", () => setBlank("black"));
  bWhite.addEventListener("click", () => setBlank("white"));
  bNotes.addEventListener("click", openNotes);
  bExit.addEventListener("click", close);

  /* -- the pen, kept per slide while presenting and never saved -- */
  let stroke = null;
  function slideBox(){
    return holder.lastElementChild ? holder.getBoundingClientRect() : null;
  }
  function size(c){
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }
  function drawPen(){
    const g = size(canvas);
    const b = slideBox();
    if (!b) return;
    g.lineCap = g.lineJoin = "round";
    g.strokeStyle = "#FF2D55"; g.lineWidth = Math.max(3, b.width / 300);
    (ink[cur] || []).concat(stroke ? [stroke] : []).forEach(pts => {
      g.beginPath();
      for (let i = 0; i < pts.length; i += 2){
        const x = b.left + pts[i] * b.width, y = b.top + pts[i + 1] * b.height;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    });
  }
  const rel = (e) => { const b = slideBox(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
  root.addEventListener("pointerdown", (e) => {
    if (tool !== "pen" || e.target.closest(".sl-hud")) return;
    stroke = rel(e); root.setPointerCapture(e.pointerId);
  });
  /* -- the laser: a dot with a fading tail, so the class can follow it -- */
  let dots = [], raf = null;
  function laserFrame(){
    const g = size(trail);
    const now = performance.now();
    dots = dots.filter(d => now - d.t < 420);
    dots.forEach((d, i) => {
      const a = 1 - (now - d.t) / 420;
      g.beginPath(); g.fillStyle = "rgba(255,40,60," + (a * 0.55) + ")";
      g.arc(d.x, d.y, 4 + 7 * a, 0, Math.PI * 2); g.fill();
      if (i === dots.length - 1){
        g.beginPath(); g.fillStyle = "#FF283C"; g.shadowColor = "#FF283C"; g.shadowBlur = 18;
        g.arc(d.x, d.y, 9, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      }
    });
    raf = dots.length ? requestAnimationFrame(laserFrame) : null;
  }
  let idle = null;
  root.addEventListener("pointermove", (e) => {
    root.classList.add("sl-awake");
    clearTimeout(idle); idle = setTimeout(() => root.classList.remove("sl-awake"), 2200);
    if (tool === "laser"){
      dots.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!raf) raf = requestAnimationFrame(laserFrame);
    }
    if (stroke){ const p = rel(e); stroke.push(p[0], p[1]); drawPen(); }
  });
  const endStroke = () => { if (!stroke) return; (ink[cur] = ink[cur] || []).push(stroke); stroke = null; drawPen(); };
  root.addEventListener("pointerup", endStroke);
  root.addEventListener("pointercancel", endStroke);
  root.addEventListener("click", (e) => {
    if (tool || e.target.closest(".sl-hud") || e.target.closest("a")) return;
    go(cur + (e.clientX < innerWidth / 3 ? -1 : 1));
  });

  /* -- the notes, in a window of their own for the teacher's screen -- */
  function openNotes(){
    if (notesWin && !notesWin.closed){ notesWin.focus(); return; }
    notesWin = window.open("", "hubSlideNotes", "width=560,height=640");
    if (!notesWin) return;
    const d = notesWin.document;
    d.title = "Slide notes";
    d.body.style.cssText = "font:18px/1.5 'Segoe UI',system-ui,sans-serif;margin:0;padding:20px 24px;background:#16181D;color:#E8EAF0";
    d.body.innerHTML = '<div id="n" style="font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#8FA3C8"></div>' +
      '<div id="t" style="font-size:30px;font-weight:700;margin:6px 0 2px"></div>' +
      '<div id="c" style="font-size:15px;color:#8FA3C8;margin-bottom:16px"></div>' +
      '<div id="b" style="white-space:pre-wrap"></div>' +
      '<div id="x" style="margin-top:24px;padding-top:12px;border-top:1px solid #333;color:#8FA3C8"></div>';
    notesWin.addEventListener("keydown", key);
    paintNotes();
  }
  function paintNotes(){
    if (!notesWin || notesWin.closed) return;
    const d = notesWin.document, s = list[cur], nx = list[cur + 1];
    const q = (id) => d.getElementById(id);
    if (!q("n")) return;
    q("n").textContent = "Slide " + (cur + 1) + " of " + list.length;
    q("t").textContent = s.title || "";
    q("b").textContent = s.notes || "No notes for this slide.";
    q("x").textContent = nx ? "Next: " + (nx.title || "slide " + (cur + 2)) : "This is the last slide.";
  }
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    clock.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    if (notesWin && !notesWin.closed){ const c = notesWin.document.getElementById("c"); if (c) c.textContent = "Presenting for " + clock.textContent; }
  }, 1000);

  function key(e){
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter"){ go(cur + 1); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace"){ go(cur - 1); e.preventDefault(); }
    else if (k === "Home") go(0);
    else if (k === "End") go(list.length - 1);
    else if (k === "b" || k === "B" || k === ".") setBlank("black");
    else if (k === "w" || k === "W" || k === ",") setBlank("white");
    else if (k === "l" || k === "L") setTool("laser");
    else if (k === "p" || k === "P") setTool("pen");
    else if (k === "c" || k === "C"){ delete ink[cur]; drawPen(); }
    else if (k === "n" || k === "N") openNotes();
    else if (k === "Escape"){ if (tool) setTool(tool); else if (blank) setBlank(blank); else close(); }
    else if (/^[0-9]$/.test(k)){ typed += k; clearTimeout(typedTimer); typedTimer = setTimeout(() => { go(parseInt(typed, 10) - 1); typed = ""; }, 600); }
  }
  let typed = "", typedTimer = null;
  document.addEventListener("keydown", key, true);
  const onResize = () => drawPen();
  addEventListener("resize", onResize);
  const onFs = () => { if (!document.fullscreenElement && o.closeWithFullscreen) close(); };
  document.addEventListener("fullscreenchange", onFs);

  function close(){
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("fullscreenchange", onFs);
    removeEventListener("resize", onResize);
    clearInterval(tick);
    try{ if (notesWin && !notesWin.closed) notesWin.close(); }catch(e){}
    try{ if (document.fullscreenElement) document.exitFullscreen(); }catch(e){}
    root.remove();
    document.body.classList.remove("sl-presenting");
    if (o.onClose) o.onClose(cur);
  }
  paint(0);
  root.classList.add("sl-awake");
  idle = setTimeout(() => root.classList.remove("sl-awake"), 2600);
  return { go, close };
}

window.hubSlides = { has, draw, words, viewer, present, picSrc, ratioOf };
})();
