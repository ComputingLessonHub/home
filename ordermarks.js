/* Marking a "put in order" list: one mark for every line in its right place.

   The lesson page, the markbook, the unit progress screens and the builder
   all mark these, and the rule used to be written out in each of them. It
   lives here once, so a mark on one screen is never a second opinion on the
   mark shown on another.

   A list starts shuffled, and a shuffle nearly always leaves a line or two
   where it belongs. Marked line by line, a student who never touched the
   list would be given those for nothing, so a list still in the order it
   was dealt scores nothing. A list is never dealt already right, so the
   right answer always means somebody moved something. */
(function(){
  function hash(s){ let x = 5381; for (const c of s) x = ((x << 5) + x + c.charCodeAt(0)) >>> 0; return x; }

  /* The order a list is dealt in: shuffled, but the same shuffle every time
     for the same task, so a reload shows the same start. */
  function deal(b){
    const out = ((b && b.items) || []).map((_, i) => i);
    for (let i = out.length - 1; i > 0; i--){
      const j = (hash(b.id + ":" + i) % (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    /* A shuffle can come out in the right order, one deal in two for a two
       line list. That one is turned by a place, top line to the bottom,
       which leaves every line wrong. Every other deal is left exactly as it
       was, so work already saved against it still reads the same. */
    if (out.length > 1 && out.every((x, i) => x === i)) out.push(out.shift());
    return out;
  }

  function untouched(b, v){
    return !Array.isArray(v) || v.join(",") === deal(b).join(",");
  }

  /* { got, max, right: [true/false for each place] } */
  function marks(b, v){
    const items = (b && Array.isArray(b.items)) ? b.items : [];
    const max = items.length;
    const fits = Array.isArray(v) && v.length === max;
    /* one line cannot be dealt wrong or moved, so there it is just right */
    const counts = fits && (max < 2 || !untouched(b, v));
    /* a line left where the shuffle put it is not ticked either, or the
       review would show a tick that earned nothing */
    const right = items.map((_, pos) => counts && v[pos] === pos);
    return { got: right.filter(Boolean).length, max, right };
  }

  window.orderMarks = { marks, deal, untouched };
})();
