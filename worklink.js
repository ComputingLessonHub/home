/* ---------------------------------------------------------------------
   HANDING WORK ABOUT WITHOUT A SERVER

   A whole piece of work travels inside a link, after the "#", so it never
   reaches GitHub Pages and is never logged anywhere: it goes from one
   browser to another and nowhere else.

   Two directions use the same envelope:
     #w=…   a student handing work to their teacher
     #f=…   the teacher handing it back, with feedback and a mark on it

   Text, quizzes, ciphers and password scores squeeze down to almost
   nothing. A screenshot does not, because a JPEG is already compressed, so
   lessons holding one keep the PDF instead. lesson.html decides that.
   --------------------------------------------------------------------- */
(function(){
  "use strict";

  function toBase64Url(bytes){
    let bin = "";
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(text){
    const pad = String(text).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /* A damaged link fails on both halves of the stream at once, and the
     writer's half has nobody waiting on it, so its rejection has to be
     swallowed or it surfaces as an uncaught error the reader already handled. */
  function feed(stream, bytes){
    const w = stream.writable.getWriter();
    w.write(bytes).catch(() => {});
    w.close().catch(() => {});
  }

  const supported = typeof CompressionStream !== "undefined" &&
                    typeof DecompressionStream !== "undefined";

  async function pack(obj){
    const cs = new CompressionStream("deflate-raw");
    feed(cs, new TextEncoder().encode(JSON.stringify(obj)));
    return toBase64Url(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
  }
  async function unpack(blob){
    const ds = new DecompressionStream("deflate-raw");
    feed(ds, fromBase64Url(blob));
    const text = new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
    return JSON.parse(text);
  }

  /* Reads whichever of the two is on this page's address. Returns null when
     there is none, and { kind:"broken" } when one arrived damaged, so a page
     can tell "no link" apart from "a link that lost characters on the way". */
  async function readHash(){
    const raw = (location.hash || "");
    const m = /^#([wf])=([\s\S]+)$/.exec(raw);
    if (!m) return null;
    const kind = m[1] === "w" ? "work" : "marked";
    if (!supported) return { kind: "broken" };
    try{
      const box = await unpack(m[2]);
      if (!box || !box.d) return { kind: "broken" };
      box.kind = kind;
      return box;
    }catch(e){
      console.error("work link could not be read:", e);
      return { kind: "broken" };
    }
  }

  window.workLink = {
    supported: supported,
    pack: pack,
    unpack: unpack,
    readHash: readHash,
    /* Roughly where a chat window starts mangling things. Well beyond an
       ordinary lesson, which comes to a few hundred characters. */
    MAX: 8000
  };
})();
