/* ===================================================================
   webhub.js — everything the HTML/CSS/JavaScript editor needs.

   Colouring, mistake-spotting and plain-English explanations for the
   three web languages, plus the little bit of glue that turns what a
   student typed into a page the browser can show. Nothing here touches
   the network or the database.
   =================================================================== */

(function(){
  "use strict";

  const esc = (t) => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  /* ---------------- what the words mean ---------------- */
  window.WEB_HELP = {
    html: {
      "html":"Wraps the whole page.",
      "head":"Holds information about the page that visitors do not see, like its title.",
      "title":"The name shown on the browser tab.",
      "body":"Everything people actually see goes in here.",
      "h1":"The most important heading on the page. Use one per page.",
      "h2":"A smaller heading, for a section.",
      "h3":"A smaller heading again, inside a section.",
      "p":"A paragraph of writing.",
      "a":"A link to another page. The address goes in href.",
      "img":"Shows a picture. The address goes in src.",
      "ul":"An unordered list — the one with bullet points.",
      "ol":"An ordered list — the one with numbers.",
      "li":"One item in a list.",
      "div":"A box you can style or move around. Very common.",
      "span":"A small box around some words inside a line.",
      "button":"A button people can click.",
      "input":"A box people can type in, or tick, depending on its type.",
      "form":"Groups boxes together so they can be sent somewhere.",
      "table":"A table of rows and columns.",
      "tr":"One row of a table.",
      "td":"One cell in a table row.",
      "th":"A heading cell in a table.",
      "br":"Breaks the line, so what follows starts on a new one.",
      "hr":"Draws a line across the page to separate one part from the next.",
      "style":"Somewhere to write CSS inside the page.",
      "script":"Somewhere to write JavaScript inside the page.",
      "link":"Attaches something to the page, usually a stylesheet.",
      "class":"A label you give elements so CSS or JavaScript can find them. Several can share one.",
      "id":"A name for one element only, so CSS or JavaScript can find it.",
      "href":"The address a link goes to.",
      "src":"The address of a picture, video or script.",
      "alt":"Words describing a picture, read aloud to people who cannot see it.",
      "strong":"Marks words as important. Browsers show them bold.",
      "em":"Marks words as emphasised. Browsers show them in italics.",
      "header":"The top part of a page or section.",
      "footer":"The bottom part of a page or section.",
      "nav":"The menu of links.",
      "section":"A part of a page that belongs together.",
      "select":"A drop-down list of choices.",
      "option":"One choice inside a drop-down list.",
      "label":"Words that go with an input box."
    },
    css: {
      "color":"The colour of the writing.",
      "background":"What sits behind an element — a colour or a picture.",
      "background-color":"The colour behind an element.",
      "font-size":"How big the writing is.",
      "font-family":"Which typeface the writing uses.",
      "font-weight":"How bold the writing is.",
      "text-align":"Lines writing up left, right or in the centre.",
      "margin":"Space outside an element, pushing others away.",
      "padding":"Space inside an element, between its edge and its contents.",
      "border":"A line drawn around an element.",
      "border-radius":"Rounds the corners.",
      "width":"How wide an element is.",
      "height":"How tall an element is.",
      "display":"How an element behaves — block, inline, flex, grid, or none to hide it.",
      "flex":"Sets how much of the leftover space an item takes in a flex row or column.",
      "justify-content":"Spreads items along a flex row.",
      "align-items":"Lines items up across a flex row.",
      "position":"Changes how an element is placed, so it can be moved with top and left.",
      "top":"How far down a positioned element sits.",
      "left":"How far across a positioned element sits.",
      "opacity":"How see-through something is: 0 is invisible, 1 is solid.",
      "box-shadow":"A shadow behind an element.",
      "text-decoration":"Underlines writing, or removes the line under links.",
      "line-height":"The space between lines of writing.",
      "cursor":"What the mouse pointer looks like over an element.",
      "transition":"Makes a change happen smoothly instead of instantly.",
      "transform":"Moves, turns or resizes an element without moving anything around it.",
      "hover":"Used as :hover, for the style while the mouse is over something.",
      "gap":"Space between items in a flex or grid layout.",
      "overflow":"What happens when the contents are too big to fit."
    },
    js: {
      "let":"Makes a variable whose value can change.",
      "const":"Makes a name that cannot be pointed at something else afterwards.",
      "var":"An older way of making a variable. Use let or const instead.",
      "function":"Makes your own command you can use again.",
      "return":"Sends a value back out of a function.",
      "if":"Does something only when a condition is true.",
      "else":"What to do when the condition was false.",
      "for":"Repeats something a set number of times.",
      "while":"Keeps repeating while a condition stays true.",
      "true":"The value for yes.",
      "false":"The value for no.",
      "null":"Deliberately empty: someone set it to nothing on purpose.",
      "undefined":"No value has been given yet.",
      "console":"The place messages go. console.log() prints one.",
      "log":"Prints a message to the console.",
      "alert":"Shows a pop-up message.",
      "prompt":"Asks the person to type something.",
      "document":"The web page itself, so JavaScript can change it.",
      "getElementById":"Finds the one element with that id.",
      "querySelector":"Finds the first element matching a CSS selector.",
      "addEventListener":"Runs some code when something happens, like a click.",
      "innerHTML":"The HTML inside an element. Setting it throws away what was there before.",
      "textContent":"The words inside an element, without any HTML.",
      "value":"What is in an input box, always as text even when it looks like a number.",
      "length":"How many items an array has, or how many characters some text has.",
      "push":"Adds an item to the end of an array.",
      "parseInt":"Reads a whole number out of the start of some text. Gives NaN if there is not one.",
      "Math":"A toolbox of number tricks, like Math.random().",
      "random":"Gives a random decimal from 0 up to but not including 1. Math.random().",
      "setTimeout":"Runs some code once, after a wait.",
      "setInterval":"Runs some code over and over on a timer, until it is stopped.",
      "classList":"Adds or removes CSS classes on an element.",
      "typeof":"Tells you what kind of value something is, as a word like \"number\" or \"string\"."
    }
  };

  /* ---------------- colouring ---------------- */
  function hlHtml(line){
    let out = "", i = 0;
    while (i < line.length){
      const rest = line.slice(i);
      let m;
      if ((m = /^<!--[\s\S]*?(-->|$)/.exec(rest))){
        out += '<span class="t-com">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^(<\/?)\s*([A-Za-z][\w-]*)/.exec(rest))){
        const tag = m[2];
        const helped = window.WEB_HELP.html[tag.toLowerCase()];
        out += '<span class="t-op">' + esc(m[1]) + "</span>" +
               '<span class="t-tag' + (helped ? " t-help" : "") + '">' + esc(tag) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^([A-Za-z-]+)(?=\s*=)/.exec(rest))){
        const helped = window.WEB_HELP.html[m[1].toLowerCase()];
        out += '<span class="t-attr' + (helped ? " t-help" : "") + '">' + esc(m[1]) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^("[^"]*"?|'[^']*'?)/.exec(rest))){
        out += '<span class="t-str">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^[<>\/=]+/.exec(rest))){
        out += '<span class="t-op">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out || "&nbsp;";
  }

  function hlCss(line){
    let out = "", i = 0;
    while (i < line.length){
      const rest = line.slice(i);
      let m;
      if ((m = /^\/\*[\s\S]*?(\*\/|$)/.exec(rest))){
        out += '<span class="t-com">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^([a-z-]+)(?=\s*:)/.exec(rest))){
        const helped = window.WEB_HELP.css[m[1]];
        out += '<span class="t-prop' + (helped ? " t-help" : "") + '">' + esc(m[1]) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^(#[0-9a-fA-F]{3,8}\b|\d+\.?\d*(px|em|rem|%|vh|vw|s|deg)?)/.exec(rest))){
        out += '<span class="t-num">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^("[^"]*"?|'[^']*'?)/.exec(rest))){
        out += '<span class="t-str">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^([.#][\w-]+|:[a-z-]+)/.exec(rest))){
        const bare = m[0].replace(/^[.#:]/, "");
        const helped = window.WEB_HELP.css[bare];
        out += '<span class="t-sel' + (helped ? " t-help" : "") + '">' + esc(m[0]) + "</span>";
        i += m[0].length; continue;
      }
      if ((m = /^[{}:;,]/.exec(rest))){
        out += '<span class="t-op">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out || "&nbsp;";
  }

  const JS_KW = new Set(("let const var function return if else for while do break continue new " +
    "typeof this class extends try catch finally throw switch case default of in await async").split(" "));

  function hlJs(line, state){
    let out = "", i = 0;
    if (state && state.block){
      const close = line.indexOf("*/");
      if (close < 0) return '<span class="t-com">' + esc(line) + "</span>";
      out += '<span class="t-com">' + esc(line.slice(0, close + 2)) + "</span>";
      i = close + 2; state.block = false;
    }
    while (i < line.length){
      const rest = line.slice(i);
      let m;
      if (rest.slice(0, 2) === "//"){ out += '<span class="t-com">' + esc(rest) + "</span>"; break; }
      if (rest.slice(0, 2) === "/*"){
        const close = rest.indexOf("*/", 2);
        if (close < 0){ if (state) state.block = true; out += '<span class="t-com">' + esc(rest) + "</span>"; break; }
        out += '<span class="t-com">' + esc(rest.slice(0, close + 2)) + "</span>"; i += close + 2; continue;
      }
      if ((m = /^("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/.exec(rest))){
        out += '<span class="t-str">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      if ((m = /^\d+\.?\d*/.exec(rest))){ out += '<span class="t-num">' + m[0] + "</span>"; i += m[0].length; continue; }
      if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))){
        const w = m[0];
        const helped = !!window.WEB_HELP.js[w];
        const cls = JS_KW.has(w) ? "t-kw" : (helped ? "t-fn" : "");
        out += (cls || helped)
          ? '<span class="' + cls + (helped ? " t-help" : "") + '">' + esc(w) + "</span>"
          : esc(w);
        i += w.length; continue;
      }
      if ((m = /^[+\-*\/%=<>!&|^~?:]+/.exec(rest))){
        out += '<span class="t-op">' + esc(m[0]) + "</span>"; i += m[0].length; continue;
      }
      out += esc(rest[0]); i++;
    }
    return out || "&nbsp;";
  }

  window.webHighlight = function(lang, line, state){
    if (lang === "css") return hlCss(line);
    if (lang === "js") return hlJs(line, state);
    return hlHtml(line);
  };

  /* ---------------- spotting mistakes ---------------- */
  const VOID_TAGS = new Set(["br","hr","img","input","meta","link","area","base","col","source","track","wbr","!doctype"]);

  function checkHtml(code){
    const issues = [];
    const lines = code.split("\n");
    const stack = [];
    lines.forEach((raw, n) => {
      const clean = raw.replace(/<!--[\s\S]*?-->/g, "");
      const re = /<(\/?)\s*([A-Za-z!][\w-]*)([^>]*?)(\/?)>/g;
      let m;
      while ((m = re.exec(clean)) !== null){
        const closing = m[1] === "/";
        const tag = m[2].toLowerCase();
        const selfClosed = m[4] === "/";
        if (closing){
          const top = stack.pop();
          if (!top){
            issues.push({ line:n, msg: "</" + tag + "> closes something that was never opened." });
          } else if (top.tag !== tag){
            issues.push({ line:n, msg: "Expected </" + top.tag + "> here, but found </" + tag + ">." });
            stack.push(top);
          }
        } else if (!selfClosed && !VOID_TAGS.has(tag)){
          stack.push({ tag: tag, line: n });
        }
      }
      if ((clean.match(/"/g) || []).length % 2)
        issues.push({ line:n, msg:"A quote mark is missing from this line." });
      const lastOpen = clean.lastIndexOf("<"), lastClose = clean.lastIndexOf(">");
      if (lastOpen > lastClose && /<[A-Za-z]/.test(clean.slice(lastOpen)))
        issues.push({ line:n, msg:"This tag is missing its closing >." });
    });
    stack.forEach(o => issues.push({ line:o.line, msg:"<" + o.tag + "> is never closed." }));
    return issues;
  }

  function checkCss(code){
    const issues = [];
    const lines = code.split("\n");
    let depth = 0, openLine = 0, inComment = false;
    lines.forEach((raw, n) => {
      let t = raw;
      if (inComment){
        const close = t.indexOf("*/");
        if (close < 0) return;
        t = t.slice(close + 2); inComment = false;
      }
      t = t.replace(/\/\*[\s\S]*?\*\//g, "");
      if (t.indexOf("/*") >= 0){ inComment = true; t = t.slice(0, t.indexOf("/*")); }
      for (const ch of t){
        if (ch === "{"){ if (!depth) openLine = n; depth++; }
        else if (ch === "}"){
          depth--;
          if (depth < 0){ issues.push({ line:n, msg:"There is a } here with no { to match it." }); depth = 0; }
        }
      }
      const body = t.trim();
      if (!body) return;
      const looksLikeStyling = /^[a-z-]+\s*:/.test(body);
      if (looksLikeStyling && depth > 0 && !/[;{}]$/.test(body)){
        issues.push({ line:n, msg:"This line needs a semicolon (;) at the end.",
                      fix:() => raw.replace(/\s*$/, "") + ";" });
      }
      if (looksLikeStyling && depth === 0 && !/^@/.test(body)){
        issues.push({ line:n, msg:"This styling is not inside a rule — it needs a selector and { } around it." });
      }
    });
    if (depth > 0) issues.push({ line:openLine, msg:"This rule is never closed with a }." });
    return issues;
  }

  function checkJs(code){
    const issues = [];
    const lines = code.split("\n");
    const opens = { "(":")", "[":"]", "{":"}" };
    const stack = [];
    let inComment = false;
    lines.forEach((raw, n) => {
      let t = raw;
      if (inComment){
        const close = t.indexOf("*/");
        if (close < 0) return;
        t = t.slice(close + 2); inComment = false;
      }
      t = t.replace(/\/\*[\s\S]*?\*\//g, "");
      if (t.indexOf("/*") >= 0){ inComment = true; t = t.slice(0, t.indexOf("/*")); }
      t = t.replace(/\/\/.*/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1?/g, '""');
      for (const ch of t){
        if (opens[ch]) stack.push({ ch, n });
        else if (ch === ")" || ch === "]" || ch === "}"){
          if (!stack.pop()) issues.push({ line:n, msg:"There is a " + ch + " here with nothing to close." });
        }
      }
      const body = t.trim();
      if (!body) return;
      if (/=\s*$/.test(body)) issues.push({ line:n, msg:"This line ends with = and nothing after it." });
      const cmp = /^(if|while)\s*\(([^)]*)\)/.exec(body);
      if (cmp && /[^=!<>]=[^=]/.test(cmp[2])){
        issues.push({ line:n, msg:"Use === to compare two things. A single = puts a value into a variable.",
                      fix:() => raw.replace(/([^=!<>])=([^=])/, "$1===$2") });
      }
      const typo = /\b(consol|documnet|fuction|functoin|retrun|lenght|getElementByID|querySelectorall)\b/.exec(t);
      if (typo){
        const right = { consol:"console", documnet:"document", fuction:"function", functoin:"function",
                        retrun:"return", lenght:"length", getElementByID:"getElementById",
                        querySelectorall:"querySelectorAll" }[typo[1]];
        issues.push({ line:n, msg:'Did you mean "' + right + '"?',
                      fix:() => raw.replace(new RegExp("\\b" + typo[1] + "\\b"), right) });
      }
    });
    stack.forEach(o => issues.push({ line:o.n, msg:"This " + o.ch + " is never closed." }));
    return issues;
  }

  /* ---------------- what to offer while they type ----------------
     The lists the suggestions box draws from. Kept here beside the
     explanations rather than in pyedit.js, because pyedit.js is the editor
     and knows nothing about HTML: it asks the language what fits where and
     draws whatever comes back.

     VOID_TAGS above already says which tags close themselves, so the same set
     decides both "this is never closed" in the mistake list and "do not write
     a closing tag for this one" when a student types the > . */
  const HTML_TAGS = ["a","article","aside","audio","b","blockquote","body","br","button","canvas",
    "code","div","em","footer","form","h1","h2","h3","h4","h5","h6","head","header","hr","html",
    "i","iframe","img","input","label","li","link","main","meta","nav","ol","option","p","pre",
    "script","section","select","small","source","span","strong","style","sub","sup","table",
    "tbody","td","textarea","th","thead","title","tr","ul","video"];

  const HTML_ATTRS = ["alt","checked","class","cols","disabled","for","height","href","id","lang",
    "max","maxlength","method","min","name","placeholder","rel","required","rows","selected","src",
    "step","style","target","title","type","value","width"];

  const ATTR_VALUES = {
    type:["text","number","password","checkbox","radio","submit","button","email","range","color","date"],
    target:["_blank","_self"],
    rel:["stylesheet","icon","noopener"],
    method:["get","post"],
    lang:["en"]
  };

  /* Only the ones a KS3 page actually uses. The full property list is about
     five hundred long and buries the twenty they need. */
  const CSS_PROPS = ["align-items","background","background-color","background-image","border",
    "border-bottom","border-color","border-radius","border-style","border-width","bottom","box-shadow",
    "color","cursor","display","flex","flex-direction","flex-wrap","font-family","font-size",
    "font-style","font-weight","gap","grid-template-columns","height","justify-content","left",
    "letter-spacing","line-height","list-style","margin","margin-bottom","margin-left","margin-right",
    "margin-top","max-width","min-height","opacity","overflow","padding","padding-bottom","padding-left",
    "padding-right","padding-top","position","right","text-align","text-decoration","text-shadow",
    "text-transform","top","transform","transition","visibility","width","z-index"];

  const COLOURS = ["black","white","red","orange","yellow","green","blue","navy","purple","pink",
    "brown","grey","gray","gold","teal","crimson","tomato","lime","cyan","magenta","silver",
    "lightblue","lightgreen","darkblue","darkgreen","transparent"];

  const CSS_VALUES = {
    "align-items":["center","flex-start","flex-end","stretch","baseline"],
    "background":COLOURS,
    "background-color":COLOURS,
    "border-color":COLOURS,
    "border-style":["solid","dashed","dotted","none"],
    "color":COLOURS,
    "cursor":["pointer","default","text","not-allowed","grab"],
    "display":["block","inline","inline-block","flex","grid","none"],
    "flex-direction":["row","column"],
    "flex-wrap":["wrap","nowrap"],
    "font-family":["sans-serif","serif","monospace","Arial, sans-serif","Georgia, serif"],
    "font-style":["normal","italic"],
    "font-weight":["normal","bold","600","800"],
    "justify-content":["center","flex-start","flex-end","space-between","space-around"],
    "list-style":["none","disc","decimal"],
    "overflow":["hidden","auto","scroll","visible"],
    "position":["static","relative","absolute","fixed","sticky"],
    "text-align":["left","center","right","justify"],
    "text-decoration":["none","underline","line-through"],
    "text-transform":["none","uppercase","lowercase","capitalize"],
    "visibility":["visible","hidden"]
  };

  /* After a dot. The ones on the left are the objects a beginner meets first,
     so they get a list of their own; anything else falls back to the things
     any value might have. */
  const JS_MEMBERS = {
    document:["getElementById","querySelector","querySelectorAll","createElement","body","title"],
    console:["log","error","warn","table","clear"],
    Math:["random","floor","ceil","round","abs","max","min","sqrt","pow","PI"],
    window:["alert","prompt","confirm","setTimeout","setInterval","location","innerWidth","innerHeight"],
    JSON:["stringify","parse"]
  };
  const JS_ANY = ["length","value","textContent","innerHTML","style","classList","addEventListener",
    "push","pop","shift","join","split","slice","indexOf","includes","toUpperCase","toLowerCase",
    "trim","replace","forEach","map","filter","sort","reverse","charAt","toFixed","appendChild",
    "remove","setAttribute","getAttribute","focus","src","href","checked","id","className"];
  const JS_GLOBALS = ["alert","prompt","confirm","console","document","window","Math","JSON","Number",
    "String","Array","Boolean","parseInt","parseFloat","isNaN","setTimeout","setInterval",
    "clearInterval","Date"];
  const JS_KEYWORDS = ["let","const","var","function","return","if","else","for","while","do","break",
    "continue","new","typeof","class","extends","try","catch","finally","throw","switch","case",
    "default","of","in","await","async","true","false","null","undefined","this"];

  /* Names the student made themselves, read straight out of what they have
     written. Offering only the built-in words would mean the one thing they
     are most likely to want, the variable they named two lines up, is the one
     thing never suggested. */
  function jsNames(code){
    const found = [];
    const keep = (w) => { if (w && found.indexOf(w) < 0) found.push(w); };
    let m;
    const re = /\b(?:let|const|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
    while ((m = re.exec(code)) !== null) keep(m[1]);
    const fn = /\bfunction\s*[A-Za-z_$]*\s*\(([^)]*)\)/g;
    while ((m = fn.exec(code)) !== null)
      m[1].split(",").forEach(p => { const w = p.trim(); if (/^[A-Za-z_$][\w$]*$/.test(w)) keep(w); });
    return found;
  }

  /* The ids and classes that are actually on the page, so the brackets of
     getElementById can offer the names the student wrote in their HTML
     rather than making them go and look. Only asked for from inside those
     brackets. `webPageCode` is set by whichever editor is open, because the
     HTML lives in a different file from the JavaScript asking about it. */
  function pageNames(which){
    const html = (typeof window.webPageCode === "function" && window.webPageCode()) || "";
    const out = [];
    const re = which === "id" ? /\bid\s*=\s*["']([^"']+)["']/g : /\bclass\s*=\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html)) !== null)
      m[1].split(/\s+/).forEach(w => { if (w && out.indexOf(w) < 0) out.push(w); });
    return out;
  }

  const items = (list, dict, decorate) => list.map(w => ({
    label: w,
    detail: (dict && dict[w]) || "",
    insert: decorate ? decorate(w) : undefined
  }));

  /* ---------------- where the cursor is, and so what fits there ----------------
     Each branch works out two things: the point a suggestion replaces from,
     and the list to choose out of. Handing back the start position rather
     than the typed letters is what lets "fo" be replaced by "font-size", and
     a half-typed colour by a whole one. */
  function suggestHtml(ctx){
    const line = ctx.lineBefore;
    /* The last < with no > after it means the cursor is still inside the tag
       being written. Between tags they are writing prose, and a box of tag
       names popping up over a sentence is in the way, so nothing is offered
       there. */
    const open = line.lastIndexOf("<"), shut = line.lastIndexOf(">");
    if (open <= shut) return null;
    const tagPart = line.slice(open);
    let m;
    if ((m = /([A-Za-z-]+)\s*=\s*"([^"]*)$/.exec(tagPart))){
      const vals = ATTR_VALUES[m[1].toLowerCase()];
      if (!vals) return null;
      return { from: ctx.pos - m[2].length, items: items(vals) };
    }
    if ((m = /^<\/?([A-Za-z][\w-]*)?$/.exec(tagPart)))
      return { from: ctx.pos - (m[1] || "").length,
               items: items(HTML_TAGS, window.WEB_HELP.html) };
    if (/^<[A-Za-z][\w-]*\s/.test(tagPart)){
      const word = (/([A-Za-z-]*)$/.exec(tagPart) || ["",""])[1];
      return { from: ctx.pos - word.length,
               items: items(HTML_ATTRS, window.WEB_HELP.html) };
    }
    return null;
  }

  function suggestCss(ctx){
    let m;
    /* a value, once the property has been named and the colon typed */
    if ((m = /([a-z-]+)\s*:\s*([^;{}]*)$/.exec(ctx.lineBefore))){
      const vals = CSS_VALUES[m[1]];
      if (!vals) return null;
      const word = (/([A-Za-z-]*)$/.exec(m[2]) || ["",""])[1];
      return { from: ctx.pos - word.length, items: items(vals) };
    }
    /* Inside a rule it is a property they are after, outside one a selector.
       Counted rather than parsed: a stray brace in a comment would throw this
       off, and getting the wrong list for one line costs nothing. */
    const depth = (ctx.before.match(/\{/g) || []).length - (ctx.before.match(/\}/g) || []).length;
    const word = (/([A-Za-z-]*)$/.exec(ctx.lineBefore) || ["",""])[1];
    if (depth > 0)
      return { from: ctx.pos - word.length,
               items: items(CSS_PROPS, window.WEB_HELP.css, w => w + ": ") };
    if (!word) return null;
    return { from: ctx.pos - word.length, items: items(HTML_TAGS, window.WEB_HELP.html) };
  }

  function suggestJs(ctx){
    let m;
    if ((m = /(getElementById|querySelector)\s*\(\s*(["'])([^"']*)$/.exec(ctx.lineBefore))){
      const wantClass = m[1] === "querySelector" && m[3].charAt(0) === ".";
      const names = pageNames(wantClass ? "class" : "id");
      if (!names.length) return null;
      const typed = wantClass ? m[3].slice(1) : m[3];
      return { from: ctx.pos - typed.length, items: items(names) };
    }
    /* As in Python: a dot after one of the named objects opens its list
       there and then, because document. can only be asking one thing. A dot
       after anything else waits for a letter. */
    if ((m = /([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$]*)$/.exec(ctx.lineBefore))){
      const own = JS_MEMBERS[m[1]];
      return { from: ctx.pos - m[2].length, now: !!own,
               items: items(own || JS_ANY, window.WEB_HELP.js) };
    }
    const word = (/([A-Za-z_$][\w$]*)$/.exec(ctx.lineBefore) || ["",""])[1] || "";
    const mine = jsNames(ctx.text).filter(w => w !== word);
    return { from: ctx.pos - word.length,
             items: items(mine)
               .concat(items(JS_KEYWORDS, window.WEB_HELP.js))
               .concat(items(JS_GLOBALS, window.WEB_HELP.js)) };
  }

  window.webSuggest = function(lang, ctx){
    try{
      if (lang === "css") return suggestCss(ctx);
      if (lang === "js") return suggestJs(ctx);
      return suggestHtml(ctx);
    }catch(e){ return null; }
  };

  /* Which tags write their own closing tag when the > is typed, and which
     close themselves and must not. */
  window.webVoidTag = function(tag){ return VOID_TAGS.has(String(tag || "").toLowerCase()); };

  /* ---------------- does this line leave something open? ----------------
     What the editor asks before deciding whether Enter should indent the
     next line under this one.

     All three languages used to share one rule, "ends with { or >", and for
     HTML that counted the > on the end of </h1>. Pressing Enter after a tag
     that had just been closed indented the next line under it, so every line
     after the first crept two spaces further right. The tags on the line are
     counted instead: only a tag still open at the end of it earns an indent,
     and a tag that closes itself, like <br>, never does. */
  function htmlOpens(line){
    if (!/>\s*$/.test(line)) return false;
    const re = /<(\/?)\s*([A-Za-z][\w-]*)((?:[^<>"]|"[^"]*")*?)(\/?)>/g;
    let depth = 0, m;
    while ((m = re.exec(line)) !== null){
      if (m[1] === "/") depth--;
      else if (!m[4] && !VOID_TAGS.has(m[2].toLowerCase())) depth++;
    }
    return depth > 0;
  }

  window.webOpens = function(lang, line){
    if (lang === "css") return /\{\s*$/.test(line);
    /* JavaScript: a bracket of any kind left open, or an arrow function
       whose body is going on the next line. */
    if (lang === "js") return /[{(\[]\s*$/.test(line) || /=>\s*$/.test(line);
    return htmlOpens(line);
  };

  window.webCheck = function(lang, code){
    try{
      if (lang === "css") return checkCss(code || "");
      if (lang === "js") return checkJs(code || "");
      return checkHtml(code || "");
    }catch(e){ return []; }
  };

  /* ---------------- building the page to show ----------------
     The student's three files are put together into one document. A small
     piece of glue at the top sends console messages and errors up to the
     lesson page, so mistakes appear in the console instead of vanishing. */
  window.webAssemble = function(html, css, js){
    const page = String(html || "");
    const style = css ? "<style>\n" + css + "\n</style>" : "";
    const S = "<" + "script>", E = "<" + "/" + "script>";
    const bridge = S + "(function(){\n" +
      "  function send(kind, args){\n" +
      "    var text = Array.prototype.map.call(args, function(a){\n" +
      "      try{ return (a && typeof a === 'object') ? JSON.stringify(a) : String(a); }\n" +
      "      catch(e){ return String(a); }\n" +
      "    }).join(' ');\n" +
      "    try{ parent.postMessage({ hubConsole: true, kind: kind, text: text }, '*'); }catch(e){}\n" +
      "  }\n" +
      "  ['log','warn','error','info'].forEach(function(k){\n" +
      "    var was = console[k];\n" +
      "    console[k] = function(){ send(k, arguments); if (was) try{ was.apply(console, arguments); }catch(e){} };\n" +
      "  });\n" +
      "  window.onerror = function(msg, src, line){ send('error', [msg + '  (line ' + line + ')']); return false; };\n" +
      "})();" + E;
    const script = js ? S + "\ntry{\n" + js + "\n}catch(e){ console.error(e.message); }\n" + E : "";

    if (/<html[\s>]/i.test(page)){
      let out = page;
      if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, bridge + style + "</head>");
      else out = out.replace(/<body([^>]*)>/i, "<body$1>" + bridge + style);
      if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, script + "</body>");
      else out += script;
      return out;
    }
    return "<!DOCTYPE html><html><head><meta charset='utf-8'>" + bridge + style +
           "</head><body>" + page + script + "</body></html>";
  };
})();
