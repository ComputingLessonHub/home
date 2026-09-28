/* =====================================================================
   author-editors.js, what each kind of task asks a teacher for in the
   lesson builder, and the list of tasks on a page.

   card() in author.html draws the line every task has (its name, the grip
   and the buttons down the right) and hands the body to editTask(), which
   looks the task's kind up in EDITORS. Each editor only says what boxes its
   kind of task needs; the kit it is given takes care of how they look:

     F, R, PY      a plain box, a formatted box, a Python editor
     toggleRow     a row of on/off buttons
     pickRow       one of several
     listField     a list of lines that can be added to and taken away
     settings(fn)  anything added inside fn goes under the task's folded
                   Settings line rather than in the body
     add(node)     put something of the editor's own in, wherever the kit
                   is currently adding
     redraw()      draw this one task again, and nothing else

   A box whose label ends "(optional)" and has nothing in it is shown as a
   small "+ Heading" link instead, and becomes the box once pressed. Most
   tasks are written without most of their optional parts, and a column of
   empty boxes was a good part of what made a page of them so long.

   Classic script, like author.html itself, so both share the same globals.
   ===================================================================== */

/* Which tasks have their Settings open, and which optional boxes have been
   asked for while still empty. Held against the task objects themselves and
   never saved: it is only about getting around the builder. */
const SETTINGS_OPEN = new WeakSet();
const REVEALED = new WeakMap();
function isRevealed(b, key){ const s = REVEALED.get(b); return !!(s && s.has(key)); }
function reveal(b, key){
  let s = REVEALED.get(b);
  if (!s){ s = new Set(); REVEALED.set(b, s); }
  s.add(key);
}
/* Empty the way a teacher would judge it: formatting with no words in it is
   still empty, but a picture or a table on its own is not. */
function isBlank(v){
  if (v === undefined || v === null) return true;
  const t = String(v);
  if (/<(img|table|pre)\b/i.test(t)) return false;
  return !t.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, " ").trim();
}
/* Put the cursor in a box that has just been asked for. Only a box in this
   card: a container's own cards hold boxes with the same names. */
function focusField(cardEl, key){
  if (!cardEl) return;
  const w = Array.from(cardEl.querySelectorAll('.bfield[data-key="' + key + '"]'))
    .find(f => f.closest(".bcard") === cardEl);
  if (!w) return;
  const target = w.querySelector(".rt-box, textarea, input");
  if (target) target.focus();
}

const EDITORS = {};

/* The tools an editor builds its boxes with, all adding to one task. */
function editorKit(b, body, ctx){
  let into = body;
  let setBox = null;
  const redraw = ctx.redraw;
  const add = (node) => { into.appendChild(node); return node; };
  const here = () => into;

  /* An empty optional box, shown as a link to it. Runs of them share a line,
     so a task with no heading, subheading or instruction yet has one short
     row of links where there were three empty boxes. */
  function tucked(label, key, o){
    if (o.keep || !/\(optional\)\s*$/.test(label)) return false;
    if (!isBlank(b[key]) || isRevealed(b, key)) return false;
    const name = label.replace(/\s*\(optional\)\s*$/, "");
    let row = into.lastElementChild;
    if (!row || !row.classList.contains("optrow")) row = add(el("div","optrow"));
    const btn = el("button","optlink","+ " + name);
    btn.type = "button";
    btn.addEventListener("click", () => {
      reveal(b, key);
      focusField(redraw(), key);
    });
    row.appendChild(btn);
    return true;
  }

  function F(label, key, opts){
    const o = opts || {};
    if (tucked(label, key, o)) return;
    const w = el("div","bfield");
    w.dataset.key = key;
    w.appendChild(el("label","", label));
    const input = o.area ? el("textarea") : el("input");
    if (o.area) input.rows = o.rows || 4;
    if (o.mono) input.className = "mono";
    if (o.placeholder) input.placeholder = o.placeholder;
    input.value = b[key] === undefined ? "" : b[key];
    input.addEventListener("input", () => {
      b[key] = o.num ? Number(input.value) : input.value;
      saveDraft(); schedulePreview();
      if (o.then) o.then();
    });
    w.appendChild(withHelp(input, o.help));
    add(w);
  }
  /* The starter code is the very thing a student opens in the editor, so it
     is written in the editor: same colours, same line numbers, same indent
     after a colon, and the same list of mistakes underneath. A plain box let
     a teacher hand out code that only looked right. */
  function PY(label, key, opts){
    const o = opts || {};
    const w = el("div","bfield");
    w.dataset.key = key;
    w.appendChild(el("label","", label));
    const shell = el("div","ide bfield-ide");
    window.pyEdit.follow(shell);
    const ed = window.pyEdit.attach({
      value: b[key] === undefined ? "" : String(b[key]),
      onInput: () => { b[key] = ed.ta.value; saveDraft(); schedulePreview(); }
    });
    shell.appendChild(ed.editor);
    shell.appendChild(ed.probs);
    w.appendChild(withHelp(shell, o.help));
    add(w);
  }
  function R(label, key, opts){
    const o = opts || {};
    if (tucked(label, key, o)) return;
    const w = el("div","bfield");
    w.dataset.key = key;
    w.appendChild(el("label","", label));
    const ed = window.richText(b[key] || "", (html) => { b[key] = html; saveDraft(); schedulePreview(); },
                               { rows: o.rows || 4, placeholder: o.placeholder,
                                 /* A picture pasted in here goes into the
                                    database, not into the lesson's own JSON. */
                                 upload: pasteUpload,
                                 imageSrc: (id) => pictureSrc({ imgId: id }) });
    w.appendChild(withHelp(ed, o.help));
    add(w);
  }
  /* on/off buttons; each entry is [key, label, defaultOn] */
  function toggleRow(defs, label, help){
    const w = el("div","bfield");
    w.dataset.toggles = "1";
    w.appendChild(el("label","", label || "Options"));
    const row = el("div","brow");
    defs.forEach(d => {
      const key = d[0], name = d[1], onByDefault = d[2] !== false, lockOff = d[3];
      /* Some settings only make sense alongside another one. A fourth entry
         says when this one cannot be on, and it is then shown off and cannot
         be pressed, rather than being left on and quietly ignored. */
      const locked = typeof lockOff === "function" && !!lockOff();
      if (locked && b[key] !== false) b[key] = false;
      const on = !locked && (b[key] === undefined ? onByDefault : b[key] !== false && b[key] !== 0);
      const btn = el("button","btn-ghost bmini2" + (on ? " right" : ""), name + ": " + (on ? "on" : "off"));
      if (locked){
        btn.disabled = true;
        btn.title = "Turn Running on first";
      } else {
        btn.addEventListener("click", () => { b[key] = !on; redraw(); schedulePreview(); });
      }
      row.appendChild(btn);
    });
    if (help) row.appendChild(helpDot(help));
    w.appendChild(row);
    add(w);
  }
  /* One of several, chosen the way the on/off buttons are turned on: the
     picked one is filled in. A dropdown would hide the choices behind a tap,
     and there are only ever a handful of them. Each entry is [value, words];
     the first is what an older lesson with nothing stored falls back to. */
  function pickRow(label, key, defs, help){
    const w = el("div","bfield");
    w.appendChild(el("label","", label));
    const row = el("div","brow");
    const now = (b[key] === undefined || b[key] === "") ? defs[0][0] : b[key];
    defs.forEach(d => {
      const btn = el("button","btn-ghost bmini2" + (d[0] === now ? " right" : ""), d[1]);
      btn.addEventListener("click", () => { b[key] = d[0]; redraw(); schedulePreview(); });
      row.appendChild(btn);
    });
    if (help) row.appendChild(helpDot(help));
    w.appendChild(row);
    add(w);
  }
  /* onChange fires whenever a line is typed in, added or removed, for the
     lists that have something to put right once a teacher has touched them. */
  function listField(label, key, help, onChange){
    const changed = () => { if (onChange) onChange(); };
    const w = el("div","bfield");
    w.appendChild(el("label","", label));
    b[key].forEach((val, k) => {
      const row = el("div","brow");
      const input = el("input"); input.value = val;
      input.addEventListener("input", () => { b[key][k] = input.value; changed(); saveDraft(); schedulePreview(); });
      row.appendChild(input);
      if (b.answer !== undefined){
        const pick = el("button","btn-ghost bmini" + (Number(b.answer) === k ? " right" : ""), "\u2713");
        pick.title = "This is the correct answer";
        pick.addEventListener("click", () => { b.answer = k; redraw(); schedulePreview(); });
        row.appendChild(pick);
      }
      const del = el("button","btn-ghost bmini","\u2715"); del.title = "Remove";
      del.addEventListener("click", () => { b[key].splice(k, 1); changed(); redraw(); schedulePreview(); });
      row.appendChild(del);
      w.appendChild(row);
    });
    const moreBtn = el("button","btn-ghost bmini2","+ Add another");
    moreBtn.addEventListener("click", () => { b[key].push(""); changed(); redraw(); });
    if (help){
      const foot = el("div","brow");
      foot.appendChild(moreBtn);
      foot.appendChild(helpDot(help));
      w.appendChild(foot);
    } else w.appendChild(moreBtn);
    add(w);
  }

  /* Settings are gathered as the editor goes and put under one folded line
     at the bottom of the task. What a student reads stays on show; how the
     task behaves is a click away. */
  function settings(fn){
    if (!setBox) setBox = el("div","bset-body");
    const was = into;
    into = setBox;
    try{ fn(); } finally { into = was; }
  }
  function finish(){
    if (!setBox || !setBox.children.length) return;
    const wrap = el("div","bsettings");
    const open = SETTINGS_OPEN.has(b);
    /* what is in there, so the folded line says so without being opened */
    const names = [];
    Array.from(setBox.children).forEach(f => {
      const toggles = f.querySelectorAll(".brow > .bmini2");
      const lab = f.querySelector(":scope > label");
      if (f.dataset.toggles && toggles.length)
        toggles.forEach(t => names.push(String(t.textContent).replace(/:\s*(on|off)$/, "")));
      else if (lab) names.push(lab.textContent.replace(/\s*\(optional\)$/, ""));
    });
    const btn = el("button","bset-head");
    btn.type = "button";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.appendChild(el("span","bset-arrow", open ? "▾" : "▸"));
    btn.appendChild(el("b","", "Settings"));
    const said = el("span","bset-sum", names.join(", "));
    btn.appendChild(said);
    setBox.hidden = !open;
    btn.addEventListener("click", () => {
      const now = !SETTINGS_OPEN.has(b);
      if (now) SETTINGS_OPEN.add(b); else SETTINGS_OPEN.delete(b);
      setBox.hidden = !now;
      btn.setAttribute("aria-expanded", now ? "true" : "false");
      btn.firstChild.textContent = now ? "▾" : "▸";
    });
    wrap.appendChild(btn);
    wrap.appendChild(setBox);
    body.appendChild(wrap);
  }

  return { F, R, PY, toggleRow, pickRow, listField, settings, add, here, redraw,
           paintHead: ctx.paintHead, finish };
}

