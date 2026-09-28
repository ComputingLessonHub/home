/* =====================================================================
   author-extras.js, the lesson builder's safety nets and shortcuts.

     Save status   "Unsaved changes" or "Saved 2 min ago" beside Save
     Draft         what is on screen kept in this browser as it changes, and
                   offered back if the tab closed before it was saved
     Undo / redo   Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, kept for this tab only
                   (sessionStorage), so it is gone once the browser closes
     Ctrl+S        the same as pressing Save
     Preview       opening a task shows it in the preview; clicking a task in
                   the preview opens it here
     Problems      a small warning on a task a student would get stuck on,
                   and a list of them when saving
     Copy          a task or page copied here can be pasted into another
                   lesson, through + Add task or the page's menu

   Nothing here writes to the server. The site is only ever sent a lesson
   when Save is pressed.

   Classic script sharing author.html's globals: `lesson`, `render`,
   `openPageRef` and so on are all read at the time they are used.
   ===================================================================== */

/* ---------------- what the lesson looks like, for comparing ----------------
   Which tasks are folded is about getting around the builder, not about the
   lesson, so it is left out: folding one is not a change to undo or save. */
function lessonJson(){
  try{
    return JSON.stringify(lesson, (k, v) => (k === "folded" || k === "collapsed") ? undefined : v);
  }catch(e){ return ""; }
}
function historyKey(){
  return (lesson && lesson.savedAs) ? String(lesson.savedAs) : "new";
}

/* ---------------- save status ---------------- */
let savedJson = null;            // the lesson as it was when opened or last saved
let savedAt = 0;                 // when it was last saved from here, if it was
let seenLesson = null;           // the lesson object the notes above belong to
let baselineTimer = null;
let restoring = false;           // the lesson is being replaced by undo, not by opening one

function paintSaveState(){
  const s = document.getElementById("saveState");
  if (!s || typeof lesson === "undefined") return;
  if (savedJson === null){ s.textContent = ""; s.className = "savestate"; return; }
  const changed = lessonJson() !== savedJson;
  if (changed){
    s.textContent = "Unsaved changes";
    s.className = "savestate unsaved";
    s.title = "Press Save (or Ctrl+S) to send it to the site. A copy is kept in this browser meanwhile.";
    return;
  }
  s.className = "savestate saved";
  s.title = "";
  if (!lesson.savedAs){ s.textContent = ""; return; }
  if (!savedAt){ s.textContent = "No changes"; return; }
  const mins = Math.floor((Date.now() - savedAt) / 60000);
  s.textContent = mins < 1 ? "Saved just now" : "Saved " + mins + " min ago";
}
setInterval(paintSaveState, 30000);

/* Called by author.html's saveToSite once the server has it. */
function builderSaved(){
  savedJson = lessonJson();
  savedAt = Date.now();
  dropDraft();
  paintSaveState();
}

/* ---------------- the draft in this browser ---------------- */
let draftTimer = null;
function draftKey(k){ return "hub_draft:" + (k || historyKey()); }
function writeDraft(){
  if (typeof bankOpen !== "undefined" && bankOpen) return;
  const json = lessonJson();
  if (!json || json === savedJson) { dropDraft(); return; }
  try{
    localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), title: lesson.title || "", json }));
  }catch(e){ /* full, or private browsing: the draft is a nicety */ }
}
function dropDraft(k){ try{ localStorage.removeItem(draftKey(k)); }catch(e){} }
/* Offered once, a little after a lesson has opened, so the loader has
   finished swapping the empty lesson for the real one first. */
let draftOffered = new Set();
function offerDraft(){
  const key = historyKey();
  if (draftOffered.has(key)) return;
  /* a lesson being opened for editing is never "new" */
  if (key === "new" && /[?&]edit=/.test(location.search)) return;
  draftOffered.add(key);
  let d = null;
  try{ d = JSON.parse(localStorage.getItem(draftKey(key)) || "null"); }catch(e){}
  if (!d || !d.json || d.json === lessonJson()) return;
  const when = new Date(d.at);
  const words = "Unsaved changes" + (d.title ? " to “" + d.title + "”" : "") + " from "
    + when.toLocaleDateString([], { day:"numeric", month:"short" }) + " "
    + when.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) + " were kept in this browser.";
  window.hubUI && window.hubUI.toast(words, { action:"Restore", ms: 20000, onAction: () => {
    try{
      const back = JSON.parse(d.json);
      restoring = true;
      lesson = back;
      seenLesson = lesson;
      openPageRef = null;
      if (typeof startFolded === "function") startFolded();
      render(); schedulePreview();
      if (typeof showTitle === "function") showTitle();
      restoring = false;
      historyNote(true);
      paintSaveState();
    }catch(e){ restoring = false; }
  } });
}

