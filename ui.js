/* =====================================================================
   ui.js, small pieces of interface shared by the teacher's pages: the
   console, the lesson builder and the page for viewing work.

     hubUI.toast(words, opts)   a short message in the corner, with an
                                optional button such as Undo
     hubUI.icon(name, size)     a fine-line icon as an <svg> string
     hubUI.iconEl(name, size)   the same, as an element
     hubUI.pref(name)           one of the layout choices in Settings
     hubUI.skeleton(shape, n)   grey shapes to show while something loads

   Classic script with no dependencies, so it can be loaded anywhere.
   ===================================================================== */
(function(){
  "use strict";

  /* ---------- layout choices ----------
     Kept with the display settings in hub_prefs, under "ui", so they belong
     to this browser the same way the theme does. Each one is a way of trying
     a new layout out, which is why they start on. */
  const DEFAULTS = {
    sidebar: true,          // the menu down the left of the console
    skeletons: true,        // grey shapes while a screen loads
    richCards: true,        // lesson cards in the hub with more on them
    classDash: true,        // a class opens onto its dashboard
    manageSections: true    // the Manage pop-up split into three parts
  };
  const LABELS = {
    sidebar: ["Side menu", "Lessons, classes and the rest down the left of the console."],
    skeletons: ["Placeholder shapes while loading", "Grey shapes where the screen is about to be, rather than dots."],
    richCards: ["Detailed lesson cards", "Pages, tasks, when it was changed and which classes have it."],
    classDash: ["Class dashboard", "A class opens on what is live, what needs marking and reset requests."],
    manageSections: ["Manage in sections", "The Manage pop-up split into When, What's open and Work."]
  };
  function prefs(){ try{ return JSON.parse(localStorage.getItem("hub_prefs") || "{}"); }catch(e){ return {}; } }
  function pref(name){
    const ui = prefs().ui || {};
    return ui[name] === undefined ? !!DEFAULTS[name] : !!ui[name];
  }
  function setPref(name, on){
    const p = prefs();
    p.ui = p.ui || {};
    p.ui[name] = !!on;
    try{ localStorage.setItem("hub_prefs", JSON.stringify(p)); }catch(e){}
    paintHtml();
    try{ window.dispatchEvent(new CustomEvent("hubui", { detail:{ name, on: !!on } })); }catch(e){}
  }
  /* The ones that are only a matter of styling are put on <html>, so the
     stylesheet can follow them without anybody redrawing anything. */
  function paintHtml(){
    const d = document.documentElement;
    Object.keys(DEFAULTS).forEach(k => { d.dataset["ui" + k[0].toUpperCase() + k.slice(1)] = pref(k) ? "on" : "off"; });
  }
  paintHtml();

  /* ---------- icons ----------
     24 unit grid, 1.5 stroke, round ends, drawn in the current colour. */
  const ICONS = {
    lessons:  '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/>',
    classes:  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.6.1 4.4 1.7 5 4.4"/>',
    practice: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10l-2.5 2L8 14M16 10l2.5 2L16 14M13.5 8.5l-3 7"/>',
    home:     '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    lock:     '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock:   '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
    key:      '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/>',
    backup:   '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/>',
    log:      '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 6.5l2 1.2M17.8 16.3l2 1.2M4.2 17.5l2-1.2M17.8 7.7l2-1.2"/><circle cx="12" cy="12" r="7"/>',
    refresh:  '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    edit:     '<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/>',
    trash:    '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    move:     '<path d="M4 12h15M14 7l5 5-5 5"/>',
    link:     '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    versions: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    coverage: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    work:     '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 14l2 2 4-4"/>',
    search:   '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    close:    '<path d="M6 6l12 12M18 6L6 18"/>',
    more:     '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    eye:      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    copy:     '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    paste:    '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9.5 4V3h5v1M9 11h6M9 15h4"/>',
    undo:     '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    warn:     '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.01"/>',
    grip:     '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    menu:     '<path d="M4 6h16M4 12h16M4 18h16"/>',
    upload:   '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    devices:  '<rect x="3" y="4" width="13" height="10" rx="1.5"/><path d="M7 18h5"/><rect x="16" y="9" width="5" height="11" rx="1.2"/>',
    back:     '<path d="M19 12H5M10 7l-5 5 5 5"/>',
    chevron:  '<path d="M9 6l6 6-6 6"/>',
    bell:     '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    open:     '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function icon(name, size){
    const s = size || 18;
    return '<svg class="hi" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" '
      + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + (ICONS[name] || ICONS.more) + '</svg>';
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

  /* ---------- emoji on icon buttons ----------
     The console grew a mix of emoji for its small square buttons, which look
     different on every device and sit badly on the dark theme. Rather than
     hunting down every place one is made, any icon button whose words are
     just one of these is given the matching line icon as it appears. */
  const EMOJI = {
    "\u{1F512}": "lock", "\u{1F513}": "unlock", "\u{1F4BE}": "backup", "\u{1F4DC}": "log",
    "\u2699\uFE0E": "settings", "\u2699\uFE0F": "settings", "\u2699": "settings",
    "\u270E": "edit", "\u{1F5D1}": "trash", "\u{1F5D1}\uFE0F": "trash", "\u{1F441}": "eye",
    "\u{1F441}\uFE0F": "eye", "\u{1F465}": "classes", "\u{1F4C4}": "log", "\u21BB": "refresh",
    "\u{1F4C5}": "calendar", "\u{1F517}": "link"
  };
  function swapOne(btn){
    if (!btn || btn.dataset.iconDone) return;
    const first = btn.firstChild;
    if (!first || first.nodeType !== 3) return;
    const text = first.nodeValue.trim();
    const name = EMOJI[text];
    if (!name) return;
    btn.dataset.iconDone = "1";
    const holder = document.createElement("span");
    holder.className = "hi-wrap";
    holder.innerHTML = icon(name, 17);
    btn.replaceChild(holder, first);
    if (!btn.getAttribute("aria-label") && btn.title) btn.setAttribute("aria-label", btn.title);
  }
  function swapEmoji(root){
    const r = root || document;
    if (r.nodeType === 1 && r.matches && r.matches(".iconbtn, .bmini, .lockbtn")) swapOne(r);
    if (r.querySelectorAll) r.querySelectorAll(".iconbtn, .bmini, .lockbtn").forEach(swapOne);
    if (r.querySelectorAll) r.querySelectorAll("[data-icon]").forEach(e => {
      if (e.dataset.iconDone) return;
      e.dataset.iconDone = "1";
      e.innerHTML = icon(e.dataset.icon, Number(e.dataset.size) || 18);
      e.classList.add("hi-wrap");
    });
  }
  function watchEmoji(){
    swapEmoji(document);
    try{
      new MutationObserver(list => list.forEach(m => {
        m.addedNodes.forEach(n => { if (n.nodeType === 1) swapEmoji(n); });
        /* a button whose words were changed after it was made */
        if (m.type === "characterData" || m.type === "childList"){
          const t = m.target.nodeType === 1 ? m.target : m.target.parentNode;
          if (t && t.matches && t.matches(".iconbtn, .bmini, .lockbtn")){ delete t.dataset.iconDone; swapOne(t); }
        }
      })).observe(document.body, { childList:true, subtree:true, characterData:true });
    }catch(e){}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchEmoji, { once:true });
  else watchEmoji();

  window.hubUI = { toast, icon, iconEl, pref, setPref, prefLabels: LABELS, prefNames: Object.keys(DEFAULTS),
                   skeleton, ICONS, swapEmoji };
})();
