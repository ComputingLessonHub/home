/* ===================================================================
   helper.js — a help chat that answers from a file of answers, with no
   AI service behind it, so it costs nothing to run and works offline.

   What makes it feel like a conversation is four small things rather
   than a language model:

     matching  each question is scored against every answer, mostly on
               the ways a student might ask for it (an entry's "ask"
               list), with spelling slips forgiven and a student's words
               swapped for the file's ("rubber" is "eraser")
     memory    it remembers the last answer, so "it still doesn't work"
               shows that answer's fixes, and "what next" its neighbours
     honesty   when nothing scores well it says so, offers the closest
               few, and sends the student to their teacher rather than
               guessing
     pace      every reply comes after a moment of "typing", longer for a
               longer answer, so it reads as being answered rather than
               as a page appearing all at once

   A topic is one file of answers (help-photoshop.js). Anything another
   subject needs, Scratch or Python say, is another file in the same
   shape, and nothing here changes.

   On a lesson it is a task (rHelper in tasks-extra.js). What it could not
   answer goes to the teacher, with no name, and shows under that task in
   the builder. The last fifty questions, with what they were matched to and
   whether that helped, are also kept in this browser (hub_help_log).
   =================================================================== */
(function(){
"use strict";

const STOP = new Set(("a an and are at be but by can could did do does doing for from get got had has have how i i'm im in " +
  "into is it its it's just me my of on or please photoshop so that the then there this to too use using want was " +
  "we what when where which why will with would you your help hi hello hey ok okay like make really need trying try " +
  "am been being thing stuff something keep keeps now one").split(" "));
const norm = (s) => String(s || "").toLowerCase().replace(/[‘’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9#+]+/g, " ").trim();
function stem(w){
  if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
  if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}
function lev(a, b, max){
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++){
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* ---------------- the index ---------------- */
function build(pack){
  const syn = pack.synonyms || {};
  const terms = (s) => norm(s).split(" ").filter(w => w && !STOP.has(w)).map(w => stem(syn[w] || w));
  const FIELDS = [["title", 3], ["ask", 2.5], ["tool", 1.5], ["steps", 0.5], ["fix", 0.35]];
  const docs = pack.entries.map(e => {
    const tf = {}; let len = 0;
    FIELDS.forEach(([f, w]) => {
      const text = Array.isArray(e[f]) ? e[f].join(" ") : (e[f] || "");
      terms(text).forEach(t => { tf[t] = (tf[t] || 0) + w; len += w; });
    });
    /* each way of asking, kept whole as well, for matching phrases */
    const phrases = (e.ask || []).concat([e.title]).map(p => terms(p)).filter(p => p.length);
    return { e, tf, len, phrases };
  });
  const df = {};
  docs.forEach(d => Object.keys(d.tf).forEach(t => { df[t] = (df[t] || 0) + 1; }));
  const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  const vocab = Object.keys(df);
  const byId = {}; pack.entries.forEach(e => { byId[e.id] = e; });
  return { pack, docs, df, avg, vocab, terms, byId, N: docs.length };
}
/* A word nobody wrote is matched to the closest one somebody did:
   "backgrond", "eracer", "opasity". Short words are left alone, because
   one letter off a three-letter word is a different word. */
function mend(ix, words){
  return words.map(w => {
    if (ix.df[w] || w.length < 4) return w;
    const max = w.length >= 8 ? 2 : 1;
    let best = null, bestD = max + 1;
    for (const v of ix.vocab){
      const d = lev(w, v, max);
      if (d < bestD){ bestD = d; best = v; if (d === 1 && max === 1) break; }
    }
    return best || w;
  });
}
function search(ix, question){
  const q = mend(ix, ix.terms(question));
  if (!q.length) return [];
  const k1 = 1.2, b = 0.6;
  const scored = ix.docs.map(d => {
    let s = 0;
    q.forEach(t => {
      const f = d.tf[t];
      if (!f) return;
      const idf = Math.log(1 + (ix.N - ix.df[t] + 0.5) / (ix.df[t] + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / ix.avg));
    });
    /* Two words together that an entry also has together ("layer
       locked", "remove background") count for much more than both
       words turning up somewhere in it. */
    let bonus = 0;
    d.phrases.forEach(p => {
      const hit = p.filter(t => q.includes(t)).length;
      if (hit >= 2 && hit / p.length >= 0.6) bonus = Math.max(bonus, hit * 1.6 * (hit / p.length));
      if (hit === p.length && p.length >= 2) bonus = Math.max(bonus, 2.5 + p.length);
    });
    return { e: d.e, score: s + bonus };
  }).filter(r => r.score > 0).sort((a, c) => c.score - a.score);
  return scored;
}

/* ---------------- talking ---------------- */
const FOLLOW_STILL = /\b(still|didnt|doesnt|did not|does not|not work|wont|same problem|nope|no it|not helped|that didnt)\b/;
const FOLLOW_NEXT = /\b(what next|then what|whats next|what now|and then|after that|next step)\b/;
const THANKS = /\b(thanks|thank you|thx|cheers|ta|that worked|it worked|got it|sorted)\b/;
const GREET = /^\s*(hi|hello|hey|yo|hiya)\b[\s!.]*$/;

function reply(ix, state, question){
  const q = norm(question);
  if (!q) return null;
  if (GREET.test(q)) return { kind: "say", text: ix.pack.greeting };
  if (THANKS.test(q) && q.split(" ").length <= 5){
    state.last = null;
    return { kind: "say", text: "Glad that helped! Ask again any time." };
  }
  const card = /(?:#|cue card |card |tutorial )(\d{1,2})\b/.exec(q);
  if (card){
    const n = parseInt(card[1], 10);
    const e = ix.pack.entries.find(x => x.card === n || (x.cards || []).includes(n));
    if (e){ state.last = e.id; return { kind: "answer", e }; }
  }
  const results = search(ix, question);
  const top = results[0];
  const last = state.last && ix.byId[state.last];
  /* "It still doesn't work" says nothing about which tool. If the words
     do not clearly point somewhere new, it means the answer just given. */
  if (last && FOLLOW_STILL.test(q) && (!top || top.score < 6 || top.e.id === "brush-not-working" || top.e.id === last.id))
    return { kind: "fixes", e: last };
  if (last && FOLLOW_NEXT.test(q) && (!top || top.score < 6))
    return { kind: "next", e: last };
  if (!top || top.score < 2.2)
    return { kind: "unsure", near: results.slice(0, 3).map(r => r.e) };
  state.last = top.e.id;
  const second = results[1];
  const close = second && second.score >= top.score * 0.88 ? [second.e] : [];
  return { kind: "answer", e: top.e, also: close, score: top.score };
}

/* ---------------- the chat window ---------------- */
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function el(tag, cls, text){ const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
/* Keys written in an answer ("Ctrl + T") are drawn as keys. Done on the
   escaped text, so nothing in an answer can become markup. */
function keys(text){
  return esc(text).replace(/\b(Ctrl|Alt|Shift|Space|Enter|Esc|Backspace|Delete|Tab|F\d{1,2})\b(?:\s\+\s(?:Ctrl|Alt|Shift|[A-Z0-9\[\]+\-]|Enter|Space))*|(?<=\s|^)\[(?=\s|$)|(?<=\s|^)\](?=\s|$)/g,
    (m) => m.split(/\s\+\s/).map(k => "<kbd>" + k + "</kbd>").join(" + "));
}
function mount(holder, pack, opts){
  opts = opts || {};
  const ix = build(pack);
  const state = { last: null };
  const root = el("div", "hp");
  const log = el("div", "hp-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const form = el("form", "hp-ask");
  const input = el("input");
  input.type = "text"; input.maxLength = 200; input.autocomplete = "off";
  input.placeholder = "Ask about " + pack.name + "…";
  input.setAttribute("aria-label", "Your question");
  const send = el("button", "btn-primary hp-send", "Ask");
  send.type = "submit";
  form.appendChild(input); form.appendChild(send);
  root.appendChild(log); root.appendChild(form);
  holder.appendChild(root);

  const scroll = () => { log.scrollTop = log.scrollHeight; };

  /* ---- the helper's turn ----
     Every reply waits behind three dots for a moment that grows with how
     much is about to be said: under a second for "Great!", never more than
     about two for a full set of steps. Long enough to read as an answer
     being written, short enough that someone in the middle of Photoshop is
     not left waiting. Replies queue, so two questions asked quickly are
     answered in the order they were asked, and the box can be typed in
     the whole time. */
  let turn = Promise.resolve();
  const sizeOf = (e) => e ? (e.title + " " + (e.steps || []).join(" ")).length : 60;
  function botTurn(size, draw){
    turn = turn.then(() => new Promise(done => {
      setTimeout(() => {
        const dots = el("div", "hp-msg hp-bot hp-typing");
        dots.setAttribute("aria-hidden", "true");
        dots.innerHTML = "<span></span><span></span><span></span>";
        log.appendChild(dots); scroll();
        setTimeout(() => {
          dots.remove();
          try{ draw(); }catch(e){}
          scroll();
          done();
        }, Math.min(1700, 500 + size * 6));
      }, 250);
    }));
  }
  function bubble(who, node){
    const b = el("div", "hp-msg hp-" + who);
    if (typeof node === "string") b.textContent = node; else b.appendChild(node);
    log.appendChild(b); scroll();
    return b;
  }
  function chips(list, label){
    const row = el("div", "hp-chips");
    if (label) row.appendChild(el("span", "hp-chiplabel", label));
    list.forEach(e => {
      if (!e) return;
      const c = el("button", "hp-chip", e.title);
      c.type = "button";
      c.addEventListener("click", () => { bubble("me", e.title); state.last = e.id; botTurn(sizeOf(e), () => answer(e)); note(e.title, e.id, "chip"); });
      row.appendChild(c);
    });
    return row;
  }
  function answer(e, also){
    const card = el("div", "hp-card");
    card.appendChild(el("div", "hp-title", e.title));
    if (e.tool){ const t = el("div", "hp-tool"); t.innerHTML = keys(e.tool); card.appendChild(t); }
    const ol = el("ol", "hp-steps");
    e.steps.forEach(s => { const li = el("li"); li.innerHTML = keys(s); ol.appendChild(li); });
    card.appendChild(ol);
    if (e.card) card.appendChild(el("div", "hp-cue", "Tutorial #" + e.card + " has a cue card and video for this."));
    const acts = el("div", "hp-acts");
    const good = el("button", "hp-act", "That helped");
    const bad = el("button", "hp-act", e.fix && e.fix.length ? "Still not working" : "Not quite");
    [good, bad].forEach(x => { x.type = "button"; acts.appendChild(x); });
    good.addEventListener("click", () => {
      acts.remove(); mark(e.id, true);
      state.last = null;
      botTurn(26, () => bubble("bot", "Great! Ask again any time."));
    });
    bad.addEventListener("click", () => {
      acts.remove(); mark(e.id, false);
      tell("not-quite", e.id);
      botTurn(e.fix && e.fix.length ? e.fix.join(" ").length : 120, () => { if (e.fix && e.fix.length) fixes(e); else unsure([]); });
    });
    card.appendChild(acts);
    bubble("bot", card);
    if (also && also.length) log.appendChild(chips(also, "Or did you mean:"));
    if (e.see && e.see.length) log.appendChild(chips(e.see.map(id => ix.byId[id]), "Next you might want:"));
    scroll();
  }
  function fixes(e){
    const card = el("div", "hp-card");
    card.appendChild(el("div", "hp-title", "Still not working? Check these"));
    const ul = el("ul", "hp-fixes");
    (e.fix && e.fix.length ? e.fix : ["Check the right layer is clicked in the Layers panel.", "Press Ctrl + D in case something is still selected."])
      .forEach(f => { const li = el("li"); li.innerHTML = keys(f); ul.appendChild(li); });
    card.appendChild(ul);
    const acts = el("div", "hp-acts");
    const teach = el("button", "hp-act", "Still stuck");
    teach.type = "button";
    teach.addEventListener("click", () => { acts.remove(); askTeacher(); });
    acts.appendChild(teach);
    card.appendChild(acts);
    bubble("bot", card);
  }
  function unsure(near){
    const box = el("div");
    box.appendChild(el("p", "hp-p", near.length
      ? "I'm not sure I've understood. Is it one of these?"
      : "I don't know that one yet. Try saying which tool you are using, or what you can see on the screen."));
    if (near.length) box.appendChild(chips(near));
    const t = el("button", "hp-act", "Ask my teacher");
    t.type = "button";
    t.addEventListener("click", () => { t.remove(); askTeacher(); });
    box.appendChild(t);
    bubble("bot", box);
  }
  function askTeacher(){
    const sent = tell("still-stuck", state.last);
    const words = opts.teacherWords ||
      ((sent ? "I've sent your question to your teacher, so they can teach me the answer. " : "") +
       "Put your hand up and show your teacher what you asked. While you wait, try Ctrl + Z to undo the last thing, and Ctrl + D to clear any selection.");
    botTurn(words.length, () => bubble("bot", words));
  }

  /* ---- passing a question on ----
     What the helper could not answer goes to the teacher, through the
     help-ask action, filed against the lesson and the task it was asked in,
     so it shows under that task in the builder and the answers file can
     learn the words students really use. Only the question, what it was
     matched to and why it is being sent: never a name. Only for a
     signed-in student, because the class is read from their sign-in; never
     in offline mode; and never from help.html, which belongs to no lesson
     and so to no task anybody would read it under. One send per question,
     whichever reason comes first. */
  let asked = "";
  const sentFor = new Set();
  function canTell(){
    const hub = window.HUB || {};
    let token = "";
    try{ token = localStorage.getItem("hub_token") || ""; }catch(e){}
    return !hub.OFFLINE && !!hub.API && hub.API.indexOf("PASTE_") !== 0 && !!token && !!asked && !!opts.lesson;
  }
  function tell(how, matched){
    if (!canTell()) return false;
    const key = asked.toLowerCase();
    if (sentFor.has(key)) return true;
    sentFor.add(key);
    let token = "";
    try{ token = localStorage.getItem("hub_token") || ""; }catch(e){}
    fetch(window.HUB.API + "/api/teacher/help-ask", { method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ question: asked, matched: matched || "", how, topic: pack.topic || "photoshop",
                             lesson: opts.lesson, task: opts.task || "" })
    }).catch(() => {});
    return true;
  }

  /* what was asked and how it went, in this browser only */
  let lastLog = null;
  function note(q, id, how){
    try{
      const list = JSON.parse(localStorage.getItem("hub_help_log") || "[]");
      lastLog = { q: String(q).slice(0, 200), id: id || null, how, at: Date.now() };
      list.push(lastLog);
      localStorage.setItem("hub_help_log", JSON.stringify(list.slice(-50)));
    }catch(e){}
  }
  function mark(id, ok){
    try{
      const list = JSON.parse(localStorage.getItem("hub_help_log") || "[]");
      for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id){ list[i].helped = ok; break; }
      localStorage.setItem("hub_help_log", JSON.stringify(list));
    }catch(e){}
  }

  function ask(text){
    const t = String(text || "").trim();
    if (!t) return;
    bubble("me", t);
    asked = t.slice(0, 200);
    const r = reply(ix, state, t);
    if (!r) return;
    note(t, r.e ? r.e.id : null, r.kind);
    if (r.kind === "unsure") tell("unsure", null);
    const size = r.kind === "say" ? r.text.length : r.kind === "answer" ? sizeOf(r.e)
               : r.kind === "fixes" ? (r.e.fix || []).join(" ").length : 80;
    botTurn(size, () => {
      if (r.kind === "say") bubble("bot", r.text);
      else if (r.kind === "answer") answer(r.e, r.also);
      else if (r.kind === "fixes") fixes(r.e);
      else if (r.kind === "next") log.appendChild(chips((r.e.see || []).map(id => ix.byId[id]), "From there, you might want:"));
      else unsure(r.near || []);
    });
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); input.value = ""; input.focus(); });

  botTurn(String(pack.greeting || "").length, () => {
    bubble("bot", pack.greeting);
    log.appendChild(chips((pack.starters || []).map(id => ix.byId[id]), "People often ask:"));
  });
  return { ask, focus: () => input.focus() };
}

window.hubHelper = { build, search, reply, mount };
})();