/* ---------------- undo and redo ----------------
   Snapshots of the whole lesson, taken a moment after each change settles,
   so a sentence typed is one step rather than forty. Held for this tab in
   sessionStorage, which the browser clears when it is closed. */
const HIST_MAX = 60;
const HIST_CHARS = 3500000;       // well inside sessionStorage's few megabytes
let hist = { key: "", stack: [], pos: -1 };
let histTimer = null;

function historyLoad(){
  const key = historyKey();
  let h = null;
  try{ h = JSON.parse(sessionStorage.getItem("hub_undo:" + key) || "null"); }catch(e){}
  const now = lessonJson();
  if (h && Array.isArray(h.stack) && h.stack[h.pos] === now) hist = { key, stack: h.stack, pos: h.pos };
  else hist = { key, stack: [now], pos: 0 };
}
function historyStore(){
  let stack = hist.stack, pos = hist.pos;
  /* the oldest go first when it will not fit */
  let size = stack.reduce((n, s) => n + s.length, 0);
  while (size > HIST_CHARS && stack.length > 1 && pos > 0){ size -= stack[0].length; stack.shift(); pos--; }
  hist.stack = stack; hist.pos = pos;
  try{ sessionStorage.setItem("hub_undo:" + hist.key, JSON.stringify({ stack, pos })); }
  catch(e){ try{ sessionStorage.removeItem("hub_undo:" + hist.key); }catch(e2){} }
}
/* Take a snapshot now if the lesson has moved on from the last one. */
function historyNote(now){
  clearTimeout(histTimer);
  const take = () => {
    if (typeof bankOpen !== "undefined" && bankOpen) return;
    if (hist.key !== historyKey()){
      /* first saved: the same lesson under its new name, history and all */
      hist.key = historyKey();
    }
    const json = lessonJson();
    if (!json || hist.stack[hist.pos] === json) return;
    hist.stack = hist.stack.slice(0, hist.pos + 1);
    hist.stack.push(json);
    if (hist.stack.length > HIST_MAX) hist.stack.shift();
    hist.pos = hist.stack.length - 1;
    historyStore();
  };
  if (now) take(); else histTimer = setTimeout(take, 700);
}
/* The path to the open task, so it can be opened again after the lesson
   has been swapped for an older copy of itself. */
function openTaskPath(){
  const out = [];
  function walk(arr, path){
    (arr || []).forEach((b, i) => {
      if (!b || out.length) return;
      if (b.type !== "page" && b.folded === false) out.push(path.concat(i));
      if (b.blocks) walk(b.blocks, path.concat(i));
    });
  }
  walk(lesson.blocks, []);
  return out[0] || null;
}
function historyGo(delta){
  if (typeof bankOpen !== "undefined" && bankOpen) return false;
  historyNote(true);                                   // whatever was typed last counts
  const to = hist.pos + delta;
  if (to < 0 || to >= hist.stack.length) return false;
  const pageAt = openPageRef ? lesson.blocks.indexOf(openPageRef) : -1;
  const openPath = openTaskPath();
  let next;
  try{ next = JSON.parse(hist.stack[to]); }catch(e){ return false; }
  hist.pos = to;
  historyStore();
  restoring = true;
  lesson = next;
  seenLesson = lesson;
  /* everything folded, then the page and task that were open, opened again */
  if (typeof startFolded === "function") startFolded();
  const pages = lesson.blocks.filter(x => x.type === "page");
  openPageRef = (pageAt >= 0 && lesson.blocks[pageAt] && lesson.blocks[pageAt].type === "page")
    ? lesson.blocks[pageAt] : (pages[0] || null);
  if (openPath){
    let arr = lesson.blocks, b = null;
    for (const i of openPath){ b = arr && arr[i]; if (!b) break; arr = b.blocks; }
    if (b && b.type !== "page") b.folded = false;
  }
  render(); schedulePreview();
  if (typeof showTitle === "function") showTitle();
  restoring = false;
  paintSaveState();
  writeDraft();
  return true;
}
function builderUndo(){
  if (!historyGo(-1)) window.hubUI && window.hubUI.toast("Nothing to undo");
}
function builderRedo(){
  if (!historyGo(1)) window.hubUI && window.hubUI.toast("Nothing to redo");
}

