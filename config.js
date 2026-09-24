/* =====================================================================
   THE ONE FILE YOU EDIT TO CHANGE HOW THE SITE RUNS
   =====================================================================

   OFFLINE
   -------
   false  Normal running. Lessons, classes, marking and saved work all go
          through the Azure Functions backend and the Cosmos DB database.

   true   Everything runs from GitHub Pages alone. No backend is called at
          all — not even to check. Lessons are read from the lessons
          folder, students reach one by a link you hand out or by typing
          its four digit code on the front page, their work is kept in
          their own browser, and they hand it in by saving a PDF.

          Use this if the IT team need to look at Azure before
          they are allowed, or if they are not allowed at all. Change the
          one word below, commit, and the whole site switches over.
          OFFLINE-MODE.md sets out what changes.

   Switching back and forth is safe: work saved in a browser stays there,
   and anything already in the database is untouched.
   ===================================================================== */
window.HUB = {
  OFFLINE: false,

  // Your Function App's address — no trailing slash, and no /api on the
  // end. Ignored entirely when OFFLINE is true, so it can be left as it is.
  // Until the Function App exists this points nowhere, and every page says
  // it cannot reach the server, which is the truth.
  API: "computinglessonhub-api.azurewebsites.net".replace(/\/+$/, "")
};

/* Everything below works out what that means, so no page has to. */
if (window.HUB.OFFLINE) window.HUB.API = "";
window.hubOffline = function(){ return !!(window.HUB && window.HUB.OFFLINE); };

/* ---------------------------------------------------------------------
   A time limit on every call to our own server.

   Nothing here used to have one, and the failure a school network
   actually produces is not the one the code was written for. A filter or
   a dropped wireless connection ACCEPTS the connection and then never
   answers: fetch neither succeeds nor fails, so the catch that every
   caller already has never gets its turn. Pages froze on the loading
   screen, Continue stuck on "checking", and Save said "Saving..." until
   the tab was refreshed.

   Worse than any one of those, a browser allows only six connections to
   one address at a time. Six calls left hanging use all of them up, and
   then nothing else gets through either, saving included. A child
   pressing Continue a few times reaches that in seconds.

   So: a call that has not answered in twenty seconds has not worked.
   Failing is what the code downstream already knows how to handle.

   Only our own address and our own pages are limited. Pyodide is tens of
   megabytes off a CDN and is perfectly entitled to take a few minutes on
   a school connection, so anything from somewhere else is left alone. */
(function(){
  if (!window.fetch || !window.AbortController) return;   // very old browser: leave it be

  var READ_MS  = 20000;
  /* Sending work up is worth waiting longer for than reading something
     back, because giving up on it costs a child the lesson they typed. */
  var WRITE_MS = 45000;

  /* Whole-database jobs in the console. These are meant to take minutes,
     a teacher is sitting watching them, and cutting one off part way is
     the last thing anybody wants. They keep the old behaviour. */
  var NO_LIMIT = /\/api\/teacher\/(backup|restore|storage|purge)\b/;

  var realFetch = window.fetch.bind(window);

  function urlOf(input){
    try{
      return new URL(
        (input && typeof input === "object" && input.url) ? input.url : String(input),
        location.href);
    }catch(e){ return null; }
  }

  function ours(url){
    if (!url) return false;
    if (url.origin === location.origin) return true;           // the site's own files
    try{
      return !!(window.HUB.API && url.origin === new URL(window.HUB.API).origin);
    }catch(e){ return false; }
  }

  window.fetch = function(input, init){
    init = init || {};
    var url = urlOf(input);
    if (init.signal || !ours(url) || NO_LIMIT.test(url.pathname)) return realFetch(input, init);

    var method = String(init.method || (input && input.method) || "GET").toUpperCase();
    var limit = (method === "GET" || method === "HEAD") ? READ_MS : WRITE_MS;

    var stop = new AbortController();
    var timer = setTimeout(function(){ stop.abort(); }, limit);
    var opts = {};
    for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) opts[k] = init[k];
    opts.signal = stop.signal;

    return realFetch(input, opts).then(
      function(r){ clearTimeout(timer); return r; },
      function(e){ clearTimeout(timer); throw e; }
    );
  };
})();