/* Fill in a task's body. Called by card() for every open task. */
function editTask(b, body, ctx){
  const k = editorKit(b, body, ctx);
  const edit = EDITORS[b.type];
  if (edit) edit(b, k);
  k.finish();
}

EDITORS.text = function(b, k){
  const { F, R } = k;
  F("Heading (optional)", "heading");
  R("Paragraph", "html", { rows:5 });
};

EDITORS.picture = function(b, k){
  const { F, toggleRow, pickRow, add, redraw } = k;
  /* Two ways to get a picture in, and the one a teacher reaches for
     most is first. Uploading puts it in the database and hands it out
     through the API; an address points at wherever it already lives,
     which is right for a diagram in site/images and for anything on
     the web that is meant to be linked to. */
  const up = el("div","bfield");
  up.appendChild(el("label","","The picture"));
  const upRow = el("div","brow");
  const pick = el("button","btn-ghost bmini2", b.imgId ? "Replace the picture" : "Upload a picture");
  const file = el("input","sb-picker");
  file.type = "file"; file.accept = "image/*";
  const said = el("span","bhelp","");
  pick.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    if (!file.files || !file.files[0]) return;
    said.textContent = "Shrinking and uploading\u2026";
    said.classList.remove("warn");
    uploadPicture(file.files[0], b.alt || "", (made, why) => {
      file.value = "";
      if (!made){ said.textContent = why; said.classList.add("warn"); return; }
      b.imgId = made.id;
      b.url = "";                 // the upload is the picture now
      redraw(); schedulePreview();
    });
  });
  upRow.appendChild(pick);
  if (b.imgId){
    const drop = el("button","btn-ghost bmini2","Remove it");
    drop.addEventListener("click", () => { b.imgId = ""; redraw(); schedulePreview(); });
    upRow.appendChild(drop);
  }
  upRow.appendChild(said);
  up.appendChild(upRow);
  up.appendChild(file);
  add(up);
  if (!b.imgId)
    F("Or the address of one", "url",
      { help:"Right-click a picture on the web and choose \u201cCopy image address\u201d. A picture in the "
           + "site's own images folder is written as images/whatever.jpg." });
  const shown = pictureSrc(b);
  if (shown){
    const prev = el("div","bfield");
    const img = el("img","bpreview"); img.src = shown; img.alt = "";
    img.addEventListener("error", () => {
      img.hidden = true;
      prev.appendChild(el("p","bhelp warn", b.imgId
        ? "That upload could not be loaded back."
        : "That address did not load a picture."));
    });
    prev.appendChild(img);
    if (b.imgId) prev.appendChild(el("p","bhelp","Kept in the database, not in the public site folder."));
    add(prev);
  }
  F("Caption underneath (optional)", "caption");
  F("Instruction above it (optional)", "note");
  F("Words for a screen reader (optional)", "alt",
    { help:"Read out to anyone who cannot see the picture. The caption is used if this is left empty." });
  pickRow("How big", "size",
    [["full","Full width"],["large","Large"],["medium","Medium"],["small","Small"],["custom","Exact"]]);
  if (b.size === "custom")
    F("How wide", "width", { help:"A number of pixels, such as 320, or a share of the width, such as 60%." });
  pickRow("Beside the next task", "beside",
    [["","No, on its own"],["left","Picture on the left"],["right","Picture on the right"]],
    "Only works on a page with something after the picture. They share a line on a computer and stack on a phone.");
  /* Where it sits across the page is only a question once there is room
     either side of it. Full width has nowhere to go, and standing beside a
     task the row has already decided which side it is on. */
  if (!b.beside && b.size && b.size !== "full")
    pickRow("Where it sits", "align", [["left","Left"],["centre","Middle"],["right","Right"]]);
  toggleRow([["frame","Border", true]], "Style");
};

