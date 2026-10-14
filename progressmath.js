/* The one place that turns a lesson and some saved data into marks.
   work.html's markbook, admin.html's unit-wide progress and the comparison
   stats on both read a lesson exactly this way, so a total on one screen is
   never a second opinion on a total shown on another. Shared rather than
   copied three times over, because this project has already had scores
   quietly disagree between screens once before. */
(function(){
  const TASK_LABEL = { quiz:"Quiz", mc:"Multiple choice", order:"Put in order",
                       blanks:"Fill the gaps", short:"Short answer",
                       ide:"Coding task", web:"Coding task", scratch:"Coding task" };
  function plainText(html){ return String(html || "").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(); }
  function normAns(x){ return String(x || "").toLowerCase().trim().replace(/\s+/g," ").replace(/[.,!?;:'"]+$/g,""); }

  function taskInfo(b){
    const label = TASK_LABEL[b.type];
    if (!label) return null;
    if (b.type === "quiz" && !(b.questions || []).length) return null;
    if ((b.type === "ide" || b.type === "web" || b.type === "scratch") && !(Array.isArray(b.checks) && b.checks.length)) return null;
    if (b.type === "blanks" && !/\[\[.*?\]\]/.test(String(b.text || ""))) return null;
    return { id: b.id, type: b.type, label: label,
             title: plainText(b.prompt || b.title) || label, block: b };
  }
  /* Pages, groups and extensions are not tasks themselves, they hold tasks;
     an assessment has no pages at all, so a top-level block is already the
     leaf. Every task is stamped with the page it came from and its title, so
     a lesson with several checklists reads as several page columns rather
     than one column nobody can tell apart from the others. A task inside an
     extension is stamped with the extension's own title instead, and marked
     extension: true. */
  function quantifiableTasks(lessonJson){
    const out = [];
    (((lessonJson && lessonJson.blocks) || [])).forEach((page, pageIndex) => {
      const isPage = page.type === "page" || page.type === "extension" || page.type === "group";
      const pageTitle = (isPage ? page.title : plainText(page.prompt || page.title)) || "Page " + (pageIndex + 1);
      const walk = (blocks, title, ext) => (blocks || []).forEach(b => {
        if (b.type === "extension"){
          walk(b.blocks, "Extension: " + (b.title || "Extension tasks"), true);
          return;
        }
        if (b.type === "page" || b.type === "group"){ walk(b.blocks, title, ext); return; }
        const t = taskInfo(b);
        if (t){ t.pageIndex = pageIndex; t.pageTitle = title; t.extension = ext; out.push(t); }
      });
      if (page.type === "page" && page.extension === true)
        walk(page.blocks, "Extension: " + pageTitle, true);
      else walk([page], pageTitle, false);
    });
    return out;
  }
  /* { got, max } for one task. Marked the same way as markQuestion() in the
     console and computeAssessment() in the lesson page, so a total here
     never disagrees with a mark shown anywhere else. */
  function scoreTask(b, v){
    if (b.type === "quiz"){
      const n = (b.questions || []).length;
      const got = (v && Array.isArray(v.solved)) ? v.solved.filter(Boolean).length : 0;
      return { got: got, max: n };
    }
    if (b.type === "mc") return { got: (v !== null && v !== undefined && v === b.answer) ? 1 : 0, max: 1 };
    if (b.type === "order"){
      const ok = Array.isArray(v) && Array.isArray(b.items) && v.length === b.items.length &&
                 v.every((x, i) => x === i);
      return { got: ok ? 1 : 0, max: 1 };
    }
    if (b.type === "blanks"){
      const accepted = [];
      String(b.text || "").replace(/\[\[(.*?)\]\]/g, (_, g) => { accepted.push(g.split("|")); return ""; });
      let got = 0;
      accepted.forEach((set, i) => {
        const given = (v && v[i]) ? String(v[i]) : "";
        if (set.map(normAns).includes(normAns(given))) got++;
      });
      return { got: got, max: accepted.length };
    }
    if (b.type === "short")
      return { got: (window.shortAnswer && window.shortAnswer.mark(b, v).ok) ? 1 : 0, max: 1 };
    /* a checklist: every line counts once, whether a run ticked it or a
       teacher did, the same as the checklist's own "done of counted" score */
    let got = 0;
    b.checks.forEach((c, i) => { if (checkDone(c, i, v)) got++; });
    return { got: got, max: b.checks.length };
  }
  /* One checklist line: a teacher's tick for a line only a teacher can
     judge, a run's tick for the rest. On its own as well as inside the
     total, because the marking bank asks it line by line. */
  function checkDone(c, i, v){
    const flags = (v && Array.isArray(v.checks)) ? v.checks : [];
    const manual = (v && v.manual && typeof v.manual === "object") ? v.manual : {};
    return !!(c && c.manual ? manual[i] === true : flags[i]);
  }
  /* Checklist lines a teacher ticked while marking, laid over a student's
     own work. They are saved in the feedback rather than in the work, which
     is the student's, and are kept by task as the whole of what the teacher
     left ticked: `teacher` for lines the code did not tick, `manual` for the
     lines only a teacher judges. A line ticked by a teacher in the lesson and
     taken back in marking goes back to not done. Every total on the site
     reads checkDone, so laying these over the data first is all it takes for
     the marks, the Progress tab and the Strength and Target to agree. */
  function withMarkingTicks(data, feedback){
    let f = feedback;
    if (typeof f === "string"){ try{ f = JSON.parse(f); }catch(e){ f = null; } }
    const ticks = f && f.ticks;
    if (!ticks || typeof ticks !== "object") return data;
    const out = Object.assign({}, data || {});
    Object.keys(ticks).forEach(id => {
      const t = ticks[id];
      if (!t || typeof t !== "object") return;
      const v = Object.assign({}, (out[id] && typeof out[id] === "object") ? out[id] : {});
      const checks = Array.isArray(v.checks) ? v.checks.slice() : [];
      if (t.teacher && typeof t.teacher === "object"){
        Object.keys(v.teacher || {}).forEach(i => { if (!t.teacher[i]) checks[+i] = false; });
        Object.keys(t.teacher).forEach(i => { if (t.teacher[i]) checks[+i] = true; });
        v.teacher = Object.assign({}, t.teacher);
      }
      if (t.manual && typeof t.manual === "object") v.manual = Object.assign({}, t.manual);
      for (let i = 0; i < checks.length; i++) checks[i] = !!checks[i];
      v.checks = checks;
      out[id] = v;
    });
    return out;
  }
  function attempted(data, id){
    if (!data) return false;
    const v = data[id];
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.some(x => x !== null && x !== undefined && x !== "");
    if (typeof v === "object") return Object.keys(v).length > 0;
    if (typeof v === "boolean") return v;
    return true;
  }
  /* The pages this class cannot reach yet, so nothing sums a mark against a
     task nobody could have attempted. The same heuristic work.html's own
     Progress tab uses when a lesson has no release row of its own: lock
     everything after the first page that is not pure text or a picture. */
  /* Which kinds of lesson have pages that lock. A practical assessment is
     sat a page at a time, so it does. A marked assessment has questions, not
     pages, and they stay open. Home learning never locks: there is nobody at
     home to open the next page. lesson.html keeps its own copy of this. */
  function pagesLock(lesson){
    return !!lesson && !lesson.homework && (!lesson.assessment || !!lesson.practical);
  }
  function defaultLocks(lesson){
    const out = new Set();
    if (!pagesLock(lesson)) return out;
    const b = lesson.blocks || [];
    /* An assessment's Finish hands it in and is never held up, so it has no
       summary to lock and no guessing: only what the builder said. */
    if (lesson.assessment){
      b.forEach((x, i) => { if (x.startLocked) out.add(i); });
      return out;
    }
    out.add(b.length);          // the summary page
    const said = b.some(x => x.startLocked !== undefined);
    if (said){ b.forEach((x, i) => { if (x.startLocked) out.add(i); }); return out; }
    let firstDo = -1;
    for (let i = 0; i < b.length; i++){
      const t = b[i].type;
      if (t !== "text" && t !== "picture"){ firstDo = i; break; }
    }
    if (firstDo === -1) return out;
    for (let i = firstDo + 1; i < b.length; i++) out.add(i);
    return out;
  }
  /* Which pages are actually locked for this class, straight from the
     server: the explicit locks a teacher has set, or the default heuristic
     above when nothing has been set yet. Shared so a lesson's mark never
     counts a page here that its own Progress tab would have left out. */
  async function fetchLockedPages(api, lessonId, group, lesson){
    if (!pagesLock(lesson)) return new Set();
    try{
      const r = await fetch(api + "/api/release?lesson=" + encodeURIComponent(lessonId) +
        "&group=" + encodeURIComponent(group) + "&t=" + Date.now(), { cache: "no-store" });
      const d = await r.json();
      if (d.managed === false) return defaultLocks(lesson);
      if (Array.isArray(d.locks)) return new Set(d.locks);
      if (typeof d.released === "number"){
        const s = new Set();
        for (let i = d.released; i < ((lesson && lesson.blocks) || []).length; i++) s.add(i);
        return s;
      }
      return new Set();
    }catch(e){ return new Set(); }
  }
  /* One roster's marks against one lesson, in one go: {gotSum, maxSum, pct,
     byUsername:{username:{got,max}}, byLabel:{label:{got,max}}}. lockedPages,
     when given, leaves out any task on a page this class cannot reach yet,
     the same as work.html's own Progress tab does. Used wherever a whole
     class's mark on a whole lesson is wanted rather than a task at a time. */
  function markRoster(lessonJson, roster, rows, lockedPages){
    const all = quantifiableTasks(lessonJson);
    const tasks = lockedPages ? all.filter(t => !lockedPages.has(t.pageIndex)) : all;
    const byUsername = {}, byLabel = {};
    let gotSum = 0, maxSum = 0;
    (roster || []).forEach(st => {
      const row = (rows || []).find(r => r.username === st.username) || null;
      /* with any lines a teacher ticked while marking, which live in the feedback */
      const data = row ? withMarkingTicks(row.data, row.feedback) : null;
      let got = 0, max = 0;
      tasks.forEach(t => {
        const sc = scoreTask(t.block, data ? data[t.id] : undefined);
        got += sc.got; max += sc.max;
        const b = byLabel[t.label] || (byLabel[t.label] = { got:0, max:0 });
        b.got += sc.got; b.max += sc.max;
      });
      byUsername[st.username] = { got: got, max: max };
      gotSum += got; maxSum += max;
    });
    return { tasks: tasks, gotSum: gotSum, maxSum: maxSum,
             pct: maxSum ? Math.round(100 * gotSum / maxSum) : null,
             byUsername: byUsername, byLabel: byLabel };
  }

  /* ---------- the level a practical's student reached ----------
     A practical built up level by level is coding tasks that each carry on
     from the one before (startFrom names the last one's key). A level is
     reached when every line on its checklist the page can tick itself is
     ticked, and the ones before it are too: the levels open one at a time,
     so a later one done without an earlier one is not a level reached.
     Teacher-checked lines are left out, as they are when the page decides
     whether a level opens, so this never names a level the student could
     not see they had reached.

     Comes back null when there is no chain of levels to read, so a practical
     made some other way keeps its own way of being marked. */
  function levelChain(lessonJson){
    const codes = [];
    const walk = (blocks) => (blocks || []).forEach(b => {
      if (!b) return;
      /* Not into an extension: a coding task there carries on from Go for
         Gold, but it is work beyond the levels, not a fifth one. */
      if (b.type === "extension") return;
      if (b.type === "page" || b.type === "group"){ walk(b.blocks); return; }
      if (b.type === "ide" && b.key) codes.push(b);
    });
    walk(lessonJson && lessonJson.blocks);
    let best = [];
    codes.forEach(first => {
      if (first.startFrom && codes.some(c => c.key === first.startFrom)) return;   // not the start of one
      const chain = [first];
      for (;;){
        const last = chain[chain.length - 1];
        const next = codes.find(c => c.startFrom === last.key && chain.indexOf(c) < 0);
        if (!next) break;
        chain.push(next);
      }
      if (chain.length > best.length) best = chain;
    });
    return best.length > 1 ? best : null;
  }
  /* "Level 2: Level Up" is called Level Up; anything else by its title. */
  function levelName(block, n){
    const title = plainText(block && block.title || "");
    const m = /^(?:level|step|stage|part)\s*\d+\s*[:.\-–]\s*(.+)$/i.exec(title);
    return m ? m[1].trim() : (title || "Level " + n);
  }
  function levelReached(lessonJson, data){
    const chain = levelChain(lessonJson);
    if (!chain) return null;
    let at = -1;
    for (let k = 0; k < chain.length; k++){
      const b = chain[k];
      const own = (b.checks || []).filter(c => !(c && c.manual));
      const v = data ? data[b.id] : null;
      const all = own.length > 0 && (b.checks || []).every((c, i) => (c && c.manual) || checkDone(c, i, v));
      if (!all) break;
      at = k;
    }
    const named = (k) => k < 0 || k >= chain.length ? null
      : { number: k + 1, name: levelName(chain[k], k + 1),
          label: "Level " + (k + 1) + " - " + levelName(chain[k], k + 1) };
    return { at: at, total: chain.length, reached: named(at), next: named(at + 1) };
  }

  /* A practical's levels by name, lowest first. The coding tasks' own chain
     where there is one, since that is the order they open in; otherwise the
     rubric, which the builder asks to be written best first. Empty when
     there are no levels at all. */
  function levelLadder(lessonJson){
    const chain = levelChain(lessonJson);
    if (chain) return chain.map((b, k) => levelName(b, k + 1));
    return ((lessonJson && lessonJson.rubric) || [])
      .map(g => String((g && g.name) || "").trim()).filter(Boolean).reverse();
  }

  window.progressMath = { TASK_LABEL, plainText, normAns, taskInfo,
                          quantifiableTasks, scoreTask, checkDone, attempted, withMarkingTicks,
                          pagesLock, defaultLocks, fetchLockedPages, markRoster,
                          levelChain, levelName, levelReached, levelLadder };
})();