/* ---------------- told about by author.html ---------------- */
/* Anything typed or pressed in the lesson. */
function builderChanged(){
  if (restoring) return;
  historyNote(false);
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { writeDraft(); paintSaveState(); }, 1200);
}
/* After every redraw. A different lesson object means one has been opened
   (or made), so its notes start again from here. */
function builderRendered(){
  if (typeof lesson === "undefined") return;
  if (lesson !== seenLesson && !restoring){
    seenLesson = lesson;
    savedJson = null;
    clearTimeout(baselineTimer);
    /* A moment later, once opening has settled: a lesson that has just been
       drawn has had its missing defaults filled in, and those are not a
       change anybody made. */
    baselineTimer = setTimeout(() => {
      savedJson = lessonJson();
      historyLoad();
      paintSaveState();
      offerDraft();
    }, 900);
  }
  paintSaveState();
  followInPreview();
}

/* ---------------- keyboard ---------------- */
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "s"){
    e.preventDefault();
    if (typeof bankOpen !== "undefined" && bankOpen) return;
    const b = document.getElementById("saveSite");
    if (b && !b.disabled) b.click();
    return;
  }
  if (key !== "z" && key !== "y") return;
  /* In a box being typed in, the browser's own undo is the one wanted. */
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (!document.getElementById("mBack") || !document.getElementById("mBack").hidden) return;
  e.preventDefault();
  if (key === "y" || (key === "z" && e.shiftKey)) builderRedo(); else builderUndo();
});

/* ---------------- the preview follows along ---------------- */
/* The id each task was given the last time the lesson was compiled, both
   ways round, so a task here and a task in the preview can find each other. */
let compiledIds = new WeakMap();
let compiledBlocks = new Map();
function noteCompiledId(b, id){
  if (!b || !id) return;
  compiledIds.set(b, id);
  compiledBlocks.set(id, b);
}
function resetCompiledIds(){ compiledIds = new WeakMap(); compiledBlocks = new Map(); }

let followed = null;           // the task the preview was last pointed at
let followPending = null;
function openTask(){
  const page = openPageRef;
  if (!page || typeof viewAll === "undefined" || viewAll) return null;
  let found = null;
  (function walk(arr){
    (arr || []).forEach(b => {
      if (found || !b) return;
      if (b.folded === false){ found = b; }
      if (b.blocks) walk(b.blocks);
      if (b.options) b.options.forEach(o => walk(o.blocks));
    });
  })(page.blocks);
  return found;
}
function followInPreview(){
  const b = openTask();
  if (b === followed) return;
  followed = b;
  followPending = b;
  sendFollow();
}
function sendFollow(){
  const b = followPending;
  if (!b) return;
  const id = compiledIds.get(b);
  const frame = document.getElementById("prev");
  if (!id || !frame || !frame.contentWindow) return;       // after the next compile
  try{
    frame.contentWindow.postMessage({ hubFocus: id }, location.origin === "null" ? "*" : location.origin);
    followPending = null;
  }catch(e){}
}
(function wirePreview(){
  const hook = () => {
    const frame = document.getElementById("prev");
    if (!frame){ setTimeout(hook, 300); return; }
    frame.addEventListener("load", () => setTimeout(sendFollow, 150));
  };
  hook();
})();
/* A task clicked in the preview is opened here. */
window.addEventListener("message", (e) => {
  const frame = document.getElementById("prev");
  if (!frame || e.source !== frame.contentWindow) return;
  const id = e.data && e.data.hubPick;
  if (!id) return;
  const b = compiledBlocks.get(id);
  if (!b) return;
  revealTask(b, true);
});
/* Open a task wherever it is: its page on screen, whatever holds it opened,
   and the rest of its list folded. */
function revealTask(target, fromPreview){
  let hit = null;
  (function walk(arr, page, chain){
    (arr || []).forEach(b => {
      if (hit || !b) return;
      const here = b.type === "page" ? b : page;
      if (b === target){ hit = { arr, page: here, chain }; return; }
      if (b.blocks) walk(b.blocks, here, chain.concat(b));
      if (b.options) b.options.forEach(o => walk(o.blocks, here, chain.concat(b)));
    });
  })(lesson.blocks, null, []);
  if (!hit) return;
  viewAll = false;
  if (hit.page) openPageRef = hit.page;
  hit.chain.forEach(c => { if (c.type !== "page") c.folded = false; });
  openOnly(hit.arr, target);
  if (fromPreview) followed = target;  // it is already showing there
  scrollToBlock = target;
  render();
}