EDITORS.pastelink = function(b, k){
  const { F } = k;
  F("Heading (optional)", "heading");
  F("What should they paste?", "task", { area:true, rows:2 });
};

EDITORS.code = function(b, k){
  const { add, redraw } = k;
  const w = el("div","bfield");
  w.appendChild(el("label","","Which kind of code?"));
  const row = el("div","brow");
  const py = el("button","btn-primary bmini2","Python");
  py.addEventListener("click", () => {
    const made = BLANK.ide();
    Object.keys(b).forEach(k => delete b[k]);
    Object.assign(b, made);
    redraw(); schedulePreview();
  });
  const web = el("button","btn-primary bmini2","HTML, CSS and JavaScript");
  web.addEventListener("click", () => {
    const made = BLANK.web();
    Object.keys(b).forEach(k => delete b[k]);
    Object.assign(b, made);
    redraw(); schedulePreview();
  });
  row.appendChild(py); row.appendChild(web);
  row.appendChild(helpDot("Pick one and the right options appear. You can delete the task and start again if you change your mind."));
  w.appendChild(row);
  add(w);
};

EDITORS.web = function(b, k){
  const { F, R, toggleRow, add, redraw } = k;
  F("Heading (optional)", "title");
  R("Subheading (optional)", "task", { rows:2 });
  const fw = el("div","bfield");
  fw.appendChild(el("label","","Which files can they use?"));
  const frow = el("div","brow");
  if (!b.files) b.files = ["html","css","js"];
  [["html","index.html"],["css","style.css"],["js","script.js"]].forEach(pair => {
    const on = b.files.indexOf(pair[0]) >= 0;
    const btn = el("button","btn-ghost bmini2" + (on ? " right" : ""), pair[1] + ": " + (on ? "on" : "off"));
    btn.addEventListener("click", () => {
      if (on){ if (b.files.length > 1) b.files = b.files.filter(x => x !== pair[0]); }
      else b.files = ["html","css","js"].filter(x => x === pair[0] || b.files.indexOf(x) >= 0);
      redraw(); schedulePreview();
    });
    frow.appendChild(btn);
  });
  fw.appendChild(frow); add(fw);
  if (b.files.indexOf("html") >= 0) F("Starting HTML", "html", { area:true, rows:6, mono:true });
  if (b.files.indexOf("css") >= 0) F("Starting CSS", "css", { area:true, rows:5, mono:true });
  if (b.files.indexOf("js") >= 0) F("Starting JavaScript", "js", { area:true, rows:5, mono:true });
  toggleRow([["run","Running", true], ["edit","Editing", true],
             ["help","Help", true], ["tooltips","Tooltips", true],
             ["autocomplete","Autocomplete", true],
             ["addFiles","Students can add files", false]],
            null,
            "With Autocomplete on, a little list of tag names, properties and words they have "
            + "already used appears as they type. Arrow keys or a tap to choose, Enter or Tab to "
            + "take it. The rest of the typing help stays either way: closing tags written for "
            + "them, brackets and quotes in pairs, and Backspace taking a whole indent.");
  F("Code must contain (optional)", "expect");
};

EDITORS.ide = function(b, k){
  const { F, R, PY, toggleRow, add, redraw } = k;
  F("Heading (optional)", "title");
  R("Subheading (optional)", "task", { rows:2 });
  /* Carrying on from an earlier task: the box below is then only what they
     see if that task was left empty. */
  {
    const earlier = earlierCodeTasks(b);
    const w = el("div","bfield");
    w.appendChild(el("label","","Start from"));
    const sel = document.createElement("select");
    const none = document.createElement("option");
    none.value = ""; none.textContent = "The starter code below";
    sel.appendChild(none);
    earlier.forEach(entry => {
      const o = document.createElement("option");
      o.value = entry.task.key;
      o.textContent = codeTaskLabel(entry);
      sel.appendChild(o);
    });
    sel.value = b.startFrom || "";
    sel.addEventListener("change", () => {
      b.startFrom = sel.value || undefined;
      saveDraft(); redraw(); schedulePreview();
    });
    const startHelp = ["Pick an earlier Python task and their code from it is put in "
                       + "here when they open this one, so they can keep building on "
                       + "it. It is fetched again each time they come back, and when "
                       + "they tick to open an extension, so it is their newest code "
                       + "rather than whatever was there when the page was drawn.",
                       "Anything they have written here themselves is left alone, and "
                       + "Reset takes them back to the earlier task rather than to an "
                       + "empty box."];
    if (!earlier.length) startHelp.unshift("Nothing to start from yet: this is the first Python task.");
    w.appendChild(withHelp(sel, startHelp));
    add(w);
    /* Nothing to write when the code comes from somewhere else: a starter box
       sitting under it only invites a teacher to fill in something a student
       will never see. */
    if (!b.startFrom) PY("Starter code", "starter");
  }
  toggleRow([["turtle","Turtle canvas", false],
             ["run","Running", true],
             ["edit","Editing", true], ["help","Help", true], ["tooltips","Tooltips", true],
             ["autocomplete","Autocomplete", true]],
            null,
            "With Autocomplete on, a little list of words appears as they type: keywords, "
            + "built-in functions, what is in random or turtle, and the variables they have "
            + "made themselves. Arrow keys or a tap to choose, Enter or Tab to take it. The "
            + "rest of the typing help stays either way: brackets and quotes in pairs, and "
            + "Backspace taking a whole indent.");
};

