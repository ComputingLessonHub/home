/* =====================================================================
   console-ui.js, the teacher console's newer layout.

   Loaded after the console's own script and built on top of it: the
   functions here wrap the console's own (show, wait, say, lessonCards and
   so on) rather than replacing the file they live in. Most of it can be
   switched off under Settings > Console layout, and switched off it hands
   straight back to what was there before.

     Every screen   one header: the title on the left, its buttons on the
                    right, and Refresh always last in that row
     Icons          line icons in place of emoji (ui.js does the swapping)
     Side menu      Home, Lessons, Classes and the rest down the left
     Loading        grey shapes where the screen is about to be
     Messages       short notes in the corner, with Undo after a removal
     Lesson hub     fuller lesson cards, search results grouped by year and
                    unit, and lessons dragged into order within a unit
     A class        a dashboard of what is live, what needs marking and who
                    has asked for a password reset
     Manage         the pop-up in three parts: When, What's open and Work
     Students       search, sort, filters, and ticking several at once
     Progress       a grid of every student against every lesson

   Classic script: the console's `let` and `const` values (cls, cat,
   assigns, groups...) are read by name at the time they are used.
   ===================================================================== */
(function(){
  "use strict";
  const UI = window.hubUI;
  if (!UI) return;
  const on = (n) => UI.pref(n);
  const ic = (name, size) => UI.icon(name, size);

  /* ================= every screen: one header ================= */
  function headers(){
    VIEWS.forEach(id => {
      if (id === "keyView" || id === "whoView") return;
      const v = $(id);
      if (!v || v.dataset.headDone) return;
      v.dataset.headDone = "1";
      const kids = Array.from(v.children);
      const title = kids.find(k => k.tagName === "H2" || (k.classList && k.classList.contains("classhead")));
      if (!title) return;
      const head = el("div","viewhead");
      v.insertBefore(head, title);
      const left = el("div","vh-title");
      left.appendChild(title);
      head.appendChild(left);
      const right = el("div","vh-actions");
      head.appendChild(right);
      /* the buttons of the row straight under the title join it on the right;
         a search box or a picker stays where it was, under the header */
      const tool = kids.find(k => k.classList && k.classList.contains("toolrow"));
      if (tool) Array.from(tool.children).forEach(c => {
        if (c.tagName === "BUTTON" && !c.classList.contains("refresh")) right.appendChild(c);
      });
      const ref = v.querySelector(":scope > .refresh") || (tool && tool.querySelector(".refresh"));
      if (ref){ ref.classList.add("vh-refresh"); ref.setAttribute("aria-label", ref.title || "Refresh"); right.appendChild(ref); }
      if (tool && !tool.children.length) tool.remove();
    });
  }

  /* ================= side menu ================= */
  const RAIL = [
    ["home",     "home",     "Home",              () => toHome()],
    ["hub",      "lessons",  "Lesson hub",        () => toHub()],
    ["classes",  "classes",  "Classes",           () => toClasses()],
    ["practice", "practice", "Practice",          () => toPractice()],
    ["pw",       "key",      "Password updates",  () => $("pwBtn") && $("pwBtn").click()],
    ["keep",     "backup",   "Backups & devices", () => $("keepBtn") && $("keepBtn").click()],
    ["sep"],
    ["log",      "log",      "What's changed",    () => $("logBtn") && $("logBtn").click()],
    ["settings", "settings", "Settings",          () => $("setBtn") && $("setBtn").click()]
  ];
  const SECTION = {
    homeView:"home", hubView:"hub", hubUnitsView:"hub", hubCompView:"hub", hubPointView:"hub",
    hubPointLessonsView:"hub", hubLessonsView:"hub", classesView:"classes", classView:"classes",
    studentsView:"classes", coverView:"classes", unitsView:"classes", partsView:"classes",
    lessonsView:"classes", progressView:"classes", practiceView:"practice", pwView:"pw", keepView:"keep"
  };
  let rail = null;
  function buildRail(){
    rail = el("nav","rail no-print");
    rail.id = "rail";
    rail.setAttribute("aria-label", "Console");
    rail.hidden = true;
    RAIL.forEach(r => {
      if (r[0] === "sep"){ rail.appendChild(el("div","rail-sep")); return; }
      if (OFFLINE && ["home","classes","practice","pw","keep"].indexOf(r[0]) >= 0) return;
      const b = el("button","rail-item");
      b.type = "button";
      b.dataset.go = r[0];
      b.innerHTML = ic(r[1], 20);
      b.appendChild(el("span","rail-words", r[2]));
      if (r[0] === "pw"){ const badge = el("span","rail-badge"); badge.hidden = true; b.appendChild(badge); }
      b.addEventListener("click", r[3]);
      rail.appendChild(b);
    });
    const bar = $("topbar");
    if (bar && bar.parentNode) bar.parentNode.insertBefore(rail, bar.nextSibling);
    /* the count of waiting password requests follows the one in the top bar */
    const count = $("pwCount");
    if (count){
      const copy = () => {
        const badge = rail.querySelector(".rail-badge");
        if (!badge) return;
        badge.textContent = count.textContent;
        badge.hidden = count.hidden || !String(count.textContent || "").trim();
      };
      new MutationObserver(copy).observe(count, { childList:true, characterData:true, subtree:true, attributes:true });
      copy();
    }
  }
  function paintRail(view){
    if (!rail) return;
    const bar = $("topbar");
    const want = on("sidebar") && bar && !bar.hidden && view !== "keyView" && view !== "whoView";
    rail.hidden = !want;
    document.body.classList.toggle("has-rail", !!want);
    const here = SECTION[view] || "";
    rail.querySelectorAll(".rail-item").forEach(b => {
      const hit = b.dataset.go === here;
      b.classList.toggle("on", hit);
      if (hit) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    const prac = rail.querySelector('[data-go="practice"]');
    const tile = $("openPractice");
    if (prac) prac.hidden = !tile || tile.hidden;
  }

  /* ================= show(): what every screen change goes through ================= */
  let current = "";
  const baseShow = show;
  window.show = function(view, quiet){
    const out = baseShow.apply(this, arguments);
    current = view;
    paintRail(view);
    return out;
  };

  /* ================= loading shapes ================= */
  const baseWaiting = waiting;
  window.waiting = function(what, middle){
    if (!on("skeletons")) return baseWaiting.apply(this, arguments);
    const d = el("div","skelwrap");
    d.appendChild(UI.skeleton("lines", 4));
    d.appendChild(el("span","sr-only", what || "Loading"));
    return d;
  };
  const baseWait = wait;
  window.wait = function(box, what, middle){
    if (!on("skeletons")) return baseWait.apply(this, arguments);
    const b = typeof box === "string" ? $(box) : box;
    if (!b) return null;
    b.innerHTML = "";
    const grid = b.classList.contains("classgrid") || b.classList.contains("bigcards") ||
                 /Grid|Years|Units|Strands|Points/.test(b.id || "");
    b.appendChild(UI.skeleton(grid ? "tiles" : "rows", grid ? 6 : 5));
    return b;
  };
  /* The spinners already written into the page, for students, coverage and
     progress: each gets the shapes beside its dots, and the stylesheet shows
     whichever the setting asks for. */
  function staticSkeletons(){
    document.querySelectorAll(".loading.mid").forEach(l => {
      if (l.querySelector(".skel")) return;
      l.appendChild(UI.skeleton("rows", 5));
    });
  }

  /* ================= messages in the corner ================= */
  const baseSay = say;
  window.say = function(title, message){
    /* Something that went wrong is a note in the corner rather than a box to
       dismiss; anything with more to say than that is still a pop-up. */
    if (/^(could not|couldn't|not saved|failed)/i.test(String(title || "")) && String(message || "").length < 160){
      UI.toast(title + (message ? ": " + message : ""), { kind:"error" });
      return;
    }
    return baseSay.apply(this, arguments);
  };

  /* Removing a lesson from a class: the same question as before, then a note
     with Undo, which gives it back exactly as it was, published or not. */
  window.removeFromClass = function(l){
    const id = l.lesson_id;
    const mine = assigns.find(a => a.lesson_id === id && a.group_name.toLowerCase() === cls.toLowerCase());
    const was = mine ? { published: !!mine.published, release: mine.release_at || "", close: mine.close_on || "" } : null;
    const others = assigns.filter(a => a.lesson_id === id && a.group_name.toLowerCase() !== cls.toLowerCase());
    const group = cls;
    openModal(box => {
      modalTitle(box, "Remove “" + titleOf(id) + "” from " + cls + "?");
      box.appendChild(el("p","modal-text","It stays in the lesson hub" +
        (others.length ? " and with " + others.length + " other class" + (others.length === 1 ? "" : "es") : "") +
        ". Work that " + cls + " has already done is kept, and comes back if you add the lesson again."));
      const msg = el("p","hint","");
      const yes = el("button","btn-primary modal-cta","Remove from " + cls);
      yes.addEventListener("click", async () => {
        msg.textContent = "Removing…";
        try{
          await catPost({ op:"unassign", id: id, group: group });
          await loadCatalogue();
          closeModal(); paintLessonGrid();
          UI.toast("Removed from " + group, { action:"Undo", onAction: async () => {
            try{
              await catPost({ op:"assign", id: id, groups: [group] });
              if (was && was.published)
                await catPost({ op:"class-publish", id: id, group: group, published: true,
                                releaseAt: was.release, closeOn: was.close });
              await loadCatalogue();
              if (cls === group) paintLessonGrid();
              UI.toast("Back with " + group);
            }catch(e){ UI.toast("Could not put it back: " + e.message, { kind:"error" }); }
          } });
        }catch(e){ msg.textContent = e.message; }
      });
      const no = el("button","btn-ghost modal-stay","Keep it");
      no.addEventListener("click", closeModal);
      box.appendChild(yes); box.appendChild(no); box.appendChild(msg);
    });
  };
  /* Unpublishing takes a lesson away from a class mid-lesson, so it gets an
     Undo too. */
  const baseSetPublish = setPublish;
  window.setPublish = async function(id, onNow, releaseAt, closeOn){
    const mine = assigns.find(a => a.lesson_id === id && a.group_name.toLowerCase() === cls.toLowerCase());
    const was = mine ? { release: mine.release_at || "", close: mine.close_on || "" } : { release:"", close:"" };
    const group = cls;
    await baseSetPublish.apply(this, arguments);
    if (onNow === false){
      UI.toast("Unpublished for " + group, { action:"Undo", onAction: () => {
        if (cls === group) baseSetPublish(id, true, was.release, was.close);
      } });
    }
  };

  /* ================= lesson hub: cards ================= */
  /* What is inside a lesson, for its card: pages, tasks and when it was last
     saved. Each lesson is read once, and only when its card comes into view,
     a few at a time; the answer is kept for the rest of this tab's life. */
  const stats = new Map();
  const queue = [];
  let running = 0;
  function countTasks(blocks){
    let n = 0;
    (blocks || []).forEach(b => {
      if (!b) return;
      if (b.type === "page" || b.type === "group" || b.type === "extension"){ n += countTasks(b.blocks); return; }
      if (b.type === "choice"){ (b.options || []).forEach(o => { n += countTasks(o.blocks); }); return; }
      n++;
    });
    return n;
  }
  function statOf(id){
    if (stats.has(id)) return Promise.resolve(stats.get(id));
    try{
      const kept = JSON.parse(sessionStorage.getItem("hub_lstat:" + id) || "null");
      if (kept){ stats.set(id, kept); return Promise.resolve(kept); }
    }catch(e){}
    return new Promise(resolve => { queue.push({ id, resolve }); pump(); });
  }
  function pump(){
    while (running < 3 && queue.length){
      const job = queue.shift();
      running++;
      fetchLesson(job.id).then(l => {
        const blocks = (l && l.blocks) || [];
        const st = { pages: blocks.filter(b => b && b.type === "page").length || (blocks.length ? 1 : 0),
                     tasks: countTasks(blocks), savedAt: (l && l.savedAt) || "",
                     assessment: !!(l && l.assessment) };
        stats.set(job.id, st);
        try{ sessionStorage.setItem("hub_lstat:" + job.id, JSON.stringify(st)); }catch(e){}
        job.resolve(st);
      }).catch(() => job.resolve(null)).finally(() => { running--; pump(); });
    }
  }
  function ago(iso){
    const t = new Date(iso).getTime();
    if (!t) return "";
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return days + " days ago";
    if (days < 60) return Math.round(days / 7) + " weeks ago";
    return new Date(t).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
  }
  let seen = null;
  function whenSeen(node, fn){
    if (!("IntersectionObserver" in window)){ fn(); return; }
    if (!seen) seen = new IntersectionObserver(list => list.forEach(x => {
      if (!x.isIntersecting) return;
      seen.unobserve(x.target);
      const go = x.target.__onSeen; x.target.__onSeen = null;
      if (go) go();
    }), { rootMargin: "200px" });
    node.__onSeen = fn;
    seen.observe(node);
  }

  /* A teacher's own order for the lessons in a unit. Offered to the server
     first; if it will not keep it, this browser does, and says so. */
  function localOrder(){ try{ return JSON.parse(localStorage.getItem("hub_lesson_order") || "{}"); }catch(e){ return {}; } }
  function applyOrder(list, key){
    const order = localOrder()[key];
    if (!order || !order.length) return list;
    const at = (id) => { const i = order.indexOf(id); return i < 0 ? 9999 : i; };
    return list.slice().sort((a, b) => at(a.lesson_id) - at(b.lesson_id));
  }
  async function saveOrder(key, ids){
    const all = localOrder(); all[key] = ids;
    try{ localStorage.setItem("hub_lesson_order", JSON.stringify(all)); }catch(e){}
    try{
      await catPost({ op:"reorder", kind:"lesson", unit: key, names: ids });
      UI.toast("Order saved");
    }catch(e){
      UI.toast("Order kept in this browser. The server does not store lesson order yet, so students still see them by number.");
    }
  }
  function sortableCards(grid, ids, onDrop){
    const cards = () => Array.from(grid.children).filter(c => c.classList.contains("lessonpill"));
    let from = null;
    cards().forEach((card, i) => {
      card.draggable = true;
      card.addEventListener("dragstart", (e) => {
        if (e.target.closest && e.target.closest("button")) { e.preventDefault(); return; }
        from = i; card.classList.add("dragging");
        if (e.dataTransfer){ e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }
      });
      card.addEventListener("dragend", () => { card.classList.remove("dragging"); window.dragLine.hide(); from = null; });
    });
    grid.addEventListener("dragover", (e) => {
      if (from === null) return;
      e.preventDefault();
      window.dragLine.mark(grid, cards(), e, { across: true });
    });
    grid.addEventListener("dragleave", (e) => { if (window.dragLine.left(grid, e)) window.dragLine.hide(); });
    grid.addEventListener("drop", (e) => {
      e.preventDefault();
      const hit = window.dragLine.mark(grid, cards(), e, { across: true });
      window.dragLine.hide();
      const f = from; from = null;
      if (f === null) return;
      let at = hit.slot > f ? hit.slot - 1 : hit.slot;
      at = Math.max(0, Math.min(ids.length - 1, at));
      if (at === f) return;
      const moved = ids.slice();
      moved.splice(at, 0, moved.splice(f, 1)[0]);
      onDrop(moved);
    });
  }

  const baseLessonCards = lessonCards;
  window.lessonCards = function(list, box, opts){
    if (!on("richCards")) return baseLessonCards.apply(this, arguments);
    const o = opts || {};
    box.innerHTML = "";
    if (!list.length){ box.appendChild(el("p","hint","No lessons here yet, press “+ Build a new lesson”.")); return; }
    inOrder(list, (l) => titleOf(l.lesson_id));
    if (o.orderKey) list = applyOrder(list, o.orderKey);
    const grid = el("div","lessongrid richgrid");
    list.forEach(l => {
      const id = l.lesson_id;
      const card = el("div","lessonpill richcard");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Open " + titleOf(id) + " in the lesson builder");
      const head = el("div","lp-head");
      head.appendChild(el("b","", titleOf(id)));
      const alts = versionsOf(id);
      if (alts.length) head.appendChild(el("span","statechip open", alts.length + " version" + (alts.length === 1 ? "" : "s")));
      if (l.assessment) head.appendChild(el("span","statechip shut","Assessment"));
      card.appendChild(head);

      /* pages, tasks and when, filled in once the lesson has been read */
      const meta = el("p","rc-meta");
      meta.appendChild(el("span","rc-dim","…"));
      card.appendChild(meta);
      whenSeen(card, () => statOf(id).then(st => {
        meta.innerHTML = "";
        if (!st){ meta.appendChild(el("span","rc-dim","Could not read it")); return; }
        const bits = [st.pages + " page" + (st.pages === 1 ? "" : "s"), st.tasks + " task" + (st.tasks === 1 ? "" : "s")];
        const when = st.savedAt || l.updated_at || l.saved_at || "";
        if (when) bits.push("changed " + ago(when));
        meta.textContent = bits.join("  ·  ");
      }));

      /* which classes have it, versions included */
      if (OFFLINE){
        card.appendChild(el("p","rc-classes", l.code ? "Code " + l.code : "No code yet"));
      } else {
        const doing = new Map();
        familyOf(id).forEach(v => classChoices(v.lesson_id).forEach(c => {
          if (c.given) doing.set(String(c.name).toLowerCase(), c.name);
        }));
        const row = el("div","rc-classes");
        if (!doing.size) row.appendChild(el("span","rc-dim","Not given to any class yet"));
        Array.from(doing.values()).slice(0, 6).forEach(n => row.appendChild(el("span","rc-class", n)));
        if (doing.size > 6) row.appendChild(el("span","rc-dim","+" + (doing.size - 6) + " more"));
        card.appendChild(row);
      }

      const acts = el("div","lp-acts");
      const give = el("button","btn-primary", OFFLINE ? "Get link" : "Give to classes");
      give.addEventListener("click", (e) => { e.stopPropagation(); OFFLINE ? shareLink(id) : distribute(id); });
      const edit = el("button","btn-ghost","Edit");
      edit.addEventListener("click", (e) => { e.stopPropagation(); editLesson(id); });
      acts.appendChild(give);
      acts.appendChild(edit);
      const more = overflowMenu([["Versions", () => versionsPopup(id)],
                                 ["Delete lesson", () => deleteLesson(id)]]);
      more.classList.add("rc-more");
      more.addEventListener("click", (e) => e.stopPropagation());
      acts.appendChild(more);
      card.appendChild(acts);

      /* the card itself opens the builder */
      card.addEventListener("click", (e) => {
        if (e.target.closest("button, a, .menu")) return;
        editLesson(id);
      });
      card.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === card){ e.preventDefault(); editLesson(id); }
      });
      grid.appendChild(card);
    });
    box.appendChild(grid);
    if (o.orderKey && list.length > 1){
      box.appendChild(el("p","hint rc-hint","Drag the cards to put them in order."));
      sortableCards(grid, list.map(l => l.lesson_id), (moved) => {
        saveOrder(o.orderKey, moved).then(() => {});
        window.lessonCards(list, box, o);
      });
    }
  };
  /* A unit's own list is the one place lessons can be put in order. */
  window.paintHub = function(){
    const list = lessonsOfUnit(hubUnit);
    window.lessonCards(list, $("hubList"), { orderKey: (hubYear || "") + "\u0000" + (hubUnit || "") });
  };

  /* ================= lesson hub: search ================= */
  /* Results grouped under the year and unit they belong to, in the hub's
     own order, so two lessons with the same name in different years can be
     told apart at a glance. */
  window.runSearch = function(termBox, into){
    const term = (termBox.value || "").trim().toLowerCase();
    if (!term){ into.innerHTML = ""; return false; }
    const words = term.split(/\s+/).filter(Boolean);
    const found = (cat.lessons || []).filter(l => {
      if (l.version_of) return false;
      const hay = ((titleOf(l.lesson_id) || "") + " " + (l.unit || "") + " " + (l.year || "")).toLowerCase();
      return words.every(w => hay.includes(w));
    });
    into.innerHTML = "";
    into.appendChild(el("p","unit-head", found.length + " lesson" + (found.length === 1 ? "" : "s") +
      " matching “" + termBox.value.trim() + "”"));
    if (!found.length) return true;
    const yearOrder = (cat.years || []).map(y => y.name);
    const unitOrder = (cat.units || []).map(u => u.name);
    const groups = new Map();
    found.forEach(l => {
      const k = (l.year || "") + "\u0000" + (l.unit || "");
      if (!groups.has(k)) groups.set(k, { year: l.year || "", unit: l.unit || "", list: [] });
      groups.get(k).list.push(l);
    });
    const pos = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 999 : i; };
    Array.from(groups.values())
      .sort((a, b) => (pos(yearOrder, a.year) - pos(yearOrder, b.year)) || (pos(unitOrder, a.unit) - pos(unitOrder, b.unit)))
      .forEach(g => {
        const h = el("h3","search-group");
        h.appendChild(el("span","sg-year", g.year || "No year group"));
        h.insertAdjacentHTML("beforeend", ic("chevron", 14));
        h.appendChild(el("span","", g.unit || "No unit"));
        h.appendChild(el("span","sg-count", String(g.list.length)));
        into.appendChild(h);
        const holder = el("div");
        window.lessonCards(g.list, holder);
        into.appendChild(holder);
      });
    return true;
  };

  /* ================= a class: its dashboard ================= */
  /* A class opens on what a teacher wants to know first: what the class can
     see now, what is waiting to be marked, and who is locked out. The four
     ways into the class's screens sit above it as a row of tabs. */
  const baseOpenClass = openClass;
  window.openClass = async function(name){
    const out = baseOpenClass.apply(this, arguments);
    const view = $("classView");
    let dash = $("classDash");
    const want = on("classDash") && !OFFLINE;
    view.classList.toggle("dashed", want);
    if (!want){ if (dash) dash.remove(); return out; }
    if (!dash){ dash = el("div","classdash"); dash.id = "classDash"; view.appendChild(dash); }
    dash.innerHTML = "";
    dash.appendChild(UI.skeleton("tiles", 3));
    try{ await out; }catch(e){}
    paintDash(dash, name);
    return out;
  };
  const isLive = (a) => {
    if (!a || !a.published) return false;
    const now = new Date().toISOString();
    if (a.release_at && a.release_at > now) return false;
    if (a.close_on && a.close_on < ymd(new Date())) return false;
    return true;
  };
  async function paintDash(dash, name){
    const group = name;
    let resets = [], results = [];
    try{ await loadCatalogue(); }catch(e){}
    await Promise.all([
      fetch(API + "/api/teacher/resets", { headers: H(), cache:"no-store" }).then(r => r.json())
        .then(d => { resets = (d.requests || []).filter(x => (x.group_name || "").toLowerCase() === group.toLowerCase()); })
        .catch(() => {}),
      fetch(API + "/api/teacher/results?all=1&group=" + encodeURIComponent(group), { headers: H(), cache:"no-store" })
        .then(r => r.json()).then(d => { results = d.rows || []; }).catch(() => {})
    ]);
    if (cls !== group) return;                      // they have moved on
    dash.innerHTML = "";
    const mine = assigns.filter(a => a.group_name.toLowerCase() === group.toLowerCase());
    const lessonOf = (id) => (cat.lessons || []).find(l => l.lesson_id === id) || {};
    const panel = (icon, title, count) => {
      const p = el("section","dash-panel");
      const h = el("h3","dash-head");
      h.innerHTML = ic(icon, 18);
      h.appendChild(el("span","", title));
      if (count !== undefined) h.appendChild(el("span","dash-count", String(count)));
      p.appendChild(h);
      dash.appendChild(p);
      return p;
    };
    const row = (p, words, sub, buttons) => {
      const r = el("div","dash-row");
      const t = el("div","dash-words");
      t.appendChild(el("b","", words));
      if (sub) t.appendChild(el("span","", sub));
      r.appendChild(t);
      (buttons || []).forEach(b => r.appendChild(b));
      p.appendChild(r);
      return r;
    };
    const btn = (words, cls2, fn) => { const b = el("button", cls2 || "btn-ghost bmini2", words); b.addEventListener("click", fn); return b; };

    /* live now, and what is coming */
    const live = mine.filter(isLive);
    const soon = mine.filter(a => a.published && a.release_at && a.release_at > new Date().toISOString())
                     .sort((a, b) => a.release_at.localeCompare(b.release_at));
    const p1 = panel("eye", "Live now", live.length);
    if (!live.length) p1.appendChild(el("p","hint","Nothing is open for " + group + " at the moment."));
    live.forEach(a => {
      const sub = [a.release_at ? "Opened " + niceDate(a.release_at) : "", a.close_on ? "closes " + niceDate(a.close_on) : ""]
        .filter(Boolean).join(", ");
      row(p1, titleOf(a.lesson_id), sub, [
        btn("View work", "btn-ghost bmini2", () => openWorkPage(a.lesson_id)),
        btn("Manage", "btn-ghost bmini2", () => manageLesson(a.lesson_id))
      ]);
    });
    if (soon.length){
      p1.appendChild(el("p","dash-sub","Coming up"));
      soon.slice(0, 5).forEach(a => row(p1, titleOf(a.lesson_id),
        "Opens " + niceDate(a.release_at) + " at " + hhmm(a.release_at),
        [btn("Schedule", "btn-ghost bmini2", () => schedulePopup(a.lesson_id))]));
    }

    /* marking: an assessment is the thing that waits on a teacher */
    const handed = new Map();
    results.forEach(r => {
      const id = r.lesson_id || r.lesson || "";
      if (!id) return;
      if (!handed.has(id)) handed.set(id, new Set());
      handed.get(id).add(r.username || r.user || Math.random());
    });
    const toMark = mine.filter(a => lessonOf(a.lesson_id).assessment || handed.has(a.lesson_id));
    const p2 = panel("work", "To mark", toMark.length);
    if (!toMark.length) p2.appendChild(el("p","hint","No assessments given to " + group + " yet."));
    toMark.forEach(a => {
      const n = handed.has(a.lesson_id) ? handed.get(a.lesson_id).size : 0;
      row(p2, titleOf(a.lesson_id), n ? n + " handed in" : "Nothing handed in yet", [
        btn("Markbook", "btn-primary bmini2", async () => {
          lessonId = a.lesson_id;
          workCache = { key: "", rows: [], t: 0 };
          openModal(box => { box.classList.add("wide"); modalTitle(box, titleOf(a.lesson_id));
                             box.appendChild(waiting("Loading the markbook", true)); });
          try{ lessonJson = await fetchLesson(a.lesson_id); openMarkbook(false); }
          catch(e){ closeModal(); UI.toast("Could not open the markbook: " + e.message, { kind:"error" }); }
        })
      ]);
    });

    /* who cannot sign in */
    const p3 = panel("key", "Password requests", resets.length);
    if (!resets.length) p3.appendChild(el("p","hint","Nobody in " + group + " is waiting for a password reset."));
    resets.forEach(x => {
      row(p3, x.display_name, x.username + (x.hasNewPassword ? "  ·  new password ready" : ""), [
        btn("Approve", "btn-primary bmini2", async () => { await resetAction("approve-reset", x.username); UI.toast("Approved for " + x.display_name); paintDash(dash, group); }),
        btn("Deny", "btn-ghost bmini2", async () => { await resetAction("deny-reset", x.username); paintDash(dash, group); })
      ]);
    });
  }

  /* ================= Manage: in three parts ================= */
  /* What a task is called in the Manage list: its own title, or what kind of
     task it is, from the same list of names the rest of the console uses. */
  const baseStepTitle = stepTitle;
  const KIND = { page:"Page", text:"Reading", picture:"Picture", pastelink:"Paste a link", ide:"Python code",
    web:"Web page", question:"Written answer", quiz:"Quiz", extension:"Extension tasks", group:"Group",
    choice:"Choice", image:"Screenshot", embed:"Video", frame:"Embedded page", link:"Link to a site",
    mc:"Multiple choice", blanks:"Fill the gaps", order:"Put in order", keywords:"Keyword definitions",
    notes:"Notes", mindmap:"Mind map", board:"Whiteboard", label:"Label a picture", binary:"Binary conversion",
    binadd:"Binary addition", password:"Password checker", caesar:"Caesar cipher", short:"Short answer",
    table:"Table", exam:"Exam question", python:"Python code" };
  window.stepTitle = function(b, i){
    const named = stripTags((b && (b.title || b.prompt || b.task)) || "");
    if (named) return named;
    if (b && b.type === "text") return baseStepTitle.apply(this, arguments);
    if (b && b.type === "page") return "Page " + (i + 1);
    return KIND[b && b.type] || (b && b.type) || "Task";
  };
  const baseOpenManage = openManage;
  window.openManage = function(){
    if (!on("manageSections")) return baseOpenManage.apply(this, arguments);
    openModal(box => {
      box.classList.add("wide", "managebox");
      modalTitle(box, titleOf(lessonId));
      const x = el("button","btn-ghost iconbtn modal-x","✕"); x.title = "Close";
      x.addEventListener("click", closeModal);
      box.appendChild(x);
      const mine = assigns.find(a => a.lesson_id === lessonId && a.group_name.toLowerCase() === cls.toLowerCase());
      const isLiveNow = mine ? !!mine.published : !!catOf(lessonId).published;
      const section = (icon, title) => {
        const sct = el("section","mg-section");
        const h = el("h3","mg-head"); h.innerHTML = ic(icon, 18); h.appendChild(el("span","", title));
        sct.appendChild(h);
        box.appendChild(sct);
        return sct;
      };

      /* When */
      const when = section("calendar", "When");
      const state = !isLiveNow ? "Draft: " + cls + " cannot see it"
        : (mine && mine.release_at && mine.release_at > new Date().toISOString())
          ? "Scheduled: opens " + niceDate(mine.release_at) + " at " + hhmm(mine.release_at)
          : "Open" + (mine && mine.close_on ? ", closes " + niceDate(mine.close_on) : "");
      when.appendChild(el("p","mg-state " + (isLiveNow ? "live" : "draft"), state));
      const wrow = el("div","mg-row");
      const pubBtn = el("button", isLiveNow ? "btn-ghost" : "btn-primary", isLiveNow ? "Unpublish" : "Publish");
      pubBtn.addEventListener("click", async () => {
        if (!isLiveNow){ closeModal(); schedulePopup(lessonId); return; }
        pubBtn.textContent = "…";
        try{
          const id = lessonId;
          await catPost({ op:"class-publish", id, group: cls, published: false });
          await loadCatalogue();
          closeModal(); paintLessonGrid(); openManage();
          UI.toast("Unpublished for " + cls, { action:"Undo", onAction: async () => {
            await catPost({ op:"class-publish", id, group: cls, published: true,
                            releaseAt: (mine && mine.release_at) || "", closeOn: (mine && mine.close_on) || "" });
            await loadCatalogue(); paintLessonGrid();
          } });
        }catch(e){ UI.toast("Could not change that: " + e.message, { kind:"error" }); }
      });
      const sch = el("button","btn-ghost","Schedule");
      sch.addEventListener("click", () => { closeModal(); schedulePopup(lessonId); });
      wrow.appendChild(pubBtn); wrow.appendChild(sch);
      when.appendChild(wrow);

      /* What's open */
      const what = section("unlock", "What's open");
      if (!lessonJson.assessment){
        const orow = el("div","mg-row");
        const oa = el("button","btn-ghost bmini2","Open all tasks"); oa.addEventListener("click", () => postLocks(new Set()));
        const la = el("button","btn-ghost bmini2","Lock all tasks");
        la.addEventListener("click", () => postLocks(new Set(lessonJson.blocks.map((_, i) => i).concat([lessonJson.blocks.length]))));
        orow.appendChild(oa); orow.appendChild(la);
        what.appendChild(orow);
      }
      const msg = el("p","hint",""); msg.id = "relMsg"; what.appendChild(msg);
      const list = el("div"); list.id = "taskList"; what.appendChild(list);
      const foot = el("div","mg-foot"); foot.id = "summaryFoot"; what.appendChild(foot);

      /* Work */
      const work = section("work", "Work");
      const krow = el("div","mg-row");
      const vw = el("button","btn-primary","View work");
      vw.addEventListener("click", () => openWorkPage(lessonId));
      krow.appendChild(vw);
      if (lessonJson && lessonJson.assessment){
        const mb = el("button","btn-ghost","Markbook");
        mb.addEventListener("click", () => openMarkbook(true));
        krow.appendChild(mb);
      }
      const pg = el("button","btn-ghost","Progress");
      pg.addEventListener("click", () => openWorkPage(lessonId, "progress"));
      krow.appendChild(pg);
      work.appendChild(krow);
      paintTasks();
    });
  };

  /* ================= students ================= */
  /* Search, sort and the two things worth filtering on, and ticking several
     at once to give them a new password or move them to another class. */
  let stuFind = "", stuFilter = "all", stuSort = "name";
  const picked = new Set();
  function stuTools(){
    let bar = $("stuTools");
    if (bar) return bar;
    bar = el("div","stutools");
    bar.id = "stuTools";
    const search = el("span","searchbox");
    search.insertAdjacentHTML("beforeend", '<span class="searchicon hi-wrap">' + ic("search", 16) + "</span>");
    const inp = el("input"); inp.placeholder = "Search the class"; inp.id = "stuFind";
    inp.addEventListener("input", () => { stuFind = inp.value.trim().toLowerCase(); window.paintStudents(); });
    search.appendChild(inp);
    bar.appendChild(search);
    const chips = el("div","stuchips");
    [["all","Everyone"],["nopw","No password yet"],["reset","Reset asked"]].forEach(f => {
      const c = el("button","chip-filter", f[1]);
      c.type = "button"; c.dataset.f = f[0];
      c.addEventListener("click", () => { stuFilter = f[0]; window.paintStudents(); });
      chips.appendChild(c);
    });
    bar.appendChild(chips);
    const sort = document.createElement("select");
    sort.className = "sel stusort";
    sort.setAttribute("aria-label", "Sort by");
    [["name","Sort by name"],["user","Sort by username"]].forEach(o => {
      const opt = document.createElement("option"); opt.value = o[0]; opt.textContent = o[1]; sort.appendChild(opt);
    });
    sort.addEventListener("change", () => { stuSort = sort.value; window.paintStudents(); });
    bar.appendChild(sort);
    const bulk = el("div","stubulk"); bulk.id = "stuBulk"; bulk.hidden = true;
    bar.appendChild(bulk);
    const t = $("stuTable");
    t.parentNode.insertBefore(bar, t);
    return bar;
  }
  function paintBulk(){
    const bulk = $("stuBulk");
    if (!bulk) return;
    bulk.innerHTML = "";
    bulk.hidden = !picked.size;
    if (!picked.size) return;
    bulk.appendChild(el("b","", picked.size + " selected"));
    const pw = el("button","btn-ghost bmini2","Set a new password");
    pw.addEventListener("click", bulkPassword);
    bulk.appendChild(pw);
    if (!meCode){
      const mv = el("button","btn-ghost bmini2","Move to another class");
      mv.addEventListener("click", bulkMove);
      bulk.appendChild(mv);
    }
    const clear = el("button","btn-ghost bmini2","Clear");
    clear.addEventListener("click", () => { picked.clear(); window.paintStudents(); });
    bulk.appendChild(clear);
  }
  function chosen(){ return students.filter(st => picked.has(st.username)); }
  function bulkPassword(){
    const list = chosen();
    openModal(box => {
      modalTitle(box, "New password for " + list.length + " student" + (list.length === 1 ? "" : "s"));
      box.appendChild(el("p","modal-text","Everyone ticked gets this password. Ask them to change it once they are in."));
      const p = pwField(box, "New password (12 to 25 characters)");
      const msg = el("p","hint","");
      const go = el("button","btn-primary modal-cta","Set it");
      go.addEventListener("click", async () => {
        const v = p.value;
        if (v.length < 12 || v.length > 25){ msg.textContent = "It must be 12 to 25 characters."; return; }
        let done = 0, failed = 0;
        for (const st of list){
          msg.textContent = "Setting " + (done + failed + 1) + " of " + list.length + "…";
          try{
            const r = await fetch(API + "/api/teacher/update-student", { method:"POST", headers: HJ(),
              body: JSON.stringify({ username: st.username, newPassword: v }) });
            if (!r.ok) throw new Error();
            done++;
          }catch(e){ failed++; }
        }
        closeModal();
        picked.clear();
        loadStudents();
        UI.toast(done + " password" + (done === 1 ? "" : "s") + " set" + (failed ? ", " + failed + " could not be" : ""),
                 failed ? { kind:"error" } : undefined);
      });
      box.appendChild(go); box.appendChild(msg);
    });
  }
  function bulkMove(){
    const list = chosen();
    const others = allClasses().map(g => g.name).filter(n => n.toLowerCase() !== cls.toLowerCase())
                               .sort((a, b) => a.localeCompare(b));
    openModal(box => {
      modalTitle(box, "Move " + list.length + " student" + (list.length === 1 ? "" : "s"));
      if (!others.length){ box.appendChild(el("p","modal-text","There is nowhere to move them to yet.")); return; }
      box.appendChild(el("p","modal-text","Their work, marks and passwords all move with them. Lessons belong to the class, so check the new class has what they need."));
      const w = el("div","field"); w.appendChild(el("label","","Move to"));
      const sel = document.createElement("select");
      others.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
      w.appendChild(sel); box.appendChild(w);
      const msg = el("p","hint","");
      const go = el("button","btn-primary modal-cta","Move them");
      go.addEventListener("click", async () => {
        let done = 0;
        for (const st of list){
          msg.textContent = "Moving " + (done + 1) + " of " + list.length + "…";
          try{
            const r = await fetch(API + "/api/teacher/update-student", { method:"POST", headers: HJ(),
              body: JSON.stringify({ username: st.username, group: sel.value }) });
            if (r.ok) done++;
          }catch(e){}
        }
        closeModal(); picked.clear(); loadStudents(); refreshGroups();
        UI.toast(done + " moved to " + sel.value);
      });
      box.appendChild(go); box.appendChild(msg);
    });
  }
  const basePaintStudents = paintStudents;
  window.paintStudents = function(){
    if (OFFLINE) return basePaintStudents.apply(this, arguments);
    stuTools();
    document.querySelectorAll("#stuTools .chip-filter").forEach(c => c.classList.toggle("on", c.dataset.f === stuFilter));
    /* the table is drawn by the console as before, from a list narrowed and
       sorted here, and then given its ticks */
    const all = students;
    let list = all.filter(st => {
      if (stuFilter === "nopw" && st.pw_set) return false;
      if (stuFilter === "reset" && !st.reset_req) return false;
      if (!stuFind) return true;
      return (String(st.display_name || "") + " " + String(st.username || "")).toLowerCase().includes(stuFind);
    });
    list = list.slice().sort((a, b) => stuSort === "user"
      ? String(a.username || "").localeCompare(String(b.username || ""))
      : String(a.display_name || "").localeCompare(String(b.display_name || "")));
    Array.from(picked).forEach(u => { if (!all.some(st => st.username === u)) picked.delete(u); });
    students = list;
    try{ basePaintStudents.apply(this, arguments); } finally { students = all; }
    const t = $("stuTable");
    const head = el("tr","stuhead");
    const allBox = document.createElement("input");
    allBox.type = "checkbox";
    allBox.setAttribute("aria-label", "Tick everyone shown");
    allBox.checked = list.length > 0 && list.every(st => picked.has(st.username));
    allBox.addEventListener("change", () => {
      list.forEach(st => { if (allBox.checked) picked.add(st.username); else picked.delete(st.username); });
      window.paintStudents();
    });
    const th0 = el("th"); th0.appendChild(allBox); head.appendChild(th0);
    head.appendChild(el("th","", "Name")); head.appendChild(el("th","", "Username")); head.appendChild(el("th","",""));
    t.insertBefore(head, t.firstChild);
    Array.from(t.querySelectorAll("tr:not(.stuhead)")).forEach((tr, i) => {
      const st = list[i];
      if (!st) return;
      const td = el("td","stutick");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = picked.has(st.username);
      box.setAttribute("aria-label", "Tick " + st.display_name);
      box.addEventListener("change", () => {
        if (box.checked) picked.add(st.username); else picked.delete(st.username);
        tr.classList.toggle("picked", box.checked);
        paintBulk();
        const hb = t.querySelector(".stuhead input");
        if (hb) hb.checked = list.every(x => picked.has(x.username));
      });
      td.appendChild(box);
      tr.classList.toggle("picked", box.checked);
      tr.insertBefore(td, tr.firstChild);
    });
    if (!list.length && all.length){
      const tr = el("tr"); const td = el("td","", "Nobody matches that."); td.colSpan = 4; td.className = "hint";
      tr.appendChild(td); t.appendChild(tr);
    }
    paintBulk();
  };

  /* ================= progress: every student against every lesson ================= */
  const basePaintUnitProgress = paintUnitProgress;
  window.paintUnitProgress = function(result){
    basePaintUnitProgress.apply(this, arguments);
    const scored = (result.lessons || []).filter(l => l.mr && l.mr.maxSum > 0);
    if (!scored.length) return;
    const box = $("progressBody");
    const wrap = el("div","heatwrap");
    wrap.appendChild(el("p","unit-head","Every student, every lesson"));
    const scroll = el("div","heatscroll");
    const t = el("table","heat");
    const band = (p) => p === null ? "none" : p >= 80 ? "b4" : p >= 60 ? "b3" : p >= 40 ? "b2" : p >= 20 ? "b1" : "b0";
    const hr = el("tr");
    hr.appendChild(el("th","heat-name",""));
    scored.forEach((l, i) => {
      const th = el("th","heat-col");
      th.appendChild(el("span","", String(i + 1)));
      th.title = l.title;
      hr.appendChild(th);
    });
    hr.appendChild(el("th","heat-col","All"));
    t.appendChild(hr);
    /* the class average first, then each student */
    const avg = el("tr","heat-avg");
    avg.appendChild(el("th","heat-name","Class average"));
    let gotAll = 0, maxAll = 0;
    scored.forEach(l => {
      const p = l.mr.pct;
      gotAll += l.mr.gotSum; maxAll += l.mr.maxSum;
      const td = el("td","heat-cell " + band(p), p === null ? "–" : p + "%");
      td.title = l.title + ": " + (p === null ? "nothing yet" : p + "%");
      avg.appendChild(td);
    });
    const pAll = maxAll ? Math.round(100 * gotAll / maxAll) : null;
    avg.appendChild(el("td","heat-cell " + band(pAll), pAll === null ? "–" : pAll + "%"));
    t.appendChild(avg);
    (result.roster || []).slice().sort((a, b) => String(a.display_name).localeCompare(String(b.display_name))).forEach(st => {
      const tr = el("tr");
      tr.appendChild(el("th","heat-name", st.display_name || st.username));
      let g = 0, m = 0;
      scored.forEach(l => {
        const x = l.mr.byUsername[st.username];
        const p = x && x.max ? Math.round(100 * x.got / x.max) : null;
        if (x){ g += x.got; m += x.max; }
        const td = el("td","heat-cell " + band(p), p === null ? "" : String(p));
        td.title = (st.display_name || st.username) + ", " + l.title + ": " + (p === null ? "nothing yet" : p + "%");
        tr.appendChild(td);
      });
      const pp = m ? Math.round(100 * g / m) : null;
      tr.appendChild(el("td","heat-cell total " + band(pp), pp === null ? "" : String(pp)));
      t.appendChild(tr);
    });
    scroll.appendChild(t);
    wrap.appendChild(scroll);
    const key = el("div","heat-key");
    key.appendChild(el("span","", "Lessons: "));
    scored.forEach((l, i) => key.appendChild(el("span","heat-keyitem", (i + 1) + " " + l.title)));
    wrap.appendChild(key);
    /* straight under the line chart, above the rest */
    const spark = box.querySelector(".progress-spark");
    if (spark && spark.nextSibling) box.insertBefore(wrap, spark.nextSibling);
    else box.insertBefore(wrap, box.firstChild);
  };

  /* ================= switching the layout choices ================= */
  window.addEventListener("hubui", () => {
    paintRail(current);
    repaint();
  });
  /* Draw the screen that is up again, the way Back does. */
  function repaint(){
    try{
      const v = current;
      if (v === "classesView") paintClasses();
      else if (v === "hubView") paintYears();
      else if (v === "hubUnitsView") paintHubUnits();
      else if (v === "hubLessonsView") paintHub();
      else if (v === "lessonsView") paintLessonGrid();
      else if (v === "studentsView") paintStudents();
      else if (v === "classView") openClass(cls);
      else if (v === "progressView") openProgressView();
    }catch(e){}
  }

  /* ================= start ================= */
  headers();
  buildRail();
  staticSkeletons();
  /* whatever is on screen already */
  const up = VIEWS.find(x => $(x) && !$(x).hidden);
  if (up){ current = up; paintRail(up); }

  window.consoleUI = { paintRail, repaint, headers };
})();