/* ---------------- problems ----------------
   Only things that would leave a student stuck or looking at something
   broken. A task still being written is not nagged about its wording. */
function plainText(v){ return String(v || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim(); }
function taskProblems(b){
  const out = [];
  if (!b || !b.type) return out;
  switch (b.type){
    case "quiz":
      (b.questions || []).forEach((q, i) => {
        const n = (b.questions.length > 1) ? " " + (i + 1) : "";
        if (!plainText(q.q)) out.push("Question" + n + " has no question written");
        const opts = (q.options || []).filter(o => String(o).trim());
        if (opts.length < 2) out.push("Question" + n + " needs at least two options");
        const right = (q.answers || []).filter(a => String((q.options || [])[a] || "").trim());
        if (opts.length >= 2 && !right.length) out.push("Question" + n + " has no right answer ticked");
      });
      break;
    case "mc":
      if (!plainText(b.prompt)) out.push("No question written");
      if ((b.options || []).filter(o => String(o).trim()).length < 2) out.push("Needs at least two options");
      break;
    case "short":
      if (!plainText(b.prompt)) out.push("No question written");
      if (!(b.answers || []).some(a => String(a).trim())) out.push("No accepted answers");
      break;
    case "question":
      if (!plainText(b.prompt)) out.push("No question written");
      break;
    case "blanks":
      if (!/\[\[[^\]]+\]\]/.test(b.text || "")) out.push("No gaps: put answers in [[double brackets]]");
      break;
    case "order":
      if ((b.items || []).filter(x => String(x).trim()).length < 2) out.push("Needs at least two items to put in order");
      break;
    case "keywords":
      if (!(b.words || []).some(w => String(w.word || "").trim())) out.push("No keywords");
      break;
    case "picture":
      if (!b.imgId && !String(b.url || "").trim()) out.push("No picture chosen");
      break;
    case "embed": case "frame": case "link":
      if (!String(b.url || "").trim()) out.push("No address");
      break;
    case "label":
      if (!String(b.image || "").trim()) out.push("No picture to label");
      else if (!(b.spots || []).length) out.push("No labels drawn on the picture");
      else if ((b.spots || []).some(s => !String(s.answer || "").trim())) out.push("A label box has no word");
      break;
    case "table":
      if (!(b.rows || []).some(r => (r || []).some(c => c && c.fill))) out.push("No boxes for them to fill in");
      break;
    case "caesar":
      if (!String(b.message || "").replace(/[^A-Za-z]/g, "")) out.push("No hidden message");
      break;
    case "exam":
      if (!plainText(b.prompt)) out.push("No question written");
      break;
    case "code":
      out.push("Python or web page not picked yet");
      break;
    case "ide": case "web":
      (b.checks || []).forEach((c, i) => {
        if (!c || c.manual) return;
        const k = c.kind || "";
        const needsValue = ["codeHas","codeLacks","defines","calls","outputHas","outputIs",
                            "contentHas","fileHas","codeCount"].indexOf(k) >= 0;
        const needsSel = ["tag","classOrId","attr","cssHas"].indexOf(k) >= 0;
        if (!String(c.label || "").trim()) out.push("Checklist line " + (i + 1) + " has no wording");
        else if (needsValue && !String(c.value || "").trim()) out.push("Checklist line " + (i + 1) + " has nothing to look for");
        else if (needsSel && !String(c.selector || "").trim()) out.push("Checklist line " + (i + 1) + " has nothing to look for");
      });
      break;
    case "choice": {
      const named = (b.options || []).filter(o => String(o.label || "").trim());
      if (named.length < 2) out.push("Needs two named choices");
      (b.options || []).forEach((o, i) => { if (String(o.label || "").trim() && !(o.blocks || []).length)
        out.push("Choice " + String.fromCharCode(65 + i) + " has no tasks"); });
      break;
    }
    case "extension": case "group":
      if (!(b.blocks || []).length) out.push("Nothing in it yet");
      break;
  }
  return out;
}
/* Every problem in the lesson, with the task it belongs to, in page order. */
function lessonProblems(){
  const out = [];
  (function walk(arr, page, pageNo){
    (arr || []).forEach(b => {
      if (!b) return;
      if (b.type === "page"){ walk(b.blocks, b, lesson.blocks.filter(x => x.type === "page").indexOf(b) + 1); return; }
      taskProblems(b).forEach(p => out.push({ block: b, page, pageNo, words: p }));
      if (b.blocks) walk(b.blocks, page, pageNo);
      if (b.options) b.options.forEach(o => walk(o.blocks, page, pageNo));
    });
  })(lesson.blocks, null, 0);
  return out;
}
/* The mark on a task's line. */
function problemDot(b){
  const list = taskProblems(b);
  if (!list.length) return null;
  const d = el("span","probdot");
  d.innerHTML = window.hubUI ? window.hubUI.icon("warn", 15) : "!";
  d.title = list.join("\n");
  d.setAttribute("aria-label", "Needs attention: " + list.join(". "));
  return d;
}
/* Before saving, a list of what a student would trip over. Saving anyway is
   always allowed: a lesson half-built is still worth keeping. */
