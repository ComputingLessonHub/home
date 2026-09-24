/* ============================================================
   The Python editor, in one place.

   The colouring, the line numbers, the mistake spotting and the typing
   behaviour used to live inside lesson.html, which meant the builder's
   "Starter code" box was a plain textarea: no colours, no numbers, and no
   indent after a colon. A teacher wrote the code that students would open in
   the real editor, in a box that behaved nothing like it.

   Everything here is shared by both. lesson.html adds the parts only the
   student needs on top: running, the console, the turtle canvas and the help
   words.
   ============================================================ */
(function(){

const PY_KW = new Set(("and as assert break class continue def del elif else except finally for from global " +
  "if import in is lambda None nonlocal not or pass raise return True False try while with yield").split(" "));
const PY_FN = new Set(("print input int str float len range list dict set tuple bool abs min max sum round sorted " +
  "open type enumerate zip map filter reversed any all chr ord format").split(" "));
const TRIPLES = ["'''", '"""'];

function escHtml(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function el(tag, cls){ const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function tel(tag, cls, text){ const e = el(tag, cls); if (text !== undefined) e.textContent = text; return e; }

/* ---------- colouring one line ----------
   `state.triple` carries a long string over to the next line, so a docstring
   stays green all the way down instead of only on the line it opened. */
function hlLine(line, state, opts){
  const help = (opts && opts.help) || {};
  const tips = !opts || opts.tips !== false;
  let out = "", i = 0;
  if (state.triple){
    const close = line.indexOf(state.triple);
    if (close < 0) return { html: '<span class="t-str">' + escHtml(line) + "</span>" };
    out += '<span class="t-str">' + escHtml(line.slice(0, close + 3)) + "</span>";
    i = close + 3; state.triple = null;
  }
  while (i < line.length){
    const rest = line.slice(i);
    let m;
    if (rest[0] === "#"){ out += '<span class="t-com">' + escHtml(rest) + "</span>"; break; }
    const trip = TRIPLES.find(q => rest.slice(0, 3) === q);
    if (trip){
      const close = rest.indexOf(trip, 3);
      if (close < 0){ state.triple = trip; out += '<span class="t-str">' + escHtml(rest) + "</span>"; break; }
      out += '<span class="t-str">' + escHtml(rest.slice(0, close + 3)) + "</span>";
      i += close + 3; continue;
    }
    if ((m = /^("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/.exec(rest))){
      out += '<span class="t-str">' + escHtml(m[0]) + "</span>"; i += m[0].length; continue;
    }
    if ((m = /^\d+\.?\d*/.exec(rest))){ out += '<span class="t-num">' + m[0] + "</span>"; i += m[0].length; continue; }
    if ((m = /^[A-Za-z_]\w*/.exec(rest))){
      const w = m[0];
      const call = /^\s*\(/.test(rest.slice(w.length));
      const cls = PY_KW.has(w) ? "t-kw" : (PY_FN.has(w) ? "t-fn" : (call ? "t-call" : ""));
      const helped = Object.prototype.hasOwnProperty.call(help, w) && tips;
      out += cls
        ? '<span class="' + cls + (helped ? " t-help" : "") + '"' + (helped ? ' data-word="' + w + '"' : "") + ">" + w + "</span>"
        : escHtml(w);
      i += w.length; continue;
    }
    if ((m = /^[+\-*\/%=<>!&|^~]+/.exec(rest))){ out += '<span class="t-op">' + escHtml(m[0]) + "</span>"; i += m[0].length; continue; }
    out += escHtml(rest[0]); i++;
  }
  return { html: out || "&nbsp;" };
}

/* ---------- what is a string and what is code ----------
   Walked a character at a time rather than counted. Counting quote marks
   reported print("Great - let's get started") as a missing quote, because the
   apostrophe in "let's" made the number of single quotes odd. It is inside a
   double-quoted string, so it is not a quote mark at all.

   `carry` is whatever triple-quoted string was still open at the end of the
   line before, so a docstring does not turn the lines inside it into code.
   `comment` is what starts a comment, because it is not # in every language
   the editor paints; left out, it is Python's. Comes back with the code
   alone, the string contents blanked, and whatever is still open. */
function strip(line, carry, comment){
  const com = comment === undefined ? "#" : comment;
  let out = "", i = 0, open = carry || "";
  while (i < line.length){
    const three = line.slice(i, i + 3);
    if (open){
      if (open.length === 3){
        if (three === open){ open = ""; i += 3; out += '""'; continue; }
        i++; continue;
      }
      if (line[i] === "\\"){ i += 2; continue; }       // \" does not end the string
      if (line[i] === open){ open = ""; i++; out += '""'; continue; }
      i++; continue;
    }
    if (com && line[i] === com) break;                 // the rest is a comment
    if (three === '"""' || three === "'''"){ open = three; i += 3; continue; }
    if (line[i] === '"' || line[i] === "'"){ open = line[i]; i++; continue; }
    out += line[i]; i++;
  }
  return { text: out, open: open };
}

/* ---------- spotting mistakes before the code is even run ---------- */
function checkPython(code){
  const issues = [], lines = code.split("\n");
  const opens = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  let carry = "";                                      // a long string left open above
  lines.forEach((raw, n) => {
    const wasInside = !!carry;
    const st = strip(raw, carry);
    if (st.open && st.open.length === 3){
      carry = st.open;                                 // a docstring carrying on
    } else {
      if (st.open) issues.push({ line:n, msg:"A quote mark is missing from this line." });
      carry = "";
    }
    /* Lines inside a long string are text, not code, so nothing below applies
       to them. */
    if (wasInside) return;
    const t = st.text;
    if (!t.trim()) return;
    for (const ch of t){
      if (opens[ch]) stack.push({ ch, n });
      else if (ch === ")" || ch === "]" || ch === "}"){
        if (!stack.pop()) issues.push({ line:n, msg:"There is a closing bracket here with nothing to close." });
      }
    }

    const printMatch = /^(\s*)print\s+(?!\()(.+)$/.exec(raw);
    if (printMatch) issues.push({ line:n, msg:"In Python 3, print needs brackets around what it prints.",
                          fix:() => printMatch[1] + 'print(' + printMatch[2].trim() + ')' });

    const opener = /^\s*(if|elif|else|for|while|def|class|try|except|finally|with)\b/.exec(t);
    if (opener && !/:\s*$/.test(t.trim())){
      issues.push({ line:n, msg:'Lines starting with "' + opener[1] + '" need a colon (:) at the end.',
                    fix:() => raw.replace(/\s*$/, "") + ":" });
    }
    if (/^\s*(if|elif|while)\b/.test(t) && /[^=!<>+\-*\/%]=[^=]/.test(t.replace(/^\s*\w+/, ""))){
      issues.push({ line:n, msg:"Use == to compare two things. A single = puts a value into a variable.",
                    fix:() => raw.replace(/([^=!<>+\-*\/%])=([^=])/, "$1==$2") });
    }
    const typo = /\b(pirnt|prnit|Print|inptu|inupt|Input|rang|whlie|improt|fro|esle|retrun)\b/.exec(t);
    if (typo){
      const right = { pirnt:"print", prnit:"print", Print:"print", inptu:"input", inupt:"input",
                      Input:"input", rang:"range", whlie:"while", improt:"import", fro:"for",
                      esle:"else", retrun:"return" }[typo[1]];
      issues.push({ line:n, msg:'Did you mean "' + right + '"?',
                    fix:() => raw.replace(new RegExp("\\b" + typo[1] + "\\b"), right) });
    }
    if (/^\t+ +| +\t/.test(raw)) issues.push({ line:n, msg:"This line mixes tabs and spaces. Use spaces only." });
  });
  stack.forEach(o => issues.push({ line:o.n, msg:"This " + o.ch + " is never closed." }));
  return issues;
}

/* ---------------- what to offer while they type ----------------
   The suggestions box asks the language what fits where the cursor is, and
   draws whatever comes back. Everything Python-shaped about that is here;
   the web languages answer the same question in webhub.js. */

/* The toolboxes a KS3 program actually imports, and what is in them. Written
   out rather than worked out from the code, because nothing here runs Python:
   the editor is looking at text. */
const PY_MODULES = {
  random: { randint:"A whole number between two values, both included.",
            randrange:"A whole number from a range, the way range() counts.",
            choice:"Picks one item out of a list at random.",
            shuffle:"Mixes a list into a random order.",
            random:"A random decimal from 0 up to but not including 1.",
            uniform:"A random decimal between two values.",
            sample:"Picks several different items out of a list." },
  math:   { sqrt:"The square root of a number.", floor:"Rounds down to a whole number.",
            ceil:"Rounds up to a whole number.", pi:"3.14159…",
            pow:"Raises one number to the power of another.",
            fabs:"How far a number is from zero, as a decimal." },
  time:   { sleep:"Waits for that many seconds before carrying on." },
  turtle: { forward:"Moves the turtle forward.", backward:"Moves the turtle backward.",
            left:"Turns the turtle left by that many degrees.",
            right:"Turns the turtle right by that many degrees.",
            penup:"Lifts the pen, so moving draws nothing.",
            pendown:"Puts the pen down again, so moving draws.",
            goto:"Moves straight to a point, given across and up.",
            color:"Sets the drawing colour.", pencolor:"Sets the line colour.",
            fillcolor:"Sets the colour a shape is filled with.",
            begin_fill:"Start of a shape to fill in.", end_fill:"End of a shape to fill in.",
            circle:"Draws a circle of that radius.", dot:"Draws a dot where the turtle is.",
            speed:"How fast the turtle moves, 1 slow to 10 fast, or 0 for instant.",
            width:"How thick the line is.", setheading:"Points the turtle at an angle.",
            home:"Back to the middle, facing right.", clear:"Rubs out everything drawn.",
            hideturtle:"Hides the arrow.", showturtle:"Shows the arrow again." }
};

/* After a dot on anything else. Text and lists are what a beginner has, so
   their methods are the ones offered. */
const PY_METHODS = {
  upper:"The text in capitals.", lower:"The text in small letters.",
  title:"The text with each word starting with a capital.",
  strip:"The text with spaces trimmed off both ends.",
  split:"Cuts text into a list, at the spaces unless told otherwise.",
  join:"Joins a list of text into one piece, with this in between.",
  replace:"Swaps every copy of one piece of text for another.",
  find:"Where a piece of text starts, or -1 when it is not there.",
  count:"How many times something appears.",
  startswith:"True when the text starts with that.",
  endswith:"True when the text ends with that.",
  format:"Fills in the gaps in a piece of text.",
  isdigit:"True when the text is all digits.",
  append:"Adds an item to the end of a list.",
  insert:"Puts an item into a list at a given position.",
  remove:"Takes the first matching item out of a list.",
  pop:"Takes an item out of a list and hands it back.",
  sort:"Puts the list in order, in place.",
  reverse:"Turns the list back to front, in place.",
  index:"Where an item is in the list.",
  clear:"Empties it.",
  keys:"All the names in a dictionary.",
  values:"All the values in a dictionary.",
  items:"Every name and value in a dictionary, in pairs.",
  get:"Looks something up in a dictionary, without stopping if it is not there.",
  read:"Reads a whole file as one piece of text.",
  readlines:"Reads a file as a list of its lines.",
  write:"Writes text into a file.",
  close:"Closes a file that was opened."
};

/* Names the student made themselves. Without these the one word they are
   most likely to want, the variable they named two lines up, would be the
   one word never offered. */
function pyNames(code){
  const found = [];
  const keep = (w) => { if (w && !PY_KW.has(w) && found.indexOf(w) < 0) found.push(w); };
  const patterns = [
    /^[ \t]*([A-Za-z_]\w*)\s*(?:[-+*\/]|\/\/|\*\*)?=[^=]/gm,   // x = 1, total += 1
    /^[ \t]*def\s+([A-Za-z_]\w*)/gm,
    /^[ \t]*class\s+([A-Za-z_]\w*)/gm,
    /\bfor\s+([A-Za-z_]\w*)\s+in\b/g,
    /^[ \t]*import\s+([A-Za-z_]\w*)/gm,
    /\bas\s+([A-Za-z_]\w*)/g
  ];
  patterns.forEach(re => { let m; while ((m = re.exec(code)) !== null) keep(m[1]); });
  /* the names a def takes in, which are variables everywhere inside it */
  let m; const args = /^[ \t]*def\s+[A-Za-z_]\w*\s*\(([^)]*)\)/gm;
  while ((m = args.exec(code)) !== null)
    m[1].split(",").forEach(p => {
      const w = p.split("=")[0].trim().replace(/^\*+/, "");
      if (/^[A-Za-z_]\w*$/.test(w)) keep(w);
    });
  return found;
}

function pyItems(list, dict){
  return list.map(w => ({ label:w, detail:(dict && dict[w]) || "" }));
}

/* Has the line run into a comment or a piece of text by the time it reaches
   the cursor? Those are words, not code, and a box of keywords popping up
   over a sentence is in the way. Walked rather than searched for the same
   reason strip() is: the apostrophe in "let's" is not a quote mark when it
   sits inside a double-quoted string. */
function endsInCode(line){
  let open = "", i = 0;
  while (i < line.length){
    const three = line.slice(i, i + 3);
    if (open){
      if (open.length === 3){ if (three === open){ open = ""; i += 3; continue; } i++; continue; }
      if (line[i] === "\\"){ i += 2; continue; }
      if (line[i] === open){ open = ""; i++; continue; }
      i++; continue;
    }
    if (line[i] === "#") return false;
    if (three === '"""' || three === "'''"){ open = three; i += 3; continue; }
    if (line[i] === '"' || line[i] === "'"){ open = line[i]; i++; continue; }
    i++;
  }
  return !open;
}

function suggestPython(ctx){
  const line = ctx.lineBefore;
  let m;
  if (!endsInCode(line)) return null;

  /* the name of a toolbox, right after import or from */
  if ((m = /^\s*(?:import|from)\s+([A-Za-z_]\w*)?$/.exec(line)))
    return { from: ctx.pos - (m[1] || "").length,
             items: pyItems(Object.keys(PY_MODULES)) };

  /* After a dot. A toolbox opens on the dot itself, because the dot after
     random says exactly what is wanted next and there are only a handful of
     things it can be. Anything else waits for a letter: the list of methods
     any value might have is long, and nothing about the dot says which of
     them belongs there. */
  if ((m = /([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)?$/.exec(line))){
    const typed = m[2] || "";
    const own = PY_MODULES[m[1]];
    return { from: ctx.pos - typed.length, now: !!own,
             items: own ? pyItems(Object.keys(own), own)
                        : pyItems(Object.keys(PY_METHODS), PY_METHODS) };
  }

  const word = (/([A-Za-z_]\w*)$/.exec(line) || ["",""])[1] || "";
  const mine = pyNames(ctx.text).filter(w => w !== word);
  return { from: ctx.pos - word.length,
           items: pyItems(mine)
             .concat(pyItems(Array.from(PY_KW), PY_HELP))
             .concat(pyItems(Array.from(PY_FN), PY_HELP))
             .concat(pyItems(Object.keys(PY_MODULES))) };
}


/* ============================================================
   The suggestions box.

   A small window under the line being typed, holding whatever the language
   said fits there: keywords, functions, the student's own variables, tag
   names, CSS properties. Arrow keys or the mouse to choose, Enter, Tab or a
   click to take it, Escape to send it away.

   One box for the page, not one per editor. Only one editor can be typed in
   at a time, and a box per editor meant one left behind in <body> every time
   the builder redrew its list of tasks, which it does on every keystroke.

   It hangs off <body> rather than off the editor because everything inside
   .ide-codewrap is clipped by its overflow:hidden, which is what keeps the
   coloured layer lined up with the text. A box opened on the last line of a
   150px editor would have been cut in half by it. Sitting outside means
   position:fixed and working the caret out in page coordinates, which is
   what caretPoint does.
   ============================================================ */

/* How wide one character is, in this font at this size. Measured rather than
   guessed: the editor's text size is a student setting with four values, and
   a guess a pixel out puts the box a whole word adrift by column forty. The
   same few fonts come up over and over, so the answer is kept. */
const charWidths = {};
function charWidth(font){
  if (charWidths[font]) return charWidths[font];
  const probe = document.createElement("span");
  probe.textContent = "00000000000000000000";           // twenty, to divide out rounding
  probe.style.cssText = "position:absolute; visibility:hidden; white-space:pre; font:" + font;
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 20;
  probe.remove();
  if (w > 0) charWidths[font] = w;
  return w || 8;
}

/* Where the caret is on the screen, and how tall its line is. */
function caretPoint(ta){
  const before = ta.value.slice(0, ta.selectionStart);
  const nl = before.lastIndexOf("\n");
  const row = before.split("\n").length - 1;
  const col = before.length - nl - 1;
  const cs = getComputedStyle(ta);
  const size = parseFloat(cs.fontSize) || 14;
  const lineH = parseFloat(cs.lineHeight) || size * 1.55;   // "normal" comes back unusable
  const box = ta.getBoundingClientRect();
  const font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  return {
    x: box.left + (parseFloat(cs.paddingLeft) || 0) + col * charWidth(font) - ta.scrollLeft,
    y: box.top + (parseFloat(cs.paddingTop) || 0) + row * lineH - ta.scrollTop,
    line: lineH
  };
}

/* Ranks the matches. Something starting with what was typed beats something
   merely containing it, and a shorter word beats a longer one, so typing
   "pr" offers print before property. Case is ignored, so "PRI" still finds
   print. */
function matches(items, typed){
  if (!typed) return items.slice(0, 40);
  const want = typed.toLowerCase();
  const scored = [];
  items.forEach(it => {
    const low = it.label.toLowerCase();
    let rank;
    if (low === want) rank = 0;
    else if (low.indexOf(want) === 0) rank = 1;
    else if (low.indexOf(want) > 0) rank = 2;
    else return;
    scored.push({ it: it, rank: rank, len: it.label.length });
  });
  scored.sort((a, b) => a.rank - b.rank || a.len - b.len ||
                        (a.it.label < b.it.label ? -1 : 1));
  return scored.slice(0, 40).map(s => s.it);
}

let theBox = null;
function suggestBox(){
  if (theBox) return theBox;

  const box = el("div","ac-box");
  box.hidden = true;
  box.setAttribute("role","listbox");
  document.body.appendChild(box);

  let shown = [], at = 0, from = 0, live = false, owner = null, chose = null;

  /* Choosing with the mouse must not take the caret out of the editor: the
     selection would be lost and the insertion would land at the wrong place. */
  box.addEventListener("mousedown", (e) => e.preventDefault());

  function draw(){
    box.innerHTML = "";
    shown.forEach((it, n) => {
      const row = el("div","ac-row" + (n === at ? " on" : ""));
      row.setAttribute("role","option");
      row.appendChild(tel("span","ac-word", it.label));
      if (it.detail) row.appendChild(tel("span","ac-detail", it.detail));
      row.addEventListener("mouseenter", () => { at = n; paintOn(); });
      row.addEventListener("click", () => take(n));
      box.appendChild(row);
    });
  }
  function paintOn(){
    Array.from(box.children).forEach((row, n) => row.classList.toggle("on", n === at));
    const row = box.children[at];
    if (!row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }
  function place(){
    if (!live || !owner) return;
    const pt = caretPoint(owner);
    /* Measured from the top left, where nothing can squash it, before being
       put where it goes. */
    box.style.left = "0px"; box.style.top = "0px";
    const w = box.offsetWidth, h = box.offsetHeight;
    const under = pt.y + pt.line + 2;
    const top = (under + h > window.innerHeight - 8 && pt.y > h + 8) ? pt.y - h - 2 : under;
    box.style.left = Math.max(6, Math.min(pt.x - 20, window.innerWidth - w - 6)) + "px";
    box.style.top = Math.max(6, top) + "px";
  }
  function take(n){
    const it = shown[n], pick = chose, start = from;
    if (!it || !pick) return;
    hide();
    pick(start, it);
  }
  function hide(){
    if (!live) return;
    live = false; box.hidden = true; shown = []; owner = null; chose = null;
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", hide);
  }

  theBox = {
    show(ta, startAt, list, onPick){
      if (!list.length){ hide(); return; }
      shown = list; at = 0; from = startAt; owner = ta; chose = onPick;
      box.hidden = false;
      if (!live){
        live = true;
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", hide);
      }
      draw();
      box.scrollTop = 0;
      place();
    },
    hide: hide,
    up: () => live,
    /* Whether this editor is the one the box is open for. Two editors on a
       page share it, so "is it open" on its own is not enough. */
    openFor: (ta) => live && owner === ta,
    move(by){
      if (!live) return;
      at = (at + by + shown.length) % shown.length;
      paintOn();
    },
    accept(){ if (live) take(at); }
  };
  return theBox;
}

/* ---------- what language the editor is painting ----------
   Everything that differs between Python and the three web languages, in one
   object, so there is one editor rather than one per language. The web one
   came from the lesson page's HTML task, where it was a second copy of all of
   this that had quietly drifted: it indented by two spaces and Python's by
   four, which was right, and it had lost the Fix it buttons, which was not.

     paint(line, state)  the line as coloured HTML
     find(code)          the mistakes, as {line, msg, fix?}
     state()             whatever has to carry from one line to the next
     indent              what Tab puts in
     opens(line)         does this line start a block, so the next is indented */
const pythonLang = {
  paint: (line, state, opts) => hlLine(line, state, opts).html,
  find: checkPython,
  state: () => ({ triple: null }),
  indent: "    ",
  comment: "#",
  opens: (line) => /:\s*$/.test(line),
  suggest: suggestPython
};
/* Words, not code. A .txt file a Python program reads opens in the same box
   as the code does, and colouring an ordinary sentence as if it were Python
   turns the word "for" in the middle of it a different colour. */
const plainLang = {
  paint: (line) => escHtml(line) || "&nbsp;",
  find: () => [],
  state: () => ({}),
  indent: "  ",
  comment: "",
  opens: () => false
};

/* HTML, CSS and JavaScript, from webhub.js. Asked for by name because a page
   with no web editor on it does not load that file. */
function webLang(which){
  return {
    paint: (line, state, opts) => {
      const painted = window.webHighlight ? window.webHighlight(which, line, state) : escHtml(line);
      /* The dotted underline is a promise that clicking the word explains it,
         and only the lesson page has the bubble that does. Teachers can turn
         it off per task, so the underlines have to come off with it. */
      return (opts && opts.tips === false) ? painted.replace(/ t-help/g, "") : painted;
    },
    find: (code) => window.webCheck ? window.webCheck(which, code) : [],
    state: () => ({ block: false }),
    indent: "  ",
    comment: "",
    opens: (line) => window.webOpens ? window.webOpens(which, line) : /[{>]\s*$/.test(line),
    closeTag: which === "html",
    suggest: (ctx) => window.webSuggest ? window.webSuggest(which, ctx) : null
  };
}

/* ---------- the editor itself ----------
   Line numbers down the side, the colours painted on a layer behind a
   see-through textarea, and the list of mistakes underneath. Options:
     value      what to start with
     readOnly   look at it but do not change it
     height     how tall the code area is, in pixels
     problems   show the list of mistakes (on unless turned off)
     fixes      offer the "Fix it" buttons (on unless turned off)
     help       the word explanations to underline, if any
     tips       whether those underlines are wanted just now
     onInput    called after every change
   Comes back with the pieces, so anything wanting more can build on them. */
function attach(opts){
  opts = opts || {};
  let lang = opts.lang || pythonLang;
  const editor = el("div","ide-editor");
  const gutter = el("div","ide-gutter");
  const codeWrap = el("div","ide-codewrap");
  const hl = el("div","ide-hl"); hl.setAttribute("aria-hidden","true");
  const ta = el("textarea","ide-code");
  ta.spellcheck = false; ta.autocapitalize = "off"; ta.autocomplete = "off"; ta.wrap = "off";
  ta.value = opts.value || "";
  if (opts.readOnly) ta.readOnly = true;
  if (opts.height) editor.style.height = opts.height + "px";
  codeWrap.appendChild(hl); codeWrap.appendChild(ta);
  editor.appendChild(gutter); editor.appendChild(codeWrap);
  const probs = el("div","ide-probs"); probs.hidden = true;

  let issues = [];
  const showProbs = opts.problems !== false;
  const showFixes = opts.fixes !== false;

  function repaint(){
    const lines = ta.value.split("\n");
    issues = lang.find(ta.value) || [];
    const bad = new Set(issues.map(x => x.line));
    const state = lang.state();
    hl.innerHTML = lines.map((l, n) =>
      '<div class="hl-line' + (bad.has(n) ? " bad" : "") + '">' +
      lang.paint(l, state, { help: opts.help, tips: opts.tips !== false }) + "</div>").join("");
    gutter.innerHTML = lines.map((_, n) =>
      '<div class="gl' + (bad.has(n) ? " bad" : "") + '">' + (n + 1) + "</div>").join("");
    if (!showProbs){ probs.hidden = true; return; }
    probs.innerHTML = "";
    if (!issues.length){ probs.hidden = true; return; }
    probs.hidden = false;
    issues.slice(0, 4).forEach(iss => {
      const row = el("div","ide-prob");
      row.appendChild(tel("span","ide-probline","Line " + (iss.line + 1)));
      row.appendChild(tel("span","ide-probmsg", iss.msg));
      if (iss.fix && showFixes){
        const fixBtn = tel("button","ide-chip","Fix it");
        fixBtn.addEventListener("click", () => {
          const ls = ta.value.split("\n");
          ls[iss.line] = iss.fix();
          ta.value = ls.join("\n");
          repaint();
          if (opts.onInput) opts.onInput();
        });
        row.appendChild(fixBtn);
      }
      probs.appendChild(row);
    });
  }

  /* ---------- typing ----------
     Everything below changes the text through put(), so the repaint, the
     "something changed" call and where the caret ends up happen once, in one
     place, rather than being written out again by every shortcut. */
  function put(start, end, text, caretAt){
    ta.setRangeText(text, start, end, "end");
    if (caretAt !== undefined) ta.selectionStart = ta.selectionEnd = caretAt;
    repaint();
    if (opts.onInput) opts.onInput();
  }

  /* The halves that go in together. Quotes pair with themselves, which is why
     this is a list of pairs rather than a list of brackets. */
  const PAIRS = { "(":")", "[":"]", "{":"}", '"':'"', "'":"'" };
  const SHUTS = ")]}\"'";
  /* An opening half only writes its partner when the rest of the line has
     room for one: nothing after the caret but spaces, or a closing half
     already sitting there. A space with more line after it is not room, which
     is what stops a ( typed in front of print Hello giving print() Hello. */
  const ROOM_AFTER = /^\s*$|^[)\]}>,;.:]/;
  /* A quote needs room in front of it as well, which a bracket does not: it
     only opens a string where a string could start, at the beginning of the
     line or after a space, bracket, comma or operator. Anywhere else the
     quote is finishing something off rather than starting it. A student
     correcting print(Hello!) types the quote against the !, and a pair there
     hands them print(Hello!"") to sort out. */
  const QUOTE_ROOM_BEFORE = /(^|[\s([{,:=+\-*\/])$/;
  /* f"..." and r"..." are one string, so the letter in front of the quote
     belongs to it and is not a word the quote has been stuck on the end of. */
  const STRING_PREFIX = /[fFrRbB]$/;

  const ac = (opts.autocomplete === false) ? null : suggestBox();
  function acOpen(){ return ac && ac.openFor(ta); }
  function acHide(){ if (acOpen()) ac.hide(); }

  /* What the language would offer where the caret is, drawn if there is
     anything worth drawing. `force` is Ctrl and space: it opens the box even
     when nothing has been typed yet, which is how you ask "what can go here?" */
  function suggest(force){
    if (!ac || ta.readOnly || !lang.suggest) return;
    if (ta.selectionStart !== ta.selectionEnd){ acHide(); return; }
    const pos = ta.selectionStart, text = ta.value;
    const before = text.slice(0, pos);
    let res = null;
    try{
      res = lang.suggest({ text: text, pos: pos, before: before,
                           lineBefore: before.slice(before.lastIndexOf("\n") + 1),
                           lineAfter: text.slice(pos).split("\n")[0] });
    }catch(e){ res = null; }
    if (!res || !res.items || !res.items.length){ acHide(); return; }
    const typed = text.slice(res.from, pos);
    /* Nothing until a real letter has been typed. The symbol that starts a
       word is not enough: a < on its own would put every tag there is on the
       screen before anyone has said what they are after. A language can say
       otherwise for a place where the symbol is the whole question, which is
       the dot after a toolbox: random. has one short answer and it is worth
       showing. Ctrl and space asks for the list without typing anything. */
    if (!typed && !res.now && !force){ acHide(); return; }
    const list = matches(res.items, typed);
    /* One suggestion, and they have already typed it: there is nothing left
       to offer. */
    if (!list.length || (list.length === 1 && list[0].label === typed)){ acHide(); return; }
    ac.show(ta, res.from, list, (from, item) => {
      const ins = item.insert === undefined ? item.label : item.insert;
      put(from, ta.selectionStart, ins, from + ins.length);
      ta.focus();
    });
  }

  /* Tab and Shift+Tab over a block move the whole thing, which is what every
     other editor does and what is wanted after code has been pasted in at the
     wrong depth. Shift+Tab on its own line does the same to that one line. */
  function shiftBlock(dir){
    const text = ta.value;
    const from = text.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    let to = text.indexOf("\n", ta.selectionEnd);
    if (to < 0) to = text.length;
    const unit = lang.indent;
    const lines = text.slice(from, to).split("\n").map(line => {
      if (dir > 0) return line.trim() ? unit + line : line;
      if (line.slice(0, unit.length) === unit) return line.slice(unit.length);
      /* Not a whole indent in front of it, so take off whatever space there
         is, up to one indent's worth. */
      let n = 0;
      while (n < unit.length && (line[n] === " " || line[n] === "\t")) n++;
      return line.slice(n);
    }).join("\n");
    ta.setRangeText(lines, from, to, "end");
    ta.selectionStart = from; ta.selectionEnd = from + lines.length;
    repaint();
    if (opts.onInput) opts.onInput();
  }

  ta.addEventListener("input", () => {
    repaint();
    if (opts.onInput) opts.onInput();
    suggest(false);
  });
  ta.addEventListener("scroll", () => {
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop;
    acHide();
  });
  ta.addEventListener("blur", acHide);
  ta.addEventListener("keydown", (e) => {
    /* While the box is open it gets the keys it needs first, and everything
       else closes it. */
    if (acOpen()){
      if (e.key === "ArrowDown"){ e.preventDefault(); ac.move(1); return; }
      if (e.key === "ArrowUp"){ e.preventDefault(); ac.move(-1); return; }
      if (e.key === "Enter" || e.key === "Tab"){ e.preventDefault(); ac.accept(); return; }
      if (e.key === "Escape"){ e.preventDefault(); ac.hide(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" ||
          e.key === "Home" || e.key === "End") ac.hide();
    }
    if (e.key === " " && (e.ctrlKey || e.metaKey)){ e.preventDefault(); suggest(true); return; }
    if (ta.readOnly) return;

    const st = ta.selectionStart, en = ta.selectionEnd, text = ta.value;
    const after = text.charAt(en);

    if (e.key === "Tab"){
      e.preventDefault();
      if (e.shiftKey || text.slice(st, en).indexOf("\n") >= 0){ shiftBlock(e.shiftKey ? -1 : 1); return; }
      put(st, en, lang.indent, st + lang.indent.length);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey){
      const line = text.slice(0, st).split("\n").pop();
      const indent = (line.match(/^[ \t]*/) || [""])[0];
      const extra = lang.opens(line) ? lang.indent : "";
      /* Enter between a bracket and its partner, or between an opening tag
         and its closing one, puts the closing half on a line of its own with
         the caret waiting in the middle. */
      const opener = text.charAt(st - 1);
      const split = st === en &&
        ((PAIRS[opener] && PAIRS[opener] === after && opener !== '"' && opener !== "'") ||
         (opener === ">" && text.slice(en, en + 2) === "</"));
      if (split){
        e.preventDefault();
        const ins = "\n" + indent + lang.indent + "\n" + indent;
        put(st, en, ins, st + 1 + indent.length + lang.indent.length);
        return;
      }
      if (indent || extra){
        e.preventDefault();
        put(st, en, "\n" + indent + extra, st + 1 + indent.length + extra.length);
      }
      return;
    }

    if (e.key === "Backspace" && st === en && !e.ctrlKey && !e.altKey && !e.metaKey){
      const lineStart = text.lastIndexOf("\n", st - 1) + 1;
      const run = text.slice(lineStart, st);
      /* Indented, and nothing but spaces in front of the caret: back to the
         previous indent stop in one press rather than four. */
      if (run && /^ +$/.test(run)){
        e.preventDefault();
        const unit = lang.indent.length || 4;
        const back = ((run.length - 1) % unit) + 1;
        put(st - back, st, "", st - back);
        return;
      }
      /* An empty pair goes in one press, not two. */
      if (PAIRS[text.charAt(st - 1)] === after && after){
        e.preventDefault();
        put(st - 1, st + 1, "", st - 1);
        return;
      }
      return;
    }

    /* An opening tag writes its own closing one when the > is typed. Not for
       the tags that close themselves, and not when the tag was already closed
       with a slash. The quotes in the pattern are what keeps a > inside an
       attribute's value out of it: a half-open quote leaves nothing for the
       pattern to match, so that > is typed as an ordinary character. */
    if (e.key === ">" && lang.closeTag && st === en){
      const line = text.slice(0, st).split("\n").pop();
      const m = /<([A-Za-z][\w-]*)((?:[^<>"]|"[^"]*")*)$/.exec(line);
      const shut = m && window.webVoidTag && window.webVoidTag(m[1]);
      if (m && !shut && !/\/\s*$/.test(line)){
        e.preventDefault();
        const ins = "></" + m[1] + ">";
        put(st, en, ins, st + 1);
        return;
      }
    }

    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

    /* Typing the closing half when it is already sitting there steps over it
       instead of writing a second one. */
    if (st === en && SHUTS.indexOf(e.key) >= 0 && after === e.key){
      e.preventDefault();
      ta.selectionStart = ta.selectionEnd = st + 1;
      acHide();
      return;
    }
    const shut = PAIRS[e.key];
    if (!shut) return;
    /* Something is selected: wrap it rather than replacing it. */
    if (st !== en){
      e.preventDefault();
      put(st, en, e.key + text.slice(st, en) + shut, undefined);
      ta.selectionStart = st + 1; ta.selectionEnd = en + 1;
      return;
    }
    const lineBefore = text.slice(0, st).split("\n").pop();
    /* Inside a string already, nothing being typed is an opening half: a
       bracket in there is a character in a sentence, and a quote is the one
       that closes the string. Walked rather than counted, because the
       apostrophe in "let's" is not a quote mark. */
    if (strip(lineBefore, "", lang.comment).open) return;
    if (e.key === '"' || e.key === "'"){
      const roomBefore = QUOTE_ROOM_BEFORE.test(lineBefore) ||
        (STRING_PREFIX.test(lineBefore) && QUOTE_ROOM_BEFORE.test(lineBefore.slice(0, -1)));
      if (!roomBefore) return;
    }
    if (!ROOM_AFTER.test(text.slice(en).split("\n")[0])) return;
    e.preventDefault();
    put(st, en, e.key + shut, st + 1);
    acHide();
  });

  repaint();

  /* Switching language without building the editor again, which is what the
     sandbox's web editor does when it moves between its three files. */
  function setLang(next){ lang = next || pythonLang; acHide(); repaint(); }

  return { editor, gutter, codeWrap, hl, ta, probs, repaint, setLang,
           issues: () => issues };
}

/* Which editor colours to use when nobody has chosen: dark for the dark
   backgrounds, light for the rest. The builder wants this as much as the
   lesson does, so it lives here beside everything else about the editor. */
function themeFromSite(){
  try{
    const bg = document.documentElement.dataset.bg || "";
    return (bg === "dark" || bg === "night") ? "dark" : "light";
  }catch(e){ return "light"; }
}

/* Keep an editor's colours in step with the site's. The lesson page has its
   own version of this, because a student may choose editor colours of their
   own and those have to win; nowhere else does, so nowhere else needs it. */
/* Anything that wants to know when the site's colours change. One watcher
   for the page however many editors are on it. */
const watchers = [];
function watchSite(fn){
  watchers.push(fn);
  if (watchers.length === 1 && window.MutationObserver){
    try{
      new MutationObserver(() => {
        const t = themeFromSite();
        watchers.forEach(f => { try{ f(t); }catch(e){} });
      }).observe(document.documentElement, { attributes:true, attributeFilter:["data-bg"] });
    }catch(e){}
  }
  fn(themeFromSite());
}
function follow(shell){
  shell.dataset.idesize = "m";
  watchSite((t) => { shell.dataset.idetheme = t; });
  return shell;
}

/* ---------- the cog: editor colours and text size ----------
   Kept per browser under hub_ide and shared by every editor on the site, so
   a student who sets the code large in a lesson finds it large in the
   practice sandbox as well.

   `shell` is the element the .ide styles hang off, which is what carries
   data-idetheme and data-idesize. Comes back with the panel to drop into the
   editor's bar area; it starts hidden and the cog shows it. */
function idePrefs(){ try{ return JSON.parse(localStorage.getItem("hub_ide") || "{}"); }catch(e){ return {}; } }
function saveIdePrefs(p){ try{ localStorage.setItem("hub_ide", JSON.stringify(p)); }catch(e){} }
/* An older version stored a theme every time an editor was drawn, so nearly
   every browser has one saved and stopped following the page. Clear those once. */
(function(){
  try{
    const p = idePrefs();
    if (p.theme && !p.chosen){ delete p.theme; saveIdePrefs(p); }
  }catch(e){}
})();

function idePanel(shell){
  const panel = el("div","ide-settings");
  panel.hidden = true;
  panel.appendChild(tel("span","ide-setlabel","Colours"));
  const themes = el("div","ide-setrow");
  /* "Match the page" first, and it is where everyone starts. Without it,
     picking a colour scheme once meant the editor never followed the site
     again: turning the whole site dark left a white editor sitting in the
     middle of it with no way back short of clearing the browser's storage. */
  [["","Match the page"],["dark","Dark"],["light","Light"],["contrast","High contrast"]].forEach(pair => {
    const chip = tel("button","ide-chip", pair[1]);
    chip.type = "button";
    chip.dataset.theme = pair[0];
    chip.addEventListener("click", () => {
      if (!pair[0]){
        const p = idePrefs();
        delete p.theme; delete p.chosen;
        saveIdePrefs(p);
        setTheme(themeFromSite());
      } else setTheme(pair[0], true);
    });
    themes.appendChild(chip);
  });
  panel.appendChild(themes);
  panel.appendChild(tel("span","ide-setlabel","Text size"));
  const sizes = el("div","ide-setrow");
  [["s","Small"],["m","Medium"],["l","Large"],["xl","Extra large"]].forEach(pair => {
    const chip = tel("button","ide-chip", pair[1]);
    chip.type = "button";
    chip.dataset.size = pair[0];
    chip.addEventListener("click", () => setSize(pair[0]));
    sizes.appendChild(chip);
  });
  panel.appendChild(sizes);

  function setTheme(k, chosen){
    shell.dataset.idetheme = k;
    /* Only remembered when the student picked it, otherwise the editor would
       stop following the site's colours after the first paint. */
    if (chosen){ const p = idePrefs(); p.theme = k; p.chosen = true; saveIdePrefs(p); }
    /* Following the site is a mode of its own, so that is the chip to mark
       rather than whichever colour it happens to be showing. */
    const auto = !idePrefs().theme;
    Array.from(themes.children).forEach(c =>
      c.classList.toggle("on", auto ? c.dataset.theme === "" : c.dataset.theme === k));
  }
  function setSize(k){
    shell.dataset.idesize = k;
    Array.from(sizes.children).forEach(c => c.classList.toggle("on", c.dataset.size === k));
    const p = idePrefs(); p.size = k; saveIdePrefs(p);
  }
  /* Always watching, even when a colour scheme has been chosen. The watcher
     asks about the preference each time it fires, so pressing "Match the page"
     starts following the site again straight away. Registering it only when
     none had been chosen meant that, once one was, nothing was left listening:
     choosing to follow the site again worked once and then stopped until the
     page was reloaded. */
  watchSite((t) => { if (!idePrefs().theme) setTheme(t); });
  const pref = idePrefs();
  if (pref.theme) setTheme(pref.theme, false);
  setSize(pref.size || "m");

  return { panel, toggle(){ panel.hidden = !panel.hidden; }, setTheme, setSize };
}

/* ---------- a word explained ----------
   A one-line explanation for the words a beginner meets. Clicking a coloured
   word in the editor shows the matching note.

   Here beside the colouring rather than in lesson.html, because the practice
   sandbox offers the same Help tab and a list of words kept in two places
   grows apart. */
const PY_HELP = {
  print:"Shows something on the screen.",
  input:"Stops and waits for the person to type, then hands the typing back as text. Store it in a variable to keep it.",
  int:"Makes a whole number out of something, like \"7\" into 7. Anything with a decimal point loses it.",
  str:"Makes text out of something, so a number can be joined onto words.",
  float:"Makes a decimal number out of something, like \"2.5\" into 2.5.",
  len:"Gives the number of items in a list, or the number of characters in some text.",
  range:"Counts from 0 up to but not including the number, so range(5) gives 0, 1, 2, 3, 4.",
  list:"Makes a list, which holds several things in order and can be changed.",
  dict:"Makes a dictionary, which stores pairs so you can look a value up by its name.",
  round:"Rounds to the nearest whole number. Exact halves go to the nearest even one, so round(2.5) is 2.",
  abs:"Gives how far a number is from zero, so the minus sign is dropped.",
  min:"Gives the smallest of the numbers.",
  max:"Gives the biggest of the numbers.",
  sum:"Adds up all the numbers in a list.",
  sorted:"Gives back a new list in order. The original list is left as it was.",
  random:"A toolbox for picking things by chance. Needs import random at the top first.",
  if:"Does something only when a condition is true.",
  elif:"Another condition to try when the ones above were false.",
  else:"What to do when none of the conditions above were true.",
  for:"Repeats something once for each item, like every number in a range.",
  while:"Keeps repeating for as long as a condition stays true.",
  break:"Leaves the loop straight away, without finishing the rest of it.",
  continue:"Skips the rest of this time round the loop and starts the next one.",
  def:"Makes your own command that you can use again later.",
  return:"Sends a value back out of your own command.",
  import:"Brings in extra tools, like turtle or random.",
  from:"Brings in just part of a toolbox.",
  in:"Checks whether something is inside a list or some text.",
  not:"Flips true into false, and false into true.",
  and:"True only when both things are true.",
  or:"True when at least one of the things is true.",
  True:"The value for yes.",
  False:"The value for no.",
  None:"Means nothing at all, no value yet.",
  try:"Attempts something that might go wrong.",
  except:"What to do if the code in try went wrong.",
  class:"A blueprint for making things that each carry their own information.",
  pass:"Does nothing, a placeholder to keep the code valid.",
  global:"Lets a command change a variable that was made outside it, instead of making its own.",
  lambda:"A very short command written on one line, with no name of its own.",
  with:"Opens something, such as a file, and closes it again when the block ends.",
  type:"Tells you what kind of value something is, such as a number or some text.",
  enumerate:"Goes through a list giving both the position, counting from 0, and the item.",
  zip:"Goes through two lists side by side, stopping when the shorter one runs out."
};

/* Whether the suggestions box is up. The lesson page's click-a-word bubble
   asks, because the two would otherwise be drawn one on top of the other. */
function suggesting(){ return !!(theBox && theBox.up()); }

window.pyEdit = { attach, checkPython, hlLine, strip, escHtml, themeFromSite, follow, suggesting,
                  idePanel, idePrefs, saveIdePrefs, pythonLang, webLang, plainLang,
                  PY_KW, PY_FN, PY_HELP };

})();