EDITORS.question = function(b, k){
  const { F, R, add, redraw } = k;
  F("Heading (optional)", "heading");
  R("Context (optional)", "context", { rows:3 });
  R("The question", "prompt", { rows:2 });
  const ww = el("div","bfield");
  ww.appendChild(el("label","","Recommended word count"));
  const wrow = el("div","stepper");
  const less = el("button","btn-ghost iconbtn","\u2212");
  const num = el("input"); num.type = "number"; num.className = "stepnum";
  num.value = String(b.minWords === undefined ? 20 : b.minWords);
  const more = el("button","btn-ghost iconbtn","+");
  const setW = (v) => { b.minWords = Math.max(0, v); num.value = String(b.minWords); saveDraft(); schedulePreview(); };
  less.addEventListener("click", () => setW((parseInt(num.value, 10) || 0) - 5));
  more.addEventListener("click", () => setW((parseInt(num.value, 10) || 0) + 5));
  num.addEventListener("input", () => { b.minWords = Math.max(0, parseInt(num.value, 10) || 0); saveDraft(); schedulePreview(); });
  wrow.appendChild(less); wrow.appendChild(num); wrow.appendChild(more);
  ww.appendChild(wrow);
  add(ww);

  /* How tall the answer box starts, in lines. One setting for every box in
     the task: several questions sharing a heading are usually asking for
     answers of about the same size. The box still scrolls and can be
     dragged taller, so this is how much room it looks like there is, not a
     limit on what can be written. */
  const lw = el("div","bfield");
  lw.appendChild(el("label","","Lines shown in the answer box"));
  const lrow = el("div","stepper");
  const lless = el("button","btn-ghost iconbtn","\u2212");
  const lnum = el("input"); lnum.type = "number"; lnum.className = "stepnum";
  lnum.min = "1"; lnum.max = "30";
  lnum.value = String(answerLines(b));
  const lmore = el("button","btn-ghost iconbtn","+");
  const setL = (v) => { b.lines = Math.max(1, Math.min(30, Math.round(Number(v) || 4)));
                        lnum.value = String(b.lines); saveDraft(); schedulePreview(); };
  lless.addEventListener("click", () => setL(answerLines(b) - 1));
  lmore.addEventListener("click", () => setL(answerLines(b) + 1));
  lnum.addEventListener("change", () => setL(lnum.value));
  lrow.appendChild(lless); lrow.appendChild(lnum); lrow.appendChild(lmore);
  lw.appendChild(withHelp(lrow, "How many lines of writing the box has room for before it scrolls. Four suits a sentence or two."));
  add(lw);

  /* Written answers usually come in runs of two or three. Another one joins
     this task rather than becoming a task of its own: it shares the heading
     and the context already written above, and only needs its own question
     and its own recommended length. */
  if (!Array.isArray(b.extra)) b.extra = [];
  b.extra.forEach((q, k) => {
    const wrapx = el("div","bfield extraq");
    const head = el("div","brow");
    head.appendChild(el("label","","Question " + (k + 2)));
    const del = el("button","btn-ghost bmini","×");
    del.title = "Remove this question";
    del.addEventListener("click", () => { b.extra.splice(k, 1); redraw(); schedulePreview(); });
    head.appendChild(del);
    wrapx.appendChild(head);

    const ed = window.richText(q.prompt || "", (html) => { q.prompt = html; saveDraft(); schedulePreview(); },
                               { rows:2 });
    wrapx.appendChild(ed);

    const rowx = el("div","brow");
    rowx.appendChild(el("label","","Recommended word count"));
    const st = el("div","stepper");
    const lessx = el("button","btn-ghost iconbtn","−");
    const numx = el("input"); numx.type = "number"; numx.className = "stepnum";
    numx.value = String(q.minWords === undefined ? 20 : q.minWords);
    const morex = el("button","btn-ghost iconbtn","+");
    const setx = (v) => { q.minWords = Math.max(0, v); numx.value = String(q.minWords); saveDraft(); schedulePreview(); };
    lessx.addEventListener("click", () => setx((parseInt(numx.value,10) || 0) - 5));
    morex.addEventListener("click", () => setx((parseInt(numx.value,10) || 0) + 5));
    numx.addEventListener("input", () => { q.minWords = Math.max(0, parseInt(numx.value,10) || 0); saveDraft(); schedulePreview(); });
    st.appendChild(lessx); st.appendChild(numx); st.appendChild(morex);
    rowx.appendChild(st);
    wrapx.appendChild(rowx);
    add(wrapx);
  });

  const another = el("button","btn-ghost bmini2","+ Another question");
  another.addEventListener("click", () => {
    b.extra.push({ prompt:"", minWords:20 });
    redraw(); schedulePreview();
  });
  add(another);
};

EDITORS.quiz = function(b, k){
  const { add, redraw } = k;
  if (!b.questions) b.questions = [{ q:"", options:["",""], answer:0, hint:"" }];
  b.questions.forEach((q, qi) => {
    const box = el("div","qsub");
    const qh = el("div","qsub-head");
    qh.appendChild(el("b","", "Question " + (qi + 1)));
    if (b.questions.length > 1){
      const rm = el("button","btn-ghost bmini","\u2715"); rm.title = "Remove this question";
      rm.addEventListener("click", () => askDelete("Question " + (qi + 1), () => { b.questions.splice(qi, 1); redraw(); schedulePreview(); }));
      qh.appendChild(rm);
    }
    box.appendChild(qh);
    const qw = el("div","bfield");
    qw.appendChild(el("label","","Question"));
    /* A quiz question can want a line of code or a bold word in it, so it
       gets the same formatting bar as everything else a teacher writes. */
    qw.appendChild(window.richText(q.q || "",
      (html) => { q.q = html; saveDraft(); schedulePreview(); }, { rows: 2 }));
    box.appendChild(qw);
    if (!q.answers) q.answers = [q.answer === undefined ? 0 : q.answer];
    const ow = el("div","bfield");
    const many = q.answers.length > 1;
    ow.appendChild(el("label","", many ? "Options (tick every right answer)" : "Options (tick the right one)"));
    (q.options || []).forEach((val, k) => {
      const row = el("div","brow");
      const inp = el("input"); inp.value = val;
      inp.addEventListener("input", () => { q.options[k] = inp.value; saveDraft(); schedulePreview(); });
      row.appendChild(inp);
      const isRight = q.answers.indexOf(k) >= 0;
      const pick = el("button","btn-ghost bmini" + (isRight ? " right" : ""), "\u2713");
      pick.title = isRight ? "A correct answer, click to unmark" : "Mark as a correct answer";
      pick.addEventListener("click", () => {
        const at = q.answers.indexOf(k);
        if (at >= 0){ if (q.answers.length > 1) q.answers.splice(at, 1); }
        else q.answers.push(k);
        q.answers.sort((x, y) => x - y);
        redraw(); schedulePreview();
      });
      row.appendChild(pick);
      const del = el("button","btn-ghost bmini","\u2715");
      del.addEventListener("click", () => {
        q.options.splice(k, 1);
        q.answers = q.answers.filter(a => a !== k).map(a => a > k ? a - 1 : a);
        if (!q.answers.length) q.answers = [0];
        redraw(); schedulePreview();
      });
      row.appendChild(del);
      ow.appendChild(row);
    });
    const addOpt = el("button","btn-ghost bmini2","+ Add another option");
    addOpt.addEventListener("click", () => { q.options.push(""); redraw(); });
    const optFoot = el("div","brow");
    optFoot.appendChild(addOpt);
    optFoot.appendChild(helpDot(q.answers.length > 1
      ? "Students must tick all " + q.answers.length + " to get it right."
      : "Tick a second option to make it a multiple-answer question."));
    ow.appendChild(optFoot); box.appendChild(ow);
    /* The lesson page has always been able to show this; there was simply
       nowhere to write it. */
    const yw = el("div","bfield");
    yw.appendChild(el("label","","Sentence to display when they get it right"));
    const yi = el("input"); yi.value = q.why || "";
    yi.addEventListener("input", () => { q.why = yi.value; saveDraft(); schedulePreview(); });
    yw.appendChild(yi); box.appendChild(yw);
    const hw = el("div","bfield");
    hw.appendChild(el("label","","Hint if they get it wrong"));
    const hi = el("input"); hi.value = q.hint || "";
    hi.addEventListener("input", () => { q.hint = hi.value; saveDraft(); schedulePreview(); });
    hw.appendChild(hi); box.appendChild(hw);
    add(box);
  });
  const addQ = el("button","btn-ghost bmini2","+ Add another question");
  addQ.addEventListener("click", () => { b.questions.push({ q:"", options:["",""], answer:0, hint:"", why:"" }); redraw(); schedulePreview(); });
  add(addQ);

  /* How well they have to do, and whether the rest of the page waits for
     it, is set from the eye in this card's top corner, alongside the same
     choice every other task that can be marked has. */
};

