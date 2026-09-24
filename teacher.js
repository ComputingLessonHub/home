/* ============================================================
   Signing in as a teacher, from anywhere that is not the console.

   The console swaps the teacher key for a session token, and once a second
   factor is switched on it stops keeping the key in the browser at all. The
   builder and the work viewer open in their own tabs and used to carry a key
   of their own in localStorage, which meant two things went wrong at once:
   with 2FA on they had no key and asked for one on every save, and whatever
   was typed was written down unchecked. A wrong key was remembered for good,
   the pop-up never came back, and every save failed from then on with no way
   to put it right.

   So: the token first, the key only where there is no second factor, and
   nothing is remembered until the server has said it is right.
   ============================================================ */
(function(){

const api = () => (window.HUB && window.HUB.API) || "";

function token(){ try{ return sessionStorage.getItem("hub_ttoken") || ""; }catch(e){ return ""; } }
function key(){ try{ return localStorage.getItem("hub_tkey") || ""; }catch(e){ return ""; } }

/* What to send. A session first, because it is the only thing that works once
   a second factor is on. */
function headers(){
  const t = token();
  if (t) return { "Authorization": "Bearer " + t };
  const k = key();
  return k ? { "x-teacher-key": k } : {};
}
function json(){ return Object.assign({ "Content-Type": "application/json" }, headers()); }
function have(){ return !!(token() || key()); }
function forget(){
  try{ sessionStorage.removeItem("hub_ttoken"); }catch(e){}
  try{ localStorage.removeItem("hub_tkey"); }catch(e){}
  dropKept();
}

/* ---- carrying a sign-in between tabs, for a few hours ----
   The token lives in sessionStorage, which belongs to one tab and no other.
   Refreshing the console keeps it, which is what that was for, but opening
   the console in a second tab, or closing that tab and opening it again,
   meant signing in from nothing.

   So a copy is kept where every tab can see it, good only while two things
   are true. It runs out six hours after signing in, which is about a school
   day. And it is tied to a tag held in a session cookie, which is the one
   thing a browser throws away when it is closed: a copy whose tag has gone
   is dead, and is deleted the moment it is looked at.

   The tag is a random number and nothing else. The token itself stays in
   localStorage and never leaves the browser, because a cookie is sent up with
   every request for a page, a stylesheet or a picture, and a sign-in has no
   business riding along on all of those.

   Six hours is the site's own doing, not the server's: the token it holds is
   an ordinary one, and what runs out is this browser's willingness to offer
   it. */
const KEEP_HOURS = 6;
const TAG = "hub_bsid";      // the session cookie: a tag, and nothing more
const BOX = "hub_keep";      // the copy of the token, in localStorage

/* Scoped to the folder the site is served from. On Pages that is /hub/, and
   a cookie at / would be handed to every other project sharing the same
   github.io address. */
function cookiePath(){ return location.pathname.replace(/[^/]*$/, "") || "/"; }
function tag(){
  try{
    const hit = ("; " + document.cookie).split("; " + TAG + "=")[1];
    return hit ? decodeURIComponent(hit.split(";")[0]) : "";
  }catch(e){ return ""; }
}
function newTag(){
  try{
    const r = new Uint8Array(16);
    crypto.getRandomValues(r);
    return Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("");
  }catch(e){
    /* A tag, never a secret. All it has to say is which run of the browser
       this is, so something unguessable is not what is wanted here. */
    return String(Date.now()) + Math.random().toString(36).slice(2);
  }
}
/* No Max-Age and no Expires on purpose: that is what makes it a session
   cookie, and what makes closing the browser the end of it. */
function setTag(v){
  try{
    document.cookie = TAG + "=" + encodeURIComponent(v) + "; path=" + cookiePath() +
                      "; SameSite=Strict" + (location.protocol === "https:" ? "; Secure" : "");
  }catch(e){}
}
function keep(t){
  if (!t) return;
  let v = tag();
  if (!v){ v = newTag(); setTag(v); }
  try{
    localStorage.setItem(BOX, JSON.stringify(
      { tag: v, token: t, exp: Date.now() + KEEP_HOURS * 3600 * 1000 }));
  }catch(e){}
}
/* The sign-in a tab with none of its own may pick up, or "" when there is
   none to pick up. */
function kept(){
  let box = null;
  try{ box = JSON.parse(localStorage.getItem(BOX) || "null"); }catch(e){}
  if (!box || !box.token) return "";
  /* Either its six hours are up, or the browser it was left by has since
     been closed. Neither is worth keeping, and a sign-in left lying about
     after it has stopped counting is worth less than that. */
  if (box.tag !== tag() || Date.now() > (box.exp || 0)){ dropKept(); return ""; }
  return box.token;
}
function dropKept(){
  try{ localStorage.removeItem(BOX); }catch(e){}
  try{
    document.cookie = TAG + "=; path=" + cookiePath() + "; Max-Age=0; SameSite=Strict";
  }catch(e){}
}

/* A 401 or 403 means whatever was being sent is no longer any good: expired,
   signed out from another machine, or simply wrong. Throw it away so the next
   attempt asks rather than failing the same way for ever. */
function rejected(status){ return status === 401 || status === 403; }

async function signIn(k, code){
  if (!api()) throw new Error("This copy of the site has no server address in config.js.");
  let device = "";
  try{ device = localStorage.getItem("hub_tdevice") || ""; }catch(e){}
  const r = await fetch(api() + "/api/teacher/sign-in", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: k, code: code || "", device: device })
  });
  let d = {};
  try{ d = await r.json(); }catch(e){}
  if (!r.ok){
    /* Only when the server looked at the note and found it no good. It used to
       go on any request for a code, including one asked because the database
       could not be reached, so a blip at the server cost this machine the rest
       of its sixty days. */
    if (d.staleDevice){ try{ localStorage.removeItem("hub_tdevice"); }catch(e){} }
    const err = new Error(d.error || "That was not accepted.");
    err.needCode = !!d.needCode;
    throw err;
  }
  try{
    sessionStorage.setItem("hub_ttoken", d.token || "");
    if (d.device) localStorage.setItem("hub_tdevice", d.device);
    /* Keeping the key beside the device note would put both halves of a
       two-factor sign-in on the same machine, which is one factor again. */
    if (d.twoFactor) localStorage.removeItem("hub_tkey");
    else localStorage.setItem("hub_tkey", k);
  }catch(e){}
  return d;
}

