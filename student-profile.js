/* =====================================================================
   student-profile.js, one student on a page of their own.

   Opened by clicking a name in a class's student list, by picking a
   student in the Jump to box, or from the Practice screen's search.

     Who          name, username, class and who teaches it, and whether
                  their password is set or a reset is waiting
     Next lesson  when this teacher next has their class, from the
                  timetable, if one has been set up
     Progress     their marks across the latest unit their class has been
                  given, lesson by lesson, beside the class average, with
                  any other unit a pick away

   Classic script loaded after the console's own: cls, assigns, cat and
   the rest are read by name at the time they are used.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof VIEWS === "undefined" || typeof OFFLINE === "undefined" || OFFLINE) return;
  const UI = window.hubUI;
  const ic = (n, s) => UI ? UI.icon(n, s) : "";

  let who = null;           // the student on screen
  let pickedUnit = "";      // "" = the latest one
  let paintNo = 0;

  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const btn = (words, cls2, fn) => { const b = el("button", cls2 || "btn-ghost bmini2", words); b.type = "button"; b.addEventListener("click", fn); return b; };

  /* ---------- which unit is "the latest" ---------- */
  /* The unit of the lesson most recently opened to the class; failing that,
     the last unit on their list. */
  function unitsOf(group){
    const g = String(group).toLowerCase();
    const mine = (cat.lessons || []).filter(l => assigns.some(a => a.lesson_id === l.lesson_id && a.group_name.toLowerCase() === g));
    const names = [];
    mine.forEach(l => { const u = l.unit || ""; if (u && names.indexOf(u) < 0) names.push(u); });
    const order = (cat.units || []).map(u => u.name);
    names.sort((a, b) => (order.indexOf(a) - order.indexOf(b)) || a.localeCompare(b));
    return names;
  }
  function latestUnit(group){
    const g = String(group).toLowerCase();
    const unitOf = (id) => ((cat.lessons || []).find(l => l.lesson_id === id) || {}).unit || "";
    const given = assigns.filter(a => a.group_name.toLowerCase() === g && a.published && unitOf(a.lesson_id));
    const now = new Date().toISOString();
    const opened = given.filter(a => !a.release_at || a.release_at <= now)
                        .sort((a, b) => String(b.release_at || "").localeCompare(String(a.release_at || "")));
    if (opened.length && opened[0].release_at) return unitOf(opened[0].lesson_id);
    const names = unitsOf(group);
    if (opened.length){
      /* nothing dated: the furthest-on unit that has anything open */
      const withOpen = names.filter(n => opened.some(a => unitOf(a.lesson_id) === n));
      return withOpen[withOpen.length - 1] || names[names.length - 1] || "";
    }
    return names[names.length - 1] || "";
  }

  /* ================= opening ================= */
  function open(st){
    if (!st || !st.username) return;
    who = st;
    pickedUnit = "";
    nameClass(st.group_name || cls);
    $("profName").textContent = st.display_name || st.username;
    show("studentView");
    paint();
  }
  /* Back to a student by username alone, after a refresh or Back: their
     record is read again from their class. */
  async function reopen(username){
    if (who && who.username === username){ nameClass(who.group_name || cls); show("studentView", true); paint(); return; }
    try{
      const list = await fetchClassRoster(cls);
      const st = list.find(x => x.username === username);
      if (st){ open(st); return; }
    }catch(e){}
    openClass(cls);
  }
  on("backStudents", "click", () => { show("studentsView"); loadStudents(); });

  /* ================= drawing ================= */
  async function paint(){
    const box = $("profBody");
    if (!box || !who) return;
    const no = ++paintNo;
    const st = who;
    const group = st.group_name || cls;
    box.innerHTML = "";

    /* who they are */
    const hero = el("section","prof-hero");
    const av = el("div","prof-avatar", initials(st.display_name || st.username));
    av.setAttribute("aria-hidden", "true");
    hero.appendChild(av);
    const words = el("div","prof-who");
    words.appendChild(el("b","prof-name", st.display_name || st.username));
    const line = el("p","prof-line");
    line.appendChild(el("span","prof-user", st.username));
    line.appendChild(document.createTextNode("  ·  " + (group || "No class")));
    words.appendChild(line);
    const chips = el("div","prof-chips");
    if (st.pw_set === false || st.pw_set === 0) chips.appendChild(el("span","statechip shut","No password yet"));
    if (st.reset_req) chips.appendChild(el("span","statechip open","Password reset asked"));
    if (chips.children.length) words.appendChild(chips);
    hero.appendChild(words);
    const acts = el("div","prof-acts");
    acts.appendChild(btn("Practice programs", "btn-ghost bmini2", () => openPrograms(st)));
    acts.appendChild(btn("Edit", "btn-ghost bmini2", () => editStudent(st)));
    hero.appendChild(acts);
    box.appendChild(hero);

    /* the facts, as tiles */
    const facts = el("div","prof-facts");
    const fact = (icon, label, value, sub, action) => {
      const f = el("section","prof-fact");
      const h = el("p","prof-fact-label"); h.innerHTML = ic(icon, 16); h.appendChild(el("span","", label));
      f.appendChild(h);
      const v = el("b","prof-fact-value", value);
      f.appendChild(v);
      const s = el("span","prof-fact-sub", sub || "");
      f.appendChild(s);
      if (action) f.appendChild(action);
      facts.appendChild(f);
      return { v, s, f };
    };
    const teachers = (classTeachers[String(group).toLowerCase()] || []).map(c => teacherNames[c] || c);
    fact("classes", "Class", group || "None", teachers.length ? "Taught by " + teachers.join(", ") : "",
         group ? btn("View Class", "btn-ghost bmini2", () => openClass(group)) : null);
    const next = fact("calendar", "Next lesson", "…", "");
    /* The lessons themselves rather than a count, each with the way to it on
       the class's own lessons page. */
    const live = assigns.filter(a => a.group_name.toLowerCase() === String(group).toLowerCase() && isOpen(a));
    const openFact = fact("eye", "Open to them now", live.length ? "" : "Nothing", live.length ? "" : "Nothing is open to " + group);
    if (live.length){
      openFact.v.remove(); openFact.s.remove();
      const list = el("div","prof-open");
      live.forEach(a => {
        const r = el("div","prof-open-row");
        r.appendChild(el("b","", titleOf(a.lesson_id)));
        r.appendChild(btn("View Lesson", "btn-ghost bmini2", () => showLessonInClass(group, a.lesson_id)));
        list.appendChild(r);
      });
      openFact.f.appendChild(list);
    }
    box.appendChild(facts);

    /* progress, filled in once it has been added up */
    const prog = el("section","dash-panel prof-progress");
    const ph = el("div","prof-prog-head");
    const title = el("h3","dash-head"); title.innerHTML = ic("progress", 18);
    const titleWords = el("span","", "Progress");
    title.appendChild(titleWords);
    ph.appendChild(title);
    const sel = document.createElement("select");
    sel.className = "sel prof-unit";
    sel.setAttribute("aria-label", "Unit");
    ph.appendChild(sel);
    prog.appendChild(ph);
    const pbody = el("div","prof-prog-body");
    pbody.appendChild(UI ? UI.skeleton("rows", 4) : waiting("Adding up the marks"));
    prog.appendChild(pbody);
    box.appendChild(prog);

    /* the next lesson, from the timetable */
    paintNext(next, group);

    try{ await loadCatalogue(); }catch(e){}
    if (no !== paintNo) return;
    const units = unitsOf(group);
    const unitName = pickedUnit && units.indexOf(pickedUnit) >= 0 ? pickedUnit : latestUnit(group);
    sel.innerHTML = "";
    units.forEach(u => { const o = el("option","", u); o.value = u; sel.appendChild(o); });
    sel.value = unitName;
    sel.hidden = units.length < 2;
    sel.onchange = () => { pickedUnit = sel.value; paint(); };
    if (!unitName){
      titleWords.textContent = "Progress";
      pbody.innerHTML = "";
      pbody.appendChild(el("p","hint", group + " has not been given any lessons filed under a unit yet."));
      return;
    }
    titleWords.textContent = "Progress in " + unitName + (pickedUnit ? "" : "  ·  latest unit");
    try{
      const result = await unitProgressFor(unitName, group);
      if (no !== paintNo) return;
      paintProgress(pbody, result, st, group);
    }catch(e){
      if (no !== paintNo) return;
      pbody.innerHTML = "";
      pbody.appendChild(el("p","hint", e.message || "Could not add up the marks just now."));
    }
  }
  const isOpen = (a) => {
    if (!a || !a.published) return false;
    if (a.release_at && a.release_at > new Date().toISOString()) return false;
    if (a.close_on && a.close_on < ymd(new Date())) return false;
    return true;
  };

  async function paintNext(fact, group){
    const tt = window.timetable;
    if (!tt || !group){ fact.v.textContent = "—"; return; }
    let n = null;
    try{ n = await tt.nextLessonFor(group); }catch(e){}
    if (!n){
      fact.v.textContent = tt.hasLessons() ? "Not on your timetable" : "No timetable yet";
      fact.s.textContent = "";
      const b = btn(tt.hasLessons() ? "Edit timetable" : "Set up timetable", "btn-ghost bmini2", () => tt.open());
      fact.f.appendChild(b);
      return;
    }
    const when = n.now ? "Now" : n.today ? "Today" : n.tomorrow ? "Tomorrow"
               : n.date.toLocaleDateString(undefined, { weekday:"short", day:"numeric", month:"short" });
    fact.v.textContent = when + ", " + (n.period.name || "") + (n.period.start ? " at " + n.period.start : "");
    fact.s.textContent = [n.room ? "Room " + n.room : "", n.week ? "Week " + n.week : ""].filter(Boolean).join("  ·  ");
  }

  /* ---------- their marks across a unit ---------- */
  function paintProgress(box, result, st, group){
    box.innerHTML = "";
    const lessons = result.lessons || [];
    if (!lessons.length){ box.appendChild(el("p","hint","There are no lessons in this unit for " + group + " yet.")); return; }
    const me = st.username;
    let got = 0, max = 0, cgot = 0, cmax = 0, started = 0, finished = 0;
    lessons.forEach(l => {
      const m = l.mr.byUsername[me];
      if (m && m.max){ got += m.got; max += m.max; }
      cgot += l.mr.gotSum || 0; cmax += l.mr.maxSum || 0;
      if ((l.started || []).indexOf(me) >= 0) started++;
      if ((l.finished || []).indexOf(me) >= 0) finished++;
    });
    const pct = max ? Math.round(100 * got / max) : null;
    const cpct = cmax ? Math.round(100 * cgot / cmax) : null;

    const stats = el("div","prof-stats");
    const stat = (value, label, sub, band) => {
      const s = el("div","prof-stat" + (band ? " " + band : ""));
      s.appendChild(el("b","", value));
      s.appendChild(el("span","", label));
      if (sub) s.appendChild(el("em","", sub));
      stats.appendChild(s);
    };
    const band = (p) => p === null ? "" : p >= 70 ? "good" : p >= 40 ? "mid" : "low";
    stat(pct === null ? "–" : pct + "%", "Their score", cpct === null ? "" : "Class average " + cpct + "%", band(pct));
    stat(started + " of " + lessons.length, "Lessons started");
    stat(finished + " of " + lessons.length, "Lessons finished");
    box.appendChild(stats);

    const rows = el("div","prof-lessons");
    lessons.forEach(l => {
      const m = l.mr.byUsername[me];
      const isStarted = (l.started || []).indexOf(me) >= 0;
      const p = isStarted && m && m.max ? Math.round(100 * m.got / m.max) : null;
      const isDone = (l.finished || []).indexOf(me) >= 0;
      const r = el("div","prof-lesson");
      const name = el("div","prof-lesson-name");
      name.appendChild(el("b","", l.title));
      name.appendChild(el("span","statechip " + (isDone ? "open" : "shut"),
        isDone ? "Finished" : isStarted ? "Started" : "Not started"));
      r.appendChild(name);
      const meter = el("div","prof-meter");
      if (l.mr.maxSum){
        const bar = el("div","coverbar");
        const fill = el("div","coverfill");
        fill.style.width = (p || 0) + "%";
        fill.dataset.band = p === null ? "low" : p >= 70 ? "good" : p >= 40 ? "mid" : "low";
        bar.appendChild(fill);
        if (l.mr.pct !== null && (l.started || []).length){
          const tick = el("span","prof-avg");
          tick.style.left = l.mr.pct + "%";
          tick.title = "Class average " + l.mr.pct + "%";
          bar.appendChild(tick);
        }
        meter.appendChild(bar);
        meter.appendChild(el("span","covernum", (p === null ? "–" : p + "%") +
          ""));
        if (l.mr.pct !== null && (l.started || []).length) meter.appendChild(el("span","prof-avg-num", "class " + l.mr.pct + "%"));
      } else {
        meter.appendChild(el("span","prof-dim", l.mr.isAssessment ? "An assessment: see Specification coverage" : "Nothing marked automatically"));
      }
      r.appendChild(meter);
      r.appendChild(btn("View work", "btn-ghost bmini2", () => window.open("work.html?lesson=" + encodeURIComponent(l.id) +
        "&group=" + encodeURIComponent(group) + "&student=" + encodeURIComponent(me), "_blank")));
      rows.appendChild(r);
    });
    /* The key sits above the lessons, in the colours it describes. */
    const key = el("div","prof-key");
    const k1 = el("span","prof-key-item"); k1.appendChild(el("span","prof-key-bar")); k1.appendChild(document.createTextNode("Their score"));
    const k2 = el("span","prof-key-item prof-key-avg"); k2.appendChild(el("span","prof-key-tick")); k2.appendChild(document.createTextNode("Class average"));
    key.appendChild(k1); key.appendChild(k2);
    box.appendChild(key);
    box.appendChild(rows);
  }

  window.studentProfile = {
    open, reopen,
    name: () => who ? (who.display_name || who.username) : "",
    username: () => {
      const v = $("studentView");
      return who && v && !v.hidden ? who.username : "";
    }
  };
})();
