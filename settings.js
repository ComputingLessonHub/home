/* Shared display settings (background + font). Include on any page:
     <script src="settings.js"></script>  then  initSettings(buttonElement)
   Choices persist per device in localStorage under hub_prefs. */
(function(){
  const THEMES = [
    ["","Light","#EDEDED"], ["night","Dark","#2C2C33"]
  ];
  /* A colour laid over the whole page. Some readers find this makes text
     settle down — it is the same idea as a coloured reading ruler. */
  const TINTS = [
    ["","None",""], ["green","Green","#7BD389"], ["blue","Blue","#7FB2E5"],
    ["pink","Pink","#EA9AC0"], ["yellow","Yellow","#F2D479"],
    ["purple","Purple","#8B6FB5"], ["forest","Dark green","#4E8C63"]
  ];
  const FONTS = [
    ["","Poppins \u2014 the standard font","'Poppins'"],
    ["lexend","Lexend \u2014 easier for some readers","'Lexend'"],
    ["atkinson","Atkinson Hyperlegible \u2014 extra-clear letters","'Atkinson Hyperlegible'"]
  ];
  function prefs(){ try{ return JSON.parse(localStorage.getItem("hub_prefs") || "{}"); }catch(e){ return {}; } }

  /* Everything a browser can be left holding that is neither a display choice
     nor the child's own work.

     A teacher sign-in saved on a machine goes stale as soon as the key is
     changed or a second factor is switched on, and after that the server
     refuses any request carrying it instead of answering it as a student's.
     The home page still filled, because the lesson list is asked for with no
     sign-in at all, so a child saw their finished lesson and was told it could
     not be found the moment they opened it. On that one machine, and signing
     out, signing back in and refreshing all left it exactly where it was.

     Kept here, on the one script every page loads, because signing out and the
     help pop-up on the sign-in page both want the same list, and a list that
     lives in two places grows apart. Saved work is deliberately not on it. */
  window.hubClearStrays = function(){
    const strays = [];
    try{
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if (!k) continue;
        /* hub_tdevice is deliberately not on this list. It is not a sign-in
           and is never sent with a request: it is only the note that this
           browser has answered a code, good for sixty days. Clearing it here
           fixed nothing, and every child signing out on a teacher's machine
           took those sixty days with them, so the code was wanted again the
           next time the console was opened. */
        /* hub_keep is the console's few-hour copy of a teacher session,
           written by teacher.js. Its cookie can stay: the tag on its own is
           a random number that opens nothing. */
        if (k === "hub_tkey" || k === "hub_keep" || k === "hub_inspect" ||
            k === "hub_sandbox_inspect" ||
            k === "hub_preview" || k.indexOf("hub_rel_") === 0) strays.push(k);
      }
      strays.forEach(k => localStorage.removeItem(k));
    }catch(e){}
    try{ sessionStorage.removeItem("hub_ttoken"); }catch(e){}
    return strays.length;
  };
  function overlay(){
    /* Loaded from <head> on most pages, so the first call happens before
       <body> exists. Nothing to attach to yet; apply() runs again on
       DOMContentLoaded and the overlay lands then. */
    if (!document.body) return null;
    let o = document.getElementById("hubTint");
    if (!o){
      o = document.createElement("div");
      o.id = "hubTint";
      o.setAttribute("aria-hidden","true");
      document.body.appendChild(o);
    }
    return o;
  }
  function applyTint(p){
    const o = overlay();
    if (!o) return;
    const colour = p.tintColour || "";
    if (!colour){ o.style.display = "none"; return; }
    o.style.display = "block";
    o.style.background = colour;
    o.style.opacity = String((p.tintAmt === undefined ? 25 : p.tintAmt) / 100);
  }
  function apply(p){
    if (p.bg) document.documentElement.dataset.bg = p.bg; else delete document.documentElement.dataset.bg;
    if (p.font) document.documentElement.dataset.font = p.font; else delete document.documentElement.dataset.font;
    applyTint(p);
    /* editors on the page follow along */
    try{ window.dispatchEvent(new Event("hubprefs")); }catch(e){}
  }
  function build(){
    const onConsole = /admin\.html|author\.html|work\.html/.test(location.pathname);
    const noServer = !!(window.HUB && window.HUB.OFFLINE);
    /* A teacher looking at a lesson, previewing one or reading a hand-in is
       on the same page a student uses, so the page alone does not say whose
       settings these are. The address does: all four of these only ever
       belong to a teacher. */
    const spectating = /[?&](view|pdf|preview|builder)=/.test(location.search);
    const mine = noServer && !onConsole && !spectating;
    const back = document.createElement("div");
    back.className = "modal-back no-print"; back.id = "setModal"; back.hidden = true;
    back.innerHTML =
      /* The middle has to be its own scrolling box. .modal is a flex column
         with overflow:hidden, so without one the groups below are simply cut
         off on a short screen with no way to reach them. Every other pop-up
         gets this from scrollBody(); this one is built by hand. */
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<h2 style="margin-top:0">Settings</h2>' +
      '<div class="modal-scroll">' +
      /* Without a server the name typed at the start of a lesson is the only
         thing that says whose work this is, so there has to be somewhere to
         put it right when it is spelled wrong. */
      (mine
        ? '<div class="set-group"><span class="set-label">Your name</span>' +
          '<div class="field"><input type="text" id="setName" autocomplete="off" spellcheck="false"></div></div>'
        : "") +
      '<div class="set-group"><span class="set-label">Theme</span><div class="swatches" id="setSw">' +
      THEMES.map(b => '<button class="swatch swatch-wide" data-bg="' + b[0] + '" style="background:' + b[2] + '">' + b[1] + '</button>').join("") +
      '</div></div>' +
      '<div class="set-group"><span class="set-label">Colour overlay</span>' +
      '<div class="swatches" id="setTint">' +
      TINTS.map(t => '<button class="swatch" data-tint="' + t[0] + '"' +
        (t[2] ? ' style="background:' + t[2] + '"' : ' data-none="1"') + ' title="' + t[1] + '">' +
        (t[2] ? '' : '\u2715') + '</button>').join("") +
      '</div>' +
      '<div class="tintrow" id="tintStrength" hidden>' +
      '<label for="tintAmt">Strength</label>' +
      '<input type="range" id="tintAmt" min="5" max="60" step="5">' +
      '<span id="tintAmtOut"></span></div></div>' +
      '<div class="set-group"><span class="set-label">Font</span><div class="font-opts" id="setFo">' +
      FONTS.map(f => '<button class="font-opt" data-font="' + f[0] + '" style="font-family:' + f[2] + '">' + f[1] + '</button>').join("") +
      '</div></div>' +
      '<div class="set-group" id="pwGroup" hidden><span class="set-label">Your password</span>' +
      '<div class="field"><label>New password (12\u201325 characters)</label><input type="password" id="pwNew" autocomplete="new-password"></div>' +
      '<div class="field"><label>Type it again</label><input type="password" id="pwNew2" autocomplete="new-password"></div>' +
      '<button class="btn-ghost" id="pwGo">Change password</button>' +
      '<p class="hint" id="pwMsg" style="margin-top:10px"></p>' +
      '<p class="subnote">It must be at least 12 characters long.</p></div>' +
      '</div>' +
      '<button class="btn-primary modal-cta" id="setDone">Done</button></div>';
    document.body.appendChild(back);
    function paint(){
      const p = prefs();
      back.querySelectorAll(".swatch[data-bg]").forEach(b => b.classList.toggle("on", (p.bg || "") === b.dataset.bg));
      back.querySelectorAll(".swatch[data-tint]").forEach(b => b.classList.toggle("on", (p.tint || "") === b.dataset.tint));
      const on = !!p.tintColour;
      const row = back.querySelector("#tintStrength");
      if (row) row.hidden = !on;
      const amt2 = back.querySelector("#tintAmt"), out = back.querySelector("#tintAmtOut");
      if (amt2){ amt2.value = String(p.tintAmt === undefined ? 25 : p.tintAmt); }
      if (out) out.textContent = (p.tintAmt === undefined ? 25 : p.tintAmt) + "%";
      back.querySelectorAll(".font-opt").forEach(b => b.classList.toggle("on", (p.font || "") === b.dataset.font));
      /* the lesson page may have changed it since this was last opened */
      const nb = back.querySelector("#setName");
      if (nb && document.activeElement !== nb) nb.value = localStorage.getItem("hub_name") || "";
    }
    back.querySelectorAll(".swatch[data-bg]").forEach(b => b.addEventListener("click", () => {
      const p = prefs(); p.bg = b.dataset.bg; save(p); paint();
    }));
    back.querySelectorAll(".swatch[data-tint]").forEach(b => b.addEventListener("click", () => {
      const p = prefs();
      const tint = b.dataset.tint;
      p.tint = tint;
      p.tintColour = tint ? (TINTS.find(t => t[0] === tint) || ["","",""])[2] : "";
      if (p.tintAmt === undefined) p.tintAmt = 25;
      save(p); paint();
    }));
    const amt = back.querySelector("#tintAmt");
    if (amt) amt.addEventListener("input", () => {
      const p = prefs(); p.tintAmt = parseInt(amt.value, 10) || 25; save(p); paint();
    });
    function save(p){ localStorage.setItem("hub_prefs", JSON.stringify(p)); apply(p); }
    back.querySelectorAll(".font-opt").forEach(b => b.addEventListener("click", () => {
      const p = prefs(); p.font = b.dataset.font; localStorage.setItem("hub_prefs", JSON.stringify(p)); apply(p); paint();
    }));
    /* Saved as they type. Only the name changes: the work already on this
       machine is theirs, so correcting a spelling must not throw it away.
       A different child is caught when the lesson opens, not here. */
    const nameBox = back.querySelector("#setName");
    if (nameBox){
      nameBox.value = localStorage.getItem("hub_name") || "";
      nameBox.addEventListener("input", () => {
        const v = nameBox.value.trim();
        if (v) localStorage.setItem("hub_name", v);
      });
    }
    const API = (window.HUB && window.HUB.API) || "";
    const grp = back.querySelector("#pwGroup");
    // only students have a password to change here
    const isStudent = !!localStorage.getItem("hub_token");
    /* A teacher is whoever has a teacher sign-in, session or key. Looking only
       for the key stopped recognising them the moment two-factor sign-in was
       switched on and the key stopped being kept. */
    const isTeacher = !!(window.teacherAuth ? window.teacherAuth.have()
                          : localStorage.getItem("hub_tkey"));
    if (isStudent && API && !onConsole && !isTeacher && !noServer) grp.hidden = false;
    if (window.settingsExtra){
      const extra = document.createElement("button");
      extra.className = "btn-ghost";
      extra.style.width = "100%";
      extra.style.marginTop = "10px";
      extra.style.marginBottom = "10px";
      extra.textContent = window.settingsExtra.label;
      extra.addEventListener("click", () => { back.hidden = true; window.settingsExtra.run(); });
      const done = back.querySelector("#setDone");
      if (done && done.parentNode) done.parentNode.insertBefore(extra, done);
    }
    back.querySelector("#pwGo").addEventListener("click", async () => {
      const msg = back.querySelector("#pwMsg");
      const next = back.querySelector("#pwNew").value, again = back.querySelector("#pwNew2").value;
      if (next.length < 12 || next.length > 25){ msg.textContent = "Your password must be 12 to 25 characters."; return; }
      if (next !== again){ msg.textContent = "The two new passwords don't match."; return; }
      msg.textContent = "Saving\u2026";
      try{
        const r = await fetch(API + "/api/login", { method:"POST",
          headers:{ "Content-Type":"application/json", Authorization: "Bearer " + localStorage.getItem("hub_token") },
          body: JSON.stringify({ action:"set-password", newPassword: next }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not change it.");
        msg.textContent = "Password changed \u2713";
        back.querySelector("#pwNew").value = back.querySelector("#pwNew2").value = "";
      }catch(e){ msg.textContent = e.message; }
    });
    back.querySelector("#setDone").addEventListener("click", () => { back.hidden = true; });
    back.addEventListener("mousedown", (e) => { if (e.target === back) back.hidden = true; });
    return { back, paint };
  }
  let ui = null;
  /* A page can add its own item to the settings pop-up — the console uses
     this for changing which teacher is signed in. */
  window.settingsExtra = null;
  window.initSettings = function(btn){
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!ui) ui = build();
      ui.paint(); ui.back.hidden = false;
    });
  };
  apply(prefs());
  /* The <head> run above sets the theme and font on <html> straight away, but
     the tint overlay needs <body>. Run once more when the document is ready so
     a saved tint shows on load without every page having to defer the script. */
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => apply(prefs()), { once:true });
  }
})();
