/* ===================================================================
   author-slides.js — the builder's Slides pop-up.

   A lesson's slides are one deck, kept on the lesson as lesson.slides
   (the shape is described at the top of slides.js). They come in three
   ways, from the buttons along the top of the pop-up:

     Import PowerPoint  a .pptx, read slide by slide into boxes, pictures
                        and lines that can still be edited (slides-import.js)
     Add pictures       one slide per picture: PowerPoint's File > Export >
                        PNG gives exactly this, and it is the fallback for
                        any slide the import draws badly
     New slide          a title and a formatting box, written here

   Pictures go to the images table like every other picture in the
   builder, and are kept by id. A slide can be tied to a page of the
   lesson; the page carries the slide's id, so it moves with the page.

   Saving is the lesson's own autosave: every change here calls
   saveDraft() and schedulePreview() like any editor on the page.
   =================================================================== */
(function(){
"use strict";

const SLIDE_SIDE = 1600;        // longest side of a picture on a slide
const SLIDE_TARGET = 700000;    // base64 length the server will take

function newId(){ return "s" + Math.random().toString(36).slice(2, 9); }
function deck(){
  if (!lesson.slides || !Array.isArray(lesson.slides.list)) lesson.slides = { ratio: 16 / 9, hpt: 405, list: [] };
  return lesson.slides;
}
function changed(){
  if (lesson.slides && !lesson.slides.list.length) delete lesson.slides;
  try{ saveDraft(); }catch(e){}
  try{ schedulePreview(); }catch(e){}
  paintButton();
}
function paintButton(){
  const b = document.getElementById("slidesBtn");
  if (!b) return;
  const n = lesson && lesson.slides && lesson.slides.list ? lesson.slides.list.length : 0;
  b.textContent = n ? "Slides (" + n + ")" : "Slides";
}
window.paintSlidesButton = paintButton;

/* ---------------- a picture for a slide ----------------
   Not shrinkPicture(): that always makes a JPEG, and a JPEG has no see-
   through parts, so a logo or a cut-out on a coloured slide arrived in a
   black box. A picture with any transparency stays a PNG; otherwise the
   smaller of the two is kept, which for a screenshot of text is usually
   the PNG anyway. */
function loadImage(blob){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { resolve(im); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture could not be read.")); };
    im.src = url;
  });
}
async function slidePicture(blob){
  const im = await loadImage(blob);
  let w = im.naturalWidth || 800, h = im.naturalHeight || 600;
  const scale = Math.min(1, SLIDE_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
  let made = null;
  for (let tries = 0; tries < 5 && !made; tries++){
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0, w, h);
    let alpha = false;
    try{
      const px = g.getImageData(0, 0, w, h).data;
      for (let i = 3; i < px.length; i += 16) if (px[i] < 250){ alpha = true; break; }
    }catch(e){}
    const png = c.toDataURL("image/png");
    if (alpha){
      if (png.length <= SLIDE_TARGET) made = { data: png, mime: "image/png" };
    } else {
      const flat = document.createElement("canvas");
      flat.width = w; flat.height = h;
      const fg = flat.getContext("2d");
      fg.fillStyle = "#fff"; fg.fillRect(0, 0, w, h); fg.drawImage(c, 0, 0);
      let jpg = "";
      for (const q of [0.88, 0.78, 0.66, 0.5]){
        jpg = flat.toDataURL("image/jpeg", q);
        if (jpg.length <= SLIDE_TARGET) break;
      }
      const best = png.length <= jpg.length ? { data: png, mime: "image/png" } : { data: jpg, mime: "image/jpeg" };
      if (best.data.length <= SLIDE_TARGET) made = best;
    }
    if (!made){ w = Math.round(w * 0.75); h = Math.round(h * 0.75); }
  }
  if (!made) throw new Error("That picture is too big.");
  /* Offline there is no database: the picture travels inside the lesson
     file instead, which is fine for a few and heavy for many. */
  if (OFFLINE) return { src: made.data };
  const API = (window.HUB && window.HUB.API) || "";
  const r = await fetch(API + "/api/teacher/upload-image", { method: "POST", headers: window.teacherAuth.json(),
    body: JSON.stringify({ data: made.data, mime: made.mime, width: w, height: h, alt: "" }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "That picture could not be saved.");
  return { imgId: d.id };
}

/* ---------------- the pop-up ---------------- */
let picked = 0;
let busy = false;
function openSlides(){
  if (typeof bankOpen !== "undefined" && bankOpen) return;
  openModal(build);
}
window.openSlidesEditor = openSlides;
/* the documents pop-up keeps its pictures the same way */
window.slidePicture = (blob) => slidePicture(blob);

function build(box){
  const d = deck();
  picked = Math.min(picked, Math.max(0, d.list.length - 1));
  box.appendChild(el("h2", "", "Slides"));
  const lead = el("p", "modal-text sle-lead",
    "Students open these from a Slides button at the top of the lesson, and can float them over their work, pin them beside it or fill the screen. You can present them from here or from Manage on a class.");
  box.appendChild(lead);

  const acts = el("div", "sle-acts");
  const pptBtn = el("button", "btn-primary", "Import PowerPoint");
  const picBtn = el("button", "btn-ghost", "Add pictures");
  const newBtn = el("button", "btn-ghost", "+ New slide");
  const showBtn = el("button", "btn-ghost", "▶ Present");
  const clearBtn = el("button", "btn-ghost sle-danger", "Remove all");
  [pptBtn, picBtn, newBtn, showBtn, clearBtn].forEach(b => { b.type = "button"; acts.appendChild(b); });
  const pptIn = el("input"); pptIn.type = "file"; pptIn.accept = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"; pptIn.hidden = true;
  const picIn = el("input"); picIn.type = "file"; picIn.accept = "image/*"; picIn.multiple = true; picIn.hidden = true;
  acts.appendChild(pptIn); acts.appendChild(picIn);
  box.appendChild(acts);
  const msg = el("p", "sle-msg", ""); msg.setAttribute("aria-live", "polite");
  box.appendChild(msg);

  const main = el("div", "sle-main");
  const listEl = el("div", "sle-list");
  const detail = el("div", "sle-detail");
  main.appendChild(listEl); main.appendChild(detail);
  box.appendChild(main);
  const done = el("button", "btn-primary modal-cta", "Done");
  done.addEventListener("click", closeModal);
  box.appendChild(done);

  function say(t){ msg.textContent = t || ""; }
  function paintAll(){
    showBtn.disabled = clearBtn.disabled = !d.list.length;
    paintList(); paintDetail();
    paintButton();
  }

  /* -- the slides down the left -- */
  function paintList(){
    listEl.innerHTML = "";
    if (!d.list.length){
      listEl.appendChild(el("p", "sle-empty",
        "No slides yet. Import a PowerPoint, add pictures of your slides, or start a new one."));
      return;
    }
    d.list.forEach((s, i) => {
      const card = el("button", "sle-card" + (i === picked ? " on" : ""));
      card.type = "button";
      card.draggable = true;
      card.appendChild(window.hubSlides.draw(s, d));
      const cap = el("span", "sle-cap", (i + 1) + ". " + (s.title || kindName(s)));
      card.appendChild(cap);
      if (pageOf(s)) card.appendChild(el("span", "sle-pagetag", "Page " + pageNumber(pageOf(s))));
      card.addEventListener("click", () => { picked = i; paintAll(); });
      card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); card.classList.add("dragging"); });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("over"); });
      card.addEventListener("dragleave", () => card.classList.remove("over"));
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (isNaN(from) || from === i) return;
        const [moved] = d.list.splice(from, 1);
        d.list.splice(i, 0, moved);
        picked = i;
        changed(); paintAll();
      });
      listEl.appendChild(card);
    });
    const on = listEl.querySelector(".sle-card.on");
    if (on) on.scrollIntoView({ block: "nearest" });
  }
  function kindName(s){ return s.kind === "pic" ? "Picture" : s.kind === "pptx" ? "PowerPoint slide" : "New slide"; }

  /* -- the slide being edited -- */
  function paintDetail(){
    detail.innerHTML = "";
    const s = d.list[picked];
    if (!s) return;
    const big = window.hubSlides.draw(s, d);
    big.classList.add("sle-big");
    detail.appendChild(big);
    /* The words on an imported slide can be put right where they are:
       each box is typed into in place, and what is typed is kept as
       that box's own text. */
    if (s.kind === "pptx"){
      const boxes = big.querySelectorAll(".sl-box .sl-tx");
      const els = (s.el || []).filter(e => e.t !== "pic" && e.t !== "line");
      boxes.forEach((tx, k) => {
        const item = els.filter(e => e.html)[k];
        if (!item) return;
        tx.contentEditable = "true";
        tx.spellcheck = true;
        tx.addEventListener("input", () => {
          item.html = window.cleanSlideHtml ? window.cleanSlideHtml(tx.innerHTML) : tx.innerHTML;
          changed();
        });
        tx.addEventListener("blur", paintList);
      });
      detail.appendChild(el("p", "subnote", "Click any words on the slide to change them."));
    }

    const f = el("div", "sle-fields");
    const tWrap = el("label", "sle-field");
    tWrap.appendChild(el("span", "", s.kind === "text" ? "Title" : "Name in the list"));
    const t = el("input"); t.type = "text"; t.value = s.title || ""; t.maxLength = 120;
    t.addEventListener("input", () => { s.title = t.value; changed(); });
    t.addEventListener("change", paintAll);
    tWrap.appendChild(t);
    f.appendChild(tWrap);

    if (s.kind === "text"){
      const bWrap = el("div", "sle-field");
      bWrap.appendChild(el("span", "", "On the slide"));
      const ed = window.richText(s.html || "", (html) => { s.html = html; changed(); refreshBig(); },
        { rows: 6, upload: typeof pasteUpload === "function" ? pasteUpload : undefined,
          imageSrc: (id) => pictureSrc({ imgId: id }) });
      bWrap.appendChild(ed);
      f.appendChild(bWrap);
      const pRow = el("div", "sle-row");
      const pBtn = el("button", "btn-ghost", s.imgId || s.src ? "Change the picture" : "Add a picture beside it");
      pBtn.type = "button";
      const pIn = el("input"); pIn.type = "file"; pIn.accept = "image/*"; pIn.hidden = true;
      pBtn.addEventListener("click", () => pIn.click());
      pIn.addEventListener("change", async () => {
        const file = pIn.files && pIn.files[0];
        if (!file) return;
        say("Adding the picture…");
        try{ const made = await slidePicture(file); delete s.imgId; delete s.src; Object.assign(s, made); say(""); changed(); paintAll(); }
        catch(e){ say(e.message); }
      });
      pRow.appendChild(pBtn); pRow.appendChild(pIn);
      if (s.imgId || s.src){
        const rm = el("button", "btn-ghost", "Take the picture off");
        rm.type = "button";
        rm.addEventListener("click", () => { delete s.imgId; delete s.src; changed(); paintAll(); });
        pRow.appendChild(rm);
      }
      f.appendChild(pRow);
    }

    /* -- which page it goes with -- */
    const pWrap = el("label", "sle-field");
    pWrap.appendChild(el("span", "", "Goes with page"));
    const sel = el("select");
    sel.appendChild(new Option("No page in particular", ""));
    pagesOf().forEach((pg, n) => {
      const o = new Option("Page " + (n + 1) + ": " + stripTitle(pg.title || ""), String(n));
      sel.appendChild(o);
    });
    const now = pageOf(s);
    sel.value = now ? String(pagesOf().indexOf(now)) : "";
    sel.addEventListener("change", () => {
      lesson.blocks.forEach(b => { if (b.slide === s.id) delete b.slide; });
      const pg = pagesOf()[parseInt(sel.value, 10)];
      if (pg){ if (!s.id) s.id = newId(); pg.slide = s.id; }
      changed(); paintList();
    });
    pWrap.appendChild(sel);
    pWrap.appendChild(el("span", "subnote", "With Follow the lesson turned on in Settings, the slides move here when a student reaches that page."));
    f.appendChild(pWrap);

    const nWrap = el("label", "sle-field");
    nWrap.appendChild(el("span", "", "Notes for you"));
    const notes = el("textarea"); notes.rows = 3; notes.value = s.notes || ""; notes.maxLength = 4000;
    notes.placeholder = "Shown in the notes window when you present.";
    notes.addEventListener("input", () => { if (notes.value) s.notes = notes.value; else delete s.notes; changed(); });
    nWrap.appendChild(notes);
    nWrap.appendChild(el("span", "subnote", "Saved in the lesson, so a student who goes looking could find them."));
    f.appendChild(nWrap);

    const row = el("div", "sle-row");
    const up = el("button", "btn-ghost", "↑ Earlier");
    const down = el("button", "btn-ghost", "↓ Later");
    const dup = el("button", "btn-ghost", "Duplicate");
    const del = el("button", "btn-ghost sle-danger", "Delete slide");
    [up, down, dup, del].forEach(b => { b.type = "button"; row.appendChild(b); });
    up.disabled = picked === 0; down.disabled = picked === d.list.length - 1;
    up.addEventListener("click", () => move(-1));
    down.addEventListener("click", () => move(1));
    dup.addEventListener("click", () => {
      const copy = JSON.parse(JSON.stringify(s)); copy.id = newId();
      d.list.splice(picked + 1, 0, copy); picked++; changed(); paintAll();
    });
    del.addEventListener("click", () => {
      lesson.blocks.forEach(b => { if (b.slide === s.id) delete b.slide; });
      d.list.splice(picked, 1); picked = Math.max(0, picked - 1); changed(); paintAll();
    });
    f.appendChild(row);
    detail.appendChild(f);

    function refreshBig(){
      const fresh = window.hubSlides.draw(s, d);
      fresh.classList.add("sle-big");
      detail.replaceChild(fresh, detail.querySelector(".sle-big"));
    }
  }
  function move(dir){
    const to = picked + dir;
    if (to < 0 || to >= d.list.length) return;
    const [s] = d.list.splice(picked, 1);
    d.list.splice(to, 0, s); picked = to; changed(); paintAll();
  }

  /* -- bringing slides in -- */
  pptBtn.addEventListener("click", () => { if (!busy) pptIn.click(); });
  picBtn.addEventListener("click", () => { if (!busy) picIn.click(); });
  pptIn.addEventListener("change", async () => {
    const file = pptIn.files && pptIn.files[0];
    pptIn.value = "";
    if (!file) return;
    busy = true; pptBtn.disabled = picBtn.disabled = true;
    try{
      const made = await window.hubSlideImport.readPptx(file, { progress: say, picture: slidePicture });
      if (!made.list.length) throw new Error("There were no slides in that file.");
      /* A deck already here keeps its shape; slides of another shape are
         still drawn whole, letterboxed inside it. */
      if (!d.list.length){ d.ratio = made.ratio; d.hpt = made.hpt; }
      else if (Math.abs(d.ratio - made.ratio) > 0.01 && made.list.length){ d.ratio = made.ratio; d.hpt = made.hpt; }
      made.list.forEach(s => { s.id = newId(); });
      const at = d.list.length;
      d.list.push.apply(d.list, made.list);
      picked = at;
      const k = made.skipped, left = [];
      if (k.pictures) left.push(k.pictures + " picture" + (k.pictures === 1 ? "" : "s") + " in a format the web cannot show");
      if (k.charts) left.push(k.charts + " chart" + (k.charts === 1 ? "" : "s") + " or diagram" + (k.charts === 1 ? "" : "s"));
      if (k.media) left.push(k.media + " video" + (k.media === 1 ? "" : "s") + " or sound" + (k.media === 1 ? "" : "s"));
      if (k.shapes) left.push(k.shapes + " hand-drawn shape" + (k.shapes === 1 ? "" : "s"));
      if (k.hidden) left.push(k.hidden + " hidden slide" + (k.hidden === 1 ? "" : "s"));
      say(made.list.length + " slide" + (made.list.length === 1 ? "" : "s") + " added." +
          (left.length ? " Left out: " + left.join(", ") + ". Export those slides as pictures if they matter." : ""));
      changed(); paintAll();
    }catch(e){ say(e.message || "That file could not be read."); }
    busy = false; pptBtn.disabled = picBtn.disabled = false;
  });
  picIn.addEventListener("change", async () => {
    const files = Array.from(picIn.files || []);
    picIn.value = "";
    if (!files.length) return;
    /* PowerPoint names exported slides Slide1.png, Slide2.png ... Slide10:
       sorted by the number in the name, not as text, or 10 lands after 1. */
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    busy = true; pptBtn.disabled = picBtn.disabled = true;
    const at = d.list.length;
    let n = 0, failed = 0;
    for (const file of files){
      n++;
      say("Adding picture " + n + " of " + files.length + "…");
      try{
        const made = await slidePicture(file);
        if (!d.list.length && n === 1){
          const im = await loadImage(file);
          if (im.naturalWidth && im.naturalHeight){ d.ratio = Math.round(im.naturalWidth / im.naturalHeight * 1000) / 1000; d.hpt = 405; }
        }
        d.list.push(Object.assign({ id: newId(), kind: "pic", title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) }, made));
      }catch(e){ failed++; }
    }
    picked = Math.min(at, d.list.length - 1);
    say((files.length - failed) + " slide" + (files.length - failed === 1 ? "" : "s") + " added." +
        (failed ? " " + failed + " could not be read." : ""));
    busy = false; pptBtn.disabled = picBtn.disabled = false;
    changed(); paintAll();
  });
  newBtn.addEventListener("click", () => {
    d.list.splice(d.list.length ? picked + 1 : 0, 0, { id: newId(), kind: "text", title: "New slide", html: "" });
    picked = d.list.length === 1 ? 0 : picked + 1;
    changed(); paintAll();
    const t = detail.querySelector("input[type=text]");
    if (t){ t.focus(); t.select(); }
  });
  showBtn.addEventListener("click", () => {
    if (!d.list.length) return;
    window.hubSlides.present(d, { start: picked, onClose: (at) => { picked = at; paintAll(); } });
  });
  clearBtn.addEventListener("click", () => {
    if (!confirm("Remove all " + d.list.length + " slides from this lesson?")) return;
    lesson.blocks.forEach(b => { delete b.slide; });
    d.list.length = 0; picked = 0; changed(); paintAll();
  });

  paintAll();
}