EDITORS.page = function(b, k){
  const { F, R, toggleRow, add, paintHead } = k;
  /* All pages is for reading the shape of a lesson and shifting things
     about, so it leaves out everything that is writing rather than
     arranging: the title and subtitle boxes, and the row of containers.
     Five pages' worth of those came to more than two screens on their own,
     which is most of what the view was meant to get rid of. The page title
     is already on the line above. */
  if (!viewAll){
    F("Title", "title", { then: paintHead });
    R("Subtitle", "task", { rows:2 });
    /* The task bar is on unless a teacher turns it off, because a page with
       several tasks on it is easier to get about with one than without.

       Saving on Continue used to be a setting here too. It went once the
       lesson's own Autosave was on by default: that already sends the work
       while they are on the page, and Continue now sends anything still
       waiting, so a page had nothing left to decide.

       An extension page is off unless asked for. It changes nothing a
       student sees on the way through; it only moves the page's tasks out
       of the Progress tab's main columns and into "You also completed" on
       the tally, where finishing early belongs. */
    toggleRow([["taskbar","Task bar", true],
               ["extension","Extension page", false]], "This page",
      ["The task bar is the line of small icons down the left of the page, one "
       + "for each task, that a student can press to get straight to that task. "
       + "It is on by default, and it is not shown on a phone or where the page "
       + "holds only one task.",
       "An extension page is for students who finish early. Its tasks are left "
       + "out of the Progress tab until Include Extension Tasks is pressed, and on "
       + "a student's tally at the end they are counted under You also completed "
       + "rather than against what they got done."]);
  }

  const inner = el("div","pagekids");
  if (!b.blocks) b.blocks = [];
  if (!b.blocks.length) inner.appendChild(el("p","bhelp dropzone", viewAll
    ? "Nothing on this page yet."
    : "Drag a task here, or use the buttons below."));
  b.blocks.forEach((child, k) => inner.appendChild(card(child, k, b.blocks)));
  wireDropList(inner, () => b.blocks);
  add(inner);
  if (!viewAll) add(addTaskRow(b.blocks));
};

EDITORS.extension = function(b, k){
  const { F, R, add } = k;
  F("Heading", "title");
  R("Subtitle", "task", { rows:2, help:[
    "The lesson shows “Finished early?” with a box to tick. These open "
    + "when it is ticked, or on their own once everything else on the page is "
    + "finished. They never hold anybody up, so nobody is asked to complete them.",
    "The subtitle is shown under “Finished early?” once they open it."] });
  const inner = el("div","pagekids");
  if (!b.blocks) b.blocks = [];
  if (!b.blocks.length) inner.appendChild(el("p","bhelp dropzone","Drag a task here, or use the buttons below."));
  b.blocks.forEach((child, k) => inner.appendChild(card(child, k, b.blocks)));
  wireDropList(inner, () => b.blocks);
  add(inner);
  add(addTaskRow(b.blocks, "extension"));
};

EDITORS.group = function(b, k){
  const { F, R, add } = k;
  F("Heading (optional)", "title");
  R("Subtitle (optional)", "task", { rows:2, help:[
    "A group keeps several tasks together as one thing. Everything in it is "
    + "on the page from the start and counts the same as it would on its own: "
    + "it is a way of building a piece of work once and dropping it into as "
    + "many lessons as you like, not a way of hiding anything.",
    "Leave both boxes empty and the tasks simply follow one another."] });
  const inner = el("div","pagekids");
  if (!b.blocks) b.blocks = [];
  if (!b.blocks.length) inner.appendChild(el("p","bhelp dropzone","Drag a task here, or use the buttons below."));
  b.blocks.forEach((child, k) => inner.appendChild(card(child, k, b.blocks)));
  wireDropList(inner, () => b.blocks);
  add(inner);
  add(addTaskRow(b.blocks, "group"));
};

EDITORS.choice = function(b, k){
  const { F, R, add, redraw } = k;
  F("Heading (optional)", "title");
  R("What they are choosing between", "prompt", { rows:2 });
  if (!Array.isArray(b.options)) b.options = [];
  b.options.forEach((opt, k) => {
    if (!opt.blocks) opt.blocks = [];
    const w = el("div","bfield choiceopt");
    const lab = el("div","brow");
    const name = el("input");
    name.placeholder = "Choice " + String.fromCharCode(65 + k);
    name.value = opt.label || "";
    name.addEventListener("input", () => { opt.label = name.value; saveDraft(); schedulePreview(); });
    lab.appendChild(name);
    if (b.options.length > 2){
      const del = el("button","btn-ghost bmini","×");
      del.title = "Remove this choice";
      del.addEventListener("click", () => { b.options.splice(k, 1); redraw(); schedulePreview(); });
      lab.appendChild(del);
    }
    w.appendChild(lab);
    const inner = el("div","pagekids");
    if (!opt.blocks.length) inner.appendChild(el("p","bhelp dropzone","What they get for this choice. Use the buttons below."));
    opt.blocks.forEach((child, j) => inner.appendChild(card(child, j, opt.blocks)));
    wireDropList(inner, () => opt.blocks);
    w.appendChild(inner);
    w.appendChild(addTaskRow(opt.blocks, "choice"));
    add(w);
  });
  const another = el("button","btn-ghost bmini2","+ Another choice");
  another.addEventListener("click", () => { b.options.push({ label:"", blocks:[] }); redraw(); schedulePreview(); });
  add(another);
};

EDITORS.image = function(b, k){
  const { F } = k;
  F("Heading (optional)", "title"); F("Instruction (optional)", "task", { area:true, rows:2 });
};

EDITORS.frame = function(b, k){
  const { F, toggleRow } = k;
  F("Heading (optional)", "heading");
  F("Address of the page", "url");
  F("Instruction (optional)", "task", { area:true, rows:2 });
  F("Width", "width", { help:"A number of pixels, or something like 100%." });
  F("Height", "height");
  toggleRow([["confirm","Confirmation", false]]);
};

