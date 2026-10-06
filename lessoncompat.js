/* Lessons written on the original site, read the way this one reads them.

   The original (Turso and Vercel) carried on being taught from while this
   version was built, and grew some of the same features under different
   names. A lesson saved there is a lesson a teacher wrote and a class has
   work against, so it has to open here meaning what it meant there. Every
   difference is settled in this one file rather than in each place that
   reads a lesson:

     a model program      `model` on a Python task, or { html, css, js } on a
                          web one, is `modelCode` / `modelHtml` / `modelCss` /
                          `modelJs` here
     the checklist view   `checkMode` "all" was the only way a checklist could
                          look until late on, so a checklist with no mode, or
                          "all", opens with every line showing
                          (`checksShowAll`). "one" and "choose" are what a
                          checklist does here anyway: one line at a time, with
                          Show all for the student who wants the whole list
     a hint's offer       a hint with no count was offered after one run
                          there, and with none here, so the one is written in
     Output must contain  `expect` on a Python task became a checklist line
                          here, "The output contains", so it becomes one

   Task ids are never touched. Work is saved against them, and a lesson that
   moved its ids would lose every answer handed in to it.

   Used by tools/migrate-to-cosmos.js on every lesson and bank task it moves,
   and by the builder on a lesson, page or task imported as JSON. The import
   cannot know where a file came from, so there it only converts a file that
   has something in it only the original writes; see looksOriginal. */
(function(root){
  "use strict";

  const textOf = (v) => String(v == null ? "" : v);

  /* Things only the original ever wrote. A lesson with none of them in it
     could have come from either side, and the one difference that cannot be
     read from the task alone (a checklist with no mode) is then left as this
     site would read it. */
  function looksOriginal(data){
    let found = false;
    walk(data, (b) => {
      if (found) return;
      if (b.checkMode !== undefined) found = true;
      else if (b.type === "ide" && typeof b.model === "string" && b.model.trim()) found = true;
      else if (b.type === "web" && b.model && typeof b.model === "object") found = true;
      else if ((b.type === "ide") && textOf(b.expect).trim()) found = true;
    });
    return found;
  }

  /* Every block anywhere in a lesson, a page, a list of blocks or one task:
     inside pages, groups and extensions, and inside each level of a Choose
     your challenge. */
  function walk(data, fn){
    const seen = new Set();
    const go = (b) => {
      if (!b || typeof b !== "object" || seen.has(b)) return;
      seen.add(b);
      if (Array.isArray(b)){ b.forEach(go); return; }
      if (b.type) fn(b);
      if (Array.isArray(b.blocks)) b.blocks.forEach(go);
      if (b.type === "choice" && Array.isArray(b.options))
        b.options.forEach(o => { if (o && Array.isArray(o.blocks)) o.blocks.forEach(go); });
      if (b.page && typeof b.page === "object") go(b.page);
    };
    go(data);
  }

  /* One task. Returns how many things it changed, so a caller can say so. */
  function convertBlock(b){
    let n = 0;
    if (b.type === "ide" && typeof b.model === "string"){
      if (b.model.trim() && !textOf(b.modelCode).trim()) b.modelCode = b.model;
      delete b.model; n++;
    }
    if (b.type === "web" && b.model && typeof b.model === "object"){
      const m = b.model;
      if (textOf(m.html).trim() && !b.modelHtml) b.modelHtml = m.html;
      if (textOf(m.css).trim() && !b.modelCss) b.modelCss = m.css;
      if (textOf(m.js).trim() && !b.modelJs) b.modelJs = m.js;
      delete b.model; n++;
    }
    /* Continue never waits any more, so what `expect` was really doing was
       telling a student the output was not right yet. That is the checklist's
       job now, and the line it is given says the same thing in its words. */
    if (b.type === "ide" && b.expect !== undefined){
      const want = textOf(b.expect);
      if (want.trim()){
        if (!Array.isArray(b.checks)) b.checks = [];
        const have = b.checks.some(c => c && c.kind === "outputHas"
                                     && textOf(c.value).trim().toLowerCase() === want.trim().toLowerCase());
        if (!have) b.checks.push({ label: "The output contains " + want.trim(), kind: "outputHas", value: want });
      }
      delete b.expect; n++;
    }
    if ((b.type === "ide" || b.type === "web") && Array.isArray(b.checks) && b.checks.length){
      const mode = b.checkMode;
      if ((mode === undefined || mode === "all") && b.checksShowAll === undefined){ b.checksShowAll = true; n++; }
      b.checks.forEach(c => {
        if (c && textOf(c.hint).trim() && c.hintAfter === undefined){ c.hintAfter = 1; n++; }
      });
    }
    if (b.checkMode !== undefined){ delete b.checkMode; n++; }
    return n;
  }

  /* The whole of whatever it is handed, changed in place and handed back. */
  function fromOriginal(data){
    let changed = 0;
    walk(data, (b) => { changed += convertBlock(b); });
    return { data: data, changed: changed };
  }

  const api = { looksOriginal, fromOriginal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.lessonCompat = api;
})(typeof window !== "undefined" ? window : this);
