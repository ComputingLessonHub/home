/* =====================================================================
   autograder.js, the checklist a student sees above their code.

   A teacher writes a list of checks in the lesson builder. Each one is a
   small object saying what to look for. This file runs them against
   whatever the student has written and reports pass or fail with a
   sentence saying what to try.

   The shape of a check follows CodeHS's TestCase idea, cut down to the
   things that are useful at KS3:

     { label, kind, ... }

   Python:
     codeHas      value          the code contains this text
     codeLacks    value          the code does not contain this text
     defines      value          def <value>( appears
     calls        value          <value>( appears
     uses         value          a for loop, while loop, if, input, list…
     usesCount    value,count,compare  how many of those there are: 3 elifs
     codeCount    value,count,compare  how many times this text appears
     outputHas    value          the printed output contains this
     outputIs     value          the printed output is exactly this
     lineCount    count          at least this many lines of real code

   Web:
     tag          selector,count      that many of a tag exist
     classOrId    selector            .thing or #thing exists
     attr         selector,attr,value an attribute is set (and matches)
     contentHas   value               the page text contains this
     cssHas       selector,property,value  a rule sets that property
     fileHas      file,value          a named file contains this

   A check can carry further conditions after the first, and those are run
   through the very same list: an extra condition is a whole check in its own
   right, joined on with and/or.

   Nothing here touches the network, and a broken check never stops the
   student working, it reports itself as needing the teacher's attention.
   ===================================================================== */
