/* ===================================================================
   author-docs.js — the builder's Documents pop-up.

   Word files come in through Import Word (several at once is fine) and
   are kept on the lesson as lesson.docs (see the top of docs.js). Each one
   can be renamed, put in order, tied to a page, and have its words put
   right in place; the one choice for the whole lesson is whether it opens
   as the lesson starts. Saved with the lesson's own autosave, the same as
   the slides.
   =================================================================== */
(function(){
"use strict";

function newId(){ return "d" + Math.random().toString(36).slice(2, 9); }
function docs(){
  if (!lesson.docs || !Array.isArray(lesson.docs.list)) lesson.docs = { list: [], open: true };
  return lesson.docs;
}
function changed(){
  if (lesson.docs && !lesson.docs.list.length) delete lesson.docs;
  try{ saveDraft(); }catch(e){}
  try{ schedulePreview(); }catch(e){}
  paintButton();
}
function paintButton(){
  const b = document.getElementById("docsBtn");
  if (!b) return;
  const n = lesson && lesson.docs && lesson.docs.list ? lesson.docs.list.length : 0;
  b.textContent = n ? "Documents (" + n + ")" : "Documents";
}
window.paintDocsButton = paintButton;

let picked = 0, busy = false;
function openDocs(){
  if (typeof bankOpen !== "undefined" && bankOpen) return;
  openModal(build);
}
window.openDocsEditor = openDocs;

function pagesOf(){ return (lesson.blocks || []).filter(b => b.type === "page"); }
function stripTitle(t){ const d = document.createElement("div"); d.innerHTML = t; return (d.textContent || "").trim() || "Untitled"; }

function build(box){
  const d = docs();
  picked = Math.min(picked, Math.max(0, d.list.length - 1));
  box.appendChild(el("h2", "", "Documents"));
  box.appendChild(el("p", "modal-text sle-lead",
    "A Word document opens beside the lesson, docked on the right with the lesson on the left. Worksheets, help sheets and reading all work."));
  const acts = el("div", "sle-acts");
  const wordBtn = el("button", "btn-primary", "Import Word");
  const delAll = el("button", "btn-ghost sle-danger", "Remove all");
  [wordBtn, delAll].forEach(b => { b.type = "button"; acts.appendChild(b); });
  const wordIn = el("input"); wordIn.type = "file"; wordIn.multiple = true; wordIn.hidden = true;
  wordIn.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  acts.appendChild(wordIn);
  box.appendChild(acts);
  const msg = el("p", "sle-msg", ""); msg.setAttribute("aria-live", "polite");
  box.appendChild(msg);

  /* the one choice for the lesson as a whole */
  const opts = el("div", "dce-opts");
  const optOpen = toggleRow("Open it as the lesson starts", "Not on a phone, where it would take half the screen without being asked.",
    () => d.open !== false, (v) => { d.open = v; });
  opts.appendChild(optOpen);
  box.appendChild(opts);

  const main = el("div", "sle-main");
  const listEl = el("div", "sle-list");
  const detail = el("div", "sle-detail");
  main.appendChild(listEl); main.appendChild(detail);
  box.appendChild(main);
  const done = el("button", "btn-primary modal-cta", "Done");
  done.addEventListener("click", closeModal);
  box.appendChild(done);

  function toggleRow(label, words, get, set){
    const b = el("button", "sl-lab");
    b.type = "button";
    b.setAttribute("role", "switch");
    const w = el("span", "sl-lab-words");
    w.appendChild(el("b", "", label));
    w.appendChild(el("span", "", words));
    const pill = el("span", "sl-lab-pill", "");
    b.appendChild(w); b.appendChild(pill);
    const paint = () => { const v = get(); b.classList.toggle("on", v); b.setAttribute("aria-checked", v ? "true" : "false"); pill.textContent = v ? "On" : "Off"; };
    b.addEventListener("click", () => { set(!get()); paint(); changed(); });
    paint();
    return b;
  }
  const say = (t) => { msg.textContent = t || ""; };

  function paintAll(){
    delAll.disabled = !d.list.length;
    opts.hidden = !d.list.length;
    paintList(); paintDetail(); paintButton();
  }
  function paintList(){
    listEl.innerHTML = "";
    if (!d.list.length){
      listEl.appendChild(el("p", "sle-empty", "No documents yet. Import a Word file (.docx)."));
      return;
    }
    d.list.forEach((doc, i) => {
      const card = el("button", "sle-card dce-card" + (i === picked ? " on" : ""));
      card.type = "button";
      const peek = el("div", "dce-peek");
      peek.appendChild(window.hubDocs.paper(doc));
      card.appendChild(peek);
      card.appendChild(el("span", "sle-cap", (i + 1) + ". " + (doc.title || "Document")));
      const pg = pagesOf().find(p => p.doc === doc.id);
      if (pg) card.appendChild(el("span", "sle-pagetag", "Page " + (pagesOf().indexOf(pg) + 1)));
      card.addEventListener("click", () => { picked = i; paintAll(); });
      listEl.appendChild(card);
    });
  }
  function paintDetail(){
    detail.innerHTML = "";
    const doc = d.list[picked];
    if (!doc) return;
    const frame = el("div", "dce-frame");
    const p = window.hubDocs.paper(doc);
    /* the words are put right in place, as on an imported slide */
    p.contentEditable = "true";
    p.spellcheck = true;
    p.addEventListener("input", () => {
      const copy = p.cloneNode(true);
      copy.querySelectorAll("img[data-img]").forEach(im => im.removeAttribute("src"));
      copy.querySelectorAll("a").forEach(a => { a.removeAttribute("style"); a.removeAttribute("target"); a.removeAttribute("rel"); });
      doc.html = window.cleanSlideHtml ? keepPictures(copy.innerHTML) : copy.innerHTML;
      changed();
    });
    frame.appendChild(p);
    detail.appendChild(frame);
    detail.appendChild(el("p", "subnote", "Click into the document to change its words."));

    const f = el("div", "sle-fields");
    const tWrap = el("label", "sle-field");
    tWrap.appendChild(el("span", "", "Name"));
    const t = el("input"); t.type = "text"; t.value = doc.title || ""; t.maxLength = 120;
    t.addEventListener("input", () => { doc.title = t.value; changed(); });
    t.addEventListener("change", paintList);
    tWrap.appendChild(t);
    f.appendChild(tWrap);

    const pWrap = el("label", "sle-field");
    pWrap.appendChild(el("span", "", "Brought forward on page"));
    const sel = el("select");
    sel.appendChild(new Option("No page in particular", ""));
    pagesOf().forEach((pg, n) => sel.appendChild(new Option("Page " + (n + 1) + ": " + stripTitle(pg.title || ""), String(n))));
    const now = pagesOf().find(pg => pg.doc === doc.id);
    sel.value = now ? String(pagesOf().indexOf(now)) : "";
    sel.addEventListener("change", () => {
      lesson.blocks.forEach(b => { if (b.doc === doc.id) delete b.doc; });
      const pg = pagesOf()[parseInt(sel.value, 10)];
      if (pg){ if (!doc.id) doc.id = newId(); pg.doc = doc.id; }
      changed(); paintList();
    });
    pWrap.appendChild(sel);
    pWrap.appendChild(el("span", "subnote", "When a student reaches that page, this document is the one showing."));
    f.appendChild(pWrap);

    const row = el("div", "sle-row");
    const up = el("button", "btn-ghost", "↑ Earlier");
    const down = el("button", "btn-ghost", "↓ Later");
    const del = el("button", "btn-ghost sle-danger", "Delete document");
    [up, down, del].forEach(b => { b.type = "button"; row.appendChild(b); });
    up.disabled = picked === 0; down.disabled = picked === d.list.length - 1;
    const move = (dir) => { const [x] = d.list.splice(picked, 1); picked += dir; d.list.splice(picked, 0, x); changed(); paintAll(); };
    up.addEventListener("click", () => move(-1));
    down.addEventListener("click", () => move(1));
    del.addEventListener("click", () => {
      lesson.blocks.forEach(b => { if (b.doc === doc.id) delete b.doc; });
      d.list.splice(picked, 1); picked = Math.max(0, picked - 1); changed(); paintAll();
    });
    f.appendChild(row);
    detail.appendChild(f);
  }
  /* cleanSlideHtml drops every <img>, which on a slide box is right and in
     a document would take the pictures out. Those are kept by id. */
  function keepPictures(html){
    const ids = [];
    const marked = html.replace(/<img\b[^>]*data-img="([^"]+)"[^>]*>/g, (m, id) => { ids.push(id); return "\u0002" + (ids.length - 1) + "\u0002"; });
    return window.cleanSlideHtml(marked).replace(/\u0002(\d+)\u0002/g, (m, k) => '<img data-img="' + ids[+k].replace(/"/g, "") + '" alt="">');
  }

  wordBtn.addEventListener("click", () => { if (!busy) wordIn.click(); });
  wordIn.addEventListener("change", async () => {
    const files = Array.from(wordIn.files || []);
    wordIn.value = "";
    if (!files.length) return;
    busy = true; wordBtn.disabled = true;
    let added = 0;
    const notes = [];
    for (const file of files){
      if (!/\.docx$/i.test(file.name)){ notes.push(file.name + " is not a .docx file. Save it as .docx in Word first."); continue; }
      try{
        const made = await window.hubDocImport.readDocx(file, {
          progress: (t) => say(file.name + ": " + t),
          picture: window.slidePicture
        });
        d.list.push({ id: newId(), title: made.title, html: made.html, outline: made.outline, font: made.font, pt: made.pt });
        added++;
        const k = made.skipped, left = [];
        if (k.pictures) left.push(k.pictures + " picture" + (k.pictures === 1 ? "" : "s"));
        if (k.charts) left.push(k.charts + " chart" + (k.charts === 1 ? "" : "s"));
        if (k.footnotes) left.push(k.footnotes + " footnote" + (k.footnotes === 1 ? "" : "s"));
        if (left.length) notes.push(made.title + ": left out " + left.join(", ") + ".");
      }catch(e){ notes.push(file.name + ": " + (e.message || "could not be read.")); }
    }
    picked = Math.max(0, d.list.length - 1);
    say((added ? added + " document" + (added === 1 ? "" : "s") + " added. " : "") + notes.join(" "));
    busy = false; wordBtn.disabled = false;
    changed(); paintAll();
  });
  delAll.addEventListener("click", () => {
    if (!confirm("Remove all " + d.list.length + " documents from this lesson?")) return;
    lesson.blocks.forEach(b => { delete b.doc; });
    d.list.length = 0; picked = 0; changed(); paintAll();
  });
  paintAll();
}

/* ---------------- saving and reading back ---------------- */
window.compileDocs = function(l){
  const d = l && l.docs;
  if (!d || !Array.isArray(d.list) || !d.list.length) return null;
  const out = JSON.parse(JSON.stringify({ list: d.list }));
  out.list.forEach(x => { if (!x.id) x.id = newId(); });
  /* only the choices turned away from the default are written down */
  if (d.open === false) out.open = false;
  return out;
};
window.readDocs = function(data){
  const d = data && data.docs;
  if (!d || !Array.isArray(d.list) || !d.list.length) return null;
  const out = JSON.parse(JSON.stringify(d));
  out.open = d.open !== false;
  /* documents cannot be moved any more, so there is nothing to unlock */
  delete out.unlock;
  return out;
};
window.docIds = function(l){
  return new Set(l && l.docs && Array.isArray(l.docs.list) ? l.docs.list.map(x => x.id).filter(Boolean) : []);
};

document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("docsBtn");
  if (b) b.addEventListener("click", openDocs);
});
})();
