/* ------------------------------------------------------------------
   A small rich-text box for the lesson builder.

   Teachers get buttons rather than markdown. The result is stored as
   simple HTML, and everything that comes back out is cleaned so a pasted
   chunk of a website cannot drag styling (or scripts) into a lesson.
   ------------------------------------------------------------------ */
(function(){
  "use strict";

  const ALLOWED = { B:1, STRONG:1, I:1, EM:1, U:1, BR:1, P:1, UL:1, OL:1, LI:1, SPAN:1, CODE:1, A:1, FONT:1, DIV:1, IMG:1, KBD:1, PRE:1,
                    TABLE:1, THEAD:1, TBODY:1, TR:1, TH:1, TD:1, CAPTION:1 };
/* A table here is something to read, not something to fill in. A question
   with boxes for a student to write in is the Table task, which saves what
   they typed; this is the one in a paragraph, and it is shown exactly the
   way the rest of a paragraph is. */
  const TABLE_TAGS = { TABLE:1, THEAD:1, TBODY:1, TR:1, TH:1, TD:1, CAPTION:1 };
  /* A swatch like the ones in Office: a row of hues, each with lighter and
     darker versions underneath. */
  const HUES = [
    ["Black",  "#000000"], ["Grey",   "#6B6B6B"], ["Red",    "#C0392B"],
    ["Orange", "#B5651D"], ["Yellow", "#B8930A"], ["Green",  "#2E7B54"],
    ["Teal",   "#1D7C7C"], ["Blue",   "#1B5FA8"], ["Purple", "#6B3FA0"],
    ["Pink",   "#B03A6E"]
  ];
  const SHADES = [0.65, 0.35, 0, -0.25, -0.45];   // lighter, then the hue, then darker
  function shade(hex, amount){
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => amount >= 0
      ? Math.round(c + (255 - c) * amount)
      : Math.round(c * (1 + amount));
    r = mix(r); g = mix(g); b = mix(b);
    return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  /* ------------------------------------------------------------------
     Blocks of code.

     A block is stored as <pre class="rt-cb" data-lang="python"> with nothing
     inside it but the code itself. The colours are painted on wherever the
     block is shown, by the very highlighters the Python and web editors use,
     so code in a lesson looks like the same code in the editor a student
     types it into. Keeping the text plain rather than the coloured spans
     keeps a lesson file small, and means colouring improved later reaches
     lessons that were written before it.
     ------------------------------------------------------------------ */
  const CODE_LANGS = { python:"Python", html:"HTML" };
  const VOID_TAGS = { br:1, hr:1, img:1, input:1, meta:1, link:1, area:1,
                      base:1, col:1, source:1, track:1, wbr:1 };
  function escHtml(t){
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* One line, coloured. An empty line is answered here rather than by the
     highlighters, which give back "&nbsp;" for it: that is a character the
     cursor would then have to be counted past in a box being typed into. */
  function lineHtml(lang, line, state){
    if (!line) return "";
    try{
      if (lang === "python" && window.pyEdit && window.pyEdit.hlLine)
        return window.pyEdit.hlLine(line, state, { tips:false }).html;
      /* the dotted underline the web editor puts under words it can explain is
         taken off: nothing in a lesson block is clickable, so it would only
         invite a click that does nothing */
      if (lang === "html" && window.webHighlight)
        return String(window.webHighlight("html", line, state)).replace(/ t-help/g, "");
    }catch(e){}
    return escHtml(line);
  }

  /* The code as text. Whatever a browser left behind while it was being typed
     into (a <br>, a stray <div> of its own) counts as the end of a line, so
     the text reads back the same however it got there. */
  function codeText(node){
    let out = "";
    Array.from(node.childNodes).forEach(n => {
      if (n.nodeType === 3){ out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === "BR"){ out += "\n"; return; }
      const block = n.tagName === "DIV" || n.tagName === "P" || n.tagName === "LI";
      if (block && out && out.slice(-1) !== "\n") out += "\n";
      out += codeText(n);
    });
    return out;
  }

  /* Each line becomes a div of its own. Lines built out of newline characters
     alone kept disappearing: a browser folds a run of them together, and an
     empty line then has nothing in it for the cursor to sit in. */
  function paintBlock(pre){
    const lang = CODE_LANGS[pre.dataset.lang] ? pre.dataset.lang : "python";
    pre.dataset.lang = lang;
    /* the spell checker underlines every word of code in red, and a phone
       would put a capital letter at the start of each line */
    pre.setAttribute("spellcheck", "false");
    pre.setAttribute("autocapitalize", "off");
    const state = {};
    pre.innerHTML = codeText(pre).split("\n")
      .map(line => '<div class="rt-cl">' + lineHtml(lang, line, state) + "</div>").join("");
  }

  /* Where a point in a block sits, as a line and a column. Read by copying
     everything in front of it and measuring that, because an empty line holds
     no text for a character count to walk through. */
  function pointAt(pre, container, offset){
    if (container !== pre && !pre.contains(container)) return null;
    const r = document.createRange();
    try{
      r.setStart(pre, 0);
      r.setEnd(container, offset);
    }catch(e){ return null; }
    const holder = document.createElement("div");
    holder.appendChild(r.cloneContents());
    const parts = codeText(holder).split("\n");
    return { line: parts.length - 1, col: parts[parts.length - 1].length };
  }

  /* The other way about: a line and column back to a place in the block. */
  function resolve(pre, line, col){
    const div = pre.children[Math.max(0, Math.min(line, pre.children.length - 1))];
    if (!div) return { node: pre, offset: 0 };
    let left = col, found = null;
    (function walk(el){
      Array.from(el.childNodes).forEach(kid => {
        if (found) return;
        if (kid.nodeType === 3){
          if (left <= kid.nodeValue.length){ found = { node: kid, offset: left }; return; }
          left -= kid.nodeValue.length;
        }
        else if (kid.nodeType === 1) walk(kid);
      });
    })(div);
    return found || { node: div, offset: div.childNodes.length };
  }
  function setCaret(pre, line, col, endLine, endCol){
    const a = resolve(pre, line, col);
    const b = (endLine === undefined) ? a : resolve(pre, endLine, endCol);
    const r = document.createRange();
    try{ r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); }catch(e){ return; }
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  }
  /* Put new code in and say where the cursor should end up. */
  function setCode(pre, text, line, col, endLine, endCol){
    pre.textContent = text;
    paintBlock(pre);
    setCaret(pre, line, col, endLine, endCol);
  }
  const flatOffset = (lines, at) =>
    lines.slice(0, at.line).reduce((n, l) => n + l.length + 1, 0) + at.col;
  function placeOf(text, offset){
    const parts = text.slice(0, offset).split("\n");
    return { line: parts.length - 1, col: parts[parts.length - 1].length };
  }

  /* How much the next line should start in by. Python opens a block with a
     colon; HTML opens one with a tag that is not closed again on the line. */
  function opensBlock(lang, before){
    if (lang !== "html") return /:\s*$/.test(before);
    if (/\/>\s*$/.test(before)) return false;
    const open = /<([A-Za-z][\w-]*)(\s[^<>]*)?>\s*$/.exec(before);
    if (!open) return false;
    const name = open[1].toLowerCase();
    if (VOID_TAGS[name]) return false;
    return before.indexOf("</" + name + ">", open.index) < 0;
  }

  /* Lessons show a teacher's words in a dozen places, and something new shows
     them every time a task type is added. Rather than each of those having to
     remember to paint the code, a block is painted as it arrives on the page.
     The builder's own blocks are left alone: it paints those as they are
     typed, and repainting underneath someone would move their cursor. */
  function paintCodeBlocks(root){
    const holder = root || document;
    if (!holder.querySelectorAll) return;
    const found = [];
    if (holder.matches && holder.matches("pre.rt-cb")) found.push(holder);
    holder.querySelectorAll("pre.rt-cb").forEach(pre => found.push(pre));
    found.forEach(pre => {
      if (pre.dataset.painted === "1") return;
      if (pre.closest && pre.closest(".rt-box")) return;
      pre.dataset.painted = "1";
      paintBlock(pre);
    });
  }
  window.paintCodeBlocks = paintCodeBlocks;
  if (window.MutationObserver){
    const watcher = new MutationObserver(records => {
      records.forEach(rec => Array.from(rec.addedNodes).forEach(n => {
        if (n.nodeType === 1) paintCodeBlocks(n);
      }));
    });
    const start = () => {
      paintCodeBlocks(document);
      watcher.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
  }

  /* Keep the tags we offer, drop everything else but its words. */
  function clean(node){
    const out = document.createElement("div");
    (function walk(from, to){
      Array.from(from.childNodes).forEach(n => {
        if (n.nodeType === 3){ to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (!ALLOWED[tag]){
          const holder = document.createElement("span");
          walk(n, holder);
          while (holder.firstChild) to.appendChild(holder.firstChild);
          return;
        }
        /* browsers still write <font color> for a colour change, so it is
           turned into a span that carries the colour as a style */
        const asTag = tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag === "FONT" ? "span" : tag.toLowerCase();
        const keep = document.createElement(asTag);
        if (tag === "FONT"){
          const colour = n.getAttribute("color") || (n.style && n.style.color);
          if (colour) keep.style.color = colour;
        }
        if (tag === "SPAN" || tag === "A"){
          const colour = n.style && n.style.color;
          if (colour) keep.style.color = colour;
          const size = n.style && n.style.fontSize;
          if (size) keep.style.fontSize = size;
        }
        /* Which side of the box a line of writing sits on. Kept as a
           class and not as an inline style, so the page decides what
           "centred" looks like and a lesson does not carry three CSS
           declarations for every paragraph in it. */
        const lined = n.style && (n.style.textAlign || "");
        if (lined === "center" || lined === "right" || lined === "justify")
          keep.classList.add("rt-" + (lined === "center" ? "centre" : lined));
        if (n.classList){
          ["rt-centre", "rt-right", "rt-justify", "rt-blocked"].forEach(c => {
            if (n.classList.contains(c)) keep.classList.add(c);
          });
        }
        /* A code block keeps its language and its code, and nothing else.
           The colours are painted back on wherever it is shown, so a lesson
           holds the code once rather than a span around every word in it. */
        if (tag === "PRE"){
          keep.className = "rt-cb";
          keep.dataset.lang = (n.dataset && CODE_LANGS[n.dataset.lang]) ? n.dataset.lang : "python";
          /* the parser drops one newline straight after <pre>, so a block that
             starts on a blank line needs a spare one to survive being saved
             and read back */
          keep.textContent = "\n" + codeText(n);
          to.appendChild(keep);
          return;
        }
        /* Cells can be merged on a real exam paper, so those two survive.
           Nothing else about a table does: no widths, no colours, no
           inline borders. How it looks is the stylesheet's business, and a
           table carrying its own is a table that ignores dark mode. */
        if (TABLE_TAGS[tag]){
          if (tag === "TD" || tag === "TH"){
            const cs = parseInt(n.getAttribute("colspan"), 10);
            const rs = parseInt(n.getAttribute("rowspan"), 10);
            if (cs > 1) keep.setAttribute("colspan", Math.min(20, cs));
            if (rs > 1) keep.setAttribute("rowspan", Math.min(50, rs));
          }
          walk(n, keep);
          to.appendChild(keep);
          return;
        }
        if (tag === "IMG"){
          /* keep where it points and how big it was made */
          const src = n.getAttribute ? n.getAttribute("src") : "";
          /* A picture uploaded into the database travels as its id and
             not as its address: the address has the server's name in it,
             and a lesson that has been moved or exported would then be
             pointing at the wrong one. The lesson page turns the id back
             into an address when it draws the paragraph. */
          const imgId = n.getAttribute ? n.getAttribute("data-img") : "";
          if (imgId) keep.setAttribute("data-img", imgId);
          else if (src) keep.setAttribute("src", src);
          if (n.style && n.style.width) keep.style.width = n.style.width;
          if (n.style && n.style.height) keep.style.height = n.style.height;
        }
        if (tag === "OL" || tag === "UL"){
          const kind = n.style && n.style.listStyleType;
          if (kind) keep.style.listStyleType = kind;
        }
        if (tag === "FONT" && n.getAttribute && n.getAttribute("size")){
          const px = { "1":"11px","2":"13px","3":"","4":"18px","5":"22px","6":"28px","7":"36px" }[n.getAttribute("size")];
          if (px) keep.style.fontSize = px;
        }
        if (tag === "A"){
          const href = n.getAttribute("href") || "";
          if (/^https?:\/\//i.test(href)){ keep.setAttribute("href", href); keep.setAttribute("target", "_blank"); }
        }
        walk(n, keep);
        // a span with nothing special about it is just noise
        if (keep.tagName === "SPAN" && !keep.style.color && !keep.style.fontSize){
          while (keep.firstChild) to.appendChild(keep.firstChild);
        } else {
          to.appendChild(keep);
        }
      });
    })(node, out);
    /* An empty span, or one left with no colour at all, is invisible on the
       page and confuses everything downstream. Take them out. */
    let html = out.innerHTML;
    html = html.replace(/<span[^>]*>\s*<\/span>/g, "");
    html = html.replace(/<span style="color:\s*(transparent|rgba\([^)]*,\s*0\))[^"]*"[^>]*>/g, "<span>");
    html = html.replace(/<span><\/span>/g, "");
    return html.trim();
  }

  /* Opens a menu under the button that asked for it, or above when there is
     more room up there, and always inside the screen.

     These hang off document.body with a top worked out from the button, and
     nothing was stopping one running off the bottom: a menu 620px tall opened
     from a toolbar 375px down a 700px screen went 300px past the edge, with
     the box at the foot of it unreachable. Now it is capped to the room it has
     and scrolls inside itself. */
  function openMenuAt(btn, menu){
    menu.hidden = false;
    /* measured at its full size first, or the cap from last time is read back */
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
    const r = btn.getBoundingClientRect();
    const GAP = 6, EDGE = 10;
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const wanted = menu.offsetHeight;
    const goUp = wanted > below && above > below;
    /* never squeezed to nothing: below this it is worth scrolling instead */
    const room = Math.max(140, goUp ? above : below);
    const height = Math.min(wanted, room);
    if (wanted > room){
      menu.style.maxHeight = room + "px";
      menu.style.overflowY = "auto";
    }
    menu.style.top = ((goUp ? r.top - GAP - height : r.bottom + GAP) + window.scrollY) + "px";
    /* and kept on the screen sideways too, using its real width rather than a
       guess at one */
    const left = Math.min(r.left + window.scrollX,
                          window.innerWidth - menu.offsetWidth - EDGE);
    menu.style.left = Math.max(EDGE, left) + "px";
  }

  /* Build the editor. onChange gets the cleaned HTML. */
  window.richText = function(initialHtml, onChange, opts){
    const o = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "rt";

    const bar = document.createElement("div");
    bar.className = "rt-bar";

    function tool(label, title, run, cls){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rt-btn" + (cls ? " " + cls : "");
      b.title = title;
      b.innerHTML = label;
      b.addEventListener("mousedown", (e) => e.preventDefault());   // keep the selection
      b.addEventListener("click", () => { run(); box.focus(); fire(); if (typeof refreshState === "function") refreshState(); });
      bar.appendChild(b);
      return b;
    }
    const cmd = (name, value) => { try{ document.execCommand(name, false, value || null); }catch(e){} };

    const boldBtn = tool("<b>B</b>", "Bold (Ctrl+B)", () => cmd("bold"));
    const italicBtn = tool("<i>I</i>", "Italic (Ctrl+I)", () => cmd("italic"));
    const underBtn = tool("<u>U</u>", "Underline (Ctrl+U)", () => cmd("underline"));
    /* The size is shown as a number rather than guessed at with two A buttons,
       and uses the same range in points as the whiteboard so the two places a
       teacher sets type size agree with each other. */
    const MIN_TEXT = 8, MAX_TEXT = 96;
    const sizeWrap = document.createElement("span");
    sizeWrap.className = "rt-sizes";
    const sizeDown = document.createElement("button");
    sizeDown.type = "button"; sizeDown.className = "rt-btn rt-step";
    sizeDown.textContent = "−"; sizeDown.title = "Smaller";
    const sizeBox = document.createElement("input");
    sizeBox.type = "number"; sizeBox.className = "rt-sizenum";
    sizeBox.min = String(MIN_TEXT); sizeBox.max = String(MAX_TEXT);
    sizeBox.title = "Size in points";
    const sizeUp = document.createElement("button");
    sizeUp.type = "button"; sizeUp.className = "rt-btn rt-step";
    sizeUp.textContent = "+"; sizeUp.title = "Bigger";
    const sizeUnit = document.createElement("span");
    sizeUnit.className = "rt-sizeunit"; sizeUnit.textContent = "pt";
    sizeWrap.appendChild(sizeDown); sizeWrap.appendChild(sizeBox);
    sizeWrap.appendChild(sizeUnit); sizeWrap.appendChild(sizeUp);
    bar.appendChild(sizeWrap);
    [sizeDown, sizeUp, sizeBox].forEach(n =>
      n.addEventListener("mousedown", (e) => { if (n !== sizeBox) e.preventDefault(); saved = save(); }));
    sizeDown.addEventListener("click", () => stepSize(-2));
    sizeUp.addEventListener("click", () => stepSize(2));
    sizeBox.addEventListener("change", () => applySize(parseInt(sizeBox.value, 10)));
    /* Lists are left out where the box holds one line rather than a passage:
       a checklist line is a line, and a bullet inside it would draw a second
       list inside the one it already sits in. refreshState looks these up by
       class and does nothing when they are not there. */
    if (o.lists !== false){
      tool("&bull;", "Bullet list", () => { cmd("insertUnorderedList"); refreshState(); }, "rt-bullet");
      /* numbered lists come in two kinds, so this one offers a choice */
      const numBtn = tool("1.", "Numbered list", () => {}, "rt-numbtn");
      const numMenu = document.createElement("div");
      numMenu.className = "rt-palette rt-nummenu";
      numMenu.hidden = true;
      [["1. 2. 3.", ""], ["a. b. c.", "lower-alpha"]].forEach(pair => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rt-auto-btn";
        b.textContent = pair[0];
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => {
          restore(saved);
          cmd("insertOrderedList");
          if (pair[1]) markList(pair[1]);
          numMenu.hidden = true;
          box.focus(); fire();
        });
        numMenu.appendChild(b);
      });
      document.body.appendChild(numMenu);
      numBtn.addEventListener("mousedown", () => { saved = save(); });
      numBtn.addEventListener("click", () => {
        if (!numMenu.hidden){ numMenu.hidden = true; return; }
        openMenuAt(numBtn, numMenu);
      });
      document.addEventListener("pointerdown", (e) => {
        if (!numMenu.hidden && !numMenu.contains(e.target) && e.target !== numBtn) numMenu.hidden = true;
      });
    }

    /* remember which kind of numbering a list uses */
    function markList(style){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      let n = sel.getRangeAt(0).startContainer;
      while (n && n !== box && n.tagName !== "OL") n = n.parentNode;
      if (n && n.tagName === "OL") n.style.listStyleType = style;
    }
    /* What size the writing under the cursor actually is, in points. Read from
       the page rather than from queryCommandValue, which only ever answers on
       the old 1 to 7 scale and cannot say what that means in points. */
    function sizeNow(){
      const sel = window.getSelection();
      let n = (sel && sel.rangeCount) ? sel.getRangeAt(0).commonAncestorContainer : box;
      if (n && n.nodeType === 3) n = n.parentNode;
      if (!n || !box.contains(n)) n = box;
      const px = parseFloat(getComputedStyle(n).fontSize) || 16;
      return Math.round(px * 0.75);            // 96dpi: 1pt is 4/3 of a pixel
    }
    /* Wrapped by hand, the same as the colour, because execCommand is
       deprecated, works differently between browsers, and cannot set a size
       in points at all. */
    function applySize(pt){
      if (isNaN(pt)) { showSize(); return; }
      const want = Math.max(MIN_TEXT, Math.min(MAX_TEXT, pt));
      const range = saved || lastRange;
      if (!range || range.collapsed){ showSize(want); return; }
      restore(range);
      let contents;
      try{ contents = range.extractContents(); }
      catch(e){ showSize(); return; }
      contents.querySelectorAll && contents.querySelectorAll("[style*='font-size'], font[size]")
        .forEach(n => {
          if (n.style) n.style.fontSize = "";
          if (n.removeAttribute) n.removeAttribute("size");
        });
      const span = document.createElement("span");
      span.style.fontSize = want + "pt";
      span.appendChild(contents);
      range.insertNode(span);
      const sel = window.getSelection();
      sel.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(span);
      sel.addRange(after);
      saved = after.cloneRange();
      showSize(want);
      box.focus(); fire();
    }
    function stepSize(by){ applySize(sizeNow() + by); }
    function showSize(n){ sizeBox.value = String(n || sizeNow()); }
    /* Pressing it again turns it off: the writing inside the tag is put back
       where the tag was, which is what people expect from a toggle. */
    function insideTag(name){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      let n = sel.getRangeAt(0).commonAncestorContainer;
      while (n && n !== box){
        if (n.nodeType === 1 && n.tagName === name) return n;
        n = n.parentNode;
      }
      return null;
    }
    function unwrap(node){
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
    /* ---------- code blocks in this box ---------- */
    /* The block a node sits in, if any. */
    function blockIn(node){
      let n = node || null;
      while (n && n !== box){
        if (n.nodeType === 1 && n.classList && n.classList.contains("rt-cb")) return n;
        n = n.parentNode;
      }
      return null;
    }
    function blockNow(){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if (!box.contains(r.startContainer)) return null;
      return blockIn(r.startContainer);
    }
    /* Colour the block being typed in again, leaving the cursor where it was.
       The whole block is redone rather than the one line: a long string opened
       on one line colours every line under it, so a single line cannot be
       recoloured on its own. Blocks in a lesson are a handful of lines. */
    function repaintBlock(pre){
      const sel = window.getSelection();
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      const at = r ? pointAt(pre, r.startContainer, r.startOffset) : null;
      paintBlock(pre);
      if (at) setCaret(pre, at.line, at.col);
    }
    /* Step out of a block, making a line for the words that come after it.
       Without this a block at the bottom of the box has nothing underneath to
       click into, and no way back to ordinary writing. */
    function leaveBlock(pre, before){
      const line = document.createElement("div");
      line.appendChild(document.createElement("br"));
      pre.parentNode.insertBefore(line, before ? pre : pre.nextSibling);
      const r = document.createRange();
      r.setStart(line, 0); r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      return line;
    }
    /* Put text in at the cursor, keeping its own line breaks and spacing. */
    function codeSplice(pre, insert){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const from = pointAt(pre, r.startContainer, r.startOffset);
      const to = r.collapsed ? from : pointAt(pre, r.endContainer, r.endOffset);
      if (!from || !to) return;
      const text = codeText(pre);
      const lines = text.split("\n");
      const a = flatOffset(lines, from), b = flatOffset(lines, to);
      const next = text.slice(0, a) + insert + text.slice(b);
      const at = placeOf(next, a + insert.length);
      setCode(pre, next, at.line, at.col);
    }

    /* Typing inside a block. Tab moves on to the next stop of four rather
       than out of the box, Enter starts the next line where this one starts
       (and one step further in after a line that opens a block), and Enter on
       an empty last line steps out of the block altogether. */
    function codeKeys(e, pre){
      if (e.key !== "Tab" && e.key !== "Enter" && e.key !== "Backspace") return false;
      const sel = window.getSelection();
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      if (!r) return false;
      const from = pointAt(pre, r.startContainer, r.startOffset);
      const to = r.collapsed ? from : pointAt(pre, r.endContainer, r.endOffset);
      if (!from || !to) return false;
      const text = codeText(pre);
      const lines = text.split("\n");
      const STEP = 4;

      if (e.key === "Tab"){
        e.preventDefault();
        if (!e.shiftKey && r.collapsed){
          /* to the next stop of four, not four more, so a line sitting three
             spaces in lands on four */
          const add = STEP - (from.col % STEP);
          const line = lines[from.line] || "";
          lines[from.line] = line.slice(0, from.col) + "    ".slice(0, add) + line.slice(from.col);
          setCode(pre, lines.join("\n"), from.line, from.col + add);
        } else {
          let firstBy = 0, lastBy = 0;
          for (let i = from.line; i <= to.line; i++){
            const line = lines[i] || "";
            let by = 0;
            if (e.shiftKey){
              const off = /^( {1,4}|\t)/.exec(line);
              if (off){ lines[i] = line.slice(off[0].length); by = -off[0].length; }
            } else {
              lines[i] = "    " + line;
              by = STEP;
            }
            if (i === from.line) firstBy = by;
            if (i === to.line) lastBy = by;
          }
          setCode(pre, lines.join("\n"), from.line, Math.max(0, from.col + firstBy),
                  to.line, Math.max(0, to.col + lastBy));
        }
        fire(); return true;
      }

      if (e.key === "Enter"){
        e.preventDefault();
        const line = lines[from.line] || "";
        if (r.collapsed && !line.trim() && from.line === lines.length - 1){
          lines.pop();
          const left = lines.join("\n");
          if (left.trim()){ pre.textContent = left; paintBlock(pre); leaveBlock(pre); }
          else { leaveBlock(pre); pre.remove(); }
          fire(); return true;
        }
        const before = line.slice(0, from.col);
        const indent = (before.match(/^[ \t]*/) || [""])[0];
        const a = flatOffset(lines, from), b = flatOffset(lines, to);
        const insert = "\n" + indent + (opensBlock(pre.dataset.lang, before) ? "    " : "");
        const next = text.slice(0, a) + insert + text.slice(b);
        const at = placeOf(next, a + insert.length);
        setCode(pre, next, at.line, at.col);
        fire(); return true;
      }

      /* Backspace */
      if (!r.collapsed) return false;
      const line = lines[from.line] || "";
      const before = line.slice(0, from.col);
      if (from.col > 0 && /^ +$/.test(before)){
        /* one press undoes one press of Tab, rather than nibbling back
           through the indent a space at a time */
        e.preventDefault();
        const take = (before.length % STEP) || STEP;
        lines[from.line] = line.slice(0, from.col - take) + line.slice(from.col);
        setCode(pre, lines.join("\n"), from.line, from.col - take);
        fire(); return true;
      }
      if (from.line === 0 && from.col === 0){
        e.preventDefault();
        /* an empty block goes; a block with code in it stays, rather than
           being folded into the words above where it would lose its shape */
        if (!text.trim()){ leaveBlock(pre, true); pre.remove(); fire(); }
        return true;
      }
      return false;
    }

    /* Pressing it again takes the tag off: the writing inside goes back
       where the tag was, which is what a toggle is expected to do. */
    function toggleInline(){
      const already = insideTag("CODE");
      if (already){ unwrap(already); return; }
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const code = document.createElement("code");
      /* surroundContents refuses a selection that starts inside a bold word
         and ends outside it, so that one is lifted out and wrapped instead */
      try{ range.surroundContents(code); }
      catch(e){
        try{ code.appendChild(range.extractContents()); range.insertNode(code); }catch(e2){ return; }
        /* splitting the bold word leaves an empty <b></b> beside it */
        [code.previousSibling, code.nextSibling].forEach(n => {
          if (n && n.nodeType === 1 && !n.textContent && !n.querySelector("img")) n.remove();
        });
      }
      const after = document.createRange();
      after.selectNodeContents(code);
      sel.removeAllRanges(); sel.addRange(after);
    }

    /* A box that holds one line, a checklist line, still wants a name or a
       bit of code picked out in it, but a block would break the line in two.
       It gets the one button, which does the one thing, with no menu. */
    if (o.code === "inline"){
      const codeBtn = tool("&lt;/&gt;", "Code", () => {}, "rt-code");
      codeBtn.addEventListener("mousedown", () => { saved = save(); });
      codeBtn.addEventListener("click", () => {
        restore(saved);
        toggleInline();
        box.focus(); fire(); refreshState();
      });
    }
    else if (o.code !== false){
      const codeBtn = tool("&lt;/&gt;", "Code", () => {}, "rt-code");
      const codeMenu = document.createElement("div");
      codeMenu.className = "rt-palette rt-codemenu";
      codeMenu.hidden = true;
      document.body.appendChild(codeMenu);

      function codeItem(label, run){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rt-auto-btn";
        b.textContent = label;
        b.addEventListener("mousedown", (ev) => ev.preventDefault());
        b.addEventListener("click", () => {
          codeMenu.hidden = true;
          restore(saved);
          run();
          box.focus(); fire(); refreshState();
        });
        codeMenu.appendChild(b);
      }
      function makeBlock(lang){
        const here = blockNow() || blockIn(saved ? saved.startContainer : null);
        /* already in one: this is a change of language, not a second block */
        if (here){ here.dataset.lang = lang; repaintBlock(here); return; }
        const range = save();
        const pre = document.createElement("pre");
        pre.className = "rt-cb";
        pre.dataset.lang = lang;
        let text = "";
        if (range){
          text = range.toString().replace(/\r/g, "");
          range.deleteContents();
          /* the block goes on lines of its own, so it is put after whatever
             the cursor was in rather than inside it */
          let top = range.startContainer;
          while (top && top.parentNode && top.parentNode !== box) top = top.parentNode;
          if (top && top.parentNode === box) box.insertBefore(pre, top.nextSibling);
          else box.appendChild(pre);
        }
        else box.appendChild(pre);
        const lines = text.split("\n");
        setCode(pre, text, lines.length - 1, lines[lines.length - 1].length);
      }
      function unblock(pre){
        const holder = document.createDocumentFragment();
        codeText(pre).split("\n").forEach((line, i) => {
          if (i) holder.appendChild(document.createElement("br"));
          holder.appendChild(document.createTextNode(line));
        });
        pre.parentNode.replaceChild(holder, pre);
      }
      /* Built afresh each time, because what it can offer depends on whether
         the cursor is in a block already. */
      function buildCodeMenu(){
        codeMenu.innerHTML = "";
        const here = blockIn(saved ? saved.startContainer : null);
        codeItem("Code in a sentence", toggleInline);
        Object.keys(CODE_LANGS).forEach(lang =>
          codeItem(CODE_LANGS[lang] + " block", () => makeBlock(lang)));
        if (here) codeItem("Back to plain writing", () => unblock(here));
      }
      codeBtn.addEventListener("mousedown", () => { saved = save(); });
      codeBtn.addEventListener("click", () => {
        if (!codeMenu.hidden){ codeMenu.hidden = true; return; }
        buildCodeMenu();
        openMenuAt(codeBtn, codeMenu);
      });
      document.addEventListener("pointerdown", (e) => {
        if (!codeMenu.hidden && !codeMenu.contains(e.target) && e.target !== codeBtn)
          codeMenu.hidden = true;
      });
    }

    /* the colour picker: a swatch that opens a small palette */
    const colourWrap = document.createElement("span");
    colourWrap.className = "rt-colourwrap";
    const colourBtn = document.createElement("button");
    colourBtn.type = "button";
    colourBtn.className = "rt-btn rt-colourbtn";
    colourBtn.title = "Text colour";
    const swatch = document.createElement("span");
    swatch.className = "rt-swatch";
    colourBtn.appendChild(document.createTextNode("A"));
    colourBtn.appendChild(swatch);
    /* The palette is put on the page itself, not inside the toolbar, so
       nothing further down the page can cover it. */
    const palette = document.createElement("div");
    palette.className = "rt-palette";
    palette.hidden = true;
    /* Colour is put on by hand rather than through execCommand, which is
       deprecated and behaves differently from browser to browser: it was
       sometimes doing nothing at all. Wrapping the chosen words in a span
       always works, and always survives being saved and read back. */
    function paintColour(range, colour){
      if (!range || range.collapsed) return false;
      let contents;
      try{ contents = range.extractContents(); }
      catch(e){ return false; }
      /* anything already coloured inside loses its own, so the new one shows */
      contents.querySelectorAll && contents.querySelectorAll("[style*='color'], font[color]")
        .forEach(n => {
          if (n.style) n.style.color = "";
          if (n.removeAttribute) n.removeAttribute("color");
        });
      const span = document.createElement("span");
      span.style.color = colour;
      span.appendChild(contents);
      range.insertNode(span);
      /* leave the words selected, so another colour can be tried at once */
      const sel = window.getSelection();
      sel.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(span);
      sel.addRange(after);
      saved = after.cloneRange();
      return true;
    }

    function pick(colour){
      if (!saved) saved = lastRange;
      restore(saved);
      /* Automatic means take the colour off, never paint a see-through one */
      if (colour && !/transparent|rgba\([^)]*,\s*0\s*\)/.test(colour)){
        if (saved && saved.collapsed){
          /* Nothing selected, so they are mid-sentence: start a coloured span
             at the cursor and carry on typing inside it, rather than stopping. */
          const span = document.createElement("span");
          span.style.color = colour;
          span.appendChild(document.createTextNode("\u200B"));
          saved.insertNode(span);
          const sel = window.getSelection();
          const put = document.createRange();
          put.setStart(span.firstChild, 1);
          put.collapse(true);
          sel.removeAllRanges(); sel.addRange(put);
          saved = put.cloneRange();
        }
        else if (!paintColour(saved, colour)) cmd("foreColor", colour);
      }
      else clearColour();
      palette.hidden = true;
      box.focus(); fire(); refreshState();
    }
    const auto = document.createElement("button");
    auto.type = "button";
    auto.className = "rt-auto-btn";
    auto.textContent = "Automatic";
    auto.addEventListener("mousedown", (e) => e.preventDefault());
    auto.addEventListener("click", () => pick(""));
    palette.appendChild(auto);

    const grid = document.createElement("div");
    grid.className = "rt-grid";
    SHADES.forEach(amount => {
      HUES.forEach(h => {
        const colour = amount === 0 ? h[1] : shade(h[1], amount);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "rt-cell";
        cell.style.background = colour;
        cell.title = h[0];
        cell.dataset.colour = colour;
        cell.addEventListener("mousedown", (e) => e.preventDefault());
        cell.addEventListener("click", () => pick(colour));
        grid.appendChild(cell);
      });
    });
    palette.appendChild(grid);

    const more = document.createElement("label");
    more.className = "rt-more";
    more.textContent = "More colours";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.addEventListener("mousedown", (e) => e.stopPropagation());
    picker.addEventListener("input", () => pick(picker.value));
    picker.addEventListener("change", () => pick(picker.value));
    more.appendChild(picker);
    palette.appendChild(more);
    document.body.appendChild(palette);
    colourBtn.addEventListener("mousedown", (e) => { e.preventDefault(); saved = save(); });
    colourBtn.addEventListener("click", () => {
      if (!palette.hidden){ palette.hidden = true; return; }
      openMenuAt(colourBtn, palette);
    });
    document.addEventListener("pointerdown", (e) => {
      if (palette.hidden) return;
      /* The palette hangs off document.body so nothing can cover it, which
         puts it outside colourWrap. Checking only colourWrap counted a press
         on a swatch as a press outside, so the palette was hidden between
         mousedown and mouseup: with the swatch gone no click ever completed
         and pick() never ran. The colour button did nothing, and the colour
         code itself was never at fault. */
      if (colourWrap.contains(e.target) || palette.contains(e.target)) return;
      palette.hidden = true;
    });
    colourWrap.appendChild(colourBtn);
    bar.appendChild(colourWrap);

    /* ---------- keys off the keyboard ----------
       Lessons keep naming keys to press, and writing Enter as ordinary words
       reads as part of the sentence. These go in as <kbd>, which is what the
       tag is for, and are drawn to look like the key itself. */
    /* The symbol printed on the key itself, alongside its name, so a student
       can match what they read to what is in front of them. Only the ones with
       a symbol everybody agrees on: Ctrl and Alt are left as words, because the
       symbols for those are a Mac convention and these are Windows machines. */
    const KEY_SYMBOL = {
      "Enter":"↵", "Shift":"⇧", "Tab":"⇥", "Backspace":"⌫",
      "Delete":"⌦", "Caps Lock":"⇪", "Space":"␣"
    };
    const keyLabel = (name) => (KEY_SYMBOL[name] ? KEY_SYMBOL[name] + " " + name : name);
    const KEYS = ["Enter","Esc","Tab","Space","Shift","Ctrl","Alt","Backspace",
                  "Delete","Caps Lock","F1","F5","F11",
                  "↑","↓","←","→"];
    const COMBOS = [["Ctrl","C"],["Ctrl","V"],["Ctrl","X"],["Ctrl","Z"],["Ctrl","Y"],
                    ["Ctrl","S"],["Ctrl","A"],["Ctrl","F"],["Ctrl","P"],
                    ["Shift","Enter"],["Alt","Tab"],["Ctrl","Shift","Esc"]];

    function insertKeys(parts){
      const range = saved || lastRange;
      if (!range) return;
      restore(range);
      const frag = document.createDocumentFragment();
      parts.forEach((label, i) => {
        if (i) frag.appendChild(document.createTextNode(" + "));
        const k = document.createElement("kbd");
        k.textContent = keyLabel(label);
        frag.appendChild(k);
      });
      /* a space after it, or the next word is written hard against the key */
      frag.appendChild(document.createTextNode(" "));
      /* the fragment is emptied by insertNode, so what to put the cursor after
         has to be held on to first */
      const last = frag.lastChild;
      try{
        range.deleteContents();
        range.insertNode(frag);
        const sel = window.getSelection();
        const after = document.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        sel.removeAllRanges(); sel.addRange(after);
        saved = after.cloneRange();
      }catch(e){}
      keyMenu.hidden = true;
      box.focus(); fire();
    }

    const keyWrap = document.createElement("span");
    keyWrap.className = "rt-keywrap";
    const keyBtn = document.createElement("button");
    keyBtn.type = "button";
    keyBtn.className = "rt-btn rt-keybtn";
    keyBtn.title = "Put a key in, like Enter or Ctrl + C";
    keyBtn.textContent = "⌨";
    const keyMenu = document.createElement("div");
    keyMenu.className = "rt-palette rt-keymenu";
    keyMenu.hidden = true;

    function keySection(name, list, asCombo){
      const h = document.createElement("p");
      h.className = "rt-keyhead";
      h.textContent = name;
      keyMenu.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "rt-keygrid" + (asCombo ? " wide" : "");
      list.forEach(entry => {
        const parts = asCombo ? entry : [entry];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rt-keycell";
        parts.forEach((pp, i) => {
          if (i) b.appendChild(document.createTextNode(" + "));
          const k = document.createElement("kbd");
          k.textContent = keyLabel(pp);
          b.appendChild(k);
        });
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => insertKeys(parts));
        grid.appendChild(b);
      });
      keyMenu.appendChild(grid);
    }
    keySection("Keys", KEYS, false);
    keySection("Together", COMBOS, true);

    /* No list can hold every key, so one can be typed instead. */
    const ownRow = document.createElement("div");
    ownRow.className = "rt-keyown";
    const ownIn = document.createElement("input");
    ownIn.type = "text";
    ownIn.placeholder = "Another key";
    const ownGo = document.createElement("button");
    ownGo.type = "button";
    ownGo.className = "rt-auto-btn";
    ownGo.textContent = "Add";
    const addOwn = () => {
      const v = ownIn.value.trim();
      if (!v) return;
      /* "Ctrl + Alt + D" typed by hand becomes three keys, same as the list */
      insertKeys(v.split("+").map(x => x.trim()).filter(Boolean));
      ownIn.value = "";
    };
    ownGo.addEventListener("mousedown", (e) => e.preventDefault());
    ownGo.addEventListener("click", addOwn);
    ownIn.addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); addOwn(); } });
    ownRow.appendChild(ownIn); ownRow.appendChild(ownGo);
    keyMenu.appendChild(ownRow);
    document.body.appendChild(keyMenu);

    keyBtn.addEventListener("mousedown", (e) => { e.preventDefault(); saved = save(); });
    keyBtn.addEventListener("click", () => {
      if (!keyMenu.hidden){ keyMenu.hidden = true; return; }
      openMenuAt(keyBtn, keyMenu);
    });
    /* The menu hangs off document.body so nothing can cover it, which puts it
       outside keyWrap. It has to be spared here or pressing a key in it would
       count as a press outside, hiding the menu between mousedown and mouseup
       so the click never landed. */
    document.addEventListener("pointerdown", (e) => {
      if (keyMenu.hidden) return;
      if (keyWrap.contains(e.target) || keyMenu.contains(e.target)) return;
      keyMenu.hidden = true;
    });
    keyWrap.appendChild(keyBtn);
    bar.appendChild(keyWrap);

    /* take the colour off, rather than painting the default over it */
    /* Whether the selection covers everything inside this element. */
    function fills(range, node){
      try{
        const r = document.createRange();
        r.selectNodeContents(node);
        return range.compareBoundaryPoints(Range.START_TO_START, r) <= 0
            && range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
      }catch(e){ return false; }
    }
    /* Automatic: put the writing back to whatever the page's own colour is, so
       it stays readable in both light and dark mode.

       The colour is nearly always on a span wrapped *around* the words rather
       than on anything inside them. Taking the contents out only ever reached
       the children, so the words went back inside the same coloured wrapper
       and the button looked as though it did nothing. Wrappers the selection
       fills are dealt with first, before anything is moved. */
    function clearColour(){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;

      let up = range.commonAncestorContainer;
      if (up.nodeType === 3) up = up.parentNode;
      const covered = [];
      while (up && up !== box && box.contains(up)){
        if (fills(range, up)) covered.push(up);
        up = up.parentNode;
      }
      covered.forEach(n => {
        if (n.style) n.style.removeProperty("color");
        if (n.removeAttribute) n.removeAttribute("color");
      });

      /* Is any colour still reaching these words from a wrapper the selection
         only partly fills? Stripping that wrapper would uncolour words outside
         the selection too, so it is overridden instead. */
      let outside = false;
      let p = range.startContainer;
      if (p.nodeType === 3) p = p.parentNode;
      while (p && p !== box && box.contains(p)){
        if (p.style && p.style.color){ outside = true; break; }
        p = p.parentNode;
      }

      const holder = document.createElement("span");
      try{
        holder.appendChild(range.extractContents());
        holder.querySelectorAll("[style]").forEach(n => { n.style.removeProperty("color"); });
        holder.querySelectorAll("font[color]").forEach(n => { n.removeAttribute("color"); });
        if (outside){
          /* var(--text) and not a fixed colour, so it follows the theme rather
             than being black on a dark page. */
          const back = document.createElement("span");
          back.style.color = "var(--text)";
          while (holder.firstChild) back.appendChild(holder.firstChild);
          range.insertNode(back);
        } else {
          while (holder.firstChild) range.insertNode(holder.lastChild);
        }
      }catch(e){}
    }

    /* ---------- which side of the box things sit on ----------
       Writing, a picture and a table all line up the same way and with
       the same three buttons, because to a teacher they are the same
       question. What differs is what gets the class: a picture or a
       table is lined up by itself, and writing by the paragraph it is
       in. execCommand("justifyCenter") is not used: it writes inline
       styles, does different things to a table in different browsers,
       and is the deprecated thing this file has been bitten by before. */
    const ALIGNS = ["", "rt-centre", "rt-right"];
    let lastPicture = null;

    /* A picture kept in the database travels as its id, so the box has
       nothing to show until the id is turned into an address. Whoever
       made this editor knows where the pictures come from and passes a
       way of asking; without one, an id shows as nothing, which is
       right for a box that has no server behind it. */
    function fillPictures(){
      if (typeof o.imageSrc !== "function") return;
      Array.from(box.querySelectorAll("img[data-img]")).forEach(img => {
        const id = img.getAttribute("data-img");
        if (id) img.src = o.imageSrc(id);
      });
    }
    function alignTarget(){
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentNode;
      if (!node || !box.contains(node)) return null;
      /* A picture or a table that has been clicked is the thing being
         lined up, rather than whatever it happens to sit inside. */
      const pic = node.closest("img");
      if (pic) return pic;
      const table = node.closest("table");
      if (table) return table;
      const block = node.closest("p, li, h1, h2, h3, div, td, th");
      return (block && block !== box && box.contains(block)) ? block : box;
    }
    function setAlign(which){
      /* A picture that was clicked is remembered, because clicking a
         toolbar button moves the selection off it. */
      const target = lastPicture || alignTarget();
      if (!target) return;
      ALIGNS.forEach(c => { if (c) target.classList.remove(c); });
      if (which) target.classList.add(which);
      /* A picture or a table sits inline until it is lined up, and then
         it has to become a block for there to be anything to line it up
         within. Lining it back up on the left takes that away again, so
         a picture nobody has touched keeps sitting in the run of text
         exactly as it always did. */
      if (target.tagName === "IMG" || target.tagName === "TABLE")
        target.classList.toggle("rt-blocked", !!which);
      fire();
    }
    tool("&#8801;", "Line up on the left", () => setAlign(""), "rt-align");
    tool("&#8803;", "Line up down the middle", () => setAlign("rt-centre"), "rt-align");
    tool("&#8802;", "Line up on the right", () => setAlign("rt-right"), "rt-align");

    /* ---------- a table ----------
       Put in by hand through the range rather than with execCommand's
       insertHTML: execCommand is deprecated and does different things in
       different browsers, and this project has been caught by that before.
       Once it is there the browser edits it like any other content. */
    const tableWrap = document.createElement("span");
    tableWrap.className = "rt-tablewrap";
    const tableBtn = document.createElement("button");
    tableBtn.type = "button";
    tableBtn.className = "rt-btn rt-tablebtn";
    tableBtn.title = "Table";
    tableBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"'
      + ' stroke-width="1.9" stroke-linecap="round" aria-hidden="true">'
      + '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/>'
      + '<path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/></svg>';
    tableBtn.addEventListener("mousedown", (e) => e.preventDefault());
    const tableMenu = document.createElement("div");
    tableMenu.className = "rt-menu rt-tablemenu";
    tableMenu.hidden = true;
    const sizeRow = document.createElement("div");
    sizeRow.className = "rt-tablesize";
    const numBox = (label, value) => {
      const w = document.createElement("label");
      w.appendChild(document.createTextNode(label));
      const i = document.createElement("input");
      i.type = "number"; i.min = "1"; i.max = "20"; i.value = String(value);
      w.appendChild(i);
      sizeRow.appendChild(w);
      return i;
    };
    const rowsIn = numBox("Rows", 3);
    const colsIn = numBox("Columns", 3);
    const headIn = document.createElement("label");
    headIn.className = "rt-tablehead";
    const headTick = document.createElement("input");
    headTick.type = "checkbox"; headTick.checked = true;
    headIn.appendChild(headTick);
    headIn.appendChild(document.createTextNode("First row is a heading"));
    const insertBtn = document.createElement("button");
    insertBtn.type = "button";
    insertBtn.className = "rt-menu-cta";
    insertBtn.textContent = "Insert";
    tableMenu.appendChild(sizeRow);
    tableMenu.appendChild(headIn);
    tableMenu.appendChild(insertBtn);
    tableWrap.appendChild(tableBtn);
    tableWrap.appendChild(tableMenu);
    bar.appendChild(tableWrap);

    /* Where the caret was before the toolbar took the focus, saved on
       mousedown the way the colour and code menus do it. */
    let tableAt = null;
    tableBtn.addEventListener("mousedown", () => { tableAt = save(); });
    tableBtn.addEventListener("click", () => {
      if (!tableMenu.hidden){ tableMenu.hidden = true; return; }
      openMenuAt(tableBtn, tableMenu);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!tableMenu.hidden && !tableMenu.contains(e.target) && !tableBtn.contains(e.target))
        tableMenu.hidden = true;
    });
    insertBtn.addEventListener("mousedown", (e) => e.preventDefault());
    insertBtn.addEventListener("click", () => {
      const rows = Math.max(1, Math.min(20, parseInt(rowsIn.value, 10) || 3));
      const cols = Math.max(1, Math.min(20, parseInt(colsIn.value, 10) || 3));
      tableMenu.hidden = true;
      insertTable(rows, cols, headTick.checked);
      box.focus(); fire();
    });

    function insertTable(rows, cols, withHead){
      const table = document.createElement("table");
      const body = document.createElement("tbody");
      for (let r = 0; r < rows; r++){
        const tr = document.createElement("tr");
        for (let c = 0; c < cols; c++){
          const cell = document.createElement(withHead && r === 0 ? "th" : "td");
          /* A cell with nothing in it at all cannot be clicked into in some
             browsers, so each one starts with a break to stand on. */
          cell.appendChild(document.createElement("br"));
          tr.appendChild(cell);
        }
        body.appendChild(tr);
      }
      table.appendChild(body);
      const after = document.createElement("p");
      after.appendChild(document.createElement("br"));
      try{
        const range = tableAt || save();
        if (range){
          range.deleteContents();
          range.insertNode(after);
          range.insertNode(table);
        } else {
          box.appendChild(table);
          box.appendChild(after);
        }
        /* Land the caret in the first cell, which is where typing starts. */
        const first = table.querySelector("th, td");
        if (first){
          const sel = window.getSelection();
          const r2 = document.createRange();
          r2.setStart(first, 0); r2.collapse(true);
          sel.removeAllRanges(); sel.addRange(r2);
        }
      }catch(e){}
    }

    /* Tab walks the cells, and Tab out of the last one adds a row, which is
       what every other table anybody has used does. Without it a teacher
       has to guess the number of rows before they start typing. */
    function tableKeys(e){
      if (e.key !== "Tab") return false;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return false;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentNode;
      const cell = node.closest && node.closest("th, td");
      if (!cell || !box.contains(cell)) return false;
      e.preventDefault();
      const cells = Array.from(cell.closest("table").querySelectorAll("th, td"));
      let next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
      if (!next && !e.shiftKey){
        const row = cell.closest("tr");
        const fresh = document.createElement("tr");
        for (let i = 0; i < row.children.length; i++){
          const td = document.createElement("td");
          td.appendChild(document.createElement("br"));
          fresh.appendChild(td);
        }
        row.parentNode.appendChild(fresh);
        next = fresh.firstChild;
        fire();
      }
      if (!next) return true;              // Tab out of the last cell, handled
      const r = document.createRange();
      r.setStart(next, 0); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      return true;
    }

    tool("&#10006;", "Remove formatting", () => cmd("removeFormat"), "rt-clear");

    const box = document.createElement("div");
    box.className = "rt-box";
    box.contentEditable = "true";
    box.spellcheck = true;
    if (o.rows) box.style.minHeight = (o.rows * 26) + "px";
    if (o.placeholder) box.dataset.placeholder = o.placeholder;
    box.innerHTML = initialHtml || "";
    fillPictures();
    box.querySelectorAll("pre.rt-cb").forEach(paintBlock);
    /* so the number reads the box's own size before anyone has clicked in it */
    try{ showSize(); }catch(e){}

    let saved = null;
    /* The words being worked on are remembered whenever the selection moves
       inside this box. Relying on a single mousedown to catch them was
       fragile: if anything else handled that event first, there was nothing
       to colour and the button appeared to do nothing at all. */
    let lastRange = null;
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (box.contains(r.commonAncestorContainer)) lastRange = r.cloneRange();
    });
    function save(){
      const sel = window.getSelection();
      if (sel && sel.rangeCount){
        const r = sel.getRangeAt(0);
        if (box.contains(r.commonAncestorContainer)) return r.cloneRange();
      }
      return lastRange;      // whatever was last worked on in this box
    }
    function restore(range){
      if (!range) return;
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    }

    let timer = null;
    function fire(){
      clearTimeout(timer);
      timer = setTimeout(() => { if (onChange) onChange(clean(box)); }, 200);
    }
    /* Show which options are already on for the text under the cursor, so
       the toolbar tells you the state rather than just setting it. */
    const stateOf = { bold:boldBtn, italic:italicBtn, underline:underBtn };
    function refreshState(){
      /* so the number always says what the writing under the cursor really is */
      try{ showSize(); }catch(e){}
      /* Inside a code block the colouring is the editor's, not the teacher's:
         a comment is in italics and a keyword is bold because of what they
         are. Reporting that as bold and italic being switched on invites a
         press of the button to turn something off that was never on. */
      const inCode = !!blockNow();
      Object.keys(stateOf).forEach(name => {
        const btn = stateOf[name];
        if (!btn) return;
        let on = false;
        if (!inCode){ try{ on = document.queryCommandState(name); }catch(e){} }
        btn.classList.toggle("on", !!on);
      });
      /* lists and code show as on when the cursor is inside one, so pressing
         the button again visibly turns them off */
      [["insertUnorderedList", ".rt-bullet"], ["insertOrderedList", ".rt-number"]].forEach(pair => {
        const btn = bar.querySelector(pair[1]);
        if (!btn) return;
        let on = false;
        try{ on = document.queryCommandState(pair[0]); }catch(e){}
        btn.classList.toggle("on", !!on);
      });
      const codeBtn = bar.querySelector(".rt-code");
      if (codeBtn) codeBtn.classList.toggle("on", !!(insideTag("CODE") || blockNow()));
      let colour = "";
      try{ colour = document.queryCommandValue("foreColor") || ""; }catch(e){}
      swatch.style.background = normaliseColour(colour) || "transparent";
    }
    function normaliseColour(v){
      if (!v) return "";
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
      if (!m) return v;
      const hex = "#" + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
      /* the everyday text colour counts as no colour at all */
      return hex;
    }
    box.addEventListener("keyup", refreshState);
    box.addEventListener("mouseup", refreshState);
    box.addEventListener("focus", refreshState);
    document.addEventListener("selectionchange", () => {
      if (document.activeElement === box) refreshState();
    });

    /* A block is coloured again after every change. Nothing happens while a
       key is being composed (accents, or a Chinese keyboard): rebuilding the
       line underneath one of those loses what is half typed. */
    let composing = false;
    box.addEventListener("compositionstart", () => { composing = true; });
    box.addEventListener("compositionend", () => {
      composing = false;
      const pre = blockNow();
      if (pre) repaintBlock(pre);
      fire();
    });
    box.addEventListener("input", () => {
      if (!composing){
        const pre = blockNow();
        if (pre) repaintBlock(pre);
      }
      fire();
    });
    box.addEventListener("blur", () => { if (onChange) onChange(clean(box)); });
    // paste as plain words, so a copied web page cannot bring its styling in
    box.addEventListener("keydown", (e) => {
      const codeBlock = blockNow();
      if (codeBlock && codeKeys(e, codeBlock)) return;
      /* Inside a table, Tab walks the cells rather than indenting a list.
         Checked before the list handling below, because a list inside a
         table cell would otherwise swallow it. */
      if (tableKeys(e)) return;
      if (e.key === "Tab"){
        /* only indent when there is already an item above to sit under */
        const sel = window.getSelection();
        let li = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
        while (li && li !== box && li.tagName !== "LI") li = li.parentNode;
        if (li && li.tagName === "LI"){
          e.preventDefault();
          if (e.shiftKey){ cmd("outdent"); }
          else if (li.previousElementSibling){ cmd("indent"); subStyle(li); }
          fire();
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey){
        /* a plain Enter starts a new line, not a whole new paragraph */
        const sel = window.getSelection();
        let li = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
        while (li && li !== box && li.tagName !== "LI") li = li.parentNode;
        if (li && li.tagName === "LI") return;      // lists behave normally
        e.preventDefault();
        cmd("insertLineBreak");
        fire();
      }
    });
    /* a nested list is shown differently from the one above it */
    function subStyle(li){
      let list = li.parentNode;
      if (!list) return;
      const outer = list.parentNode && list.parentNode.closest ? list.parentNode.closest("ol, ul") : null;
      if (list.tagName === "UL") list.style.listStyleType = "circle";
      else if (list.tagName === "OL"){
        const above = outer && outer.style ? outer.style.listStyleType : "";
        list.style.listStyleType = (above === "lower-alpha") ? "decimal" : "lower-alpha";
      }
    }

    /* A picture on the clipboard becomes part of the writing. It is kept as
       a data url, which is only sensible for something small, so anything
       large is scaled down before it goes in. */
    box.addEventListener("paste", (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const item of items){
        if (item.type && item.type.indexOf("image") === 0){
          e.preventDefault();
          /* Pictures belong in lessons, not in a student's notes: they would
             fill the database, and there is a screenshot task for handing one
             in. Nothing is pasted, and they are told why. */
          if (o.pictures === false){
            if (window.hubSay) window.hubSay("You cannot paste a picture here",
              "Use a screenshot task to hand a picture in.");
            else alert("You cannot paste a picture here.");
            return;
          }
          const file = item.getAsFile();
          if (!file) return;
          /* In the builder a pasted picture goes into the database and
             the paragraph keeps only its id. Inline base64 was making
             the lesson itself carry the picture: every student
             downloaded it again with the lesson each time they opened
             it, and a lesson with three screenshots in it was a
             megabyte of JSON. Everywhere else, the old way. */
          if (typeof o.upload === "function"){
            const mark = document.createElement("span");
            mark.className = "rt-uploading";
            mark.contentEditable = "false";
            mark.textContent = "Uploading the picture…";
            const at = save();
            if (at){ at.deleteContents(); at.insertNode(mark); }
            else box.appendChild(mark);
            o.upload(file, (made, why) => {
              const img = document.createElement("img");
              if (!made){
                const oops = document.createElement("span");
                oops.textContent = why || "That picture could not be saved.";
                mark.replaceWith(oops);
                fire();
                return;
              }
              img.setAttribute("data-img", made.id);
              img.src = made.src;
              img.style.width = Math.min(420, made.width || 420) + "px";
              mark.replaceWith(img);
              fire();
            });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const probe = new Image();
            probe.onload = () => {
              /* no wider than 900px, so a screenshot does not fill the database */
              const scale = Math.min(1, 900 / probe.width);
              const c = document.createElement("canvas");
              c.width = Math.round(probe.width * scale);
              c.height = Math.round(probe.height * scale);
              c.getContext("2d").drawImage(probe, 0, 0, c.width, c.height);
              const img = document.createElement("img");
              img.src = c.toDataURL("image/jpeg", 0.82);
              img.style.width = Math.min(420, c.width) + "px";
              box.focus();
              document.execCommand("insertHTML", false, img.outerHTML);
              fire();
            };
            probe.src = reader.result;
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    });

    /* Clicking a picture offers a size to change it to. */
    box.addEventListener("click", (e) => {
      /* Which picture was last clicked, so the line-up buttons know what
         they are lining up: pressing one of them moves the selection off
         the picture before they get a chance to look. */
      lastPicture = (e.target && e.target.tagName === "IMG") ? e.target : null;
      if (!e.target || e.target.tagName !== "IMG") return;
      const img = e.target;
      const old = box.querySelector(".rt-imgsize");
      if (old) old.remove();
      const tools = document.createElement("span");
      tools.className = "rt-imgsize";
      tools.contentEditable = "false";
      [["Small", 220], ["Medium", 420], ["Large", 680]].forEach(pair => {
        const b2 = document.createElement("button");
        b2.type = "button";
        b2.textContent = pair[0];
        b2.addEventListener("mousedown", (ev) => ev.preventDefault());
        b2.addEventListener("click", () => {
          img.style.width = pair[1] + "px";
          img.style.height = "auto";
          tools.remove();
          fire();
        });
        tools.appendChild(b2);
      });
      const r = img.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      tools.style.left = (r.left - wrapRect.left) + "px";
      tools.style.top = (r.bottom - wrapRect.top + 4) + "px";
      wrap.appendChild(tools);
      setTimeout(() => {
        document.addEventListener("pointerdown", function away(ev){
          if (!tools.contains(ev.target)){ tools.remove(); document.removeEventListener("pointerdown", away); }
        });
      }, 0);
    });

    box.addEventListener("paste", (e) => {
      /* The picture handler further up is a different listener on the same
         box, and returning from it does not stop this one: both run on
         every paste. Pasting a picture therefore came through here as
         well with no text at all, and cmd() turns "" into null, so
         execCommand("insertText", null) wrote the word "null" into the
         box in front of the picture. Found by pasting one and looking. */
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const item of items)
        if (item.type && item.type.indexOf("image") === 0) return;
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      if (!text) return;                 // nothing to put in, so put nothing in
      const pre = blockNow();
      /* insertText turns the line breaks in pasted code into <br>s and drops
         the spaces at the front of each line, which is the whole shape of a
         piece of Python. Inside a block it is put in as text instead. */
      if (pre){ codeSplice(pre, text.replace(/\r/g, "")); fire(); return; }
      cmd("insertText", text);
    });

    wrap.appendChild(bar);
    wrap.appendChild(box);
    wrap.getHtml = () => clean(box);
    wrap.setHtml = (html) => {
      box.innerHTML = html || "";
      fillPictures();
      box.querySelectorAll("pre.rt-cb").forEach(paintBlock);
    };
    return wrap;
  };

  /* Turn stored HTML back into something safe, used when loading a lesson. */
  window.cleanRichText = function(html){
    const holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    return clean(holder);
  };
})();
