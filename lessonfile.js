/* ---------------------------------------------------------------------
   The lessons folder, read as a catalogue.

   Without a server, lessons/index.json IS the catalogue: it says which
   lessons exist, which year and unit each belongs to, and the four digit
   code a student types on the home page when a link has not reached them.
   The home page, the teacher console and the lesson builder all need the
   same answers out of it, so they ask here rather than each picking the
   file apart their own way.
   --------------------------------------------------------------------- */
(function(){
  "use strict";

  let cached = null;

  /* The year can be written on the unit or on the lesson. Whichever a
     teacher used, every lesson comes out of here knowing both its unit and
     its year, because the hub files them by year first. */
  function flatten(file){
    const units = Array.isArray(file && file.units) ? file.units
                : Array.isArray(file) ? [{ name:"", lessons:file }]
                : [];
    const lessons = [];
    units.forEach(u => {
      (u.lessons || []).forEach(l => {
        lessons.push({
          id: l.id,
          title: l.title || l.id,
          description: l.description || "",
          unit: l.unit || u.name || "",
          year: l.year || u.year || "",
          code: l.code ? String(l.code).trim() : "",
          assessment: !!l.assessment,
          homework: !!l.homework,
          /* A version of another lesson. Empty for an original, which is
             every lesson that was written before versions existed. */
          versionOf: l.versionOf || "",
          versionName: l.versionName || "",
          versionNote: l.versionNote || "",
          versionCode: l.versionCode || ""
        });
      });
    });
    return {
      units: units.map(u => ({ name: u.name || "", year: u.year || "" })),
      lessons: lessons
    };
  }

  async function load(force){
    if (cached && !force) return cached;
    const r = await fetch("lessons/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error("There is no lessons/index.json to read.");
    cached = flatten(await r.json());
    return cached;
  }

  window.lessonFile = {
    load: load,
    forget: () => { cached = null; },

    byCode: (list, code) => {
      const want = String(code == null ? "" : code).trim();
      if (!want) return null;
      return (list.lessons || []).find(l => l.code === want) || null;
    },
    codeFor: (list, id) => {
      const l = (list.lessons || []).find(x => x.id === id);
      return l ? l.code : "";
    },

    /* A code nothing else is using. Four digits, never starting with a zero,
       so what a student types is always four characters long and there is no
       "did I need the nought?" to get wrong. */
    newCode: (list) => {
      const taken = new Set((list.lessons || []).map(l => l.code).filter(Boolean));
      for (let tries = 0; tries < 500; tries++){
        const c = String(1000 + Math.floor(Math.random() * 9000));
        if (!taken.has(c)) return c;
      }
      return "";
    },

    /* The address to hand a class. Built against this page, so it carries
       whatever folder the site is served from. */
    linkFor: (id) => new URL("lesson.html?id=" + encodeURIComponent(id), location.href).href
  };
})();
