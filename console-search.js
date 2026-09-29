/* =====================================================================
   console-search.js, the "Jump to" box in the middle of the console's top bar.

   One box for getting straight to somewhere: a screen of the console, a
   class or one of its pages, a year group, a unit, a lesson, or a student.
   Everything but the students is already in the page, so it is matched as
   the teacher types. Students are asked of the server, the same search the
   Practice screen uses, and only once two letters are in.

   Nothing here has a way of its own into a screen. Every result goes
   through the function or button that already opens it, so the crumbs,
   Back and "put me back where I was" behave exactly as if it had been
   clicked to.

   Keys: / or Ctrl+K from anywhere to start typing, the arrows to move,
   Enter to go, Escape to leave it.

   Classic script, loaded after console-ui.js: the console's `let` and
   `const` values (cat, groups, cls...) are read by name when used.
   ===================================================================== */
(function(){
  "use strict";
  const box = $("jumpBox"), inp = $("jumpIn"), list = $("jumpList");
  if (!box || !inp || !list) return;
  const UI = window.hubUI;
  const ic = (name) => UI ? UI.icon(name, 16) : "";
  if (UI){ const i = box.querySelector(".jump-icon"); if (i) i.innerHTML = ic("search"); }
  box.hidden = false;

  /* ---------- what can be jumped to ---------- */

  const click = (id) => () => { const b = $(id); if (b) b.click(); };
  /* The same screens as the side menu, and a few words each that a teacher
     might type for them instead of their name. */
  const AREAS = [
    { name:"Home",              icon:"home",     words:"start dashboard", go: () => toHome(),        online:true },
    { name:"Lesson hub",        icon:"lessons",  words:"lessons units year groups catalogue",
      go: () => { const t = $("openHub"); if (t && !OFFLINE) t.click(); else toHub(); } },
    { name:"Classes",           icon:"classes",  words:"groups sets",          go: () => toClasses(),     online:true },
    { name:"Practice",          icon:"practice", words:"sandbox programs",     go: () => toPractice(),    online:true,
      when: () => { const t = $("openPractice"); return t && !t.hidden; } },
    { name:"Password updates",  icon:"key",      words:"reset passwords requests logins", go: click("pwBtn"), online:true },
    { name:"Backups & devices", icon:"backup",   words:"backup restore devices", go: click("keepBtn"),  online:true },
    { name:"What's changed",    icon:"log",      words:"changelog version news", go: click("logBtn") },
    { name:"Settings",          icon:"settings", words:"preferences layout theme font", go: click("setBtn") }
  ];
  /* The pages of a class, offered under each class that matches. */
  const CLASS_PAGES = [
    { name:"Students",        icon:"classes",  words:"logins passwords pupils", tile:"openStudents" },
    { name:"Units & lessons", icon:"lessons",  words:"publish lock mark work", tile:"openLessons" },
    { name:"Progress",        icon:"progress", words:"markbook grid results", tile:"openProgress" }
  ];

  const low = (s) => String(s || "").toLowerCase();
  /* Every word typed has to be found somewhere in the name or its extra
     words, so "8b stu" finds 8B's students. A name that starts with what was
     typed comes above one that only contains it. */
  function score(term, name, words){
    const parts = term.split(/\s+/).filter(Boolean);
    if (!parts.length) return 0;
    const n = low(name), hay = n + " " + low(words);
    for (const p of parts) if (hay.indexOf(p) < 0) return 0;
    if (n === term) return 4;
    if (n.startsWith(term)) return 3;
    if (n.startsWith(parts[0]) || (" " + n).indexOf(" " + parts[0]) >= 0) return 2;
    return 1;
  }
  const best = (rows, max) => rows.filter(r => r.s > 0).sort((a, b) => b.s - a.s || a.name.localeCompare(b.name)).slice(0, max);

  function localResults(term){
    const groups = [];
    const areas = AREAS.filter(a => !(a.online && OFFLINE) && (!a.when || a.when()))
      .map(a => Object.assign({ s: score(term, a.name, a.words), meta:"" }, a));
    groups.push({ head:"Console", rows: best(areas, 5) });

    if (!OFFLINE){
      const mine = (typeof myClasses === "function") ? myClasses(allClasses()) : allClasses();
      const classRows = [];
      mine.forEach(c => {
        const s = score(term, c.name, "class");
        if (s) classRows.push({ s: s + 0.5, name: c.name, icon:"classes",
          meta: c.students + " student" + (c.students === 1 ? "" : "s"),
          go: () => openClass(c.name) });
        CLASS_PAGES.forEach(p => {
          /* Only once the class itself has been named, so typing "progress"
             does not list the progress of every class. */
          const t = score(term, c.name + " " + p.name, p.words);
          if (t && low(term).split(/\s+/).some(w => low(c.name).indexOf(w) >= 0))
            classRows.push({ s: t, name: c.name + " · " + p.name, icon: p.icon, meta:"",
              go: () => { openClass(c.name); const b = $(p.tile); if (b) b.click(); } });
        });
      });
      groups.push({ head:"Classes", rows: best(classRows, 8) });
    }

    if (catLoaded){
      const years = (cat.years || []).map(y => ({ s: score(term, y.name, "year group"), name: y.name,
        icon:"lessons", meta:"Year group", go: () => goYear(y.name) }));
      const units = (cat.units || []).filter(u => u.name).map(u => ({ s: score(term, u.name, u.year), name: u.name,
        icon:"lessons", meta: u.year || "Not in a year group", go: () => goUnit(u.name) }));
      groups.push({ head:"Year groups & units", rows: best(years.concat(units), 6) });
      /* Originals only, the same as the hub: a version carries its lesson's
         title and would only list it again. */
      const lessons = (cat.lessons || []).filter(l => !l.version_of).map(l => {
        const title = titleOf(l.lesson_id);
        return { s: score(term, title, (l.unit || "") + " " + (l.code || "")), name: title, icon:"lessons",
                 meta: l.unit || "Not in a unit", go: () => goLesson(l) };
      });
      groups.push({ head:"Lessons", rows: best(lessons, 8) });
    }
    return groups;
  }

  /* ---------- getting there ---------- */

  const yearOfUnit = (name) => { const u = (cat.units || []).find(x => x.name === name); return u ? (u.year || "") : ""; };
  function goYear(y){ openYear(y); }
  function goUnit(name){
    hubYear = yearOfUnit(name);
    openHubUnit(name);
  }
  /* A lesson is shown where it lives in the hub, picked out, rather than
     opened in the builder: from there it is one click to edit, give to a
     class or look at its versions. A GCSE or A Level lesson filed against a
     point of the specification is found under that point, the way the hub
     itself lays those year groups out. */
  function goLesson(l){
    const id = l.lesson_id;
    hubYear = yearOfUnit(l.unit || "") || l.year || "";
    const p = l.point ? pointById(l.point) : null;
    if (p && hubLevel()){
      const strand = p.parent ? pointById(p.parent) : p;
      openYear(hubYear);
      if (strand){
        openComponent(parseInt(strand.component, 10) || 0);
        openStrand(strand.id);
        openPoint(p.id);
        return pick($("hubPointList"), id);
      }
    }
    openHubUnit(l.unit || "");
    pick($("hubList"), id);
  }
  function pick(holder, id){
    if (!holder) return;
    const card = holder.querySelector('[data-lesson="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!card) return;
    card.scrollIntoView({ block:"center", behavior:"smooth" });
    card.classList.remove("jump-found");
    void card.offsetWidth;                  // start the glow again if it is picked twice
    card.classList.add("jump-found");
    card.addEventListener("animationend", () => card.classList.remove("jump-found"), { once:true });
    if (card.tabIndex >= 0) card.focus({ preventScroll:true });
  }
  /* A student is shown in their class's list, with that list narrowed to
     them where the list can be narrowed, and picked out where it cannot. */
  async function goStudent(st){
    const group = st.group_name || "";
    if (!group) return;
    openClass(group);
    show("studentsView");
    await loadStudents();
    if (cls !== group) return;              // they have gone somewhere else meanwhile
    const find = $("stuFind");
    if (find){
      find.value = st.username;
      find.dispatchEvent(new Event("input"));
      return;
    }
    const rows = Array.from(document.querySelectorAll("#stuTable tr"));
    const row = rows.find(r => r.textContent.indexOf(st.username) >= 0);
    if (row){
      row.scrollIntoView({ block:"center", behavior:"smooth" });
      row.classList.add("jump-found");
      row.addEventListener("animationend", () => row.classList.remove("jump-found"), { once:true });
    }
  }

  /* ---------- students, from the server ---------- */

  let stuRows = [], stuState = "", stuAsked = "", stuTimer = null, stuSeq = 0;
  function askStudents(term){
    clearTimeout(stuTimer);
    if (OFFLINE || term.length < 2){ stuRows = []; stuState = ""; stuAsked = ""; return; }
    if (term === stuAsked) return;
    /* what came back for the last thing typed is not an answer to this */
    stuRows = []; stuAsked = "";
    stuState = "wait";
    stuTimer = setTimeout(async () => {
      const seq = ++stuSeq;
      try{
        const r = await fetch(API + "/api/teacher/students?find=" + encodeURIComponent(term),
                              { headers: H(), cache: "no-store" });
        const d = await r.json();
        if (seq !== stuSeq) return;
        if (!r.ok) throw new Error(d.error || "");
        /* This teacher's classes only, as on the Practice screen. */
        const found = d.students || [];
        const mine = meCode ? found.filter(st => myClasses([{ name: st.group_name || "" }]).length) : found;
        stuRows = mine.slice(0, 8).map(st => ({
          name: st.display_name || st.username, icon:"classes",
          meta: st.username + " · " + (st.group_name || "no class"),
          go: () => goStudent(st)
        }));
        stuAsked = term; stuState = "";
      }catch(e){
        if (seq !== stuSeq) return;
        stuRows = []; stuState = "fail";
      }
      if (low(inp.value.trim()) === term) paint();
    }, 250);
  }

  /* ---------- the list ---------- */

  let rows = [], at = -1;
  function paint(){
    const term = low(inp.value.trim());
    list.innerHTML = "";
    rows = []; at = -1;
    if (!term){ close(); return; }
    const groups = localResults(term);
    if (!OFFLINE && term.length >= 2){
      groups.push({ head:"Students", rows: stuRows, note:
        stuState === "wait" && !stuRows.length ? "Looking for students…" :
        stuState === "fail" ? "Could not search students just now." : "" });
    }
    groups.forEach(g => {
      if (!g.rows.length && !g.note) return;
      list.appendChild(el("li","jump-head", g.head)).setAttribute("role", "presentation");
      if (g.note && !g.rows.length){
        const n = el("li","jump-note", g.note);
        n.setAttribute("role", "presentation");
        list.appendChild(n);
      }
      g.rows.forEach(r => {
        const li = el("li","jump-item");
        li.id = "jumpOpt" + rows.length;
        li.setAttribute("role", "option");
        li.dataset.i = rows.length;
        if (UI) li.insertAdjacentHTML("beforeend", '<span class="jump-ic hi-wrap">' + UI.icon(r.icon || "chevron", 16) + "</span>");
        li.appendChild(el("span","jump-name", r.name));
        if (r.meta) li.appendChild(el("span","jump-meta", r.meta));
        /* mousedown, not click: a click lands after the box has lost focus
           and the list has shut underneath it */
        li.addEventListener("mousedown", (e) => { e.preventDefault(); choose(+li.dataset.i); });
        li.addEventListener("mousemove", () => mark(+li.dataset.i));
        list.appendChild(li);
        rows.push(r);
      });
    });
    if (!rows.length && !list.children.length){
      const n = el("li","jump-note", catLoaded || OFFLINE ? "Nothing matches that." : "Loading the lessons…");
      n.setAttribute("role", "presentation");
      list.appendChild(n);
    }
    list.hidden = false;
    inp.setAttribute("aria-expanded", "true");
    mark(rows.length ? 0 : -1);
  }
  function mark(i){
    at = i;
    list.querySelectorAll(".jump-item").forEach(li => li.classList.toggle("on", +li.dataset.i === i));
    const li = i >= 0 ? $("jumpOpt" + i) : null;
    if (li){ inp.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block:"nearest" }); }
    else inp.removeAttribute("aria-activedescendant");
  }
  function close(){
    list.hidden = true;
    inp.setAttribute("aria-expanded", "false");
    inp.removeAttribute("aria-activedescendant");
  }
  function choose(i){
    const r = rows[i];
    if (!r) return;
    inp.value = "";
    close();
    inp.blur();
    try{ r.go(); }catch(e){ console.warn("Could not go there:", e); }
  }

  /* The lessons are only in the page once the hub has been opened, so the
     first time the box is used they are fetched. */
  function ready(){
    if (catLoaded) return;
    loadCatalogue().then(() => { if (!list.hidden) paint(); }).catch(() => {});
  }
  inp.addEventListener("focus", () => { ready(); if (inp.value.trim()) paint(); });
  inp.addEventListener("input", () => { askStudents(low(inp.value.trim())); paint(); });
  inp.addEventListener("blur", () => setTimeout(close, 120));
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && rows.length){ e.preventDefault(); if (list.hidden) paint(); mark((at + 1) % rows.length); }
    else if (e.key === "ArrowUp" && rows.length){ e.preventDefault(); mark((at - 1 + rows.length) % rows.length); }
    else if (e.key === "Enter"){ e.preventDefault(); choose(at); }
    else if (e.key === "Escape"){ e.stopPropagation(); if (!list.hidden && inp.value) { inp.value = ""; close(); } else inp.blur(); }
  });

  /* / or Ctrl+K from anywhere that is not already somewhere to type. */
  document.addEventListener("keydown", (e) => {
    const k = String(e.key || "").toLowerCase();
    const ctrlK = k === "k" && (e.ctrlKey || e.metaKey) && !e.altKey;
    if (!ctrlK && !(e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey)) return;
    const bar = $("topbar");
    if (!bar || bar.hidden || box.hidden) return;
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (!ctrlK && typing) return;
    if (typeof modalDepth !== "undefined" && modalDepth > 0) return;   // a pop-up is open
    e.preventDefault();
    inp.focus();
    inp.select();
  });
})();