/* ---------------- pages ---------------- */
function pagesOf(){ return (lesson.blocks || []).filter(b => b.type === "page"); }
function pageOf(s){ return s && s.id ? pagesOf().find(p => p.slide === s.id) || null : null; }
function pageNumber(p){ return pagesOf().indexOf(p) + 1; }
function stripTitle(t){ const d = document.createElement("div"); d.innerHTML = t; return (d.textContent || "").trim() || "Untitled"; }

/* What is typed into a box on an imported slide is kept, but not anything a
   paste drags in with it: the words, line breaks, bold, italic and the
   spans that carry the slide's own sizes and colours. */
window.cleanSlideHtml = function(html){
  const box = document.createElement("div");
  box.innerHTML = html;
  box.querySelectorAll("script,style,iframe,object,embed,img,video,audio,svg,math,form,input,button").forEach(n => n.remove());
  box.querySelectorAll("*").forEach(n => {
    Array.from(n.attributes).forEach(a => {
      const keep = a.name === "style" || a.name === "class" || (n.tagName === "A" && a.name === "href" && /^(https?:|mailto:)/i.test(a.value));
      if (!keep || /expression|url\s*\(|javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
  });
  return box.innerHTML;
};

/* ---------------- what is saved, and read back ----------------
   Called by compile() and fromCompiled(), so a deck survives the round
   trip a lesson makes every time it is opened. Links from a page to a
   slide that is no longer there are dropped as they are saved. */
window.compileSlides = function(l){
  const d = l && l.slides;
  if (!d || !Array.isArray(d.list) || !d.list.length) return null;
  const out = JSON.parse(JSON.stringify({ ratio: d.ratio || 16 / 9, hpt: d.hpt || 405, list: d.list }));
  out.list.forEach(s => { if (!s.id) s.id = newId(); });
  return out;
};
window.readSlides = function(data){
  const d = data && data.slides;
  if (!d || !Array.isArray(d.list) || !d.list.length) return null;
  return JSON.parse(JSON.stringify(d));
};
window.slideIds = function(l){
  return new Set(l && l.slides && Array.isArray(l.slides.list) ? l.slides.list.map(s => s.id).filter(Boolean) : []);
};


document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("slidesBtn");
  if (b) b.addEventListener("click", openSlides);
});
})();
