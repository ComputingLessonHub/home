/* =====================================================================
   work-ui.js, the marking page's shortcuts and helpers.

     Keyboard       ← and → move between students, M goes to the mark,
                    Ctrl+Enter (or Enter in the mark box) saves and moves on,
                    ? lists the keys
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