EDITORS.embed = function(b, k){
  const { F, R, toggleRow, add } = k;
  F("YouTube link, video id, or the whole embed code", "url", { area:true, rows:2 });
  const shown = toEmbed(b.url);
  const note = el("p","bhelp", shown ? "Will be embedded as: " + shown : "Paste any YouTube address, it gets tidied up automatically.");
  if (shown && !/youtube\.com\/embed\//.test(shown)) note.className = "bhelp warn";
  add(note);
  F("Heading (optional)", "title");
  R("Subheading (optional)", "note", { rows:2 });
  toggleRow([["confirm","Confirmation", false]]);
};

EDITORS.link = function(b, k){
  const { F, toggleRow } = k;
  F("Heading (optional)", "heading");
  F("Address", "url");
  F("Button label", "title");
  F("What to do there (optional)", "task", { area:true, rows:2 });
  toggleRow([["confirm","Confirmation", false]]);
};

EDITORS.mc = function(b, k){
  const { F, R, listField } = k;
  R("Question", "prompt", { rows:2 });
  listField("Options (tick the right one)", "options");
  if (lesson.assessment) F("Topic tag", "topic", { help:"Used for Strength and Target feedback." });
};

EDITORS.blanks = function(b, k){
  const { F } = k;
  F("Instruction (optional)", "prompt");
  F("Sentence with gaps", "text", { area:true, rows:3,
    help:"Put the answers in double brackets: The [[cat]] sat on the [[mat]]." });
  F("Extra wrong words for the dropdowns", "distractors");
  if (lesson.assessment) F("Topic tag", "topic");
};

EDITORS.order = function(b, k){
  const { F, listField } = k;
  F("Instruction (optional)", "prompt");
  listField("Items in the CORRECT order", "items", "Students see them shuffled.");
  if (lesson.assessment) F("Topic tag", "topic");
};

/* The checklist is the same button on both kinds of coding task. */
function checklistField(b, k){
  const { add } = k;
  // once Python or web has been chosen
  const isWeb = b.type === "web";
  if (!Array.isArray(b.checks)) b.checks = [];
  const w = el("div","bfield");
  w.appendChild(el("label","","Checklist"));
  const n = b.checks.length;
  const open2 = el("button","btn-ghost bmini2",
    n ? "Edit the checklist (" + n + ")" : "+ Add a checklist");
  open2.addEventListener("click", () => checklistPopup(b, isWeb));
  const checkRow = el("div","brow");
  checkRow.appendChild(open2);
  checkRow.appendChild(helpDot(
    "Students see these above the editor and press Check my work. Leave empty for no checklist."));
  w.appendChild(checkRow);
  add(w);
}

EDITORS.keywords = function(b, k){
  const { F, R, add, redraw } = k;
  F("Heading (optional)", "title");
  R("Instruction (optional)", "task", { rows:2 });
  if (!Array.isArray(b.words)) b.words = [];
  const w = el("div","bfield");
  w.appendChild(el("label","","The keywords"));
  b.words.forEach((entry, k) => {
    const row = el("div","brow kwrow");
    const word = el("input");
    word.placeholder = "Keyword";
    word.value = entry.word || "";
    word.addEventListener("input", () => { entry.word = word.value; saveDraft(); schedulePreview(); });
    const hint = el("input");
    hint.placeholder = "Hint (optional)";
    hint.value = entry.hint || "";
    hint.addEventListener("input", () => { entry.hint = hint.value; saveDraft(); schedulePreview(); });
    row.appendChild(word); row.appendChild(hint);
    [["↑","Move up", () => { if (k){ b.words.splice(k-1,0,b.words.splice(k,1)[0]); redraw(); schedulePreview(); } }],
     ["↓","Move down", () => { if (k<b.words.length-1){ b.words.splice(k+1,0,b.words.splice(k,1)[0]); redraw(); schedulePreview(); } }],
     ["✕","Remove", () => { b.words.splice(k,1); redraw(); schedulePreview(); }]
    ].forEach(t => {
      const btn = el("button","btn-ghost bmini", t[0]);
      btn.title = t[1];
      btn.addEventListener("click", t[2]);
      row.appendChild(btn);
    });
    w.appendChild(row);
  });
  const addKw = el("button","btn-ghost bmini2","+ Another keyword");
  addKw.addEventListener("click", () => { b.words.push({ word:"", hint:"" }); redraw(); schedulePreview(); });
  const kwFoot = el("div","brow");
  kwFoot.appendChild(addKw);
  kwFoot.appendChild(helpDot(
    "One per row. The hint is optional and sits under the word, for anything "
    + "that needs narrowing down."));
  w.appendChild(kwFoot);
  add(w);
};

EDITORS.notes = function(b, k){
  const { F } = k;
  F("Heading (optional)", "title");
  F("Instruction (optional)", "task", { area:true, rows:2 });
  F("Something to start them off (optional)", "starter", { area:true, rows:3 });
};

EDITORS.mindmap = function(b, k){
  const { F, toggleRow } = k;
  F("Heading (optional)", "title");
  F("Instruction (optional)", "task", { area:true, rows:2 });
  F("The idea in the middle", "centre", { help:"Left empty, they choose their own." });
  toggleRow([["lockCentre","Students cannot change the middle", false]]);
};

EDITORS.board = function(b, k){
  const { F } = k;
  F("Heading (optional)", "title");
  F("Instruction (optional)", "task", { area:true, rows:2 });
  F("How tall, in pixels", "height", { num:true,
    help:"What they draw is kept as the strokes themselves, not a picture, so it takes very little room." });
};

EDITORS.label = function(b, k){
  const { F, add } = k;
  F("Heading (optional)", "title");
  F("Instruction (optional)", "task", { area:true, rows:2 });
  F("Picture address", "image", { help:"Paste a link to the picture they will label." });
  if (!Array.isArray(b.spots)) b.spots = [];

  const w = el("div","bfield");
  const labHead = el("div","brow");
  labHead.appendChild(el("label","","The picture, and where the labels go"));
  labHead.appendChild(helpDot("Drag on the picture to draw a box, then type the word for it below."));
  w.appendChild(labHead);

  /* With no picture there is nothing to draw boxes on, so only the hint
     shows. This used to return from card() instead, which handed
     appendChild an undefined card: adding a Label a picture task blanked
     the whole page in the builder, because a fresh one has no image yet. */
  if (!b.image) w.appendChild(el("p","hint","Paste a picture address above to start."));
  else {
    const holder = el("div","label-pic label-edit");
    const img = el("img");
    img.src = b.image;
    img.draggable = false;
    holder.appendChild(img);
    const ghost = el("div","label-ghost");
    ghost.hidden = true;
    holder.appendChild(ghost);
    w.appendChild(holder);

    const list = el("div","label-list");
    w.appendChild(list);

    function paintSpots(){
      holder.querySelectorAll(".label-spot").forEach(n => n.remove());
      list.innerHTML = "";
      b.spots.forEach((sp, i) => {
        const mark = el("div","label-spot");
        mark.style.left = sp.x + "%"; mark.style.top = sp.y + "%";
        mark.style.width = sp.w + "%"; mark.style.height = sp.h + "%";
        mark.textContent = sp.answer || String(i + 1);
        holder.appendChild(mark);

        /* the word for this box, typed underneath rather than in a list
           of commas somewhere else */
        const row = el("div","label-row");
        row.appendChild(el("span","label-num", String(i + 1)));
        const word = el("input","checkname");
        word.value = sp.answer || "";
        word.placeholder = "The word that goes in box " + (i + 1);
        word.addEventListener("input", () => {
          sp.answer = word.value;
          mark.textContent = word.value || String(i + 1);
          saveDraft(); schedulePreview();
        });
        const rm = el("button","btn-ghost bmini","\u2715");
        rm.title = "Remove this box";
        rm.addEventListener("click", () => { b.spots.splice(i, 1); saveDraft(); paintSpots(); schedulePreview(); });
        row.appendChild(word); row.appendChild(rm);
        list.appendChild(row);
      });
      if (!b.spots.length) list.appendChild(el("p","hint","No boxes yet. Drag on the picture to draw one."));
    }

    let from = null;
    const pct = (e) => {
      const r = holder.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 100,
               y: ((e.clientY - r.top) / r.height) * 100 };
    };
    holder.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("label-spot")) return;
      e.preventDefault();
      holder.setPointerCapture(e.pointerId);
      from = pct(e);
      ghost.hidden = false;
      ghost.style.left = from.x + "%"; ghost.style.top = from.y + "%";
      ghost.style.width = "0%"; ghost.style.height = "0%";
    });
    holder.addEventListener("pointermove", (e) => {
      if (!from) return;
      const now = pct(e);
      ghost.style.left = Math.min(from.x, now.x) + "%";
      ghost.style.top = Math.min(from.y, now.y) + "%";
      ghost.style.width = Math.abs(now.x - from.x) + "%";
      ghost.style.height = Math.abs(now.y - from.y) + "%";
    });
    holder.addEventListener("pointerup", (e) => {
      if (!from) return;
      const now = pct(e);
      const spot = { x: Math.min(from.x, now.x), y: Math.min(from.y, now.y),
                     w: Math.abs(now.x - from.x), h: Math.abs(now.y - from.y), answer:"" };
      from = null;
      ghost.hidden = true;
      if (spot.w < 3 || spot.h < 3) return;      // a stray click, not a box
      b.spots.push(spot);
      saveDraft(); paintSpots(); schedulePreview();
    });

    paintSpots();
  }
  add(w);
};

