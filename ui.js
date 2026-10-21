/* =====================================================================
   ui.js, small pieces of interface shared by the teacher's pages: the
   console, the lesson builder and the page for viewing work.

     hubUI.toast(words, opts)   a short message in the corner, with an
                                optional button such as Undo
     hubUI.icon(name, size)     a fine-line icon as an <svg> string
     hubUI.iconEl(name, size)   the same, as an element
     hubUI.pref(name)           how the console is laid out; only the side
                                menu can be changed, by Switch to old view
     hubUI.skeleton(shape, n)   grey shapes to show while something loads

   Classic script with no dependencies, so it can be loaded anywhere.
   ===================================================================== */
(function(){
  "use strict";

  /* ---------- layout choices ----------
     These began as switches in Settings, each a way of trying a new layout
     out. The trial is over: the placeholder shapes, the detailed lesson
     cards and the Home dashboard are simply how the console looks now. The
     class dashboard was tried and taken out. The side menu
     is the one choice left, as "Switch to old view", for anybody who wants
     the console the way it was.

     Kept under a new name, oldView, rather than the trial's sidebar switch,
     so everybody starts on the new view whatever they had set while trying
     it out. */
  const FIXED = {
    skeletons: true,        // grey shapes while a screen loads
    richCards: true,        // lesson cards in the hub with more on them
    homeDash: true          // Home as a dashboard: today's lessons and what needs doing
  };
  const NAMES = ["sidebar"].concat(Object.keys(FIXED));
  function prefs(){ try{ return JSON.parse(localStorage.getItem("hub_prefs") || "{}"); }catch(e){ return {}; } }
  function oldView(){ return !!(prefs().ui || {}).oldView; }
  function pref(name){
    if (name === "sidebar") return !oldView();
    return !!FIXED[name];
  }
  function setOldView(on){
    const p = prefs();
    p.ui = p.ui || {};
    p.ui.oldView = !!on;
    try{ localStorage.setItem("hub_prefs", JSON.stringify(p)); }catch(e){}
    paintHtml();
    try{ window.dispatchEvent(new CustomEvent("hubui", { detail:{ name:"sidebar", on: !on } })); }catch(e){}
  }
  /* The ones that are only a matter of styling are put on <html>, so the
     stylesheet can follow them without anybody redrawing anything. */
  function paintHtml(){
    const d = document.documentElement;
    NAMES.forEach(k => { d.dataset["ui" + k[0].toUpperCase() + k.slice(1)] = pref(k) ? "on" : "off"; });
  }
  paintHtml();

  /* ---------- icons ----------
     Drawn by icons.js, which every page loads before this, so the console,
     the builder, a lesson and a student's home page share one set. */
  const ICONS = (window.hubIcons && window.hubIcons.ICONS) || {};
  function icon(name, size){
    return window.hubIcons ? window.hubIcons.icon(name, size) : "";
  }
  function iconEl(name, size){
    const span = document.createElement("span");
    span.className = "hi-wrap";
    span.innerHTML = icon(name, size);
    return span;
  }

  /* ---------- toasts ----------
     One stack in the bottom corner. A message with a button stays a little
     longer, and the button is what makes it worth showing at all: Undo after
     something has been removed. Screen readers hear it through the live
     region. */
  let stack = null;
  function toast(words, opts){
    const o = opts || {};
    if (!document.body) return null;
    if (!stack){
      stack = document.createElement("div");
      stack.className = "toasts no-print";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const t = document.createElement("div");
    t.className = "toast" + (o.kind ? " " + o.kind : "");
    const said = document.createElement("span");
    said.className = "toast-words";
    said.textContent = words;
    t.appendChild(said);
    let timer = null;
    const shut = () => {
      clearTimeout(timer);
      t.classList.add("going");
      setTimeout(() => t.remove(), 220);
    };
    if (o.action){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "toast-act";
      b.textContent = o.action;
      b.addEventListener("click", () => { shut(); try{ o.onAction && o.onAction(); }catch(e){} });
      t.appendChild(b);
    }
    const x = document.createElement("button");
    x.type = "button";
    x.className = "toast-x";
    x.setAttribute("aria-label", "Dismiss");
    x.innerHTML = icon("close", 14);
    x.addEventListener("click", shut);
    t.appendChild(x);
    stack.appendChild(t);
    /* at most four at once; the oldest goes */
    while (stack.children.length > 4) stack.firstChild.remove();
    timer = setTimeout(shut, o.ms || (o.action ? 7000 : (o.kind === "error" ? 6000 : 3200)));
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", () => { timer = setTimeout(shut, 2500); });
    return { close: shut };
  }

  /* ---------- loading shapes ----------
     "tiles" for a grid of cards, "rows" for a table or list, "lines" for a
     block of text. The shapes pulse gently unless the reader has asked for
     less motion. */
  function skeleton(shape, n){
    const box = document.createElement("div");
    box.className = "skel skel-" + (shape || "tiles");
    box.setAttribute("aria-busy", "true");
    box.setAttribute("aria-label", "Loading");
    const count = n || (shape === "rows" ? 6 : shape === "lines" ? 4 : 6);
    for (let i = 0; i < count; i++){
      const s = document.createElement("div");
      s.className = "skel-item";
      if (shape !== "lines"){
        const a = document.createElement("span"); a.className = "skel-bar w60";
        const b = document.createElement("span"); b.className = "skel-bar w35";
        s.appendChild(a); s.appendChild(b);
      } else {
        s.classList.add("skel-bar");
        s.style.width = (60 + ((i * 37) % 35)) + "%";
      }
      box.appendChild(s);
    }
    return box;
  }

  /* Icon characters on buttons are turned into drawn icons by icons.js,
     for every page. swapEmoji is kept so a box drawn in one go can ask for
     it at once rather than as the page notices it. */
  function swapEmoji(root){ if (window.hubIcons) window.hubIcons.swap(root); }

  window.hubUI = { toast, icon, iconEl, pref, oldView, setOldView,
                   skeleton, ICONS, swapEmoji };
})();
