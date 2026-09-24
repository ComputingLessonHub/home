/* The one place that turns a lesson and some saved data into marks.
   work.html's markbook, admin.html's unit-wide progress and the comparison
   stats on both read a lesson exactly this way, so a total on one screen is
   never a second opinion on a total shown on another. Shared rather than
   copied three times over, because this project has already had scores
   quietly disagree between screens once before. */
(function(){
  const TASK_LABEL = { quiz:"Quiz", mc:"Multiple choice", order:"Put in order",
                       blanks:"Fill the gaps", short:"Short answer",
                       ide:"Coding task", web:"Coding task" };
  function plainText(html){ return String(html || "").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(); }
  function normAns(x){ return String(x || "").toLowerCase().trim().replace(/\s+/g," ").replace(/[.,!?;:'"]+$/g,""); }

  function taskInfo(b){
    const label = TASK_LABEL[b.type];
    if (!label) return null;
    if (b.type === "quiz" && !(b.questions || []).length) return null;
    if ((b.type === "ide" || b.type === "web") && !(Array.isArray(b.checks) && b.checks.length)) return null;
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
    const flags = (v && Array.isArray(v.checks)) ? v.checks : [];
    const manual = (v && v.manual && typeof v.manual === "object") ? v.manual : {};
    let got = 0;
    b.checks.forEach((c, i) => { if (c && c.manual ? manual[i] === true : !!flags[i]) got++; });
    return { got: got, max: b.checks.length };
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
  function defaultLocks(lesson){
    const out = new Set();
    if (!lesson || lesson.assessment) return out;
    const b = lesson.blocks || [];
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
      const data = row ? row.data : null;
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

  window.progressMath = { TASK_LABEL, plainText, normAns, taskInfo,
                          quantifiableTasks, scoreTask, attempted,
                          defaultLocks, fetchLockedPages, markRoster };
})();
