/* The markbook for an assessment, standard or practical: the marks question
   by question, who has done the response tasks, and what the class said in
   Student Voice, a tab each.

   It used to be a pop-up in the console. It lives on the View work / Mark
   work page now, as the tab Progress is for a lesson, so the marks and the
   work they came from are one click apart. This file only draws it: the
   page that holds it fetches the class, the work and the results and hands
   them to build(), and calls paint() again whenever any of those change.

   Marking is done the same way as the lesson page does it, through
   shortmatch.js and progressmath.js, so a mark here is the mark the
   student was shown. */
(function(){
  function el(tag, cls, text){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function stripTags(s){
    const d = document.createElement("div");
    d.innerHTML = String(s || "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  function niceTime(sec){
    if (!sec) return "";
    const m = Math.floor(sec / 60), r = sec % 60;
    return m ? (m + "m " + r + "s") : (r + "s");
  }

  let lessonJson = null;
  let title = "", group = "";
  let say = function(){};
  let markbookRows = [], markbookTasks = [], markbookQs = [], voiceQs = [];
  /* What the Student Voice tab is narrowed to: one question or all of
     them, and within a question one answer, picked by pressing its bar. */
  let voiceFilter = { q: "", a: null };
  let mbSort = { key:"username", dir:1 };
  /* Which table is up: the marks, who has done the response tasks, or what
     the class said in Student Voice. They used to be stacked, and the second was
     found by scrolling past the first. */
  let mbView = "marks";
  /* What this markbook holds, settled as it is built. kind is "test" for a
     marked assessment, "rubric" or "score" for a practical. level says
     whether Level reached is a column, which it is only when students are
     shown levels: a class shown grade ranges has the range alone. ticks is
     for a practical marked by nothing but its checklists, the only kind
     where ticks done out of ticks there are says how far somebody got. */
  let mbShape = { kind:"test", level:false, ticks:false };

  /* every response and extension task the lesson can hand out */
  function responseTaskIds(){
    const out = [];
    const bank = (lessonJson && lessonJson.responses) || {};
    Object.keys(bank).forEach(topic => (bank[topic] || []).forEach(t => {
      const nice = (lessonJson.topics && lessonJson.topics[topic] && lessonJson.topics[topic].label) || topic;
      if (t.id) out.push({ id: t.id, short: nice.slice(0, 10),
                           label: nice + ": " + (stripTags(t.prompt || t.title || "") || t.type) });
    }));
    ((lessonJson && lessonJson.extensions) || []).forEach(t => {
      if (t.id) out.push({ id: t.id, short: "Ext", label: "Extension: " + (stripTags(t.prompt || t.title || "") || t.type) });
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

  /* Marking, the same way the lesson page does it, so a teacher sees per
     question what each student got. */
  function normAns(x){
    return String(x || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,!?;:'"]+$/g, "");
  }
  function markQuestion(b, v){
    if (b.type === "mc") return { max:1, got: v === b.answer ? 1 : 0 };
    if (b.type === "order"){
      const ok = Array.isArray(v) && v.length === (b.items || []).length && v.every((x, i) => x === i);
      return { max:1, got: ok ? 1 : 0 };
    }
    if (b.type === "blanks"){
      const accepted = [];
      String(b.text || "").replace(/\[\[(.*?)\]\]/g, (_, g) => { accepted.push(g.split("|")); return ""; });
      let got = 0;
      accepted.forEach((set, i) => {
        const given = (v && v[i]) ? String(v[i]) : "";
        if (set.map(normAns).includes(normAns(given))) got++;
      });
      return { max: accepted.length, got: got };
    }
    /* Marked by shortmatch.js, the same code the lesson page and the
       assessment use, so a mark in the markbook is the mark the student
       was shown. */
    if (b.type === "short") return { max:1, got: window.shortAnswer.mark(b, v).ok ? 1 : 0 };
    /* A table and a label picture, the same as everywhere else marks them:
       progressmath.js holds the one copy of those rules. */
    if ((b.type === "table" || b.type === "label" || b.type === "hotspot") && window.progressMath && window.progressMath.scoreTask){
      const m = window.progressMath.scoreTask(b, v);
      return m.max ? { max: m.max, got: m.got } : null;
    }
    /* An exam question, the way computeAssessment() in the lesson page
       marks it: a one line answer by shortmatch, a written one by the marks
       the student gave themselves against the scheme. */
    if (b.type === "exam"){
      let max = Math.max(0, parseInt(b.marks, 10) || 0);
      const said = (v && typeof v === "object") ? String(v.text || "") : String(v || "");
      if (b.answer === "short"){
        if (!max) max = 1;
        return { max: max, got: window.shortAnswer.mark(b, said).ok ? max : 0 };
      }
      const scheme = (b.scheme || []).filter(p => p && p.text);
      if (!max) max = scheme.reduce((t, p) => t + Math.max(1, parseInt(p.marks, 10) || 1), 0);
      const got = (v && v.marks !== undefined && v.marks !== null) ? Math.max(0, Math.min(max, Number(v.marks) || 0)) : 0;
      return { max: max, got: got };
    }
    /* A coding task counts only when its checklist lines carry marks, and
       each ticked line is worth what was put against it, as in the lesson. */
    if (b.type === "ide" || b.type === "web"){
      const checks = Array.isArray(b.checks) ? b.checks : [];
      if (!checks.some(c => (parseInt(c && c.marks, 10) || 0) > 0)) return null;
      const flags = (v && Array.isArray(v.checks)) ? v.checks : [];
      let got = 0, max = 0;
      checks.forEach((c, i) => {
        const worth = Math.max(0, parseInt(c && c.marks, 10) || 0);
        max += worth;
        if (flags[i]) got += worth;
      });
      return { max: max, got: got };
    }
    return null;
  }
  function assessmentQuestions(){
    const out = [];
    let n = 0;
    /* Numbered the way the student saw them: every question counts, reading
       does not, so Q5 here is the question that was 5 on their page. */
    const reading = ["text","picture","embed","link","frame"];
    ((lessonJson && lessonJson.blocks) || []).forEach(b => {
      /* A page is one of the pages in front of the questions, and the
         lesson page gives it no number either. */
      if (reading.includes(b.type) || b.type === "page") return;
      n++;
      if (["mc","order","blanks","short","exam"].includes(b.type) ||
          ((b.type === "table" || b.type === "label" || b.type === "hotspot" ||
            b.type === "ide" || b.type === "web") && markQuestion(b, null))){
        out.push({ id: b.id, n: n, block: b,
                   label: "Q" + n, title: stripTags(b.prompt || b.title || b.task || b.id) });
      }
    });
    return out;
  }
  /* The Student Voice questions worth a filter: the ones the lesson asks, and
     any it has stopped asking that somebody was given before it stopped. */
  function voiceQuestions(work){
    const sv = window.studentVoice;
    if (!sv) return [];
    const asked = sv.asked(lessonJson).map(q => q.id);
    const given = work.map(w => sv.givenOf(w.raw !== undefined ? w.raw : w.data)).filter(Boolean).map(q => q.id);
    return sv.QUESTIONS.filter(q => asked.indexOf(q.id) >= 0 || given.indexOf(q.id) >= 0);
  }

  /* ctx: { lesson, roster, work, results, title, group, say }
     work rows carry data with marking ticks and teacher edits already laid
     over, and raw as the student saved it; the questions are marked from
     raw, the way the lesson page marks them. results are the rows of
     /api/teacher/results, with anything saved on this screen since put in. */
  function build(ctx){
    lessonJson = ctx.lesson;
    title = ctx.title || "";
    group = ctx.group || "";
    say = ctx.say || say;
    const roster = ctx.roster || [], work = ctx.work || [], res = ctx.results || [];
    const pm = window.progressMath;
    const practical = !!(lessonJson && lessonJson.practical);
    const rubric = pm.rubricRun(lessonJson);
    mbShape = { kind: !practical ? "test" : rubric ? "rubric" : "score",
                level: rubric && !pm.showsGrades(lessonJson),
                ticks: practical && pm.checklistOnly(lessonJson) };
    const chain = rubric ? pm.levelChain(lessonJson) : null;
    const ladder = rubric ? pm.levelLadder(lessonJson).map(n => n.trim().toLowerCase()) : [];
    markbookTasks = responseTaskIds();
    markbookQs = assessmentQuestions();
    voiceQs = practical ? [] : voiceQuestions(work);
    if (mbView === "voice" && !voiceQs.length) mbView = "marks";
    if (voiceFilter.q && !voiceQs.some(q => q.id === voiceFilter.q)) voiceFilter = { q: "", a: null };
    markbookRows = roster.map(st => {
      /* By username, so two students with the same name do not share a
         result. The name is only for a server too old to send it. */
      const r = res.find(x => x.username ? x.username === st.username : x.display_name === st.display_name) || null;
      const w = work.find(x => x.username === st.username) || null;
      const raw = w ? (w.raw !== undefined ? w.raw : w.data) : null;
      const marks = {};
      /* A mark a teacher changed by hand is the one the student was
         shown, so it is the one here too. */
      let ov = {};
      try{ ov = (r && r.overrides) ? (JSON.parse(r.overrides) || {}) : {}; }catch(e){ ov = {}; }
      markbookQs.forEach(q => {
        const m = w ? markQuestion(q.block, raw ? raw[q.id] : null) : null;
        if (m && ov[q.id] !== undefined && ov[q.id] !== null)
          m.got = Math.max(0, Math.min(m.max, Number(ov[q.id]) || 0));
        marks[q.id] = (raw && raw.__done) ? m : null;
      });
      /* A rubric practical has no score worth showing: it is stored as 0
         out of 1 so the row exists at all, with the level Mark work
         worked out in the grade. */
      const grade = r ? (r.grade || "") : "";
      /* Their work with whatever a teacher ticked or put right in
         marking laid over it, the same as every total on the site. */
      const seen = w ? w.data : null;
      /* The level. Built in levels, it is read off the coding tasks as
         they stand now, so a student who carries on after marking moves
         up without anybody saving again. Otherwise it is what Mark work
         saved from the list or the questions. levelAt orders the column:
         -1 is somebody with work but no level yet, -2 nothing to say. */
      let level = "", levelAt = -2;
      if (rubric && chain){
        if (seen && pm.hasWork(lessonJson, seen)){
          const lv = pm.levelReached(lessonJson, seen);
          levelAt = lv.at;
          level = lv.reached ? lv.reached.name : "";
        }
      } else if (rubric && grade){
        const at = ladder.indexOf(grade.trim().toLowerCase());
        levelAt = at >= 0 ? at : ladder.length;
        level = grade;
      }
      const entry = level ? pm.rubricEntry(lessonJson, level) : null;
      if (entry) level = entry.name;          // the rubric's own wording
      if (levelAt === -1) level = "Not yet";
      /* Blank where the level has no range written, unless students are
         shown ranges: then there is no Level column, and the column says
         what the student sees, which for a level with no range is its
         name, and for somebody not at the first level yet is that. */
      const grades = pm.showsGrades(lessonJson);
      const range = entry ? (pm.gradeRange(lessonJson, entry.name) || (grades ? entry.name : ""))
                  : grades && levelAt === -1 ? "Not yet" : "";
      const ticks = mbShape.ticks && w ? pm.checklistTicks(lessonJson, seen) : null;
      /* A practical with nothing in it and no feedback written almost
         always means they were away for it. The spreadsheet carries the
         same Strength and Target the marking screen offers for them,
         rather than two blank cells in a report. Anything written by a
         teacher is kept as it is. */
      const said = r && (r.strength || r.target);
      const away = !said && practical && !pm.hasWork(lessonJson, w && w.data);
      const awayWords = away ? pm.absentFeedback(lessonJson) : null;
      /* Each student is given one question, so a row holds which one and
         what they picked, or null where they were given it and moved on. */
      const voiceQ = window.studentVoice && !practical ? window.studentVoice.givenOf(raw) : null;
      const voiceA = voiceQ ? window.studentVoice.answerOf(raw, voiceQ) : null;
      const voiceSkip = !!voiceQ && voiceA === null && window.studentVoice.skippedOf(raw);
      return { name: st.display_name, username: st.username, grade: grade,
               score: r ? r.score : null, outOf: r ? r.out_of : null,
               /* nor does one nobody has graded yet, or a practice one, which is
                  never graded: 0 out of 1 there is "not marked", not nought */
               pct: (r && !grade && !practical) ? Math.round(100 * r.score / Math.max(1, r.out_of)) : null,
               seconds: r ? (r.seconds || 0) : 0,
               strength: awayWords ? awayWords.strength : r ? (r.strength || "") : "",
               target: awayWords ? awayWords.target : r ? (r.target || "") : "",
               level: level, levelAt: levelAt, range: range, ticks: ticks,
               marks: marks, voiceQ: voiceQ, voiceA: voiceA, voiceSkip: voiceSkip, data: seen };
    });
  }

  function sortRows(){
    const k = mbSort.key, d = mbSort.dir;
    const byName = (a, b) => String(a.username || "").toLowerCase().localeCompare(String(b.username || "").toLowerCase());
    const val = (r) => {
      if (k === "name") return r.name.toLowerCase();
      if (k === "username") return String(r.username || "").toLowerCase();
      /* A grade range is ordered by the level it belongs to rather than as
         words, which would put "10" before "9" and "W4" after "S1". */
      if (k === "level" || k === "range") return r.levelAt;
      if (k === "ticks") return r.ticks ? r.ticks.got : -1;
      if (k.indexOf("q:") === 0){ const m = r.marks[k.slice(2)]; return m ? m.got : -1; }
      if (k.indexOf("t:") === 0) return attempted(r.data, k.slice(2)) ? 1 : 0;
      /* The question by where it is in the list; the answer by the
         option's place, so a scale sorts low to high. */
      if (k === "vq") return r.voiceQ ? voiceQs.indexOf(r.voiceQ) : -1;
      if (k === "va") return r.voiceA !== null && r.voiceA !== undefined ? r.voiceA : r.voiceSkip ? -1 : -2;
      return r[k] === null || r[k] === undefined ? -1 : r[k];
    };
    markbookRows.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y) : x - y;
      return c ? c * d : byName(a, b);
    });
  }
  /* A column heading, pressed to sort by it. A press that was the end of a
     drag, or held Shift, was picking cells to copy and does not sort. */
  function headCell(label, key, tip){
    const th = el("th","mbsort" + (mbSort.key === key ? " on" : ""));
    th.appendChild(el("span","", label + (mbSort.key === key ? (mbSort.dir === 1 ? " \u2191" : " \u2193") : "")));
    th.dataset.copy = label;
    if (tip) th.title = tip;
    th.addEventListener("click", (e) => {
      if (e.shiftKey || mbMoved) return;
      if (mbSort.key === key) mbSort.dir = -mbSort.dir;
      else { mbSort.key = key; mbSort.dir = (key === "name" || key === "username") ? 1 : -1; }
      mbSel = null;
      const box = document.getElementById("mbHolder");
      if (box) paint(box);
    });
    return th;
  }
  /* A plain cell, which copies as what it shows unless told otherwise. */
  function mbCell(text, copy){
    const td = el("td","", text);
    if (copy !== undefined) td.dataset.copy = copy;
    return td;
  }
  /* Who the row is, username first, because that is what a school's own
     records are kept against. The same on every markbook. */
  function mbNameHeads(tr){
    tr.appendChild(headCell("Username","username"));
    tr.appendChild(headCell("Display name","name"));
  }
  function mbNameCells(tr, r){
    tr.appendChild(mbCell(r.username || ""));
    tr.appendChild(mbCell(r.name));
  }
  function mbTicks(r){ return r.ticks ? r.ticks.got + " / " + r.ticks.max : ""; }

  /* ---------- Student Voice ----------
     Every student is given one of the questions, so the tab is read one
     question at a time: a row of filters along the top, one per question
     with how many answered it, then how that question was answered, a bar
     per option, then who said what. Pressing a bar narrows the table to the
     students who picked that option, which is what a teacher actually asks
     of it: who said they did not feel supported? */
  function voiceRows(){
    return markbookRows.filter(r => r.voiceQ &&
      (!voiceFilter.q || r.voiceQ.id === voiceFilter.q) &&
      (voiceFilter.a === null || (voiceFilter.a === "skip" ? r.voiceSkip : r.voiceA === voiceFilter.a)));
  }
  function voiceAnswered(q){
    return markbookRows.filter(r => r.voiceQ === q && r.voiceA !== null).length;
  }
  function voiceFilters(holder){
    const row = el("div","mbvoice-filters");
    row.setAttribute("role","group");
    row.setAttribute("aria-label","Show the answers to");
    const total = markbookRows.filter(r => r.voiceQ && r.voiceA !== null).length;
    const pill = (id, label, n, tip) => {
      const b = el("button","mbvoice-pill" + (voiceFilter.q === id ? " on" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", String(voiceFilter.q === id));
      b.appendChild(el("span","", label));
      b.appendChild(el("b","", String(n)));
      if (tip) b.title = tip;
      b.addEventListener("click", () => {
        voiceFilter = { q: id, a: null }; mbSel = null;
        paint(holder);
      });
      row.appendChild(b);
    };
    pill("", "All questions", total, "Every answer, whichever question it was");
    voiceQs.forEach(q => pill(q.id, q.short || q.id, voiceAnswered(q), q.ask));
    return row;
  }
  /* One question's answers as bars. With a question picked, each bar is a
     button: pressed, the table shows only the students who picked it, and
     pressed again, everybody. Under All questions each card is instead the
     way into its own question. */
  function voiceTotals(q, holder, picked){
    const card = el(picked ? "div" : "button", "mbvoice-q" + (picked ? " picked" : ""));
    if (!picked){
      card.type = "button";
      card.title = "Show only this question";
      card.addEventListener("click", () => { voiceFilter = { q: q.id, a: null }; mbSel = null; paint(holder); });
    }
    card.appendChild(el("b","mbvoice-ask", q.ask));
    const counts = q.options.map(() => 0);
    const given = markbookRows.filter(r => r.voiceQ === q);
    given.forEach(r => { if (r.voiceA !== null) counts[r.voiceA]++; });
    const n = counts.reduce((x, y) => x + y, 0);
    const skips = given.filter(r => r.voiceSkip).length;
    /* The most at the top: Very well above Not at all, Too fast above Too
       slow, the way a chart of how something went is read. A choice
       between different things stays in its own order. */
    const order = q.options.map((_, i) => i);
    if (q.ordered) order.reverse();
    /* Skipped is a row of its own under a picked question, so who skipped
       can be listed too, but it is not an answer and has no bar. */
    if (picked && skips) order.push("skip");
    order.forEach(i => {
      const isSkip = i === "skip";
      const text = isSkip ? "Skipped" : q.options[i];
      const line = el(picked ? "button" : "div", "mbvoice-row" + (picked && voiceFilter.a === i ? " on" : "") + (isSkip ? " skip" : ""));
      if (picked){
        line.type = "button";
        line.setAttribute("aria-pressed", String(voiceFilter.a === i));
        line.title = voiceFilter.a === i ? "Show everyone again" : "Show only the students who picked this";
        line.addEventListener("click", () => {
          voiceFilter.a = voiceFilter.a === i ? null : i; mbSel = null;
          paint(holder);
        });
      }
      const icon = (!isSkip && q.icons && q.icons[i]) || "";
      line.appendChild(el("span","mbvoice-opt", (icon ? icon + " " : "") + text));
      const bar = el("span","mbvoice-bar");
      if (!isSkip){
        const fill = el("span","mbvoice-fill");
        fill.style.width = (n ? Math.round(100 * counts[i] / n) : 0) + "%";
        bar.appendChild(fill);
      } else bar.classList.add("empty");
      line.appendChild(bar);
      line.appendChild(el("span","mbvoice-n", String(isSkip ? skips : counts[i])));
      card.appendChild(line);
    });
    const passed = given.length - n - skips;
    card.appendChild(el("span","mbvoice-of",
      (n === 1 ? "1 answer" : n + " answers") +
      (skips ? " · " + skips + " skipped" : "") +
      (passed ? " · " + passed + " moved on without answering" : "")));
    return card;
  }
  /* The filters, the bars and then the table, which has a Question column
     only while every question is showing. Says how many rows it drew. */
  function paintVoice(holder, table, head){
    holder.appendChild(voiceFilters(holder));
    const q = voiceFilter.q ? window.studentVoice.byId[voiceFilter.q] : null;
    if (q) holder.appendChild(voiceTotals(q, holder, true));
    else {
      const grid = el("div","mbvoice");
      voiceQs.forEach(x => grid.appendChild(voiceTotals(x, holder, false)));
      holder.appendChild(grid);
    }
    if (q && voiceFilter.a !== null){
      const note = el("p","mbvoice-showing");
      note.appendChild(document.createTextNode(voiceFilter.a === "skip" ? "Showing only the students who skipped it. "
        : "Showing only the students who picked “" + q.options[voiceFilter.a] + "”. "));
      const all = el("button","bank-link","Show everyone");
      all.type = "button";
      all.addEventListener("click", () => { voiceFilter.a = null; mbSel = null; paint(holder); });
      note.appendChild(all);
      holder.appendChild(note);
    }
    if (!q) head.appendChild(headCell("Question","vq"));
    head.appendChild(headCell("Answer","va"));
    table.appendChild(head);
    const rows = voiceRows();
    rows.forEach(r => {
      const tr = el("tr");
      mbNameCells(tr, r);
      if (!q){
        const td = mbCell(r.voiceQ.short || r.voiceQ.id);
        td.title = r.voiceQ.ask;
        tr.appendChild(td);
      }
      if (r.voiceA === null){
        const none = el("td","mbvoice-none", r.voiceSkip ? "Skipped" : "No answer");
        none.dataset.copy = r.voiceSkip ? "Skipped" : "";
        tr.appendChild(none);
      } else tr.appendChild(mbCell(r.voiceQ.options[r.voiceA]));
      table.appendChild(tr);
    });
    return rows.length;
  }

  function paint(holder){
    holder.id = "mbHolder";
    holder.innerHTML = "";
    mbMoved = false;          // a drag on the table that has gone says nothing about this one
    sortRows();
    const practical = mbShape.kind !== "test";
    const done = markbookRows.filter(r => r.score !== null || r.grade);
    const pcts = done.filter(r => r.pct !== null).map(r => r.pct);
    const times = done.filter(r => r.seconds > 0).map(r => r.seconds);
    const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    const stats = el("div","mbstats");
    /* Only the figures there is something to say for: a practical has no
       percentages, and a row of empty boxes reads as broken. */
    [[practical ? "Marked" : "Finished", done.length + " of " + markbookRows.length],
     ["Average", pcts.length ? avg(pcts) + "%" : ""],
     ["Lowest", pcts.length ? Math.min.apply(null, pcts) + "%" : ""],
     ["Highest", pcts.length ? Math.max.apply(null, pcts) + "%" : ""],
     ["Average time", times.length ? niceTime(avg(times)) : ""]].forEach(p => {
      if (!p[1]) return;
      const c = el("div","mbstat");
      c.appendChild(el("b","", p[1]));
      c.appendChild(el("span","", p[0]));
      stats.appendChild(c);
    });
    holder.appendChild(stats);

    /* The tables, a tab each, with what can be done with the table at the
       other end of the same row: never scrolled away, and small, because
       the table is what the page is for. Student Voice only where the
       assessment asks for it, or somebody has answered. */
    const bar = el("div","mbbar");
    const tabs = el("div","subtabs mbtabs");
    const views = [["marks","Marks"],["responses","Response tasks"]];
    if (voiceQs.length) views.push(["voice","Student Voice"]);
    views.forEach(pair => {
      const b = el("button", mbView === pair[0] ? "on" : "", pair[1]);
      b.type = "button";
      b.addEventListener("click", () => {
        if (mbView === pair[0]) return;
        mbView = pair[0]; mbSel = null;
        paint(holder);
      });
      tabs.appendChild(b);
    });
    bar.appendChild(tabs);
    const tools = el("div","mbtools");
    const copyAll = el("button","btn-ghost bmini2","Copy all");
    copyAll.type = "button";
    copyAll.title = "Copy the whole table, ready to paste into a spreadsheet";
    copyAll.addEventListener("click", async () => {
      const t = holder.querySelector(".mbtable");
      if (!t) return;
      mbSel = { table: t, a: [0, 0], b: [t.rows.length - 1, t.rows[0].cells.length - 1] };
      mbPaintSel();
      copyAll.textContent = (await mbCopyOut()) ? "Copied" : "Press Ctrl+C";
      setTimeout(() => { copyAll.textContent = "Copy all"; }, 1600);
    });
    const excel = el("button","btn-ghost bmini2","Save for Excel");
    excel.type = "button";
    excel.addEventListener("click", exportMarkbook);
    tools.appendChild(copyAll);
    tools.appendChild(excel);
    bar.appendChild(tools);
    holder.appendChild(bar);

    const table = el("table","mbtable");
    const head = el("tr");
    mbNameHeads(head);
    let voiceShown = -1;
    if (mbView === "voice"){
      voiceShown = paintVoice(holder, table, head);
    } else if (mbView === "responses"){
      if (!markbookTasks.length){
        holder.appendChild(el("p","hint","This assessment has no response tasks yet."));
        return;
      }
      markbookTasks.forEach(t => head.appendChild(headCell(t.short, "t:" + t.id, t.label)));
      table.appendChild(head);
      markbookRows.forEach(r => {
        const tr = el("tr");
        mbNameCells(tr, r);
        markbookTasks.forEach(t => {
          const td = el("td","mbtick");
          const ok = attempted(r.data, t.id);
          td.appendChild(el("span", ok ? "yes" : "no", ok ? "\u2713" : "\u2717"));
          td.dataset.copy = ok ? "Yes" : "No";
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
    } else if (mbShape.kind === "test"){
      /* The percentage and the time are in the figures above the table and
         in the spreadsheet; the table is the marks, question by question. */
      head.appendChild(headCell("Marks","score"));
      markbookQs.forEach(q => head.appendChild(headCell(q.label, "q:" + q.id, q.title)));
      table.appendChild(head);
      markbookRows.forEach(r => {
        const tr = el("tr");
        mbNameCells(tr, r);
        tr.appendChild(mbCell(r.score === null ? "" : r.score + " / " + r.outOf));
        markbookQs.forEach(q => {
          const m = r.marks[q.id];
          const td = el("td","mbtick");
          if (!m) td.appendChild(el("span","none",""));
          else if (m.got === m.max) td.appendChild(el("span","yes", m.max > 1 ? m.got + "/" + m.max : "\u2713"));
          else if (m.got > 0) td.appendChild(el("span","part", m.got + "/" + m.max));
          else td.appendChild(el("span","no","\u2717"));
          /* the mark itself, the same as the spreadsheet: "1/2" pasted into
             Excel turns into a date */
          td.dataset.copy = m ? String(m.got) : "";
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
    } else {
      if (mbShape.kind === "rubric"){
        if (mbShape.level) head.appendChild(headCell("Level reached","level"));
        head.appendChild(headCell("Grade range","range"));
      } else head.appendChild(headCell("Mark","score"));
      if (mbShape.ticks) head.appendChild(headCell("Ticks","ticks","Checklist lines ticked, out of all of them"));
      table.appendChild(head);
      markbookRows.forEach(r => {
        const tr = el("tr");
        mbNameCells(tr, r);
        if (mbShape.kind === "rubric"){
          if (mbShape.level) tr.appendChild(mbCell(r.level));
          tr.appendChild(mbCell(r.range));
        } else tr.appendChild(mbCell(r.score === null ? "" : r.score + " / " + r.outOf));
        if (mbShape.ticks) tr.appendChild(mbCell(mbTicks(r)));
        table.appendChild(tr);
      });
    }
    const scroll = el("div","mbscroll");
    scroll.appendChild(table);
    holder.appendChild(scroll);
    mbSelectable(table);
    if (mbView === "marks" && mbShape.kind === "test" && !markbookQs.length)
      holder.appendChild(el("p","hint","No marked questions in this assessment."));
    if (voiceShown === 0)
      holder.appendChild(el("p","hint","Nobody here yet. A student is asked as they finish the assessment."));

    /* how to copy part of it, said once under the table */
    holder.appendChild(el("p","subnote mbhint","Click a cell, then drag or Shift-click to pick more. Ctrl+C copies them."));
  }

  /* ---------- picking cells to copy ----------
     A markbook is mostly wanted somewhere else: a school's tracking sheet,
     a report, an email. Selecting text across a table selects it in reading
     order, ticks and arrows and all, and pastes into a spreadsheet as one
     column, so the cells are picked here instead, the way a spreadsheet
     picks them, and go to the clipboard as rows and columns. Each cell can
     say what it copies as, so a tick goes as Yes and a mark as a number. */
  let mbSel = null;          // { table, a:[row, cell], b:[row, cell] }
  let mbDrag = false, mbMoved = false;
  function mbAt(cell){ return [cell.parentNode.rowIndex, cell.cellIndex]; }
  function mbBox(){
    if (!mbSel) return null;
    return { r0: Math.min(mbSel.a[0], mbSel.b[0]), r1: Math.max(mbSel.a[0], mbSel.b[0]),
             c0: Math.min(mbSel.a[1], mbSel.b[1]), c1: Math.max(mbSel.a[1], mbSel.b[1]) };
  }
  function mbPaintSel(){
    if (!mbSel) return;
    const box = mbBox();
    Array.from(mbSel.table.rows).forEach((tr, r) => Array.from(tr.cells).forEach((c, k) => {
      c.classList.toggle("mbsel", r >= box.r0 && r <= box.r1 && k >= box.c0 && k <= box.c1);
    }));
  }
  function mbSelectable(table){
    table.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const cell = e.target.closest("td,th");
      if (!cell || !table.contains(cell)) return;
      /* the browser's own text selection would fight this one */
      e.preventDefault();
      const at = mbAt(cell);
      if (e.shiftKey && mbSel && mbSel.table === table) mbSel.b = at;
      else mbSel = { table: table, a: at, b: at };
      mbDrag = true; mbMoved = false;
      mbPaintSel();
    });
    table.addEventListener("mouseover", (e) => {
      if (!mbDrag || !mbSel || mbSel.table !== table) return;
      const cell = e.target.closest("td,th");
      if (!cell || !table.contains(cell)) return;
      const at = mbAt(cell);
      if (at[0] === mbSel.b[0] && at[1] === mbSel.b[1]) return;
      mbSel.b = at; mbMoved = true;
      mbPaintSel();
    });
  }
  /* What the picked cells say, as tab-separated text and as a table. The
     table is what a spreadsheet takes when it can, and each cell is marked
     as text, so a grade range like 4-5 or a count like 12 / 23 is not
     turned into a date on the way in. A plain number stays a number. */
  function mbSelected(){
    const box = mbBox();
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = [], html = [];
    for (let r = box.r0; r <= box.r1; r++){
      const tr = mbSel.table.rows[r];
      if (!tr) continue;
      const cells = [], tds = [];
      for (let k = box.c0; k <= box.c1; k++){
        const c = tr.cells[k];
        const v = c ? (c.dataset.copy !== undefined ? c.dataset.copy : c.textContent.trim()) : "";
        cells.push(v.replace(/[\t\r\n]+/g, " "));
        tds.push(/^-?\d+(\.\d+)?$/.test(v) || v === "" ? "<td>" + esc(v) + "</td>"
                 : "<td style='mso-number-format:\"\\@\"'>" + esc(v) + "</td>");
      }
      lines.push(cells.join("\t"));
      html.push("<tr>" + tds.join("") + "</tr>");
    }
    return { text: lines.join("\r\n"), html: "<table>" + html.join("") + "</table>",
             count: (box.r1 - box.r0 + 1) * (box.c1 - box.c0 + 1) };
  }
  /* For the button, which is not a copy the browser started, so it has to
     ask the clipboard itself. True when it worked. */
  async function mbCopyOut(){
    if (!mbSel || !navigator.clipboard) return false;
    const out = mbSelected();
    try{
      if (window.ClipboardItem && navigator.clipboard.write){
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([out.text], { type: "text/plain" }),
          "text/html": new Blob([out.html], { type: "text/html" }) })]);
        return true;
      }
    }catch(e){ /* the plain text alone is still worth having */ }
    try{ await navigator.clipboard.writeText(out.text); return true; }
    catch(e){ return false; }
  }
  document.addEventListener("mouseup", () => { mbDrag = false; });
  /* Ctrl+C is the browser's own copy, so it needs no permission from
     anybody: a school can switch off the clipboard for scripts and this
     still works. Nothing is selected on the page while cells are picked,
     though, and a copy with nothing selected copies nothing, so the keydown
     below puts the picked cells into a box off the screen and selects them
     just before the browser copies. This then adds the same cells as a
     table, which is what a spreadsheet takes when it can, and tidies the
     box away. */
  let mbCopyBox = null, mbCopyFrom = null;
  function mbCopyDone(){
    if (!mbCopyBox) return;
    const box = mbCopyBox;
    mbCopyBox = null;
    box.remove();
    /* back to wherever the keyboard was */
    if (mbCopyFrom && document.body.contains(mbCopyFrom) && mbCopyFrom.focus) mbCopyFrom.focus({ preventScroll: true });
    mbCopyFrom = null;
  }
  document.addEventListener("copy", (e) => {
    if (!mbCopyBox || !mbSel || !document.body.contains(mbSel.table)) return;
    const out = mbSelected();
    e.clipboardData.setData("text/plain", out.text);
    e.clipboardData.setData("text/html", out.html);
    e.preventDefault();
    setTimeout(mbCopyDone, 0);
  });
  /* Ctrl+A picks the whole table while one is on screen and nothing is
     being typed, and Ctrl+C copies what is picked. Text somebody has
     selected on purpose, or a box being typed in, keeps the browser's own
     copy. A markbook on a tab that is not showing is not on screen: the
     work beside it keeps its own Ctrl+A. */
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key !== "a" && key !== "c") return;
    const t = document.querySelector("#mbHolder .mbtable");
    if (!t || !t.rows.length || !t.getClientRects().length) return;
    const f = document.activeElement;
    if (f && f.closest && f.closest("input, textarea, select, [contenteditable=true], .rt-box")) return;
    if (key === "c"){
      if (!mbSel || mbSel.table !== t) return;
      if (window.getSelection && String(window.getSelection()).trim()) return;
      mbCopyDone();
      mbCopyFrom = document.activeElement;
      const box = document.createElement("textarea");
      box.className = "mbcopybox";
      box.setAttribute("aria-hidden", "true");
      box.tabIndex = -1;
      box.value = mbSelected().text;
      document.body.appendChild(box);
      box.focus({ preventScroll: true });
      box.select();
      mbCopyBox = box;
      /* A browser that copies without raising the event still copied the
         text; the box only has to go. */
      setTimeout(mbCopyDone, 400);
      return;                 // not prevented: the browser's copy is the point
    }
    e.preventDefault();
    mbSel = { table: t, a: [0, 0], b: [t.rows.length - 1, t.rows[0].cells.length - 1] };
    mbPaintSel();
  });

  /* Excel opens a table like this directly, no add-ins, nothing to install. */
  function exportMarkbook(){
    if (mbShape.kind !== "test") return exportPracticalMarkbook();
    /* The markbook's own columns first, in its order, then what the
       table leaves to the figures above it and to the feedback, then what
       they said in Student Voice. */
    const head = ["Username","Display name","Marks","Out of"];
    markbookQs.forEach(q => head.push(q.label + " " + q.title));
    head.push("Percent","Time taken","Strength","Target");
    markbookTasks.forEach(t => head.push(t.label));
    if (voiceQs.length) head.push("Student Voice question","Student Voice answer");
    const rows = [head];
    markbookRows.forEach(r => {
      const row = [r.username || "", r.name,
                   r.score === null ? "" : r.score, r.outOf === null ? "" : r.outOf];
      markbookQs.forEach(q => { const m = r.marks[q.id]; row.push(m ? m.got : ""); });
      row.push(r.pct === null ? "" : r.pct, r.seconds ? niceTime(r.seconds) : "", r.strength, r.target);
      markbookTasks.forEach(t => row.push(attempted(r.data, t.id) ? "Yes" : "No"));
      if (voiceQs.length) row.push(r.voiceQ ? r.voiceQ.ask : "",
                                   r.voiceQ && r.voiceA !== null ? r.voiceQ.options[r.voiceA] : r.voiceSkip ? "Skipped" : "");
      rows.push(row);
    });
    mbSave(rows);
  }
  /* A practical's spreadsheet has the same columns as its markbook, in the
     same order, then the Strength, the Target and the response tasks. */
  function exportPracticalMarkbook(){
    const head = ["Username","Display name"];
    if (mbShape.kind === "rubric"){
      if (mbShape.level) head.push("Level reached");
      head.push("Grade range");
    } else head.push("Mark","Out of");
    if (mbShape.ticks) head.push("Ticks","Out of");
    head.push("Strength","Target");
    markbookTasks.forEach(t => head.push(t.label));
    const rows = [head];
    markbookRows.forEach(r => {
      const row = [r.username || "", r.name];
      if (mbShape.kind === "rubric"){
        if (mbShape.level) row.push(r.level);
        row.push(r.range);
      } else row.push(r.score === null ? "" : r.score, r.outOf === null ? "" : r.outOf);
      if (mbShape.ticks) row.push(r.ticks ? r.ticks.got : "", r.ticks ? r.ticks.max : "");
      row.push(r.strength, r.target);
      markbookTasks.forEach(t => row.push(attempted(r.data, t.id) ? "Yes" : "No"));
      rows.push(row);
    });
    mbSave(rows);
  }
  function mbSave(rows){
    const name = (title + " " + group).replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "-") + ".xlsx";
    if (window.saveXlsx) window.saveXlsx(rows, "Markbook", name);
    else say("Could not build the file", "The spreadsheet builder did not load.");
  }

  window.markbook = { build: build, paint: paint };
})();
