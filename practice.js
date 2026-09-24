/* ===================================================================
   practice.js — the Practice section: what is on offer, and where a
   student's sandbox programs are kept.

   Practice is work nobody set and nobody marks. It is not a lesson, so
   none of it goes near the lesson list, the catalogue or the markbook.

   Two things live here because two pages want them: the home page paints
   the list of activities, and sandbox.html keeps the programs.
   =================================================================== */
(function(){
  "use strict";

  const API = (window.HUB && window.HUB.API) || "";
  const OFFLINE = !!(window.HUB && window.HUB.OFFLINE);

  /* ---------- what a student can practise ----------
     Everything that will ever be here is listed now, with `ready` saying
     whether it has a page behind it yet. The quiz and the written answers
     are being written next; turning one on is this one word, and the card
     appears on the home page with no other change anywhere. */
  const ACTIVITIES = [
    { id:"sandbox", ready:true,  href:"sandbox.html", icon:"▶",
      title:"Sandbox",
      blurb:"Write and run your own Python programs. Keep up to five of them." },
    { id:"quiz", ready:false, href:"practice-quiz.html", icon:"⚡",
      title:"Quickfire quiz",
      blurb:"Short rounds of questions on what you have been learning." },
    { id:"written", ready:false, href:"practice-written.html", icon:"✎",
      title:"Written answers",
      blurb:"Practise writing longer answers, with help as you go." }
  ];

  const MAX_PROGRAMS = 5;
  /* About 300 lines of code. Plenty for practice, and it is what keeps the
     arithmetic honest. Worst case, every child filling every slot to the
     brim: a Python program is main.py plus two files, so 10KB and at most
     40KB more, and five of those is 250KB; a web program is three code files,
     so 30KB, and five of those is 150KB. Call it 250KB a student, 200MB
     across a year group, against a database of 5GB. Nothing here is ever
     stored as a picture. */
  const MAX_CODE = 10000;
  const MAX_NAME = 40;
  /* The files a Python program has beside main.py: another .py to import, or
     a .txt or .csv to read with open(). A .csv is only text with commas in it,
     so it is kept, capped and shown exactly the way a .txt is. Two of them,
     because that is what the storage was worked out for. A picture renamed
     .txt would sail through any check of the name, so the size cap is what
     actually holds the line: 20,000 characters is about 3,000 words, more
     than any KS3 exercise needs. Python beside it is held to the same 10,000
     as main.py. */
  const MAX_FILES = 2;
  const MAX_FILE_CHARS = 20000;
  const MAIN = "main.py";

  /* One row in the work table per student, under a lesson id no lesson can
     have. That is deliberate: it needs no new serverless function (there
     are eight and eight are allowed), no new table, and a student who
     leaves takes their sandbox with them, because deleting a student
     already deletes their work. */
  const SLOT = "__practice_sandbox";

  /* A teacher has a sandbox too, for trying something out before showing a
     class. A teacher is not a row in the students table, so their programs
     cannot sit in the work table beside a child's: they go to a route of the
     teacher function instead, filed under the initials picked on the way into
     the console. Everything else, the caps, the saving in two halves, the
     five programs, is the same code as a student's. `teacherCode` is null for
     a student and a string (possibly "" for All (Admin)) for a teacher. */
  let teacherCode = null;
  const asTeacher = () => teacherCode !== null;
  const KEY = () => asTeacher() ? "hub_sandbox_teacher" : "hub_sandbox";

  const auth = () => window.teacherAuth;
  const token = () => asTeacher()
    ? ((auth() && auth().have()) ? "teacher" : "")
    : (localStorage.getItem("hub_token") || "");
  const whoami = () => asTeacher()
    ? "teacher:" + teacherCode.toLowerCase()
    : (localStorage.getItem("hub_user") || "").toLowerCase();

  function blank(){ return { user: whoami(), programs: [], notes: {}, pending: false, saved: 0 }; }

  /* What is in this browser. Whose it is, is written down beside it: a
     shared computer hands the next child the same localStorage, and marks
     belonging to somebody else have appeared on a screen here before. */
  function readLocal(){
    let d = null;
    try{ d = JSON.parse(localStorage.getItem(KEY()) || "null"); }catch(e){ d = null; }
    if (!d || !Array.isArray(d.programs)) return blank();
    if (!OFFLINE && String(d.user || "") !== whoami()) return blank();
    return { user: d.user || "", programs: d.programs.map(tidy).filter(Boolean),
             notes: tidyNotes(d.notes),
             pending: !!d.pending, saved: d.saved || 0 };
  }
  function writeLocal(d){
    try{ localStorage.setItem(KEY(), JSON.stringify(d)); }catch(e){ /* a full browser: the server still has it */ }
  }

  /* Anything read back, from either side, is checked rather than trusted: a
     blob that has been edited by hand must not put an object where the editor
     expects a string. It is also where every cap is actually applied, so
     there is one place that decides how big a program may be rather than one
     per screen that can write one. */
  function tidy(p){
    if (!p || typeof p !== "object") return null;
    const kind = p.kind === "web" ? "web" : "python";
    const out = {
      id: String(p.id || "").slice(0, 40) || newId(),
      name: String(p.name || "Program").slice(0, MAX_NAME),
      kind: kind,
      updated: Number(p.updated) || 0
    };
    if (kind === "web"){
      out.html = text(p.html, MAX_CODE);
      out.css = text(p.css, MAX_CODE);
      out.js = text(p.js, MAX_CODE);
    } else {
      out.code = text(p.code, MAX_CODE);
      const seen = { "main.py": true };
      out.files = (Array.isArray(p.files) ? p.files : [])
        .slice(0, MAX_FILES)
        .map(f => {
          if (!f) return null;
          const name = fileName(f.name);
          /* Two files with one name would hide one of them from Python, and
             one called main.py would shadow the program itself. */
          if (!name || seen[name.toLowerCase()]) return null;
          seen[name.toLowerCase()] = true;
          return { name: name, text: text(f.text, isCode(name) ? MAX_CODE : MAX_FILE_CHARS) };
        })
        .filter(Boolean);
    }
    return out;
  }
  function text(v, cap){ return String(v == null ? "" : v).slice(0, cap); }

  /* What a teacher has written about each program, kept beside them so the
     sandbox can show it without asking the server a second time. Checked the
     same way the programs are: this arrives as JSON out of a text column and
     an object where a string is expected would break the page showing it. */
  function tidyNotes(raw){
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).slice(0, 20).forEach(id => {
      const n = raw[id];
      if (!n || typeof n !== "object") return;
      const note = { strength: text(n.strength, 600), target: text(n.target, 600),
                     comment: text(n.comment, 2000), at: text(n.at, 40) };
      if (note.strength || note.target || note.comment) out[String(id).slice(0, 40)] = note;
    });
    return out;
  }
  const isCode = (name) => /\.py$/i.test(String(name || ""));
  const isCsv = (name) => /\.csv$/i.test(String(name || ""));

  /* What a file may be called, before it is written into Python's own little
     filesystem: no folders, nothing but letters, numbers and the quiet
     punctuation, and one of the two endings. The name a browser hands over
     comes from the child's own computer and is not to be trusted with a path.

     `want` forces the ending where the student has chosen one: "py", "txt"
     or "csv". Left out, a name ending .py stays Python, one ending .csv stays
     a .csv, and everything else becomes text, which is what uploading a file
     off their computer should do.

     The ending is always put back in lower case. Python cares about the
     difference between DATA.TXT and data.txt, and a child typing the name
     into their code will not have noticed which they were given. */
  function fileName(raw, want){
    let name = String(raw || "").split(/[\\/]/).pop().trim();
    name = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._-]+/, "").slice(0, 40);
    if (!name) return "";
    const kind = want || (isCode(name) ? "py" : isCsv(name) ? "csv" : "txt");
    const ending = kind === "py" ? ".py" : kind === "csv" ? ".csv" : ".txt";
    return name.replace(/\.[^.]*$/, "") + ending;
  }
  function newId(){
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* Never more than five, however the list arrived. Only reached by a
     student working in two places at once, which is rare, but it must not
     end in six. The order they are in is theirs and is left alone: the
     newest are the ones kept, not the ones moved to the front, or a list
     would shuffle itself every time a program was opened. */
  function capped(list){
    if (list.length <= MAX_PROGRAMS) return list.slice();
    const newest = new Set(list.slice()
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .slice(0, MAX_PROGRAMS)
      .map(p => p.id));
    return list.filter(p => newest.has(p.id));
  }

  /* `leaving` is for the save made as the tab goes away. A normal fetch is
     cancelled when the page is thrown out; keepalive asks the browser to
     finish sending it anyway, which is exactly the save nobody can watch.
     It is not used for ordinary saves: keepalive bodies are capped at 64KB
     by the browser, and five full programs is not far off it. */
  async function pushUp(programs, leaving){
    if (OFFLINE || !API || !token()) return false;
    if (asTeacher()){
      const topts = {
        method: "POST",
        headers: auth().json(),
        body: JSON.stringify({ who: teacherCode, programs: programs })
      };
      if (leaving) topts.keepalive = true;
      const tr = await fetch(API + "/api/teacher/sandbox", topts);
      if (!tr.ok) throw new Error("Could not save just now.");
      return true;
    }
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ lesson: SLOT, data: { practice: "sandbox", programs: programs } })
    };
    if (leaving) opts.keepalive = true;
    const r = await fetch(API + "/api/submit", opts);
    if (!r.ok) throw new Error("Could not save just now.");
    return true;
  }

  async function pullDown(){
    if (OFFLINE || !API || !token()) return null;
    if (asTeacher()){
      const tr = await fetch(API + "/api/teacher/sandbox?who=" + encodeURIComponent(teacherCode), {
        headers: auth().headers(), cache: "no-store"
      });
      if (!tr.ok) throw new Error("Could not load your programs.");
      const td = await tr.json();
      const mine = (td && Array.isArray(td.programs)) ? td.programs : [];
      /* Nobody marks a teacher's programs, so there are never any notes. */
      return { programs: capped(mine.map(tidy).filter(Boolean)), notes: {} };
    }
    const r = await fetch(API + "/api/work?lesson=" + encodeURIComponent(SLOT), {
      headers: { Authorization: "Bearer " + token() }, cache: "no-store"
    });
    if (!r.ok) throw new Error("Could not load your programs.");
    const d = await r.json();
    const got = (d && d.data && Array.isArray(d.data.programs)) ? d.data.programs : [];
    /* The teacher's notes ride along in the same row, in the feedback column
       the marking screen writes, so they cost nothing extra to fetch. */
    let notes = {};
    try{ notes = tidyNotes((JSON.parse(d.feedback || "{}") || {}).programs); }catch(e){ notes = {}; }
    return { programs: capped(got.map(tidy).filter(Boolean)), notes: notes };
  }

  /* ---------- the store the sandbox page talks to ----------
     Saving is in two halves. The browser's copy is written the moment
     anything changes, so nothing is ever lost to a refresh; the server is
     told when the typing stops, when the page is left, and whenever a
     program is made, renamed or deleted. Sending every keystroke up would
     be hundreds of writes a lesson for work nobody marks. */
  let state = blank();
  let timer = null;
  let sending = null;
  let stuck = false;          // a save that did not get through

  const sandbox = {
    MAX_PROGRAMS, MAX_CODE, MAX_NAME, MAX_FILES, MAX_FILE_CHARS,

    /* Called whenever there is something new to say about saving, so the
       page can show it without asking over and over. Set by whoever is
       showing it. */
    onState: null,

    /* What this browser already has, straight away, so the editor can be
       drawn without waiting for the network. */
    localCopy(){ state = readLocal(); return state.programs.slice(); },

    /* The real list. Anything typed here that never reached the server goes
       up first: it is newer than whatever is up there, and letting the
       server's copy win would throw away the work that failed to send.
       Otherwise the server is the truth, which is what makes a program
       deleted on one computer stay deleted on the next. */
    async load(){
      state = readLocal();
      if (OFFLINE || !API || !token()) return state.programs.slice();
      if (state.pending){
        await sandbox.flush();
        return state.programs.slice();
      }
      const up = await pullDown();
      if (up){
        state = { user: whoami(), programs: up.programs, notes: up.notes,
                  pending: false, saved: Date.now() };
        writeLocal(state);
      }
      return state.programs.slice();
    },

    /* What the teacher has said about one program, or null. Read off whatever
       the last load brought down: nothing here ever asks on its own, because
       a note is not worth a request of its own when the programs have just
       been fetched from the same row. */
    noteFor(id){ return (state.notes || {})[id] || null; },

    /* Changed on the page: written down here and now, sent up shortly.
       `now` is for the changes worth not losing to a closed tab, which is
       every one that is not simply typing. */
    keep(programs, now){
      state.programs = capped(programs.map(tidy).filter(Boolean));
      state.user = whoami();
      state.pending = true;
      writeLocal(state);
      clearTimeout(timer);
      if (now) return sandbox.flush();
      timer = setTimeout(() => { sandbox.flush(); }, 10000);
      return Promise.resolve(false);
    },

    /* Everything not yet sent, sent. Comes back true when the server has it
       and false otherwise, and never throws: there is nothing useful for a
       page to do about a save that did not get through except say so and
       let the next one carry it, which is what happens here. */
    async flush(leaving){
      clearTimeout(timer);
      if (!state.pending) return false;
      if (OFFLINE || !API || !token()) return false;
      if (sending) return sending;
      const going = state.programs.slice();
      sending = (async () => {
        try{
          await pushUp(going, leaving);
          /* Only what actually went up is settled. Anything typed while it
             was in the air is still waiting, so the flag stays up. */
          if (same(state.programs, going)){
            state.pending = false;
            state.saved = Date.now();
            writeLocal(state);
          }
          stuck = false;
          return true;
        }catch(e){
          /* The school's network drops for a moment far more often than it
             goes away for good, so this tries again rather than giving up
             on work that is safe in the browser either way. */
          stuck = true;
          clearTimeout(timer);
          timer = setTimeout(() => { sandbox.flush(); }, 30000);
          return false;
        }finally{
          sending = null;
          if (typeof sandbox.onState === "function"){ try{ sandbox.onState(); }catch(e){} }
        }
      })();
      return sending;
    },

    /* Is there anything the server has not been told about, and has a go at
       telling it already failed? The page turns these into words. */
    waiting(){ return !!state.pending; },
    stuck(){ return stuck; },

    /* Turns this into a teacher's sandbox, filed under their initials. Must
       be called before anything else is asked of the store, because it
       changes which copy in this browser is read and where saves are sent. */
    useTeacher(code){ teacherCode = String(code || "").slice(0, 20); state = blank(); },
    isTeacher: asTeacher,
    newId, fileName, isCode, isCsv, MAIN, SLOT
  };

  /* Compared whole rather than field by field. The field list was written
     when a program was a name and some Python; a web program's three files
     and a Python program's uploaded text were both invisible to it, so a
     save that landed between one keystroke and the next was marked settled
     while the newer work sat there unsent. */
  function same(a, b){
    try{ return JSON.stringify(a) === JSON.stringify(b); }catch(e){ return false; }
  }

  window.practice = {
    ACTIVITIES,
    /* The ones with a page behind them. Everything else waits here until
       it is written. */
    live(){ return ACTIVITIES.filter(a => a.ready); },
    sandbox
  };
})();
