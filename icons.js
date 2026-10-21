/* =====================================================================
   icons.js, the one set of icons the whole site draws with.

     hubIcons.icon(name, size)   a fine-line icon as an <svg> string
     hubIcons.swap(root)         turn icon characters into icons, now

   24 unit grid, 1.5 stroke, round ends, drawn in the current colour, so an
   icon takes the colour of the button it is on in every theme.

   The site grew a mix of characters standing in for icons: a gear, a
   circular arrow, a cross, a hamburger, arrows, triangles, a padlock, a
   floppy disc. They look different on every computer, sit badly on the
   dark theme and do not match the drawn icons beside them. Rather than
   hunting down every place one is made, which is scattered across every
   page and script, a button (or the small .ico, .bgrip, .seg-flag and
   .jump-icon pieces inside one) whose words are just one of these
   characters is given the matching drawn icon as it appears, and again if
   its words are changed later.

   Loaded on every page, in the head, before ui.js, which draws from it.
   It touches nothing else: a character inside a sentence, a lesson or a
   code editor is left exactly as written.
   ===================================================================== */
(function(){
  "use strict";

  const ICONS = {
    lessons:  '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/>',
    classes:  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.6.1 4.4 1.7 5 4.4"/>',
    practice: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10l-2.5 2L8 14M16 10l2.5 2L16 14M13.5 8.5l-3 7"/>',
    home:     '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    lock:     '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock:   '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M17.5 10h.01M6.5 14h.01M17.5 14h.01M9.5 14h5"/>',
    key:      '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/>',
    backup:   '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/>',
    log:      '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 6.5l2 1.2M17.8 16.3l2 1.2M4.2 17.5l2-1.2M17.8 7.7l2-1.2"/><circle cx="12" cy="12" r="7"/>',
    refresh:  '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    edit:     '<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/>',
    trash:    '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    move:     '<path d="M4 12h15M14 7l5 5-5 5"/>',
    swap:     '<path d="M4 8h15M15 4l4 4-4 4"/><path d="M20 16H5M9 12l-4 4 4 4"/>',
    up:       '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down:     '<path d="M12 5v14M6 13l6 6 6-6"/>',
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
    moreV:    '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    eye:      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    copy:     '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    clipboard:'<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3.5h6v1"/><rect x="9" y="3" width="6" height="3" rx="1"/><path d="M9 11h6M9 14.5h6M9 18h3"/>',
    duplicate:'<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M12 8.5v7M8.5 12h7"/>',
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
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    signout:  '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l-4-4 4-4M5 12h11"/>',
    flag:     '<path d="M5 21V4"/><path d="M5 4.5c4-2 7 2 13 0v8c-6 2-9-2-13 0"/>',
    bell:     '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    open:     '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function icon(name, size){
    const s = size || 18;
    return '<svg class="hi" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" '
      + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + (ICONS[name] || ICONS.more) + '</svg>';
  }

  /* Each character, with the variation selectors that ask for a text or an
     emoji drawing of it taken off first, and what it was standing in for. */
  const GLYPH = {
    "\u{1F512}": "lock", "\u{1F513}": "unlock", "\u{1F4BE}": "backup", "\u{1F4DC}": "log",
    "⚙": "settings", "✎": "edit", "\u{1F5D1}": "trash", "\u{1F441}": "eye",
    "\u{1F465}": "classes", "\u{1F4C4}": "log", "↻": "refresh", "⟳": "refresh",
    "\u{1F4C5}": "calendar", "\u{1F517}": "link", "\u{1F50D}": "search",
    "✕": "close", "✖": "close", "☰": "grip", "⇄": "swap",
    "⋮": "moreV", "⋯": "more", "↑": "up", "↓": "down",
    "▸": "chevron", "▶︎": "chevron", "▾": "chevronDown",
    "⎋": "signout", "\u{1F3C1}": "flag"
  };
  /* What a button is called, where the character was all it said and it
     has no title to read a name from. */
  const NAME = { close:"Close", settings:"Settings", refresh:"Refresh", up:"Move up", down:"Move down",
                 grip:"Drag to move", swap:"Move to another page", moreV:"More", more:"More",
                 signout:"Sign out", search:"Search" };
  /* Where a character is a piece of an icon rather than a whole button. */
  const PART = ".ico, .bgrip, .seg-flag, .jump-icon";
  const HOST = "button, [role=button], " + PART;
  /* Never inside writing or a lesson's own words: a cross or an arrow a
     teacher typed there is a character, not an icon. The code editor's own
     buttons (its settings cog) are swapped like any other; the code itself
     is never inside a button, so it is never looked at. */
  const KEEP = ".rt-box, [contenteditable], .prose, .q-ask, .pg-t";
  const clean = (t) => t.replace(/[︎️]/g, "").trim();

  function swapText(node){
    const host = node.parentNode;
    if (!host || host.nodeType !== 1 || !host.matches || !host.matches(HOST)) return;
    if (host.closest(KEEP)) return;
    const name = GLYPH[clean(node.nodeValue || "")];
    if (!name) return;
    /* A button that also carries words keeps them: only a character standing
       on its own, as the whole of the button or of its icon part, is swapped. */
    const words = Array.from(host.childNodes).some(n => n !== node && n.nodeType === 3 && n.nodeValue.trim());
    if (words) return;
    const size = host.matches(PART) ? 16 : (host.classList.contains("bmini") ? 16 : 18);
    const wrap = document.createElement("span");
    wrap.className = "hi-wrap";
    wrap.innerHTML = icon(name, size);
    host.replaceChild(wrap, node);
    const button = host.matches(PART) ? host.closest("button, [role=button]") : host;
    if (button && !button.getAttribute("aria-label") && !clean(button.textContent || "")){
      button.setAttribute("aria-label", button.title || NAME[name] || name);
    }
  }
  function swap(root){
    const r = root || document.body;
    if (!r) return;
    if (r.nodeType === 3){ swapText(r); return; }
    if (r.nodeType !== 1) return;
    /* Only short text: an icon character is one or two code units with a
       selector, so anything longer is words and is not looked at. */
    const walk = document.createTreeWalker(r, NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => (n.nodeValue.length <= 4 && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    const found = [];
    while (walk.nextNode()) found.push(walk.currentNode);
    found.forEach(swapText);
    /* the console's own spans that ask for an icon by name */
    r.querySelectorAll("[data-icon]").forEach(e => {
      if (e.dataset.iconDone) return;
      e.dataset.iconDone = "1";
      e.innerHTML = icon(e.dataset.icon, Number(e.dataset.size) || 18);
      e.classList.add("hi-wrap");
    });
  }
  function watch(){
    swap(document.body);
    try{
      new MutationObserver(list => list.forEach(m => {
        if (m.type === "characterData"){ swapText(m.target); return; }
        m.addedNodes.forEach(n => swap(n));
      })).observe(document.body, { childList:true, subtree:true, characterData:true });
    }catch(e){}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once:true });
  else watch();

  window.hubIcons = { icon, swap, ICONS };
})();