/* Fills a page's own pop-up box with the sign-in. The box, the ✕ and the
   scrolling all belong to the page; only what goes inside is here.
     opts.close   shut the pop-up
     opts.then    what to do once it is accepted
     opts.why     a line saying what was being attempted, if it helps
   The pop-up stays open until the server accepts something, so a typo is a
   typo rather than the end of the afternoon. */
function form(box, opts){
  opts = opts || {};
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  box.appendChild(mk("h2","","Teacher sign-in"));
  box.appendChild(mk("p","modal-text", opts.why ||
    "Type the teacher key. If a code is wanted as well, a box for it appears."));

  const kw = mk("div","bfield");
  kw.appendChild(mk("label","","Teacher key"));
  const kIn = document.createElement("input");
  kIn.type = "password"; kIn.autocomplete = "off";
  try{ kIn.value = key(); }catch(e){}
  kw.appendChild(kIn); box.appendChild(kw);

  const cw = mk("div","bfield"); cw.hidden = true;
  cw.appendChild(mk("label","","Code from your authenticator app"));
  const cIn = document.createElement("input");
  cIn.type = "text"; cIn.autocomplete = "one-time-code"; cIn.inputMode = "numeric";
  cIn.maxLength = 6; cIn.placeholder = "123456";
  cw.appendChild(cIn); box.appendChild(cw);

  const msg = mk("p","hint","");
  box.appendChild(msg);

  const go = mk("button","btn-primary modal-cta","Sign in");
  async function attempt(){
    const k = kIn.value.trim();
    if (!k){ msg.textContent = "Type the teacher key first."; kIn.focus(); return; }
    go.disabled = true;
    msg.textContent = "Checking…";
    try{
      await signIn(k, cIn.value.trim());
      msg.textContent = "";
      if (opts.close) opts.close();
      if (opts.then) opts.then();
    }catch(e){
      if (e.needCode){ cw.hidden = false; cIn.focus(); }
      msg.textContent = e.message === "Failed to fetch" ? "Could not reach the server." : e.message;
      cIn.value = "";
      go.disabled = false;
    }
  }
  go.addEventListener("click", attempt);
  kIn.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  cIn.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  box.appendChild(go);

  const no = mk("button","btn-ghost modal-stay","Cancel");
  no.addEventListener("click", () => { if (opts.close) opts.close(); });
  box.appendChild(no);
  setTimeout(() => { try{ kIn.focus(); }catch(e){} }, 30);
}

window.teacherAuth = { headers, json, have, forget, signIn, form, rejected, keep, kept, dropKept };

})();