EDITORS.binary = EDITORS.binadd = function(b, k){
  const { F, toggleRow, add, redraw } = k;
  F("Heading (optional)", "title");
  F("Instruction (optional)", "task", { area:true, rows:2 });
  const w = el("div","bfield");
  w.appendChild(el("label","","How many bits"));
  const st = el("div","stepper");
  const less = el("button","btn-ghost iconbtn","\u2212");
  const num = el("input"); num.type = "number"; num.className = "stepnum"; num.value = String(b.bits || 8);
  const more = el("button","btn-ghost iconbtn","+");
  const setB = (v) => { b.bits = Math.max(4, Math.min(16, v)); num.value = String(b.bits); saveDraft(); schedulePreview(); };
  less.addEventListener("click", () => setB((parseInt(num.value, 10) || 8) - 1));
  more.addEventListener("click", () => setB((parseInt(num.value, 10) || 8) + 1));
  num.addEventListener("input", () => { b.bits = Math.max(4, Math.min(16, parseInt(num.value, 10) || 8)); saveDraft(); });
  st.appendChild(less); st.appendChild(num); st.appendChild(more);
  w.appendChild(st);
  add(w);
  F("How many questions", "count", { num:true });
  if (b.type === "binary"){
    const mw = el("div","bfield");
    mw.appendChild(el("label","","Which way round"));
    const row = el("div","brow");
    [["toDenary","Binary to denary"],["toBinary","Denary to binary"],["either","A mixture"]].forEach(pair => {
      const btn = el("button","btn-ghost bmini2" + (b.mode === pair[0] ? " right" : ""), pair[1]);
      btn.addEventListener("click", () => { b.mode = pair[0]; redraw(); schedulePreview(); });
      row.appendChild(btn);
    });
    mw.appendChild(row); add(mw);
    F("Set numbers (optional)", "numbers", { help:"Separate with commas, e.g. 13, 200. Left empty, numbers are made up each time." });
    toggleRow([["showPlace","Place values", true]]);
  } else {
    F("Set sums (optional)", "pairs", { help:"One per line, e.g. 10 + 5. Left empty, sums are made up each time." });
    toggleRow([["showPlace","Place values", true], ["showCarry","Row for carrying", true]]);
  }
};

EDITORS.password = function(b, k){
  const { F } = k;
  F("Heading (optional)", "title");
  F("What they have to do", "task", { area:true, rows:2 });
};

EDITORS.caesar = function(b, k){
  const { F, add } = k;
  F("Heading (optional)", "title");
  F("What they have to do", "task", { area:true, rows:2 });
  F("The hidden message", "message", { area:true, rows:2, then: () => showCoded() });
  const sw = el("div","bfield");
  sw.appendChild(el("label","","Shift"));
  const srow = el("div","stepper");
  const down = el("button","btn-ghost iconbtn","−");
  const num = el("input"); num.type = "number"; num.className = "stepnum";
  num.min = "1"; num.max = "25";
  num.value = String(b.shift || 7);
  const up = el("button","btn-ghost iconbtn","+");
  /* One step either way is no puzzle at all, and 26 is back where it
     started, so the slider a student drags only ever offers 1 to 25. */
  const setShift = (v) => {
    b.shift = Math.max(1, Math.min(25, v));
    num.value = String(b.shift);
    saveDraft(); schedulePreview(); showCoded();
  };
  down.addEventListener("click", () => setShift((parseInt(num.value, 10) || 7) - 1));
  up.addEventListener("click", () => setShift((parseInt(num.value, 10) || 7) + 1));
  num.addEventListener("input", () => setShift(parseInt(num.value, 10) || 7));
  srow.appendChild(down); srow.appendChild(num); srow.appendChild(up);
  sw.appendChild(srow);
  /* What the class will actually see, so a teacher can check it before
     the lesson rather than by playing it through. */
  const coded = el("p","bhelp");
  function showCoded(){
    const shift = Math.max(1, Math.min(25, Number(b.shift) || 7));
    coded.textContent = b.message
      ? "They will see: " + caesarEncode(b.message, shift)
      : "Type the message above and the coded version appears here.";
  }
  showCoded();
  sw.appendChild(coded);
  add(sw);
  F("Label above the answer box", "prompt");
};

EDITORS.short = function(b, k){
  const { F, R, listField } = k;
  R("Question", "prompt", { rows:2 });
  if (!Array.isArray(b.answers)) b.answers = [""];
  listField("Accepted answers", "answers",
    "The student has to type one of these. Capitals, extra spaces and stray " +
    "punctuation are ignored, so add a line only for answers that are really " +
    "different, such as CPU and central processing unit.",
    /* The note about the old keyword marking has been read and acted on the
       moment the list is touched, so it goes rather than sitting there for
       the rest of the afternoon. */
    () => { delete b.wasKeywords; });
  shortAnswerNotes(k.here(), b);
  F("Model answer", "model", { area:true, rows:2,
    help:"Shown to a student who gets it wrong, and printed beside their work." });
  if (lesson.assessment) F("Topic tag", "topic");
};