function checkBeforeSave(then){
  const list = lessonProblems();
  if (!list.length){ then(); return; }
  openModal(box => {
    box.classList.add("narrow");
    box.appendChild(el("h2","", list.length === 1 ? "One thing to look at" : list.length + " things to look at"));
    box.appendChild(el("p","modal-text","Students would get stuck on these. Click one to go to it, or save anyway."));
    const ul = el("div","problist");
    list.slice(0, 30).forEach(p => {
      const row = el("button","probrow");
      row.type = "button";
      row.innerHTML = (window.hubUI ? window.hubUI.icon("warn", 16) : "");
      const words = el("span","");
      words.appendChild(el("b","", (typeof LABEL !== "undefined" && LABEL[p.block.type]) || p.block.type));
      words.appendChild(document.createTextNode((p.pageNo ? "  ·  Page " + p.pageNo : "") + "  ·  " + p.words));
      row.appendChild(words);
      row.addEventListener("click", () => { closeModal(); revealTask(p.block); });
      ul.appendChild(row);
    });
    box.appendChild(ul);
    const go = el("button","btn-primary modal-cta","Save anyway");
    go.addEventListener("click", () => { closeModal(); then(); });
    const stay = el("button","btn-ghost modal-stay","Go back and fix");
    stay.addEventListener("click", closeModal);
    box.appendChild(go); box.appendChild(stay);
  });
}

/* ---------------- copying between lessons ----------------
   One thing on the clipboard at a time, in this browser, so it survives
   closing one lesson and opening another. */
const CLIP_KEY = "hub_clip";
function clipGet(){
  try{ return JSON.parse(localStorage.getItem(CLIP_KEY) || "null"); }catch(e){ return null; }
}
function clipCopy(b){
  const copy = JSON.parse(JSON.stringify(b));
  const what = b.type === "page" ? "page" : "task";
  try{
    localStorage.setItem(CLIP_KEY, JSON.stringify({ what, block: copy, from: lesson.title || "", at: Date.now() }));
  }catch(e){
    window.hubUI && window.hubUI.toast("That is too big to copy in this browser.", { kind:"error" });
    return;
  }
  window.hubUI && window.hubUI.toast((what === "page" ? "Page" : "Task") +
    " copied. Open another lesson and paste it from " + (what === "page" ? "a page's ⋯ menu." : "+ Add task."));
}
/* A pasted copy is a new task in this lesson: coding tasks get keys of their
   own, and a "start from" pointing into the other lesson is let go. */
function clipFresh(block){
  const made = JSON.parse(JSON.stringify(block));
  (function walk(b){
    if (!b) return;
    if (b.type === "ide"){
      if (typeof newCodeKey === "function") b.key = newCodeKey();
      delete b.startFrom;
    }
    delete b.folded;
    (b.blocks || []).forEach(walk);
    (b.options || []).forEach(o => (o.blocks || []).forEach(walk));
  })(made);
  return made;
}
/* Paste a task into a list, at `at` or the end. */
function clipPasteTask(arr, at){
  const c = clipGet();
  if (!c || c.what !== "task" || !c.block) return;
  const made = clipFresh(c.block);
  if (!arr){ addBlock(made); return; }
  arr.splice(at === undefined || at < 0 ? arr.length : at, 0, made);
  openOnly(arr, made);
  scrollToBlock = made;
  render(); schedulePreview(); saveDraft();
}
/* Paste a page after the one given, or at the end. */
function clipPastePage(after){
  const c = clipGet();
  if (!c || c.what !== "page" || !c.block) return;
  const made = clipFresh(c.block);
  made.startLocked = true;
  const at = after ? lesson.blocks.indexOf(after) + 1 : lesson.blocks.length;
  lesson.blocks.splice(at, 0, made);
  (made.blocks || []).forEach(x => { x.folded = true; });
  tellPreview(made); render(); saveDraft();
}
