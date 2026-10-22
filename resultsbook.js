/* Results, in the teacher console: every marked assessment and practical in
   a unit, for whichever classes are picked, with a grade beside every mark.

   A mark becomes a grade against the whole year group, not the classes on
   screen: a set that did well should not have its grades pulled down by
   being compared only with itself. So the grade boundaries are worked out
   from every result the assessment has, and they are shared: one teacher
   saving them is what every other teacher then sees, with their name and
   when beside them.

   The first time an assessment is opened the boundaries are worked out to
   give the split saved under '__split' (15% / 40% / 30% / 15% to start
   with). That can fail, most often because a short test leaves half the
   year on the same mark, and then the page says so and leaves the marks
   for the teacher to set by hand.

   A rubric practical has no mark to grade. Its grade is the range written
   against the level the student reached, which Mark work saves and nothing
   a student sees reads.

   The table is drawn with the markbook's own pieces from markbook.js, so
   cells pick, copy and sort the same way as on every other markbook. */
(function(){
  const BANDS = ["1-3", "4-5", "6-7", "8-9"];
  const CUT_KEYS = ["4-5", "6-7", "8-9"];
  const START_SPLIT = [15, 40, 30, 15];
  /* Below this many results a split is guesswork: ten students cannot be
     cut into fifteen percents. */
  const FEWEST = 10;
  /* How far any grade may land from the share it was aimed at before the
     working out is called a failure. Ten points is three students in a
     class of thirty. */
  const CLOSE_ENOUGH = 10;

  let ctx = null;
  let pick = { mine: true, years: [], classes: [], unit: "", lessons: [] };
  let book = null;                // { rows, students, boundaries } for bookKey
  let bookKey = "", fetching = "";
  const lessonJson = {};          // id -> the lesson, for a practical's rubric
  /* What each marked assessment's boundaries stand at on this screen:
     cuts is the lowest mark for 4-5, 6-7 and 8-9. saved is what the database
     holds, so the page can tell an edit from what is there. */
  const bounds = {};
  let split = START_SPLIT.slice(), splitSaved = START_SPLIT.slice(), splitBy = "", splitAt = "";
  let sort = { key: "username", dir: 1 };
  let fetchTimer = null;

  function el(tag, cls, text){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const $ = (id) => document.getElementById(id);
  const low = (s) => String(s || "").toLowerCase();
  function when(at){
    if (!at) return "";
    const d = new Date(String(at).replace(" ", "T") + "Z");
    if (isNaN(d)) return at;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  /* ---------- what there is to choose from ---------- */
  const cat = () => ctx.catalogue() || {};
  const yearNames = () => (cat().years || []).map(y => y.name);
  function lessonsIn(unit){
    return (cat().lessons || []).filter(l => l.unit === unit);
  }
  /* The originals only. A version is graded with its original, so the
     year group is everybody who sat any version of it. */
  function assessmentsOf(unit){
    const list = lessonsIn(unit).filter(l => Number(l.assessment) && !l.version_of);
    list.sort((a, b) => (a.position || 0) - (b.position || 0));
    return list;
  }
  function familyOf(id){
    return [id].concat((cat().lessons || []).filter(l => l.version_of === id).map(l => l.lesson_id));
  }
  function unitsOfYears(){
    return (cat().units || []).filter(u => pick.years.includes(u.year || "") && assessmentsOf(u.name).length);
  }
  /* A class has no year group of its own: it belongs to whichever year
     group's lessons it has been given. The same idea the console's
     yearOfClass uses, across every year picked. */
  function classesOfYears(){
    const units = new Set((cat().units || []).filter(u => pick.years.includes(u.year || "")).map(u => u.name));
    const ids = new Set((cat().lessons || []).filter(l => units.has(l.unit)).map(l => l.lesson_id));
    const known = new Map(ctx.allClasses().map(g => [low(g.name), g.name]));
    const seen = new Map();
    (cat().assignments || []).forEach(a => {
      if (!ids.has(a.lesson_id)) return;
      const k = low(a.group_name);
      if (k && !seen.has(k)) seen.set(k, known.get(k) || a.group_name);
    });
    let names = Array.from(seen.values());
    if (pick.mine && ctx.me()) names = ctx.myClasses(names.map(n => ({ name: n }))).map(g => g.name);
    return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  const titleOf = (id) => {
    const l = (cat().lessons || []).find(x => x.lesson_id === id);
    return (l && (l.title || ctx.titleOf(id))) || id;
  };
  function kindOf(id){
    const l = (cat().lessons || []).find(x => x.lesson_id === id) || {};
    if (!l.practical) return "test";
    const json = lessonJson[id];
    return json && window.progressMath.rubricRun(json) ? "rubric" : "score";
  }

  /* ---------- turning marks into grades ---------- */
  function bandOfMark(mark, cuts){
    if (mark >= cuts[2]) return 3;
    if (mark >= cuts[1]) return 2;
    if (mark >= cuts[0]) return 1;
    return 0;
  }
  /* A rubric's range is free text: "4-5" in one school, "Grade 4 to 5" in
     the next. The numbers in it are what count; the middle of them decides
     which of the four it sits in. A range with no number in it has no band,
     and is shown but left out of the combined grade. */
  function bandOfRange(text){
    const nums = (String(text || "").match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 9);
    if (!nums.length) return -1;
    const mid = nums.reduce((x, y) => x + y, 0) / nums.length;
    return mid <= 3 ? 0 : mid <= 5 ? 1 : mid <= 7 ? 2 : 3;
  }
  /* What the assessment is out of: the total most of the original's
     results were marked out of, since a lesson edited after some sat it
     can have both. */
  function outOfFor(id){
    const counts = {};
    const mine = (book ? book.rows : []).filter(r => r.lesson_id === id && r.out_of > 0);
    const any = mine.length ? mine : (book ? book.rows : []).filter(r => familyOf(id).includes(r.lesson_id) && r.out_of > 0);
    any.forEach(r => { counts[r.out_of] = (counts[r.out_of] || 0) + 1; });
    let best = 0, n = -1;
    Object.keys(counts).forEach(k => { if (counts[k] > n){ n = counts[k]; best = Number(k); } });
    const json = lessonJson[id];
    return best || (json && json.outOf) || 0;
  }
  /* A version marked out of a different total is put on the original's
     scale, so one set of boundaries grades both. */
  const scaled = (r, outOf) => r.out_of > 0 && r.out_of !== outOf ? r.score * outOf / r.out_of : r.score;
  function yearMarks(id){
    const fam = familyOf(id), outOf = outOfFor(id);
    return (book ? book.rows : []).filter(r => fam.includes(r.lesson_id) && r.out_of > 0)
                                  .map(r => scaled(r, outOf));
  }
  function sharesFor(marks, cuts){
    const n = [0, 0, 0, 0];
    marks.forEach(m => n[bandOfMark(m, cuts)]++);
    return n.map(c => marks.length ? 100 * c / marks.length : 0);
  }
  /* The lowest mark for each grade that puts the share of the year group
     below it nearest to where the split says. Each one is looked for above
     the last, so every grade is at least a mark wide and 8-9 can still be
     reached. Says whether it came out close enough, and why not if not. */
  function workOut(id){
    const marks = yearMarks(id), outOf = outOfFor(id);
    const aim = [split[0], split[0] + split[1], split[0] + split[1] + split[2]];
    const evenly = () => {
      const cuts = [];
      aim.forEach((t, i) => cuts.push(Math.min(outOf - 2 + i, Math.max(i ? cuts[i - 1] + 1 : 1, Math.round(outOf * t / 100)))));
      return cuts;
    };
    if (outOf < 3)
      return { ok: false, cuts: [1, 2, 3], why: "This is marked out of fewer than 3, so there are not enough marks to share four grades between." };
    if (marks.length < FEWEST)
      return { ok: false, cuts: evenly(),
               why: (marks.length === 1 ? "Only 1 student has" : "Only " + marks.length + " students have") +
                    " a mark so far, which is too few to split. These marks are shared out evenly across the " +
                    outOf + " instead. Change them below, or calculate again once more have sat it." };
    const below = (m) => 100 * marks.filter(x => x < m).length / marks.length;
    const cuts = [];
    aim.forEach((t, i) => {
      const from = i ? cuts[i - 1] + 1 : 1, to = outOf - 2 + i;
      let best = from, gap = Infinity;
      for (let m = from; m <= to; m++){
        const g = Math.abs(below(m) - t);
        if (g < gap){ gap = g; best = m; }
      }
      cuts.push(best);
    });
    const got = sharesFor(marks, cuts);
    const worst = Math.max.apply(null, got.map((p, i) => Math.abs(p - split[i])));
    if (worst > CLOSE_ENOUGH)
      return { ok: false, cuts: cuts,
               why: "The grades could not be split the way you asked, because too many students have the same mark. " +
                    "The closest it gets is " + got.map((p, i) => BANDS[i] + ": " + Math.round(p) + "%").join(", ") +
                    ". Change the marks below to find a balance you are happy with." };
    return { ok: true, cuts: cuts, why: "" };
  }

  /* Where an assessment's boundaries stand: saved ones if there are any,
     worked out if not. A teacher's edits on this screen are kept across a
     refresh of the results, because they have not been saved anywhere else. */
  function settle(id){
    const saved = (book.boundaries || []).find(b => b.lesson_id === id);
    let savedCuts = null;
    if (saved){
      try{
        const m = JSON.parse(saved.marks || "{}");
        const c = CUT_KEYS.map(k => parseInt(m[k], 10));
        if (c.every(n => !isNaN(n))) savedCuts = c;
      }catch(e){ savedCuts = null; }
    }
    const was = bounds[id];
    const b = { cuts: null, saved: savedCuts, savedOutOf: saved ? saved.out_of : 0,
                by: saved ? saved.updated_by : "", at: saved ? saved.updated_at : "",
                auto: null, msg: "" };
    if (was && was.edited){ b.cuts = was.cuts.slice(); b.edited = true; b.auto = was.auto; }
    else if (savedCuts) b.cuts = savedCuts.slice();
    else { b.auto = workOut(id); b.cuts = b.auto.cuts.slice(); }
    bounds[id] = b;
  }
  const unsaved = (b) => !b.saved || b.cuts.some((c, i) => c !== b.saved[i]);
  const cutsProblem = (cuts, outOf) =>
    cuts.some(n => !Number.isInteger(n) || n < 1 || n > outOf) || !(cuts[0] < cuts[1] && cuts[1] < cuts[2])
      ? "Each grade needs more marks than the one below it, between 1 and " + outOf + "." : "";

  /* ---------- the page ---------- */
  function open(context){
    ctx = context;
    try{ Object.assign(pick, JSON.parse(sessionStorage.getItem("hub_results") || "{}")); }catch(e){}
    if (!ctx.me()) pick.mine = false;
    tidyPick();
    paintFilters();
    refresh(false);
  }
  function remember(){
    try{ sessionStorage.setItem("hub_results", JSON.stringify(pick)); }catch(e){}
  }
  /* Drops anything picked that is no longer on offer, after a filter above
     it changed: a class from a year group taken off, a unit that has gone. */
  function tidyPick(){
    const years = yearNames();
    pick.years = pick.years.filter(y => years.includes(y));
    const classes = classesOfYears().map(low);
    pick.classes = pick.classes.filter(c => classes.includes(low(c)));
    const units = unitsOfYears().map(u => u.name);
    if (!units.includes(pick.unit)) pick.unit = units.length === 1 ? units[0] : "";
    const ids = pick.unit ? assessmentsOf(pick.unit).map(l => l.lesson_id) : [];
    pick.lessons = pick.lessons.filter(id => ids.includes(id));
    if (!pick.lessons.length) pick.lessons = ids.slice();
    remember();
  }
  /* A row of pills to pick any number from, with All in front. */
  function pills(label, names, chosen, onChange, empty){
    const row = el("div", "resfilter");
    row.appendChild(el("span", "resfilter-label", label));
    const box = el("div", "respills");
    if (!names.length){ box.appendChild(el("span", "hint resfilter-none", empty)); row.appendChild(box); return row; }
    const all = names.every(n => chosen.some(c => low(c) === low(n.value)));
    const allBtn = el("button", "respill" + (all ? " on" : ""), "All");
    allBtn.type = "button";
    allBtn.setAttribute("aria-pressed", String(all));
    allBtn.addEventListener("click", () => onChange(all ? [] : names.map(n => n.value)));
    box.appendChild(allBtn);
    names.forEach(n => {
      const on = chosen.some(c => low(c) === low(n.value));
      const b = el("button", "respill" + (on ? " on" : ""), n.label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", () => onChange(on ? chosen.filter(c => low(c) !== low(n.value)) : chosen.concat([n.value])));
      box.appendChild(b);
    });
    row.appendChild(box);
    return row;
  }
  function paintFilters(){
    const box = $("resFilters");
    box.innerHTML = "";
    const changed = () => { tidyPick(); paintFilters(); refresh(false); };
    /* Only a teacher has classes of their own. Under All (Admin) every
       class is theirs and the choice would change nothing. */
    if (ctx.me()){
      const row = el("div", "resfilter");
      row.appendChild(el("span", "resfilter-label", "Show"));
      const tabs = el("div", "subtabs restabs");
      [[true, "Students I teach"], [false, "All students"]].forEach(([v, text]) => {
        const b = el("button", pick.mine === v ? "on" : "", text);
        b.type = "button";
        b.addEventListener("click", () => { if (pick.mine === v) return; pick.mine = v; changed(); });
        tabs.appendChild(b);
      });
      row.appendChild(tabs);
      box.appendChild(row);
    }
    box.appendChild(pills("Year groups", yearNames().map(y => ({ value: y, label: y })), pick.years,
      (v) => { pick.years = v; changed(); }, "There are no year groups yet."));
    if (pick.years.length){
      box.appendChild(pills("Classes", classesOfYears().map(c => ({ value: c, label: c })), pick.classes,
        (v) => { pick.classes = v; changed(); },
        pick.mine && ctx.me() ? "None of your classes has been given a lesson in these year groups."
                              : "No class has been given a lesson in these year groups yet."));
      const units = unitsOfYears();
      const row = el("div", "resfilter");
      row.appendChild(el("span", "resfilter-label", "Unit"));
      if (!units.length) row.appendChild(el("span", "hint resfilter-none", "No unit in these year groups has an assessment."));
      else {
        const sel = el("select", "sel resunit");
        sel.setAttribute("aria-label", "Unit");
        if (!pick.unit){ const o = el("option", "", "Choose a unit"); o.value = ""; sel.appendChild(o); }
        units.forEach(u => {
          const o = el("option", "", (pick.years.length > 1 && u.year ? u.year + " · " : "") + u.name);
          o.value = u.name;
          sel.appendChild(o);
        });
        sel.value = pick.unit;
        sel.addEventListener("change", () => { pick.unit = sel.value; pick.lessons = []; changed(); });
        row.appendChild(sel);
      }
      box.appendChild(row);
      /* Only worth a row when there is a choice to make. */
      const list = pick.unit ? assessmentsOf(pick.unit) : [];
      if (list.length > 1)
        box.appendChild(pills("Assessments", list.map(l => ({ value: l.lesson_id, label: titleOf(l.lesson_id) })), pick.lessons,
          (v) => { pick.lessons = v; changed(); }, ""));
    }
  }

  /* Asked for once the picking has settled, so pressing four class pills
     in a row is one request and not four. */
  function refresh(force){
    clearTimeout(fetchTimer);
    const body = $("resBody");
    if (!pick.years.length){ body.innerHTML = ""; body.appendChild(el("p", "hint", "Choose a year group to begin.")); return; }
    if (!pick.unit){ body.innerHTML = ""; body.appendChild(el("p", "hint", "Choose a unit to see its assessments.")); return; }
    if (!pick.lessons.length){ body.innerHTML = ""; body.appendChild(el("p", "hint", "Choose at least one assessment.")); return; }
    const ids = [];
    pick.lessons.forEach(id => familyOf(id).forEach(x => ids.push(x)));
    const key = JSON.stringify([ids, pick.classes.map(low).sort()]);
    if (!force && book && key === bookKey){ paintBody(); return; }
    fetchTimer = setTimeout(() => load(ids, key), force ? 0 : 250);
  }
  async function load(ids, key){
    fetching = key;
    const body = $("resBody");
    body.innerHTML = "";
    body.appendChild(ctx.waiting("Adding up the results", true));
    try{
      /* A practical's rubric says what range each level stands for, and
         whether it is marked against one at all, so those are fetched with
         the results rather than after them. */
      const need = pick.lessons.filter(id => !lessonJson[id] && (cat().lessons || []).some(l => l.lesson_id === id && l.practical));
      const [reply] = await Promise.all([
        fetch(ctx.api() + "/api/teacher/results-book?lessons=" + encodeURIComponent(JSON.stringify(ids)) +
              "&groups=" + encodeURIComponent(JSON.stringify(pick.classes)), { headers: ctx.headers(), cache: "no-store" })
          .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "The server did not answer."); return d; }),
        Promise.all(need.map(id => ctx.fetchLesson(id).then(j => { lessonJson[id] = j; }).catch(() => {})))
      ]);
      if (fetching !== key) return;          // something newer was asked for while this was coming
      book = { rows: reply.rows || [], students: reply.students || [], boundaries: reply.boundaries || [] };
      bookKey = key;
      const s = book.boundaries.find(b => b.lesson_id === "__split");
      if (s){
        try{
          const v = JSON.parse(s.split || "[]");
          if (Array.isArray(v) && v.length === 4){
            /* an edit to the split here that has not been saved is kept */
            if (split.every((n, i) => n === splitSaved[i])) split = v.slice();
            splitSaved = v.slice();
          }
        }catch(e){}
        splitBy = s.updated_by || ""; splitAt = s.updated_at || "";
      }
      pick.lessons.forEach(id => { if (kindOf(id) !== "rubric") settle(id); });
      paintBody();
    }catch(e){
      if (fetching !== key) return;
      body.innerHTML = "";
      body.appendChild(el("p", "hint", "The results could not be loaded (" + e.message + "). Press refresh to try again."));
    }
  }

  function paintBody(){
    const body = $("resBody");
    body.innerHTML = "";
    const graded = pick.lessons.filter(id => kindOf(id) !== "rubric");
    if (graded.length){
      const sec = el("section", "resbounds");
      const head = el("div", "resbounds-head");
      head.appendChild(el("h3", "", "Grade boundaries"));
      head.appendChild(el("p", "hint", "Worked out from every student in the year group who has sat it, not only the classes picked. Change a mark and the grades update straight away."));
      sec.appendChild(head);
      const grid = el("div", "resbound-grid");
      graded.forEach(id => grid.appendChild(boundCard(id)));
      grid.appendChild(splitCard());
      sec.appendChild(grid);
      body.appendChild(sec);
    }
    const holder = el("div", "resbook");
    holder.id = "mbHolder";        // where markbook.js looks for a table to copy from
    body.appendChild(holder);
    paintTable();
  }

  /* One marked assessment's boundaries: the three marks, how the year
     group falls into the four grades with them, and who saved them. */
  function boundCard(id){
    const b = bounds[id], outOf = outOfFor(id);
    const card = el("div", "resbound");
    card.appendChild(el("b", "resbound-title", titleOf(id)));
    const n = yearMarks(id).length;
    card.appendChild(el("span", "resbound-sub", "Out of " + outOf + " · " +
      (n === 1 ? "1 student" : n + " students") + " in the year group have a mark"));
    const status = el("p", "resbound-status");
    const warn = el("p", "warnline resbound-warn");
    const fields = el("div", "resbound-marks");
    const inputs = [];
    /* Top grade first, the same way up as the chart under it. */
    [2, 1, 0].forEach(i => {
      const row = el("label", "resbound-row");
      row.appendChild(el("span", "resbound-band", "Grade " + CUT_KEYS[i]));
      const inp = el("input", "resbound-in");
      inp.type = "number"; inp.min = "1"; inp.max = String(outOf); inp.step = "1";
      inp.inputMode = "numeric";
      inp.value = String(b.cuts[i]);
      inp.setAttribute("aria-label", "Lowest mark for grade " + CUT_KEYS[i]);
      inp.addEventListener("input", () => {
        const v = parseInt(inp.value, 10);
        if (isNaN(v)) return;
        b.cuts[i] = v; b.edited = true;
        paintCard();
        paintTable();
      });
      inputs[i] = inp;
      row.appendChild(inp);
      row.appendChild(el("span", "resbound-unit", "marks or more"));
      fields.appendChild(row);
    });
    const below = el("p", "resbound-floor");
    const chart = el("div", "reschart");
    const tools = el("div", "resbound-tools");
    const save = el("button", "btn-primary bmini2", "Save marks");
    save.type = "button";
    const again = el("button", "btn-ghost bmini2", "Calculate again");
    again.type = "button";
    tools.appendChild(save); tools.appendChild(again);
    card.appendChild(status); card.appendChild(warn); card.appendChild(fields);
    card.appendChild(below); card.appendChild(chart); card.appendChild(tools);

    function paintCard(){
      const problem = cutsProblem(b.cuts, outOf);
      /* Kept up while the marks are being changed by hand, since that is
         exactly when the teacher needs to know what the split got wrong,
         and taken down once what they settled on is saved. */
      const showWhy = b.auto && !b.auto.ok && unsaved(b);
      warn.hidden = !problem && !showWhy && !b.msg;
      warn.textContent = problem || b.msg || (showWhy ? b.auto.why : "");
      warn.classList.toggle("bad", !!problem);
      status.innerHTML = "";
      if (b.saved){
        status.appendChild(document.createTextNode("Last saved by "));
        status.appendChild(el("b", "", b.by || "a teacher"));
        status.appendChild(document.createTextNode(" on " + when(b.at) + "."));
        if (unsaved(b)) status.appendChild(document.createTextNode(" You have changed them since."));
        if (b.savedOutOf && b.savedOutOf !== outOf)
          status.appendChild(document.createTextNode(" They were saved when it was out of " + b.savedOutOf + "."));
      } else {
        status.textContent = b.auto && b.auto.ok && !b.edited
          ? "Worked out from the results. Not saved yet, so other teachers do not see these until you save them."
          : "Not saved yet.";
      }
      below.textContent = "Below " + b.cuts[0] + " is grade 1-3.";
      save.disabled = !!problem || !unsaved(b);
      paintChart(chart, sharesFor(yearMarks(id), b.cuts), n);
    }
    save.addEventListener("click", async () => {
      save.disabled = true; save.textContent = "Saving";
      try{
        const r = await fetch(ctx.api() + "/api/teacher/grade-boundaries", {
          method: "POST", headers: ctx.jsonHeaders(),
          body: JSON.stringify({ lesson: id, outOf: outOf, by: ctx.who(),
                                 marks: { "4-5": b.cuts[0], "6-7": b.cuts[1], "8-9": b.cuts[2] } }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "The server did not answer.");
        b.saved = b.cuts.slice(); b.savedOutOf = outOf; b.by = d.updated_by; b.at = d.updated_at;
        b.edited = false; b.msg = "";
        /* the copy of the results in hand says so too, or the next repaint
           would put the old ones back */
        book.boundaries = book.boundaries.filter(x => x.lesson_id !== id).concat([{ lesson_id: id,
          marks: JSON.stringify(d.marks), out_of: outOf, updated_by: d.updated_by, updated_at: d.updated_at }]);
      }catch(e){
        b.msg = "Those marks were not saved (" + e.message + "). Try again.";
      }
      save.textContent = "Save marks";
      paintCard();
    });
    /* Calculating again throws away whatever is in the boxes, which may be
       somebody's careful afternoon, so it asks first. */
    again.addEventListener("click", () => {
      ctx.openModal(box => {
        box.appendChild(el("h2", "", "Calculate again?"));
        box.appendChild(el("p", "modal-text",
          "The marks for " + titleOf(id) + " will be worked out again from the results, using the split of " +
          split.map((p, i) => BANDS[i] + " " + p + "%").join(", ") + ". " +
          (b.saved ? "This may override changes made by hand, including ones another teacher saved. Nothing is saved until you press Save marks."
                   : "This may override any changes you have made by hand.")));
        const go = el("button", "btn-primary modal-cta", "Calculate again");
        go.addEventListener("click", () => {
          b.auto = workOut(id);
          b.cuts = b.auto.cuts.slice();
          b.edited = false; b.msg = "";
          ctx.closeModal();
          inputs.forEach((inp, i) => { inp.value = String(b.cuts[i]); });
          paintCard();
          paintTable();
        });
        const keep = el("button", "btn-ghost modal-stay", "Keep these marks");
        keep.addEventListener("click", () => ctx.closeModal());
        box.appendChild(go); box.appendChild(keep);
      });
    });
    paintCard();
    return card;
  }
  /* How the year group falls into the four grades, best first, with the
     share each was aimed at marked on its bar. */
  function paintChart(box, shares, n){
    box.innerHTML = "";
    [3, 2, 1, 0].forEach(i => {
      const row = el("div", "reschart-row");
      row.appendChild(el("span", "reschart-band", BANDS[i]));
      const bar = el("span", "reschart-bar");
      const fill = el("span", "reschart-fill");
      fill.style.width = Math.round(shares[i]) + "%";
      bar.appendChild(fill);
      const aim = el("span", "reschart-aim");
      aim.style.left = split[i] + "%";
      aim.title = "Aiming for " + split[i] + "%";
      bar.appendChild(aim);
      row.appendChild(bar);
      row.appendChild(el("span", "reschart-pct", n ? Math.round(shares[i]) + "%" : ""));
      box.appendChild(row);
    });
    box.appendChild(el("span", "reschart-key", "The line on each bar is the share it is aiming for."));
  }

  /* The split every assessment is worked out to give. Saved for the whole
     school, and used the next time anybody presses Calculate again. */
  function splitCard(){
    const card = el("div", "resbound ressplit");
    card.appendChild(el("b", "resbound-title", "How the year group is split"));
    card.appendChild(el("span", "resbound-sub", "The share of students each grade is aimed at when marks are calculated"));
    const fields = el("div", "resbound-marks");
    const total = el("p", "resbound-floor");
    const status = el("p", "resbound-status");
    const save = el("button", "btn-primary bmini2", "Save split");
    save.type = "button";
    [3, 2, 1, 0].forEach(i => {
      const row = el("label", "resbound-row");
      row.appendChild(el("span", "resbound-band", "Grade " + BANDS[i]));
      const inp = el("input", "resbound-in");
      inp.type = "number"; inp.min = "0"; inp.max = "100"; inp.step = "1";
      inp.inputMode = "numeric";
      inp.value = String(split[i]);
      inp.setAttribute("aria-label", "Share of the year group for grade " + BANDS[i]);
      inp.addEventListener("input", () => {
        const v = parseInt(inp.value, 10);
        split[i] = isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
        paint();
        /* The aim line on every chart moves with it. The bars are drawn
           best first, so the first line belongs to 8-9. */
        document.querySelectorAll(".resbound:not(.ressplit) .reschart").forEach(chart => {
          chart.querySelectorAll(".reschart-aim").forEach((line, k) => {
            line.style.left = split[3 - k] + "%"; line.title = "Aiming for " + split[3 - k] + "%";
          });
        });
      });
      row.appendChild(inp);
      row.appendChild(el("span", "resbound-unit", "%"));
      fields.appendChild(row);
    });
    function paint(){
      const sum = split.reduce((x, y) => x + y, 0);
      total.textContent = sum === 100 ? "Adds up to 100%." : "Adds up to " + sum + "%. It needs to be 100%.";
      total.classList.toggle("bad", sum !== 100);
      const changed = split.some((p, i) => p !== splitSaved[i]);
      save.disabled = sum !== 100 || !changed;
      status.innerHTML = "";
      if (splitBy || splitAt){
        status.appendChild(document.createTextNode("Last saved by "));
        status.appendChild(el("b", "", splitBy || "a teacher"));
        status.appendChild(document.createTextNode(" on " + when(splitAt) + "."));
      } else status.textContent = "The starting split. Nobody has changed it yet.";
      if (changed) status.appendChild(document.createTextNode(" Not saved yet."));
    }
    save.addEventListener("click", async () => {
      save.disabled = true; save.textContent = "Saving";
      try{
        const r = await fetch(ctx.api() + "/api/teacher/grade-boundaries", {
          method: "POST", headers: ctx.jsonHeaders(), body: JSON.stringify({ split: split, by: ctx.who() }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "The server did not answer.");
        splitSaved = d.split.slice(); splitBy = d.updated_by; splitAt = d.updated_at;
      }catch(e){
        ctx.say("The split was not saved", e.message);
      }
      save.textContent = "Save split";
      paint();
    });
    card.appendChild(status); card.appendChild(fields); card.appendChild(total);
    const tools = el("div", "resbound-tools");
    tools.appendChild(save);
    card.appendChild(tools);
    card.appendChild(el("p", "subnote", "Saving the split does not change any marks. Press Calculate again on an assessment to use it."));
    paint();
    return card;
  }

  /* ---------- the markbook ---------- */
  /* One row per student in the classes picked, whether or not they have sat
     anything, the same as every markbook: a gap is worth seeing. */
  function tableRows(){
    const byUser = new Map();
    (book.students || []).forEach(st => byUser.set(low(st.username), {
      username: st.username, name: st.display_name || st.username, group: st.group_name, cells: {}, bands: [] }));
    pick.lessons.forEach(id => {
      const fam = familyOf(id), kind = kindOf(id), outOf = outOfFor(id);
      const json = lessonJson[id];
      (book.rows || []).forEach(r => {
        if (!fam.includes(r.lesson_id)) return;
        const row = byUser.get(low(r.username));
        if (!row) return;
        if (kind === "rubric"){
          const level = String(r.grade || "").trim();
          if (!level) return;
          const range = (json && window.progressMath.gradeRange(json, level)) || "";
          const band = bandOfRange(range || level);
          row.cells[id] = { range: range || level, band: band };
        } else {
          if (!(r.out_of > 0)) return;
          const b = bounds[id];
          const band = b && !cutsProblem(b.cuts, outOf) ? bandOfMark(scaled(r, outOf), b.cuts) : -1;
          row.cells[id] = { score: r.score, outOf: r.out_of, pct: r.score / r.out_of, band: band };
        }
      });
    });
    const rows = Array.from(byUser.values());
    /* The combined grade is the average of each grade's place among the
       four, rounded to the nearest: 8-9 and 4-5 make 6-7. A half goes up. */
    rows.forEach(r => {
      const got = pick.lessons.map(id => r.cells[id] ? r.cells[id].band : -1).filter(b => b >= 0);
      r.combined = got.length ? Math.round(got.reduce((x, y) => x + y, 0) / got.length) : -1;
      r.combinedOf = got.length;
    });
    return rows;
  }
  function sortRows(rows){
    const k = sort.key, d = sort.dir;
    const val = (r) => {
      if (k === "username") return low(r.username);
      if (k === "name") return low(r.name);
      if (k === "group") return low(r.group);
      if (k === "combined") return r.combined;
      const id = k.slice(2), c = r.cells[id];
      if (k.indexOf("m:") === 0) return c ? c.pct : -1;
      return c ? c.band : -2;
    };
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y, undefined, { numeric: true }) : x - y;
      return c ? c * d : low(a.username).localeCompare(low(b.username));
    });
  }
  /* The markbook's own column heading: pressed to sort, unless the press
     was the end of picking cells. */
  function headCell(label, key, tip){
    const th = el("th", "mbsort" + (sort.key === key ? " on" : ""));
    th.appendChild(el("span", "", label + (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "")));
    th.dataset.copy = label;
    if (tip) th.title = tip;
    th.addEventListener("click", (e) => {
      if (e.shiftKey || window.markbook.dragged()) return;
      if (sort.key === key) sort.dir = -sort.dir;
      else { sort.key = key; sort.dir = (key === "name" || key === "username" || key === "group") ? 1 : -1; }
      paintTable();
    });
    return th;
  }
  const short = (id) => { const t = titleOf(id); return t.length > 26 ? t.slice(0, 24).trim() + "…" : t; };
  function columns(){
    const cols = [];
    pick.lessons.forEach(id => {
      const kind = kindOf(id);
      if (kind !== "rubric") cols.push({ id: id, what: "mark", label: short(id) + " mark", key: "m:" + id });
      cols.push({ id: id, what: kind === "rubric" ? "range" : "grade", label: short(id) + " grade", key: "g:" + id });
    });
    if (pick.lessons.length > 1) cols.push({ what: "combined", label: "Combined", key: "combined",
      tip: "The average of the grades above, to the nearest grade" });
    return cols;
  }
  function cellText(r, col){
    if (col.what === "combined") return r.combined >= 0 ? BANDS[r.combined] : "";
    const c = r.cells[col.id];
    if (!c) return "";
    if (col.what === "mark") return c.score + " / " + c.outOf;
    if (col.what === "range") return c.range;
    return c.band >= 0 ? BANDS[c.band] : "";
  }
  function paintTable(){
    const holder = $("mbHolder");
    if (!holder || !book) return;
    holder.innerHTML = "";
    if (!pick.classes.length){
      holder.appendChild(el("p", "hint", "Choose one or more classes to see their students' results."));
      return;
    }
    const rows = tableRows();
    sortRows(rows);
    const cols = columns();
    const sat = rows.filter(r => pick.lessons.some(id => r.cells[id])).length;
    const stats = el("div", "mbstats");
    [["Students", String(rows.length)], ["Have a result", sat + " of " + rows.length]].forEach(p => {
      const c = el("div", "mbstat");
      c.appendChild(el("b", "", p[1]));
      c.appendChild(el("span", "", p[0]));
      stats.appendChild(c);
    });
    holder.appendChild(stats);
    const bar = el("div", "mbbar");
    bar.appendChild(el("h3", "resbook-title", "Markbook"));
    const tools = el("div", "mbtools");
    const copyAll = el("button", "btn-ghost bmini2", "Copy all");
    copyAll.type = "button";
    copyAll.title = "Copy the whole table, ready to paste into a spreadsheet";
    copyAll.addEventListener("click", async () => {
      const t = holder.querySelector(".mbtable");
      if (!t) return;
      copyAll.textContent = (await window.markbook.copyTable(t)) ? "Copied" : "Press Ctrl+C";
      setTimeout(() => { copyAll.textContent = "Copy all"; }, 1600);
    });
    const excel = el("button", "btn-ghost bmini2", "Save for Excel");
    excel.type = "button";
    excel.addEventListener("click", () => saveExcel(rows, cols));
    tools.appendChild(copyAll); tools.appendChild(excel);
    bar.appendChild(tools);
    holder.appendChild(bar);

    const table = el("table", "mbtable");
    const head = el("tr");
    head.appendChild(headCell("Username", "username"));
    head.appendChild(headCell("Display name", "name"));
    head.appendChild(headCell("Class", "group"));
    cols.forEach(c => head.appendChild(headCell(c.label, c.key, c.tip || (c.id ? titleOf(c.id) : ""))));
    table.appendChild(head);
    rows.forEach(r => {
      const tr = el("tr");
      tr.appendChild(el("td", "", r.username || ""));
      tr.appendChild(el("td", "", r.name));
      tr.appendChild(el("td", "", r.group || ""));
      cols.forEach(c => {
        const td = el("td", c.what === "combined" ? "rescombined" : "", cellText(r, c));
        /* the mark alone, the same as the markbook: "7 / 10" pasted into
           Excel is text, and "7/10" turns into a date */
        if (c.what === "mark" && r.cells[c.id]) td.dataset.copy = String(r.cells[c.id].score);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    const scroll = el("div", "mbscroll");
    scroll.appendChild(table);
    holder.appendChild(scroll);
    window.markbook.selectable(table);
    if (!rows.length) holder.appendChild(el("p", "hint", "There are no students in these classes yet."));
    holder.appendChild(el("p", "subnote mbhint", "Click a cell, then drag or Shift-click to pick more. Ctrl+C copies them."));
  }
  function saveExcel(rows, cols){
    const head = ["Username", "Display name", "Class"];
    cols.forEach(c => {
      if (c.what === "mark") head.push(titleOf(c.id) + " mark", titleOf(c.id) + " out of");
      else head.push(c.what === "combined" ? "Combined grade" : titleOf(c.id) + " grade");
    });
    const out = [head];
    rows.forEach(r => {
      const row = [r.username || "", r.name, r.group || ""];
      cols.forEach(c => {
        const cell = r.cells[c.id];
        if (c.what === "mark") row.push(cell ? cell.score : "", cell ? cell.outOf : "");
        else row.push(cellText(r, c));
      });
      out.push(row);
    });
    const name = ("Results " + (pick.unit || "")).replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "-") + ".xlsx";
    if (window.saveXlsx) window.saveXlsx(out, "Results", name);
    else ctx.say("Could not build the file", "The spreadsheet builder did not load.");
  }

  window.resultsBook = { open: open, refresh: () => refresh(true) };
})();