EDITORS.table = function(b, k){
  const { F, R, add, redraw } = k;
  F("Heading (optional)", "title");
  R("What are they to do?", "task", { rows:2,
    placeholder:"Complete the table for the algorithm above." });
  if (!Array.isArray(b.head)) b.head = [];
  if (!Array.isArray(b.rows)) b.rows = [];
  const cols = Math.max(b.head.length, ...b.rows.map(r => (r || []).length), 1);
  /* Every row the same width, whatever editing has left behind. */
  while (b.head.length < cols) b.head.push("");
  b.rows.forEach(r => { while (r.length < cols) r.push({ t:"", fill:true }); });

  const w = el("div","bfield");
  w.appendChild(el("label","","The table"));
  w.appendChild(el("p","bhelp",
    "Type what a student should see. A cell with the box turned on is one "
    + "they fill in, and whatever you type in it is the answer it is marked "
    + "against. Leave that empty and the cell is still theirs to fill in, "
    + "but nothing marks it."));
  const scroll = el("div","tt-edit-scroll");
  const grid = el("table","tt-edit");

  const headRow = el("tr");
  b.head.forEach((h, c) => {
    const th = el("th");
    const inp = el("input");
    inp.value = h || "";
    inp.placeholder = "Heading";
    inp.addEventListener("input", () => { b.head[c] = inp.value; saveDraft(); schedulePreview(); });
    th.appendChild(inp);
    const drop = el("button","btn-ghost bmini","✕");
    drop.title = "Remove this column";
    drop.addEventListener("click", () => {
      if (cols <= 1) return;
      b.head.splice(c, 1);
      b.rows.forEach(r => r.splice(c, 1));
      redraw(); schedulePreview();
    });
    th.appendChild(drop);
    headRow.appendChild(th);
  });
  headRow.appendChild(el("th","tt-edit-corner",""));
  grid.appendChild(headRow);

  b.rows.forEach((row, r) => {
    const tr = el("tr");
    row.forEach((cell, c) => {
      if (!cell || typeof cell !== "object") row[c] = cell = { t: String(cell == null ? "" : cell) };
      const td = el("td");
      const inp = el("input");
      inp.value = cell.t || "";
      inp.placeholder = cell.fill ? "Answer (optional)" : "What they see";
      inp.addEventListener("input", () => { cell.t = inp.value; saveDraft(); schedulePreview(); });
      td.appendChild(inp);
      /* One button a cell, and it says which of the two the cell is. */
      const flip = el("button","btn-ghost bmini tt-flip" + (cell.fill ? " on" : ""),
                      cell.fill ? "▢" : "T");
      flip.title = cell.fill ? "They fill this in. Click to show it instead."
                             : "They see this. Click to make it a box they fill in.";
      flip.addEventListener("click", () => { cell.fill = !cell.fill; redraw(); schedulePreview(); });
      td.appendChild(flip);
      tr.appendChild(td);
    });
    const end = el("td","tt-edit-corner");
    const drop = el("button","btn-ghost bmini","✕");
    drop.title = "Remove this row";
    drop.addEventListener("click", () => { b.rows.splice(r, 1); redraw(); schedulePreview(); });
    end.appendChild(drop);
    tr.appendChild(end);
    grid.appendChild(tr);
  });
  scroll.appendChild(grid);
  w.appendChild(scroll);

  const foot = el("div","brow");
  const addRow = el("button","btn-ghost bmini2","+ Row");
  addRow.addEventListener("click", () => {
    const fresh = [];
    for (let c = 0; c < cols; c++) fresh.push({ t:"", fill:true });
    b.rows.push(fresh);
    redraw(); schedulePreview();
  });
  const addCol = el("button","btn-ghost bmini2","+ Column");
  addCol.addEventListener("click", () => {
    b.head.push("");
    b.rows.forEach(r => r.push({ t:"", fill:true }));
    redraw(); schedulePreview();
  });
  foot.appendChild(addRow); foot.appendChild(addCol);
  /* Said once, under the grid, rather than left to be discovered when a
     class has already done it. */
  const marked = b.rows.reduce((n, r) => n + r.filter(c => c && c.fill && String(c.t || "").trim()).length, 0);
  const blanks = b.rows.reduce((n, r) => n + r.filter(c => c && c.fill).length, 0);
  foot.appendChild(el("span","bhelp", blanks
    ? blanks + (blanks === 1 ? " box, " : " boxes, ") + (marked || "none") + " with an answer to mark against"
    : "No boxes yet, so there is nothing for them to fill in."));
  w.appendChild(foot);
  add(w);
  if (specLevel()) specPicker(k.here(), b);
};

EDITORS.exam = function(b, k){
  const { F, R, pickRow, listField, add, redraw } = k;
  R("The question", "prompt", { rows:3,
    placeholder:"Describe how the CPU fetches an instruction from memory." });
  const cmds = ["State", "Identify", "Describe", "Explain", "Compare", "Discuss", "Evaluate", "Complete", "Calculate"];
  const cw = el("div","bfield");
  cw.appendChild(el("label","","Command word"));
  const crow = el("div","brow");
  const csel = document.createElement("select");
  [""].concat(cmds).forEach(w => {
    const o = document.createElement("option");
    o.value = w; o.textContent = w || "None";
    if ((b.command || "") === w) o.selected = true;
    csel.appendChild(o);
  });
  csel.addEventListener("change", () => { b.command = csel.value; saveDraft(); schedulePreview(); });
  crow.appendChild(csel);
  const mlab = el("label","brow-inline","Worth");
  const mnum = el("input"); mnum.type = "number"; mnum.min = "0"; mnum.max = "30";
  mnum.className = "smallnum";
  mnum.value = String(Math.max(0, parseInt(b.marks, 10) || 0));
  mnum.addEventListener("input", () => {
    b.marks = Math.max(0, Math.min(30, Math.round(Number(mnum.value) || 0)));
    saveDraft(); schedulePreview();
  });
  crow.appendChild(mlab); crow.appendChild(mnum);
  crow.appendChild(helpDot("The number of marks on the paper. It sets how much room the answer box gets."));
  cw.appendChild(crow);
  add(cw);

  pickRow("How do they answer?", "answer",
    [["lines","In their own words"],["short","One line"]],
    "One line is the only one marked on its own, because the whole line is the answer. " +
    "Anything longer shows the mark scheme once they have had a go and they tick off what they wrote.");

  if (b.answer === "short"){
    if (!Array.isArray(b.answers) || !b.answers.length) b.answers = [""];
    listField("Accepted answers", "answers",
      "Capitals, spacing and stray punctuation are ignored, so add a line only for " +
      "answers that are really different, such as CPU and central processing unit.");
    shortAnswerNotes(k.here(), b);
    F("Model answer", "model", { area:true, rows:2,
      help:"Shown to a student who gets it wrong, and printed beside their work." });
  } else {
    /* The mark scheme, a point at a time. A student sees these only after
       they have written something, and ticks off the ones they made. */
    if (!Array.isArray(b.scheme) || !b.scheme.length) b.scheme = [{ text:"", marks:1 }];
    const sw = el("div","bfield");
    sw.appendChild(el("label","","Mark scheme"));
    b.scheme.forEach((point, k) => {
      const row = el("div","brow");
      const inp = el("input");
      inp.placeholder = "One point worth a mark";
      inp.value = point.text || "";
      inp.addEventListener("input", () => { point.text = inp.value; saveDraft(); schedulePreview(); });
      row.appendChild(inp);
      const worth = el("input"); worth.type = "number"; worth.min = "1"; worth.max = "10";
      worth.className = "smallnum";
      worth.title = "How many marks this point is worth";
      worth.value = String(Math.max(1, parseInt(point.marks, 10) || 1));
      worth.addEventListener("input", () => {
        point.marks = Math.max(1, Math.min(10, Math.round(Number(worth.value) || 1)));
        saveDraft(); schedulePreview();
      });
      row.appendChild(worth);
      const del = el("button","btn-ghost bmini","✕"); del.title = "Remove";
      del.addEventListener("click", () => { b.scheme.splice(k, 1); redraw(); schedulePreview(); });
      row.appendChild(del);
      sw.appendChild(row);
    });
    const addRow = el("div","brow");
    const addPoint = el("button","btn-ghost bmini2","+ Add a point");
    addPoint.addEventListener("click", () => { b.scheme.push({ text:"", marks:1 }); redraw(); });
    addRow.appendChild(addPoint);
    /* The two numbers drifting apart is the mistake worth catching: a four
       marker whose scheme adds up to three cannot be got full marks on. */
    const worthAll = b.scheme.reduce((n, p) => n + Math.max(1, parseInt(p.marks, 10) || 1), 0);
    const want = Math.max(0, parseInt(b.marks, 10) || 0);
    if (want && b.scheme.some(p => String(p.text || "").trim()) && worthAll !== want)
      addRow.appendChild(el("span","bhelp warn",
        "The scheme adds up to " + worthAll + " but the question is worth " + want + "."));
    sw.appendChild(addRow);
    add(sw);
    F("A full answer (optional)", "model", { area:true, rows:2,
      help:"Shown under the mark scheme, so they can see what a complete answer reads like." });
    F("Lines for the answer (optional)", "lines", { num:true,
      help:"Left empty, the box is two lines a mark." });
  }
  specPicker(k.here(), b);
};
