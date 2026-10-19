/* Student Voice for a whole year group, in the console.

   An assessment's markbook shows what one class said about one assessment.
   This adds up every class in a year group across every assessment that
   asked, which is the question a head of department actually has: how did
   Year 8 find this half term? It is a quiet button beside Specification on
   the year group's screen, not a tile of its own, because it is looked at a
   few times a year rather than every lesson.

   The questions, their options and how a saved answer is read all come from
   voice.js, so this and the markbook can never disagree about what an
   answer means. Nothing here writes anything. */
(function(){
  const SV = () => window.studentVoice;

  /* The standard assessments filed under this year group. Only those can
     ask (voice.js says so), and the catalogue knows which they are without
     opening any of them. */
  function yearAssessments(){
    const units = new Set(unitsOfYear(hubYear).map(u => u.name));
    return (cat.lessons || []).filter(l => l.assessment && !l.practical && units.has(l.unit));
  }

  /* Shown only where there is something it could add up. */
  function paintButtons(){
    const any = !!hubYear && !OFFLINE && yearAssessments().length > 0;
    ["yearVoiceBtn", "compVoiceBtn"].forEach(id => { const b = $(id); if (b) b.hidden = !any; });
  }

  async function open(){
    const year = hubYear;
    openModal(box => {
      box.classList.add("wide", "yvoice");
      modalTitle(box, "Student Voice");
      box.appendChild(el("p","pace-sub", year));
      box.appendChild(waiting("Adding up what " + year + " said", true));
    });
    let asked = [], rows = [];
    try{
      /* Which of them asked is in each lesson's own file, so they are opened,
         all at once rather than one after another. */
      const all = yearAssessments();
      const files = await Promise.all(all.map(l => fetchLesson(l.lesson_id).catch(() => null)));
      asked = all.map((l, i) => ({ id: l.lesson_id, title: l.title || l.lesson_id, json: files[i] }))
        .filter(a => a.json && SV().asked(a.json).length);
      if (asked.length){
        const r = await fetch(API + "/api/teacher/voice?lessons=" + encodeURIComponent(asked.map(a => a.id).join(",")),
                              { headers: H(), cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load the answers.");
        rows = d.rows || [];
      }
    }catch(e){
      openModal(box => {
        modalTitle(box, "Could not add them up");
        box.appendChild(el("p","modal-text", e.message === "Failed to fetch" ? "Could not reach the server." : e.message));
        const ok = el("button","btn-primary modal-cta","Close");
        ok.addEventListener("click", closeModal);
        box.appendChild(ok);
      });
      return;
    }
    /* each answer as the work it came from, so voice.js can read it */
    const answers = rows.map(r => {
      const raw = { __voice: r.voice };
      const q = SV().givenOf(raw);
      return { lesson: r.lesson_id, group: r.group_name, q: q,
               a: q ? SV().answerOf(raw, q) : null, skip: !!q && SV().skippedOf(raw) };
    }).filter(x => x.q);
    const state = { lesson: "", group: "" };
    openModal(box => {
      box.classList.add("wide", "yvoice");
      modalTitle(box, "Student Voice");
      const sub = el("p","pace-sub","");
      box.appendChild(sub);
      if (!asked.length){
        sub.textContent = year;
        box.appendChild(el("p","modal-text",
          "None of " + year + "'s assessments ask Student Voice yet. Turn it on in an assessment's Lesson options."));
        return;
      }
      const bar = el("div","yvoice-bar");
      const pickLesson = el("select");
      pickLesson.setAttribute("aria-label", "Which assessment");
      pickLesson.appendChild(new Option("Every assessment", ""));
      asked.forEach(a => pickLesson.appendChild(new Option(a.title, a.id)));
      const classes = Array.from(new Set(answers.map(x => x.group))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const pickGroup = el("select");
      pickGroup.setAttribute("aria-label", "Which class");
      pickGroup.appendChild(new Option("Every class", ""));
      classes.forEach(c => pickGroup.appendChild(new Option(c, c)));
      bar.appendChild(pickLesson); bar.appendChild(pickGroup);
      box.appendChild(bar);
      const grid = el("div","mbvoice");
      box.appendChild(grid);
      const paint = () => {
        const shown = answers.filter(x => (!state.lesson || x.lesson === state.lesson) && (!state.group || x.group === state.group));
        const said = shown.filter(x => x.a !== null).length;
        sub.textContent = year + "  ·  " + (said === 1 ? "1 answer" : said + " answers") +
          (state.group ? " from " + state.group : classes.length > 1 ? " from " + classes.length + " classes" : "");
        grid.innerHTML = "";
        /* every question any of the shown assessments asked, in voice.js's order */
        const ids = new Set();
        asked.filter(a => !state.lesson || a.id === state.lesson).forEach(a => SV().asked(a.json).forEach(q => ids.add(q.id)));
        SV().QUESTIONS.filter(q => ids.has(q.id)).forEach(q => grid.appendChild(card(q, shown.filter(x => x.q === q))));
        if (!grid.children.length) grid.appendChild(el("p","hint","Nobody has answered yet."));
      };
      pickLesson.addEventListener("change", () => { state.lesson = pickLesson.value; paint(); });
      pickGroup.addEventListener("change", () => { state.group = pickGroup.value; paint(); });
      paint();
    });
  }

  /* One question's answers as bars, the way the markbook draws them: the
     most at the top for a scale, a choice in its own order. */
  function card(q, given){
    const c = el("div","mbvoice-q");
    c.appendChild(el("b","mbvoice-ask", q.ask));
    const counts = q.options.map(() => 0);
    given.forEach(x => { if (x.a !== null) counts[x.a]++; });
    const n = counts.reduce((a, b) => a + b, 0);
    const skips = given.filter(x => x.skip).length;
    const order = q.options.map((_, i) => i);
    if (q.ordered) order.reverse();
    order.forEach(i => {
      const line = el("div","mbvoice-row");
      const opt = el("span","mbvoice-opt","");
      const icon = SV().iconOf(q, i, 18);
      if (icon) opt.innerHTML = icon + " ";
      opt.appendChild(document.createTextNode(q.options[i]));
      line.appendChild(opt);
      const barBox = el("span","mbvoice-bar");
      const fill = el("span","mbvoice-fill");
      fill.style.width = (n ? Math.round(100 * counts[i] / n) : 0) + "%";
      barBox.appendChild(fill);
      line.appendChild(barBox);
      line.appendChild(el("span","mbvoice-n", n ? Math.round(100 * counts[i] / n) + "%" : "0"));
      line.title = counts[i] + " of " + n;
      c.appendChild(line);
    });
    c.appendChild(el("span","mbvoice-of", (n === 1 ? "1 answer" : n + " answers") + (skips ? " · " + skips + " skipped" : "")));
    return c;
  }

  /* After admin.html's own handlers, so the year group's screen has been
     drawn by the time the button decides whether to show. */
  const baseOpenYear = window.openYear;
  window.openYear = function(){ const r = baseOpenYear.apply(this, arguments); paintButtons(); return r; };
  ["yearVoiceBtn", "compVoiceBtn"].forEach(id => { const b = $(id); if (b) b.addEventListener("click", open); });
  window.yearVoice = { open: open, paint: paintButtons };
})();
