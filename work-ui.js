/* =====================================================================
   work-ui.js, the marking page's shortcuts and helpers.

     Keyboard       ← and → move between students, M goes to the mark,
                    Ctrl+Enter (or Enter in the mark box) saves and moves on,
                    ? lists the keys
     Who is left    the student list says who is marked, who is not and who
                    has handed in nothing, with "Unmarked only" to skip the
                    ones already done
     Comment bank   what has been written in each box before, in this
                    browser, to put back in with a click
     Answers        the right answers, mark scheme or checklist for the page
                    on screen, beside the student's work

   Built on work.html's own functions and values, read by name when used.
   Nothing here is saved to the server beyond what Save feedback already
   sends: the comment bank lives in this browser.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof PRACTICE === "undefined" || PRACTICE) return;
  const UI = window.hubUI;
  const toast = (w, o) => UI ? UI.toast(w, o) : null;

  /* ================= who is marked ================= */
  function isMarked(st){
    if (!st) return false;
    const row = rows.find(r => r.username === st.username);
    if (row && row.feedback){
      try{
        const f = JSON.parse(row.feedback);
        if (String(f.strength || f.target || f.comment || "").trim()) return true;
      }catch(e){ if (String(row.feedback).trim()) return true; }
    }
    const mk = (typeof marks !== "undefined") ? marks[st.username] : null;
    return !!(mk && (mk.grade || typeof mk.score === "number"));
  }
  const hasWork = (st) => !!rows.find(r => r.username === st.username);
  let unmarkedOnly = false;
  try{ unmarkedOnly = sessionStorage.getItem("hub_unmarked_only") === "1"; }catch(e){}

  const basePaintPicker = paintPicker;
  window.paintPicker = function(){
    basePaintPicker.apply(this, arguments);
    const sel = $("stuPick");
    if (!sel) return;
    Array.from(sel.options).forEach(o => {
      const st = roster[Number(o.value)];
      if (!st) return;
      const mark = isMarked(st) ? "✓ " : hasWork(st) ? "● " : "– ";
      o.textContent = mark + o.textContent;
      /* marked ones stay in the list so the one on screen can always be shown,
         but are greyed while only the unmarked are wanted */
      o.disabled = unmarkedOnly && isMarked(st) && Number(o.value) !== idx;
    });
    paintCount();
  };
  function paintCount(){
    const n = roster.filter(isMarked).length;
    const c = $("markCount");
    if (c) c.textContent = n + " of " + roster.length + " marked";
  }
  /* The next one along, skipping the marked ones when asked to. */
  function step(d){
    let i = idx + d;
    while (i >= 0 && i < roster.length && unmarkedOnly && isMarked(roster[i])) i += d;
    if (i < 0 || i >= roster.length){
      toast(unmarkedOnly ? "Nobody left to mark that way" : (d > 0 ? "That was the last student" : "That was the first student"));
      return false;
    }
    showStudent(i);
    return true;
  }
  function wireBar(){
    const bar = document.querySelector(".workbar");
    if (!bar || $("unmarkedOnly")) return;
    const lab = el("label","onlyunmarked");
    const box = document.createElement("input");
    box.type = "checkbox"; box.id = "unmarkedOnly"; box.checked = unmarkedOnly;
    box.addEventListener("change", () => {
      unmarkedOnly = box.checked;
      try{ sessionStorage.setItem("hub_unmarked_only", unmarkedOnly ? "1" : "0"); }catch(e){}
      paintPicker();
      if (unmarkedOnly && isMarked(roster[idx])) step(1);
    });
    lab.appendChild(box);
    lab.appendChild(document.createTextNode(" Unmarked only"));
    bar.appendChild(lab);
    bar.appendChild(el("span","markcount")).id = "markCount";
    const keys = el("button","btn-ghost bmini2 keyhelp","Keys");
    keys.title = "Keyboard shortcuts (?)";
    keys.addEventListener("click", showKeys);
    bar.appendChild(keys);
    /* the arrows either side of the list skip the marked ones too */
    ["prevStu","nextStu"].forEach((id, k) => {
      const b = $(id);
      if (b) b.addEventListener("click", (e) => { e.stopImmediatePropagation(); step(k ? 1 : -1); }, true);
    });
  }

  /* ================= keyboard ================= */
  function typing(t){ return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  function saveThenNext(){
    const btn = $("saveFb");
    if (!btn || btn.disabled && btn.dataset.saved !== "yes") return;
    if (btn.dataset.saved === "yes"){ step(1); return; }
    btn.click();
    /* wait for Save to say it is done, then move on; if a question came up
       instead (one of the two boxes empty), leave it with the teacher */
    const started = Date.now();
    const look = () => {
      if (btn.dataset.saved === "yes"){ step(1); return; }
      if (!$("mBack").hidden || Date.now() - started > 10000) return;
      setTimeout(look, 150);
    };
    setTimeout(look, 150);
  }
  function showKeys(){
    openModal(box => {
      box.classList.add("narrow");
      box.appendChild(el("h2","","Keyboard shortcuts"));
      const list = el("div","keylist");
      [["←  →", "Previous and next student"],
       ["M", "Go to the mark (or the first feedback box)"],
       ["Ctrl + Enter", "Save feedback and go to the next student"],
       ["Enter", "In the mark box: the same"],
       ["U", "Only unmarked students, on and off"],
       ["?", "This list"]].forEach(k => {
        const r = el("div","keyrow");
        r.appendChild(el("kbd","", k[0]));
        r.appendChild(el("span","", k[1]));
        list.appendChild(r);
      });
      box.appendChild(list);
      const ok = el("button","btn-primary modal-cta","Got it");
      ok.addEventListener("click", closeModal);
      box.appendChild(ok);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!$("mBack").hidden) return;
    if ($("workPane") && $("workPane").hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){ e.preventDefault(); saveThenNext(); return; }
    if (e.key === "Enter" && e.target && e.target.id === "fbScore"){ e.preventDefault(); saveThenNext(); return; }
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowRight"){ e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft"){ e.preventDefault(); step(-1); }
    else if (e.key === "m" || e.key === "M"){
      e.preventDefault();
      const target = !$("markWrap").hidden ? ($("fbGrade").hidden ? $("fbScore") : $("fbGrade")) : $("fbStrength");
      if (target) target.focus();
    }
    else if (e.key === "u" || e.key === "U"){ const b = $("unmarkedOnly"); if (b){ b.click(); } }
    else if (e.key === "?"){ e.preventDefault(); showKeys(); }
  });

  /* ================= comment bank ================= */
  const BANK = "hub_fb_bank";
  function bank(){ try{ return JSON.parse(localStorage.getItem(BANK) || "{}"); }catch(e){ return {}; } }
  function remember(kind, text){
    const t = String(text || "").trim();
    if (!t) return;
    const b = bank();
    const list = (b[kind] || []).filter(x => x.t !== t);
    const was = (b[kind] || []).find(x => x.t === t);
    list.unshift({ t, n: (was ? was.n : 0) + 1, at: Date.now() });
    b[kind] = list.slice(0, 80);
    try{ localStorage.setItem(BANK, JSON.stringify(b)); }catch(e){}
  }
  const BOXES = [["strength","fbStrength","bankStrength"],["target","fbTarget","bankTarget"],["comment","fbComment",null]];
  function reuseButtons(){
    BOXES.forEach(([kind, boxId, holderId]) => {
      const area = $(boxId);
      if (!area) return;
      let holder = holderId ? $(holderId) : area.parentNode.querySelector(".bank.reusebank");
      if (!holder){ holder = el("div","bank reusebank"); area.parentNode.appendChild(holder); }
      /* the page redraws its own bank button for each student, which empties
         the holder, so this is put back every time */
      if (holder.querySelector(".reusewrap")) return;
      const wrap = el("span","reusewrap");
      const btn = el("button","btn-ghost bmini2","Reuse…");
      btn.type = "button";
      btn.title = "What you have written in this box before";
      btn.addEventListener("click", () => reusePopup(kind, area));
      wrap.appendChild(btn);
      holder.appendChild(wrap);
    });
  }
  function reusePopup(kind, area){
    const items = (bank()[kind] || []).slice().sort((a, b) => (b.n - a.n) || (b.at - a.at));
    openModal(box => {
      box.classList.add("narrow");
      box.appendChild(el("h2","", kind === "strength" ? "Strengths you have used" :
                                   kind === "target" ? "Targets you have used" : "Comments you have used"));
      if (!items.length){
        box.appendChild(el("p","modal-text","Nothing yet. Whatever you save in this box is kept here, in this browser, to use again."));
      } else {
        box.appendChild(el("p","modal-text","Click one to add it to the box. The most used are first."));
        const find = el("input","searchbox bankfind"); find.placeholder = "Search";
        box.appendChild(find);
        const list = el("div","reuselist");
        items.forEach(it => {
          const b = el("button","reuseitem");
          b.type = "button";
          b.appendChild(el("span","", it.t));
          if (it.n > 1) b.appendChild(el("span","reusen", "×" + it.n));
          b.addEventListener("click", () => {
            const now = area.value.trim();
            area.value = now ? now + (/[.!?]$/.test(now) ? " " : ". ") + it.t : it.t;
            area.dispatchEvent(new Event("input", { bubbles:true }));
            closeModal();
            area.focus();
          });
          list.appendChild(b);
        });
        box.appendChild(list);
        find.addEventListener("input", () => {
          const q = find.value.toLowerCase();
          Array.from(list.children).forEach(c => { c.hidden = q && !c.textContent.toLowerCase().includes(q); });
        });
        setTimeout(() => find.focus(), 0);
      }
      const shut = el("button","btn-ghost modal-stay","Close");
      shut.addEventListener("click", closeModal);
      box.appendChild(shut);
    });
  }
  const baseSave = saveFeedback;
  window.saveFeedback = async function(){
    const before = BOXES.map(([kind, boxId]) => [kind, ($(boxId) || {}).value || ""]);
    const out = await baseSave.apply(this, arguments);
    if ($("saveFb") && $("saveFb").dataset.saved === "yes"){
      before.forEach(([kind, text]) => remember(kind, text));
      paintPicker();
    }
    return out;
  };

  /* ================= the answers beside the work ================= */
  function plain(v){ return String(v || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
  function pagesOf(){ return ((lessonJson && lessonJson.blocks) || []); }
  function tasksOn(page){
    const out = [];
    (function walk(list){
      (list || []).forEach(b => {
        if (!b) return;
        if (b.blocks && (b.type === "page" || b.type === "group" || b.type === "extension")){ walk(b.blocks); return; }
        if (b.type === "choice"){ (b.options || []).forEach(o => walk(o.blocks)); return; }
        out.push(b);
      });
    })(page && page.type === "page" ? page.blocks : [page]);
    return out;
  }
  function answerRows(b, data){
    const rowsOut = [];
    const add = (label, text, cls) => rowsOut.push({ label, text, cls });
    const theirs = data ? data[b.id] : undefined;
    switch (b.type){
      case "quiz":
        (b.questions || []).forEach((q, i) => {
          const right = (q.answers || [q.answer || 0]).map(a => (q.options || [])[a]).filter(x => x !== undefined);
          add((b.questions.length > 1 ? "Q" + (i + 1) + " " : "") + plain(q.q), right.join(" / "));
        });
        break;
      case "mc":
        add(plain(b.prompt), (b.options || [])[b.answer || 0] || "");
        break;
      case "short":
        add(plain(b.prompt), (b.answers || []).join(" / "));
        if (typeof theirs === "string" && theirs.trim()) add("Their answer", theirs, "theirs");
        break;
      case "blanks": {
        const gaps = []; String(b.text || "").replace(/\[\[([^\]]+)\]\]/g, (m, x) => { gaps.push(x); return m; });
        add(plain(b.prompt) || "The gaps", gaps.join(", "));
        break;
      }
      case "order":
        add(plain(b.prompt) || "In order", (b.items || []).filter(Boolean).map((x, i) => (i + 1) + ". " + x).join("  "));
        break;
      case "label":
        add(plain(b.title) || "Labels", (b.spots || []).map((s, i) => (i + 1) + ". " + (s.answer || "")).join("  "));
        break;
      case "table": {
        const cells = [];
        (b.rows || []).forEach(r => (r || []).forEach(c => { if (c && c.fill && String(c.t || "").trim()) cells.push(c.t); }));
        if (cells.length) add(plain(b.title || b.task) || "Table", cells.join(", "));
        break;
      }
      case "exam":
        add(plain(b.prompt), (b.answer === "short" ? (b.answers || []).join(" / ")
          : (Array.isArray(b.scheme) ? b.scheme : []).map(p => "• " + p.text + " (" + (p.marks || 1) + ")").join("\n")));
        if (b.model) add("A full answer", b.model);
        break;
      case "question": {
        const words = typeof theirs === "string" ? theirs : (theirs && theirs.text) || "";
        const n = String(words).trim() ? String(words).trim().split(/\s+/).length : 0;
        add(plain(b.prompt), "Recommended " + (b.minWords === undefined ? 20 : b.minWords) + " words; they wrote " + n, "theirs");
        break;
      }
      case "ide": case "web": {
        const flags = theirs && Array.isArray(theirs.checks) ? theirs.checks : null;
        (b.checks || []).forEach((c, i) => {
          const ok = flags ? !!flags[i] : null;
          add((ok === null ? "○ " : ok ? "✓ " : "✗ ") + (c.label || "Check " + (i + 1)),
              c.manual ? "You tick this one" : "", ok === null ? "" : ok ? "ok" : "no");
        });
        if (!(b.checks || []).length) add(plain(b.title || b.task) || "Coding task", "No checklist");
        break;
      }
    }
    return rowsOut;
  }
  function paintAnswers(){
    const panel = $("answerPanel");
    if (!panel || panel.classList.contains("shut")) return;
    const body = panel.querySelector(".ans-body");
    body.innerHTML = "";
    const pages = pagesOf();
    const st = roster[idx];
    const row = st ? rows.find(r => r.username === st.username) : null;
    const data = row ? row.data : null;
    const list = allPages ? pages : [pages[Math.min(lastStep, pages.length - 1)]];
    let any = false;
    list.forEach((pg, n) => {
      if (!pg) return;
      const tasks = tasksOn(pg).map(b => ({ b, rows: answerRows(b, data) })).filter(x => x.rows.length);
      if (!tasks.length) return;
      if (allPages) body.appendChild(el("p","ans-page", plain(pg.title) || "Page " + (n + 1)));
      tasks.forEach(t => {
        any = true;
        const card = el("div","ans-task");
        t.rows.forEach(r => {
          const line = el("div","ans-row " + (r.cls || ""));
          line.appendChild(el("b","", r.label));
          if (r.text) line.appendChild(el("span","", r.text));
          card.appendChild(line);
        });
        body.appendChild(card);
      });
    });
    if (!any) body.appendChild(el("p","hint","Nothing on this page has an answer to check against."));
  }
  function buildAnswers(){
    const side = document.querySelector(".workside");
    if (!side || $("answerPanel")) return;
    const panel = el("section","answerpanel");
    panel.id = "answerPanel";
    let shut = false;
    try{ shut = localStorage.getItem("hub_answers_shut") === "1"; }catch(e){}
    panel.classList.toggle("shut", shut);
    const head = el("button","ans-head");
    head.type = "button";
    head.setAttribute("aria-expanded", shut ? "false" : "true");
    head.appendChild(el("span","ans-arrow", shut ? "▸" : "▾"));
    head.appendChild(el("b","","Answers for this page"));
    head.addEventListener("click", () => {
      const now = !panel.classList.contains("shut");
      panel.classList.toggle("shut", now);
      head.setAttribute("aria-expanded", now ? "false" : "true");
      head.firstChild.textContent = now ? "▸" : "▾";
      try{ localStorage.setItem("hub_answers_shut", now ? "1" : "0"); }catch(e){}
      paintAnswers();
    });
    panel.appendChild(head);
    panel.appendChild(el("div","ans-body"));
    side.insertBefore(panel, side.firstChild);
  }
  /* the page in the frame changes, the student changes, the view changes */
  window.addEventListener("message", (e) => {
    if (e && e.data && typeof e.data.hubWorkStep === "number") setTimeout(paintAnswers, 0);
  });
  const baseShow = showStudent;
  window.showStudent = function(){
    const out = baseShow.apply(this, arguments);
    reuseButtons();
    paintAnswers();
    paintCount();
    return out;
  };

  /* ================= start ================= */
  function ready(){
    if (!roster.length){ setTimeout(ready, 300); return; }
    const vm = $("viewMode");
    if (vm) vm.addEventListener("click", () => setTimeout(paintAnswers, 0));
    wireBar();
    reuseButtons();
    buildAnswers();
    paintPicker();
    paintAnswers();
  }
  ready();
})();
