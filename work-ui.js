/* =====================================================================
   work-ui.js, the marking page's shortcuts and helpers.

     Keyboard       Ctrl with ← and → moves between students, even from
                    inside the work, Ctrl+M steps through the feedback boxes,
                    Ctrl+Enter is Save and next, ? lists the keys
     Who is left    "Unmarked only" as a switch in the bar, and a count of how
                    many in the class are marked

   Built on work.html's own functions and values, read by name when used.
   The marking itself, who counts as marked, skipping the marked ones and
   Save and next, all belong to work.html: this only gives them keys and a
   place in the bar, so there is one of each rather than two that disagree.
   Nothing here is saved to the server.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof PRACTICE === "undefined" || PRACTICE) return;
  const UI = window.hubUI;

  /* ================= who is marked ================= */
  function paintCount(){
    const c = $("markCount");
    if (!c) return;
    const n = roster.filter(st => isMarked(st)).length;
    c.textContent = n + " of " + roster.length + " marked";
  }
  const basePaintPicker = paintPicker;
  window.paintPicker = function(){
    const out = basePaintPicker.apply(this, arguments);
    paintSwitch();
    paintCount();
    return out;
  };

  /* work.html's Unmarked only, drawn as the same switch as Open / Locked in
     Manage, so the two screens that filter a class do it with one kind of
     control. The setting, and what it does to the list and to Next, is
     work.html's own. */
  let sw = null;
  function paintSwitch(){
    if (!sw) return;
    const on = unmarkedOnly();
    sw.classList.toggle("on", on);
    sw.setAttribute("aria-checked", on ? "true" : "false");
  }
  function wireBar(){
    const bar = document.querySelector(".workbar");
    if (!bar || $("unmarkedOnly")) return;
    sw = el("button","pace-switch onlyunmarked");
    sw.type = "button"; sw.id = "unmarkedOnly";
    sw.setAttribute("role", "switch");
    sw.title = "List and go to only the students with no saved feedback";
    sw.appendChild(el("span","pace-switch-words","Unmarked only"));
    sw.appendChild(el("span","pace-knob"));
    sw.addEventListener("click", () => {
      const btn = $("onlyUnmarked");
      if (btn) btn.click();
      else { try{ localStorage.setItem(UNMARKED_KEY, unmarkedOnly() ? "0" : "1"); }catch(e){} paintPicker(); }
      paintSwitch();
    });
    /* The switch, the count and "Up to date as of" are one thing: where the
       marking has got to. Kept together so the bar wraps around them rather
       than between them. */
    const where = el("span","markwhere");
    where.appendChild(sw);
    where.appendChild(el("span","markcount")).id = "markCount";
    const fresh = $("workFresh");
    if (fresh) where.appendChild(fresh);
    bar.appendChild(where);
    const old = $("onlyUnmarked");
    if (old) old.classList.add("replaced");
    /* Keys sits in the corner, out of the bar, and only where there is a
       keyboard to use it with: the stylesheet hides it on a tablet or phone. */
    const keys = el("button","keyfab");
    keys.type = "button";
    keys.title = "Keyboard shortcuts (?)";
    keys.setAttribute("aria-label", "Keyboard shortcuts");
    if (UI) keys.innerHTML = UI.icon("keyboard", 20); else keys.textContent = "Keys";
    keys.addEventListener("click", showKeys);
    document.body.appendChild(keys);
    paintSwitch();
    paintCount();
  }

  /* ================= keyboard ================= */
  function typing(t){ return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  /* Strength, then Target, then the comment, and round again, whichever of
     them the Feedback column is showing. Anywhere else starts at the first. */
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
       ["Ctrl + M", "Next feedback box: Strength, Target, then the comment"],
       ["Ctrl + Enter", "Save and next"],
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
  /* depth: 0 for this page, 1 for the student's work, 2 and more for a frame
     inside the work (the block editor is one). Ctrl and an arrow move between
     students inside the work whatever has the focus, because that work is
     only being read. In the feedback boxes Ctrl and an arrow are left to jump
     a word, which is what a teacher typing expects. */
  function onKey(e, depth){
    if (!$("mBack").hidden) return;
    if ($("workPane") && $("workPane").hidden) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && !e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")){
      if (!depth && typing(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      goStep(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (ctrl && !e.altKey && (e.key === "m" || e.key === "M")){
      e.preventDefault(); e.stopPropagation();
      if (depth) window.focus();
      nextBox();
      return;
    }
    /* work.html listens for Ctrl + Enter on this page and in the work's own
       frame. A frame inside the work never reaches either, so it is passed
       on from there and nowhere else, or it would save twice. */
    if (ctrl && e.key === "Enter"){
      if (depth >= 2 && typeof saveNextKey === "function") saveNextKey(e);
      return;
    }
    if (depth || typing(e.target) || ctrl || e.altKey) return;
    if (e.key === "?"){ e.preventDefault(); showKeys(); }
  }
  document.addEventListener("keydown", (e) => onKey(e, 0));
  /* A key pressed in the frame never reaches this page, so the frame is
     listened to as well, and every frame inside it, each time a new student
     is loaded into it. Capturing, so a code editor in the work cannot keep
     the key to itself. */
  function hookFrame(win, depth){
    try{
      if (!win || win.__hubKeys) return;
      const doc = win.document;
      win.__hubKeys = true;
      win.addEventListener("keydown", (e) => onKey(e, depth), true);
      const hookKids = () => doc.querySelectorAll("iframe").forEach(f => {
        try{ hookFrame(f.contentWindow, depth + 1); }catch(e){}
        if (!f.__hubKeysLoad){
          f.__hubKeysLoad = true;
          f.addEventListener("load", () => { try{ hookFrame(f.contentWindow, depth + 1); }catch(e){} });
        }
      });
      hookKids();
      new win.MutationObserver(hookKids).observe(doc.documentElement, { childList:true, subtree:true });
    }catch(e){}       // another site's page in an embed: nothing to listen to
  }
  const frame = $("workFrame");
  if (frame){
    frame.addEventListener("load", () => hookFrame(frame.contentWindow, 1));
    hookFrame(frame.contentWindow, 1);
  }

  /* Opening another student, or saving one, changes the count. */
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