(function(){
  "use strict";

  const pass = (label) => ({ label, ok:true,  note:"" });
  const fail = (label, note) => ({ label, ok:false, note: note || "" });
  /* An unusable check is the teacher's problem, not the student's, so it
     is shown differently rather than as work they got wrong. */
  const broken = (label, why) => ({ label, ok:false, broken:true, note: why });

  /* ---------- Python ---------- */

  /* Comments and blank lines are not what a check is about. */
  function realCode(code){
    return String(code || "")
      .split("\n")
      .map(l => l.replace(/#.*$/, "").trimEnd())
      .filter(l => l.trim() !== "")
      .join("\n");
  }

  /* A condition that assigns rather than compares is a mistake, not an if
     statement. "if x = 5:" does not run, so it should not tick anything off. */
  function conditionLooksRight(line){
    const cond = (line.split(":")[0] || "").replace(/^\s*(if|elif|while)\b/, "");
    /* strip the comparisons that legitimately contain = */
    const rest = cond.replace(/[=!<>]=|<|>/g, "");
    return !/=/.test(rest);
  }
  /* Is this one line that keyword, written correctly? Asked of a single line
     rather than of the program, because the lines a check matched are what a
     condition after it is pointed at. */
  function soundOne(line, word){
    const re = new RegExp("^\\s*" + word + "\\b");
    if (!re.test(line)) return false;
    if (!/:\s*$/.test(line.trimEnd()) && !/:/.test(line)) return false;
    return conditionLooksRight(line);
  }
  /* Looks for a keyword on a line that is actually written correctly. */
  function soundLine(code, word){
    return code.split("\n").some(line => soundOne(line, word));
  }

  /* Comments are the one thing that cannot be found in the tidied code,
     because tidying is what removes them, so these are passed the untouched
     code as a second argument. Quoted text goes first, or a hash inside a
     message the student prints reads as the start of a comment. */
  function commentLines(raw){
    return String(raw || "").split("\n")
      .filter(l => /#/.test(l.replace(/"[^"]*"|'[^']*'/g, "")));
  }

  const PY_PATTERNS = {
    "for loop":    /\bfor\s+\w+\s+in\b.*:/,
    "while loop":  (code) => soundLine(code, "while"),
    "if":          (code) => soundLine(code, "if"),
    "else":        /\belse\s*:/,
    "elif":        (code) => soundLine(code, "elif"),
    "input":       /\binput\s*\(/,
    "print":       /\bprint\s*\(/,
    "list":        /=\s*\[|\.append\s*\(/,
    "function":    /\bdef\s+\w+\s*\(/,
    "variable":    /^\s*\w+\s*=[^=]/m,
    "comment":     (code, raw) => commentLines(raw).length > 0,
    "random":      /\brandom\b/,
    "turtle":      /\bturtle\b|\bforward\s*\(|\bpenup\s*\(/
  };

  /* ---------- counting ----------
     "Three elifs" is a different question from "an elif somewhere", and it is
     the one a teacher asks when the shape of the program is the point: three
     branches, two loops, a comment on every section.

     The same soundness rules apply as for `uses`. A line that would not run is
     not one of the three, or a student with "elif x = 1:" written three times
     is told they have what was asked for and left to wonder why nothing works. */
  function countLines(code, re){
    return code.split("\n").filter(l => re.test(l)).length;
  }
  function soundLines(code, word){
    const re = new RegExp("^\\s*" + word + "\\b");
    return code.split("\n").filter(line => {
      if (!re.test(line)) return false;
      if (!/:/.test(line)) return false;
      return conditionLooksRight(line);
    }).length;
  }
  /* Occurrences of a pattern anywhere, for the things that are calls rather
     than lines of their own: "print" three times on one line is three prints. */
  function countAll(code, re){
    const found = String(code || "").match(re);
    return found ? found.length : 0;
  }

  const PY_COUNTS = {
    "for loop":    (code) => countLines(code, /\bfor\s+\w+\s+in\b.*:/),
    "while loop":  (code) => soundLines(code, "while"),
    "if":          (code) => soundLines(code, "if"),
    "else":        (code) => countLines(code, /\belse\s*:/),
    "elif":        (code) => soundLines(code, "elif"),
    "input":       (code) => countAll(code, /\binput\s*\(/g),
    "print":       (code) => countAll(code, /\bprint\s*\(/g),
    "list":        (code) => countAll(code, /=\s*\[|\.append\s*\(/g),
    "function":    (code) => countAll(code, /\bdef\s+\w+\s*\(/g),
    "variable":    (code) => countLines(code, /^[^\S\n]*\w+\s*=[^=]/),
    "comment":     (code, raw) => commentLines(raw).length,
    "random":      (code) => countAll(code, /\brandom\b/g),
    "turtle":      (code) => countAll(code, /\bturtle\b|\bforward\s*\(|\bpenup\s*\(/g)
  };

  /* What to call these when there is more than one. Most would take an s, but
     "2 ifs" and "2 elses" are not what anyone says out loud, and the words a
     student reads should be the words their teacher uses. */
  const COUNT_WORDS = {
    "for loop":    ["for loop", "for loops"],
    "while loop":  ["while loop", "while loops"],
    "if":          ["if statement", "if statements"],
    "else":        ["else", "else lines"],
    "elif":        ["elif", "elifs"],
    "input":       ["input", "inputs"],
    "print":       ["print", "prints"],
    "list":        ["list", "lists"],
    "function":    ["function", "functions"],
    "variable":    ["variable", "variables"],
    "comment":     ["comment", "comments"],
    "random":      ["use of random", "uses of random"],
    "turtle":      ["turtle command", "turtle commands"]
  };
  function amount(n, which){
    const words = COUNT_WORDS[which] || [which, which + "s"];
    if (n === 0) return "no " + words[1];
    if (n === 1) return "1 " + words[0];
    return n + " " + words[1];
  }
  function times(n){
    if (n === 0) return "is not there yet";
    if (n === 1) return "is there once";
    return "is there " + n + " times";
  }

  /* How a count is judged, and what to say when it is not right yet. The
     sentence always says what they have as well as what is wanted: one short
     and one too many are different problems and need different next steps. */
  const COMPARES = { atLeast:1, exactly:1, atMost:1 };
  function countsUp(label, got, check, sofar){
    /* A count left out would read as zero and tick itself off whatever the
       student wrote, which is worse than saying nothing at all. Zero itself is
       a real setting: "at most 0" is how a teacher asks for none. */
    const said = String(check.count == null ? "" : check.count).trim();
    if (said === "" || isNaN(parseInt(said, 10)))
      return broken(label, "This check does not say how many.");
    const want = Math.max(0, parseInt(said, 10));
    const how = COMPARES[check.compare] ? check.compare : "atLeast";
    const ok = how === "exactly" ? got === want
             : how === "atMost"  ? got <= want
             :                     got >= want;
    if (ok) return pass(label);
    if (how === "exactly")
      return fail(label, sofar + " There should be exactly " + want + ".");
    if (how === "atMost")
      return fail(label, sofar + " There should be no more than " + want + ".");
    return fail(label, sofar + " You need at least " + want + ".");
  }

  /* ---------- extra conditions on a check ----------
     A check can carry more conditions after the first, joined with and/or, so
     one line of a checklist can ask for something a single rule cannot say.

     A condition is a whole check in its own right: anything that can be the
     first thing a line looks for can be a condition on it too. That is why
     there is no list of them here. It was three kinds once, and a teacher who
     wanted "uses a for loop, and calls draw()" had to write two lines of the
     checklist, which a student then read as two separate jobs.

     Each one can be told where to look. "Anywhere" is the whole program;
     "this line" is only the lines the thing before it matched, which is what
     makes "uses an input, and that input mentions food" possible rather than
     "uses an input somewhere and mentions food somewhere else"; "this block"
     is what is written inside those lines, which is how "uses an if, and
     inside the if it prints something" gets asked.

     Read left to right with no precedence, so "A and B or C" means
     "(A and B) or C", unless a condition is bracketed. A bracketed condition
     goes with the run of bracketed ones before it, and the bracket as a whole
     joins the line with the word on its first member, which is how
     "A and (B or C)" gets written. One depth of bracket and no more: past
     that a teacher would have to count brackets to know what their own
     checklist asks for. */

  /* ---------- which lines a check matched ----------
     What "this line" and "this block" are measured from, kept as line numbers
     so a block can be found under them.

     Text a teacher typed is found by looking for it. The things picked from a
     list are not: "for loop" is the name of a pattern, not something anybody
     writes in their code, and looking for those words themselves found no
     lines at all. That is why "this line" quietly did nothing after "uses
     a...", and why "this block" would have done nothing either. */

  /* The code on a line with any comment taken off, which is what a check sees.
     A check never matches inside a comment, so the lines it matched must not
     be found there either. Only for Python: in the web tasks a hash is an id
     or a colour, not the start of a comment. */
  function bareLine(line){ return String(line || "").replace(/#.*$/, ""); }

  /* PY_PATTERNS asked of one line. The ones written as a regex up there are
     already per line; the rest ask about the whole program, so they are
     written again here. */
  const PY_LINE = {
    "while loop": (l) => soundOne(l, "while"),
    "if":         (l) => soundOne(l, "if"),
    "elif":       (l) => soundOne(l, "elif")
  };
  function usesLine(line, which){
    if (PY_LINE[which]) return PY_LINE[which](line);
    const test = PY_PATTERNS[which];
    if (!test || typeof test === "function") return false;
    return test.test(line);
  }

  function matchedLines(check, lines, cased, soft, web){
    const kind = check.kind || "codeHas";
    /* the tag or selector where there is no typed text, so "has an h1" points
       at the line the h1 is on */
    const value = String(check.value || "").trim() || String(check.selector || "").trim();
    const readable = (l) => web ? String(l || "") : bareLine(l);
    const pick = (test) => {
      const out = [];
      lines.forEach((l, i) => { if (test(l)) out.push(i); });
      return out;
    };

    if (kind === "uses" || kind === "usesCount"){
      const which = String(check.value || "for loop").toLowerCase();
      /* the one thing that is only ever found in a comment */
      if (which === "comment")
        return pick(l => /#/.test(String(l).replace(/"[^"]*"|'[^']*'/g, "")));
      return pick(l => usesLine(readable(l), which));
    }
    if (kind === "defines" || kind === "calls"){
      const name = value.replace(/[^\w]/g, "");
      if (!name) return [];
      const re = kind === "defines"
        ? new RegExp("\\bdef\\s+" + name + "\\s*\\(", cased ? "" : "i")
        : new RegExp("(?<!def\\s)\\b" + name + "\\s*\\(", cased ? "" : "i");
      return pick(l => re.test(readable(l)));
    }
    if (!value) return [];
    return pick(l => has(readable(l), value, cased, soft));
  }

  /* ---------- blocks ---------- */
  function indentOf(line){
    const m = /^[ \t]*/.exec(String(line || ""));
    return m ? m[0].length : 0;
  }
  /* Does this line open a block? In Python that is a line whose code ends with
     a colon; in a web task, one ending with an opening brace, which is the
     same idea for a CSS rule or a JavaScript block. Quoted text and comments
     come off first, or a colon inside a message a student prints would read as
     the start of a block. */
  function opensBlock(line){
    const code = String(line || "")
      .replace(/"[^"]*"|'[^']*'/g, "")
      .replace(/#.*$/, "").replace(/\/\/.*$/, "")
      .trimEnd();
    return /[:{]$/.test(code);
  }
  /* The lines inside a block: everything under its first line that is indented
     further than it, up to the first line that comes back out again. A blank
     line in the middle does not end it. The first line itself is not part of
     it, because "inside the if" is what the if does; a teacher asking about
     the condition on the if asks about the line instead. */
  function bodyLines(lines, at){
    if (!opensBlock(lines[at])) return [];
    const open = indentOf(lines[at]);
    const out = [];
    for (let i = at + 1; i < lines.length; i++){
      if (!String(lines[i]).trim()){ out.push(i); continue; }
      if (indentOf(lines[i]) <= open) break;
      out.push(i);
    }
    return out;
  }
  /* every block body under these lines, with nothing counted twice */
  function bodiesUnder(lines, at){
    const seen = {}, out = [];
    (at || []).forEach(i => bodyLines(lines, i).forEach(j => {
      if (!seen[j]){ seen[j] = true; out.push(j); }
    }));
    return out.sort((x, y) => x - y);
  }
  const textAt = (lines, at) => (at || []).map(i => lines[i]).join("\n");

  /* A condition that was looking somewhere in particular has to say so. The
     sentences the checks use are written as though they had seen the whole
     program, so a student who put their print just outside the if was told
     their code does not use a print at all, which is both wrong and no help.
     The few wordings that come up when a condition is scoped are turned round
     to name the place instead. */
  const WHERE_WORDS = { match:"on that line", block:"inside it" };
  function saidWhere(note, scope){
    const said = String(note || "").trim().replace(/\.$/, "");
    const where = WHERE_WORDS[scope];
    if (!where) return said;
    let m = /^Your code does not include (.+?) yet$/.exec(said);
    if (m) return m[1] + " is not " + where + " yet";
    m = /^Your code does not use an? (.+?) yet$/.exec(said);
    if (m) return "there is no " + m[1] + " " + where + " yet";
    m = /^Try doing this without (.+)$/.exec(said);
    if (m) return m[1] + " is still " + where;
    return where + ", " + said.charAt(0).toLowerCase() + said.slice(1);
  }

  /* Which conditions leave the next one somewhere narrower to look. A check on
     the output, on the number of runs or on how many lines there are has no
     particular line to point at, and one that asks for something to be absent
     has by definition not found one. */
  const NARROWS = { codeHas:1, codeCount:1, uses:1, usesCount:1, defines:1, calls:1,
                    tag:1, classOrId:1, attr:1, contentHas:1, cssHas:1, fileHas:1 };

  /* A condition worth running. Not every kind needs typed words: "at least 5
     lines" is a number and "has an h1" is a tag, and dropping everything
     without a value left those quietly out of the line they belonged to. */
  function condSaid(m){
    return !!(m && (String(m.value || "").trim() ||
                    String(m.count || "").trim() ||
                    String(m.selector || "").trim()));
  }

  /* One condition, run through the same machinery as a first check. The case
     and space settings belong to the line as a whole rather than to each part
     of it, so they are copied down; the wording and any conditions of its own
     are not, because only the line has those. */
  function runCond(m, check, opts, where, narrowed){
    const c = Object.assign({}, m, {
      caseSensitive: check.caseSensitive === true,
      exactSpace: check.exactSpace === true,
      label: check.label || "Check"
    });
    delete c.more; delete c.hint; delete c.manual;
    if (opts.web){
      /* narrowed down there are no three files any more, only the lines that
         were picked out, so each of them is those lines */
      const files = narrowed ? { html: where, css: where, js: where } : opts.files;
      return checkWebOne(c, files, opts.runs);
    }
    return checkPythonOne(c, where, opts.output, opts.runs);
  }

  /* Walks the chain and folds the answers together with the first one.
     `found` is the lines the last thing to match found, by number, so a
     condition scoped to "this line" or "this block" has somewhere to look. */
  function withExtras(check, first, opts){
    const more = (Array.isArray(check.more) ? check.more : []).filter(condSaid);
    if (!more.length || !first || first.broken) return first;
    const cased = check.caseSensitive === true;
    const soft = check.exactSpace !== true;
    const label = check.label || "Check";
    const lines = String(opts.code || "").split("\n");
    let ok = !!first.ok;
    let found = matchedLines(check, lines, cased, soft, opts.web);
    let why = "";

    /* Every condition is run, even once the answer can no longer change,
       because each one narrows where the next may look and because the
       sentence a student reads should name the first thing missing. */
    function judge(m){
      const at = m.scope === "match" ? found
               : m.scope === "block" ? bodiesUnder(lines, found)
               : null;
      const where = (at === null) ? opts.code : textAt(lines, at);
      let r;
      try{ r = runCond(m, check, opts, where, at !== null); }
      catch(e){ r = broken(label, "One of the other conditions could not run."); }
      if (r.broken){
        if (!why) why = "one of the other conditions is not set up properly";
        return false;
      }
      if (!r.ok){
        if (!why) why = saidWhere(r.note || "one of the other conditions is not met yet",
                                  m.scope);
        return false;
      }
      /* what this condition matched becomes the place the next one can look,
         inside wherever it was looking rather than anywhere in the program */
      if (NARROWS[m.kind]){
        let hit = matchedLines(m, lines, cased, soft, opts.web);
        if (at !== null) hit = hit.filter(i => at.indexOf(i) >= 0);
        if (hit.length) found = hit;
      }
      return true;
    }

    let i = 0;
    while (i < more.length){
      if (!more[i].group){
        const r = judge(more[i]);
        ok = (more[i].join === "or") ? (ok || r) : (ok && r);
        i++;
        continue;
      }
      /* a bracket: this condition and every bracketed one straight after it */
      const outer = more[i].join;
      let sub = null;
      while (i < more.length && more[i].group){
        const r = judge(more[i]);
        sub = (sub === null) ? r
            : (more[i].join === "or") ? (sub || r) : (sub && r);
        i++;
      }
      ok = (outer === "or") ? (ok || sub) : (ok && sub);
    }

    if (ok) return pass(label);
    return fail(label, first.ok
      ? ("Nearly: " + (why || "one of the other conditions is not met yet") + ".")
      : first.note);
  }

  function checkPythonOne(check, code, output, runs){
    const label = check.label || "Check";
    const bare = realCode(code);
    const value = String(check.value || "");
    const out = String(output == null ? "" : output);
    const cased = check.caseSensitive === true;
    const soft = check.exactSpace !== true;

    switch (check.kind){
      case "codeHas":
        if (!value) return broken(label, "This check has nothing to look for.");
        return has(bare, value, cased, soft) ? pass(label)
          : fail(label, "Your code does not include “" + value + "” yet.");

      case "codeLacks":
        if (!value) return broken(label, "This check has nothing to look for.");
        return !has(bare, value, cased, soft) ? pass(label)
          : fail(label, "Try doing this without “" + value + "”.");

      /* Counting a piece of text the teacher typed: three calls to a function
         they wrote, two print lines, no more than one input. */
      case "codeCount": {
        if (!value) return broken(label, "This check has nothing to count.");
        const got = countText(bare, value, cased, soft);
        return countsUp(label, got, check, "“" + value + "” " + times(got) + ".");
      }

      case "defines": {
        if (!value) return broken(label, "This check does not say which function.");
        const re = new RegExp("\\bdef\\s+" + value.replace(/[^\w]/g, "") + "\\s*\\(", cased ? "" : "i");
        return re.test(bare) ? pass(label)
          : fail(label, "Write a function called " + value + ".");
      }

      case "calls": {
        if (!value) return broken(label, "This check does not say what to call.");
        const name = value.replace(/[^\w]/g, "");
        const called = new RegExp("(?<!def\\s)\\b" + name + "\\s*\\(", cased ? "" : "i").test(bare);
        return called ? pass(label) : fail(label, "Nothing calls " + value + " yet.");
      }

      case "uses": {
        /* No choice made in the builder means the first one, rather than a
           check that can never pass. */
        const which = String(value || "for loop").toLowerCase();
        const test = PY_PATTERNS[which];
        if (!test) return broken(label, "Unknown thing to look for: " + which);
        const found = typeof test === "function" ? test(bare, code) : test.test(bare);
        if (found) return pass(label);
        /* say so when the right word is there but written wrongly */
        const nearly = new RegExp("\\b" + which.split(" ")[0] + "\\b").test(bare);
        return fail(label, nearly
          ? "There is a " + which + " there, but it is not quite right yet."
          : "Your code does not use a " + which + " yet.");
      }

      /* The same list of things, asked about by number. */
      case "usesCount": {
        const which = String(value || "for loop").toLowerCase();
        const counter = PY_COUNTS[which];
        if (!counter) return broken(label, "Unknown thing to count: " + which);
        const got = counter(bare, code);
        return countsUp(label, got, check, "You have " + amount(got, which) + ".");
      }

      case "outputHas":
        if (!out.trim()) return fail(label, "Run your code first.");
        return has(out, value, cased, soft) ? pass(label)
          : fail(label, "Your output does not include \u201c" + value + "\u201d.");

      case "outputIs": {
        if (!out.trim()) return fail(label, "Run your code first.");
        const tidy = (t) => t.replace(/\r/g, "").trim().replace(/[ \t]+$/gm, "");
        return same(tidy(out), tidy(value), cased, soft) ? pass(label)
          : fail(label, "Your output is not quite right yet.");
      }

      /* Counted rather than looked for in the code: the point of it is to get
         them to press Run, which nothing about the text of their program can
         show. One run is the useful case, as a plain "have a go" tick. */
      case "runCount": {
        const want = Math.max(1, parseInt(check.count, 10) || 1);
        const got = Math.max(0, parseInt(runs, 10) || 0);
        if (got >= want) return pass(label);
        return fail(label, got === 0
          ? (want === 1 ? "Press Run to try your code."
                        : "Press Run to try your code, " + want + " times in all.")
          : "Run it again: " + got + " of " + want + " so far.");
      }

      case "lineCount": {
        const want = parseInt(check.count, 10) || 1;
        const got = bare.split("\n").filter(l => l.trim()).length;
        return got >= want ? pass(label)
          : fail(label, "Only " + got + " line" + (got === 1 ? "" : "s") + " so far, " + want + " are needed.");
      }

      default:
        return broken(label, "Unknown kind of check: " + check.kind);
    }
  }

  /* A line the student has not met yet says only what the teacher wrote
     under it, and nothing at all when they wrote nothing: the wording built
     in above ("Only 2 lines so far, 4 are needed") is not shown to a student
     any more. Only for a plain miss: a "broken" result
     means the check itself is set up wrong, and hiding that would leave a
     lesson quietly not working. */
  function ownWords(check, res){
    if (!res || res.ok || res.broken) return res;
    res.note = String((check && check.hint) || "").trim();
    return res;
  }

  window.runPythonChecks = function(checks, code, output, runs){
    return (checks || []).map(c => {
      if (c && c.manual === true) return { ok:false, manual:true, label:c.label || "Check" };
      try{
        const raw = String(code == null ? "" : code);
        const first = checkPythonOne(c, raw, output, runs);
        /* The whole program, not the tidied version, because a condition is a
           check in its own right and one of them asks about comments, which
           tidying is what removes. */
        const joined = withExtras(c, first, {
          web: false, code: raw, runs: runs,
          output: String(output == null ? "" : output)
        });
        return ownWords(c, joined);
      }
      catch(e){ return broken(c.label || "Check", "This check could not run."); }
    });
  };

  /* ---------- HTML, CSS and JavaScript ---------- */

  /* The three files become one page, so a check can look at the whole
     thing the way a browser would. */
  function parsePage(files){
    const html = String((files && files.html) || "");
    const doc = new DOMParser().parseFromString(
      /<html[\s>]/i.test(html) ? html : "<!DOCTYPE html><html><body>" + html + "</body></html>",
      "text/html");
    return doc;
  }

  function checkWebOne(check, files, runs){
    const label = check.label || "Check";
    const doc = parsePage(files);
    const css = String((files && files.css) || "");
    const js = String((files && files.js) || "");
    const value = String(check.value || "");
    const selector = String(check.selector || "").trim();
    const want = parseInt(check.count, 10) || 1;

    const cased = check.caseSensitive === true;
    const soft = check.exactSpace !== true;

    switch (check.kind){
      case "runCount": {
        const want = Math.max(1, parseInt(check.count, 10) || 1);
        const got = Math.max(0, parseInt(runs, 10) || 0);
        if (got >= want) return pass(label);
        return fail(label, got === 0 ? "Press Run to see your page."
                                     : "Run it again: " + got + " of " + want + " so far.");
      }

      case "tag": {
        if (!selector) return broken(label, "This check does not say which tag.");
        let found;
        try{ found = doc.querySelectorAll(selector.replace(/[^\w-]/g, "")); }
        catch(e){ return broken(label, "That tag name cannot be searched for."); }
        return found.length >= want ? pass(label)
          : fail(label, found.length
              ? "Found " + found.length + ", " + want + " are needed."
              : "There is no <" + selector + "> yet.");
      }

      case "classOrId": {
        if (!/^[.#]/.test(selector))
          return broken(label, "Start with . for a class or # for an id.");
        let found;
        try{ found = doc.querySelectorAll(selector); }
        catch(e){ return broken(label, "That selector cannot be searched for."); }
        return found.length >= want ? pass(label)
          : fail(label, "Nothing has " + selector + " yet.");
      }

      case "attr": {
        if (!selector) return broken(label, "This check does not say which element.");
        const attr = String(check.attr || "").trim();
        if (!attr) return broken(label, "This check does not say which attribute.");
        let found;
        try{ found = Array.from(doc.querySelectorAll(selector)); }
        catch(e){ return broken(label, "That selector cannot be searched for."); }
        const withAttr = found.filter(n => n.hasAttribute(attr));
        if (!withAttr.length)
          return fail(label, "No " + selector + " has a " + attr + " yet.");
        if (!value) return pass(label);
        const matching = withAttr.filter(n => has(n.getAttribute(attr) || "", value, cased, soft));
        return matching.length ? pass(label)
          : fail(label, "The " + attr + " is set, but not to “" + value + "”.");
      }

      case "contentHas": {
        if (!value) return broken(label, "This check has nothing to look for.");
        const text = (doc.body ? doc.body.textContent : "") || "";
        return has(text, value, cased, soft) ? pass(label)
          : fail(label, "The page does not show \u201c" + value + "\u201d yet.");
      }

      case "cssHas": {
        const prop = String(check.property || "").trim();
        if (!selector || !prop) return broken(label, "This check needs a selector and a property.");
        /* find the block for that selector, then the property inside it */
        const blocks = css.split("}");
        const block = blocks.find(b => {
          const head = b.split("{")[0] || "";
          return head.split(",").map(x => x.trim()).includes(selector);
        });
        if (!block) return fail(label, "There is no rule for " + selector + " yet.");
        const body = block.split("{")[1] || "";
        const line = new RegExp("(?:^|;)\\s*" + prop.replace(/[^\w-]/g, "") + "\\s*:\\s*([^;]+)").exec(body);
        if (!line) return fail(label, selector + " does not set " + prop + " yet.");
        if (!value) return pass(label);
        return has(line[1].trim(), value, cased, soft) ? pass(label)
          : fail(label, prop + " is set, but not to “" + value + "”.");
      }

      case "fileHas": {
        const which = String(check.file || "html").toLowerCase();
        const text = which === "css" ? css : which === "js" ? js : String((files && files.html) || "");
        if (!value) return broken(label, "This check has nothing to look for.");
        return has(text, value, cased, soft) ? pass(label)
          : fail(label, "Your " + which.toUpperCase() + " does not include “" + value + "” yet.");
      }

      default:
        return broken(label, "Unknown kind of check: " + check.kind);
    }
  }

  window.runWebChecks = function(checks, files, runs){
    return (checks || []).map(c => {
      if (c && c.manual === true) return { ok:false, manual:true, label:c.label || "Check" };
      try{
        const all = [ (files && files.html) || "", (files && files.css) || "",
                      (files && files.js) || "" ].join("\n");
        const first = checkWebOne(c, files, runs);
        const joined = withExtras(c, first, {
          web: true, files: files || {}, code: all, output: all, runs: runs
        });
        return ownWords(c, joined);
      }
      catch(e){ return broken(c.label || "Check", "This check could not run."); }
    });
  };

  /* ---------- what the student sees ---------- */

  /* Case is ignored unless a teacher deliberately asks for it. A student who
     writes Print where the check says print has usually made a different
     mistake from the one the check is about, and marking it wrong teaches
     nothing. Each check carries its own caseSensitive flag.

     Spaces are ignored for the same reason, and unless the same sort of
     deliberate choice is made. A line asking for "x > 17" is asking about the
     comparison, not about how much room was left either side of the >, and a
     student who wrote "x>17" has done the thing being asked for. That one is
     the check's exactSpace flag, and it is off unless a teacher turns it on,
     so "soft" below means the usual forgiving reading. Tabs go with spaces;
     line breaks do not, or a check could match halfway through one line and
     halfway through the next. */
  function tidyText(text, cased, soft){
    let s = String(text == null ? "" : text);
    if (soft) s = s.replace(/[ \t]+/g, "");
    return cased ? s : s.toLowerCase();
  }
  function has(hay, needle, cased, soft){
    return tidyText(hay, cased, soft).includes(tidyText(needle, cased, soft));
  }
  function same(a, b, cased, soft){
    return tidyText(a, cased, soft) === tidyText(b, cased, soft);
  }
  /* How many times a piece of text appears, counted the way someone reading
     down the page would count it: no overlaps, so "aa" appears once in "aaa". */
  function countText(hay, needle, cased, soft){
    const n = String(needle == null ? "" : needle);
    if (!n) return 0;
    const inHay = tidyText(hay, cased, soft);
    const inNeedle = tidyText(needle, cased, soft);
    if (!inNeedle) return 0;
    let from = 0, found = 0;
    for (;;){
      const at = inHay.indexOf(inNeedle, from);
      if (at < 0) return found;
      found++;
      from = at + inNeedle.length;
    }
  }

  window.buildChecklist = function(checks){
    const all = checks || [];
    const isManual = (c) => c && c.manual === true;
    const autoCount = all.filter(c => !isManual(c)).length;
    const manualCount = all.filter(isManual).length;
    const mixed = autoCount > 0 && manualCount > 0;

    const wrap = document.createElement("div");
    wrap.className = "checklist";
    const head = document.createElement("div");
    head.className = "checklist-head";
    const title = document.createElement("b");
    title.textContent = "Checklist";
    head.appendChild(title);
    const score = document.createElement("span");
    score.className = "checklist-score";
    head.appendChild(score);
    wrap.appendChild(head);

    /* Two columns only when there is something in both: the checks the page can
       do on its own down the left, the ones a teacher has to look at down the
       right. With only one kind there is nothing to compare it against, so it
       takes the whole width. */
    const body = document.createElement("div");
    body.className = "checklist-body" + (mixed ? " split" : "");
    wrap.appendChild(body);

    function column(kind, note){
      const col = document.createElement("div");
      col.className = "checklist-col " + kind;
      if (note){
        const p = document.createElement("p");
        p.className = "checklist-note";
        p.textContent = note;
        col.appendChild(p);
      }
      const ul = document.createElement("ul");
      ul.className = "checklist-items";
      col.appendChild(ul);
      body.appendChild(col);
      return ul;
    }
    const autoList = autoCount ? column("auto", null) : null;
    const manualList = manualCount
      ? column("manual", "Your teacher will check " + (manualCount === 1 ? "this one" : "these") + " after the lesson.")
      : null;

    /* Kept in the order they were written, so results line up by position. */
    const items = [];
    all.forEach(c => {
      const li = document.createElement("li");
      li.className = "check" + (isManual(c) ? " check-manual" : "");
      const mark = document.createElement("span");
      mark.className = "check-mark";
      mark.textContent = "○";
      const text = document.createElement("span");
      text.className = "check-text";
      /* A teacher can style the wording of a line, so it arrives as HTML.
         labelHtml is the styled version and label the same words in plain
         text; anything written before styling existed has only the latter,
         and marking, the PDF and the summary screens read label throughout. */
      if (c.labelHtml){
        text.innerHTML = window.cleanRichText
          ? window.cleanRichText(c.labelHtml) : c.labelHtml;
      } else text.textContent = c.label || "Check";
      const note = document.createElement("span");
      note.className = "check-note";
      li.appendChild(mark); li.appendChild(text); li.appendChild(note);
      (isManual(c) ? manualList : autoList).appendChild(li);
      items.push({ li, mark, note, manual: isManual(c) });
    });

    /* A teacher looking at the work can tick these; a student cannot. */
    let manualOn = false;
    items.forEach((it, i) => {
      if (!it.manual) return;
      it.li.addEventListener("click", () => {
        if (!manualOn) return;
        const now = it.li.dataset.state === "yes";
        it.li.dataset.state = now ? "" : "yes";
        it.mark.textContent = now ? "○" : "✓";
        tally();
        if (typeof wrap.onManual === "function") wrap.onManual(wrap.getManual());
      });
    });

    function tally(){
      let done = 0, counted = 0;
      items.forEach(it => {
        counted++;
        if (it.li.dataset.state === "yes") done++;
      });
      score.textContent = done + " of " + counted;
      wrap.dataset.allDone = done === counted ? "yes" : "no";
      return done === counted;
    }

    /* Called with the results of running the checks. `hold` is the lines to
       leave exactly as they are, which is how a line a run has just turned
       waits for the tick over the console to point at it rather than quietly
       going green first. They are drawn by a second call with nothing held
       back, once that tick has had its say. */
    wrap.show = function(results, hold){
      const held = (hold && hold.length) ? hold : null;
      (results || []).forEach((r, i) => {
        const it = items[i];
        if (!it || it.manual) return;         // a teacher's tick is not overwritten
        if (held && held.indexOf(i) >= 0) return;
        it.li.dataset.state = r.broken ? "broken" : r.ok ? "yes" : "no";
        it.mark.textContent = r.broken ? "!" : r.ok ? "✓" : "○";
        it.note.textContent = r.note || "";
      });
      return tally();
    };
    wrap.reset = function(){
      items.forEach(it => {
        if (it.manual) return;
        it.li.dataset.state = "";
        it.mark.textContent = "○";
        it.note.textContent = "";
      });
      tally();
    };
    /* Which lines are ticked, by position, so the page can tell what has
       changed since the last run rather than having to work it out twice. */
    wrap.ticked = function(){
      return items.map(it => it.li.dataset.state === "yes");
    };
    /* One line of the list, so the page can ask where it is before deciding
       whether it has to move at all. */
    wrap.lineAt = function(at){
      const it = items[at];
      return it ? it.li : null;
    };
    /* Point at a line that has just been ticked off. The class is taken off
       and forced to be laid out again before it goes back on, or a second run
       that ticks the same line would add a class that is already there and
       nothing would move. */
    wrap.point = function(at){
      const it = items[at];
      if (!it) return null;
      it.li.classList.remove("justticked");
      void it.li.offsetWidth;
      it.li.classList.add("justticked");
      setTimeout(() => it.li.classList.remove("justticked"), 2400);
      return it.li;
    };

    /* Which of the teacher-checked lines are ticked, by position in the whole
       list, so they can be saved with the work and put back later. */
    wrap.getManual = function(){
      const out = {};
      items.forEach((it, i) => { if (it.manual && it.li.dataset.state === "yes") out[i] = true; });
      return out;
    };
    wrap.setManual = function(flags){
      if (!flags) return;
      items.forEach((it, i) => {
        if (!it.manual) return;
        const on = !!flags[i];
        it.li.dataset.state = on ? "yes" : "";
        it.mark.textContent = on ? "✓" : "○";
      });
      tally();
    };
    wrap.allowManual = function(on){
      manualOn = !!on;
      wrap.classList.toggle("can-tick", manualOn);
      items.forEach(it => { if (it.manual) it.li.title = manualOn ? "Click to tick this off" : ""; });
    };
    tally();
    return wrap;
  };
})();
