/* =====================================================================
   work-ui.js, the marking page's shortcuts and helpers.

     Keyboard       Ctrl with ← and → moves between students, even from
                    inside the work, Ctrl+M steps through the feedback boxes,
                    Ctrl+Enter saves and moves on, ? lists the keys
     Who is left    the student list says who is marked, who is not and who
                    has handed in nothing, with "Unmarked only" to skip the
                    ones already done

   Built on work.html's own functions and values, read by name when used.
   Nothing here is saved to the server beyond what Save feedback already
   sends.
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
    /* The same switch as Open / Locked in Manage, so the two screens that
       filter a class do it with one control rather than two. */
    const sw = el("button","pace-switch onlyunmarked");
    sw.type = "button"; sw.id = "unmarkedOnly";
    sw.setAttribute("role", "switch");
    sw.appendChild(el("span","pace-switch-words","Unmarked only"));
    sw.appendChild(el("span","pace-knob"));
    const paintSwitch = () => {
      sw.classList.toggle("on", unmarkedOnly);
      sw.setAttribute("aria-checked", unmarkedOnly ? "true" : "false");
    };
    paintSwitch();
    sw.addEventListener("click", () => {
      unmarkedOnly = !unmarkedOnly;
      paintSwitch();
      try{ sessionStorage.setItem("hub_unmarked_only", unmarkedOnly ? "1" : "0"); }catch(e){}
      paintPicker();
      if (unmarkedOnly && isMarked(roster[idx])) step(1);
    });
    /* The switch, the count and "Up to date as of" are one thing: where the
       marking has got to. Kept together so the bar wraps around them rather
       than between them, and "Up to date" moved out from beside Refresh,
       which only happens to be what sets it. */
    const where = el("span","markwhere");
    where.appendChild(sw);
    where.appendChild(el("span","markcount")).id = "markCount";
    const fresh = $("workFresh");
    if (fresh) where.appendChild(fresh);
    bar.appendChild(where);
    /* the arrows either side of the list skip the marked ones too */
    ["prevStu","nextStu"].forEach((id, k) => {
      const b = $(id);
      if (b) b.addEventListener("click", (e) => { e.stopImmediatePropagation(); step(k ? 1 : -1); }, true);
    });
    /* Keys sits in the corner, out of the bar, and only where there is a
       keyboard to use it with: the stylesheet hides it on a tablet or phone. */
    const keys = el("button","keyfab");
    keys.type = "button";
    keys.title = "Keyboard shortcuts (?)";
    keys.setAttribute("aria-label", "Keyboard shortcuts");
    if (UI) keys.innerHTML = UI.icon("keyboard", 20); else keys.textContent = "Keys";
    keys.addEventListener("click", showKeys);
    document.body.appendChild(keys);
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
  /* Strength, then Target, then the general comment, and round again.
     Anywhere else starts at Strength. */
  const BOX_ORDER = ["fbStrength","fbTarget","fbComment"];
  function nextBox(){
    const boxes = BOX_ORDER.map(id => $(id)).filter(b => b && !b.disabled && b.offsetParent);
    if (!boxes.length) return;
    const at = boxes.indexOf(document.activeElement);
    const go = boxes[at < 0 ? 0 : (at + 1) % boxes.length];
    go.focus();
    if (go.setSelectionRange) go.setSelectionRange(go.value.length, go.value.length);
  }
  function showKeys(){
    openModal(box => {
      box.classList.add("narrow");
      box.appendChild(el("h2","","Keyboard shortcuts"));
      const list = el("div","keylist");
      [["Ctrl + ←  →", "Previous and next student, from anywhere on the page"],
       ["Ctrl + M", "Next feedback box: Strength, Target, then General comment"],
       ["Ctrl + Enter", "Save feedback and go to the next student"],
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
  /* inFrame: the key was pressed inside the student's work. Ctrl and an
     arrow move between students there whatever has the focus, because that
     work is only being read. In the feedback boxes Ctrl and an arrow are
     left to jump a word, which is what a teacher typing expects. */
  function onKey(e, inFrame){
    if (!$("mBack").hidden) return;
    if ($("workPane") && $("workPane").hidden) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && !e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")){
      if (!inFrame && typing(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      step(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (ctrl && !e.altKey && (e.key === "m" || e.key === "M")){
      e.preventDefault(); e.stopPropagation();
      if (inFrame) window.focus();
      nextBox();
      return;
    }
    if (ctrl && e.key === "Enter"){ e.preventDefault(); saveThenNext(); return; }
    if (inFrame || typing(e.target) || ctrl || e.altKey) return;
    if (e.key === "?"){ e.preventDefault(); showKeys(); }
  }
  document.addEventListener("keydown", (e) => onKey(e, false));
  /* A key pressed in the frame never reaches this page, so the frame is
     listened to as well, and every frame inside it (the block editor is one),
     each time a new student is loaded into it. Capturing, so a code editor
     in the work cannot keep the key to itself. */
  function hookFrame(win){
    try{
      if (!win || win.__hubKeys) return;
      const doc = win.document;
      win.__hubKeys = true;
      win.addEventListener("keydown", (e) => onKey(e, true), true);
      const hookKids = () => doc.querySelectorAll("iframe").forEach(f => {
        try{ hookFrame(f.contentWindow); }catch(e){}
        if (!f.__hubKeysLoad){
          f.__hubKeysLoad = true;
          f.addEventListener("load", () => { try{ hookFrame(f.contentWindow); }catch(e){} });
        }
      });
      hookKids();
      new win.MutationObserver(hookKids).observe(doc.documentElement, { childList:true, subtree:true });
    }catch(e){}       // another site's page in an embed: nothing to listen to
  }
  const frame = $("workFrame");
  if (frame){
    frame.addEventListener("load", () => hookFrame(frame.contentWindow));
    hookFrame(frame.contentWindow);
  }

  /* Saving a mark changes who is ticked off in the student list. */
  const baseSave = saveFeedback;
  window.saveFeedback = async function(){
    const out = await baseSave.apply(this, arguments);
    if ($("saveFb") && $("saveFb").dataset.saved === "yes") paintPicker();
    return out;
  };
  const baseShow = showStudent;
  window.showStudent = function(){
    const out = baseShow.apply(this, arguments);
    paintCount();
    return out;
  };

  /* ================= start ================= */
  function ready(){
    if (!roster.length){ setTimeout(ready, 300); return; }
    wireBar();
    paintPicker();
  }
  ready();
})();
