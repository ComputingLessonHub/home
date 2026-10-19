/* Marking a "put in order" list: one mark for every line in its right place.

   The lesson page, the markbook, the unit progress screens and the builder
   all mark these, and the rule used to be written out in each of them. It
   lives here once, so a mark on one screen is never a second opinion on the
   mark shown on another.

   A list is dealt with no line in its right place, so every line that ends
   up right is one a student put there, and a list nobody touched scores
   nothing without needing a rule of its own. */
(function(){
  function hash(s){ let x = 5381; for (const c of s) x = ((x << 5) + x + c.charCodeAt(0)) >>> 0; return x; }

  function shuffled(n, seed){
    const out = Array.from({ length:n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--){
      const j = hash(seed + ":" + i) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /* Whether lifting out one line and putting it back somewhere else would
     sort the list: true when the rest, with that line taken out, already
     runs in order. */
  function oneMoveAway(out){
    return out.some((_, skip) => {
      const rest = out.filter((__, k) => k !== skip);
      return rest.every((x, k) => !k || rest[k-1] < x);
    });
  }

  /* The order a list is dealt in: shuffled, but the same shuffle every time
     for the same task, so a reload shows the same start.

     No line may start in its right place. The plain shuffle this replaced
     left a line or two there on most lists (Q6 of the Scratch assessment
     opened with its top line already right), so marking had to treat a list
     still as dealt as worth nothing, and a student who moved the right line
     away and put it back lost every mark on the list. Four lines and up must
     also need more than one move, or the list is the right one turned round
     by a place and dragging a single line solves it. Three lines cannot
     manage that, so they only have to have nothing in place.

     Shuffled again with a new seed until a deal passes. The first try is
     the old shuffle exactly, so a list whose old deal already passed opens
     the same as it always did. */
  function deal(b){
    const n = ((b && b.items) || []).length;
    const fine = (out) => out.every((x, i) => x !== i) && (n < 4 || !oneMoveAway(out));
    for (let attempt = 0; attempt < 200; attempt++){
      const out = shuffled(n, attempt ? b.id + ":" + attempt : b.id);
      if (n < 2 || fine(out)) return out;
    }
    /* never reached in practice; turned by a place, which has nothing right */
    return Array.from({ length:n }, (_, i) => (i + 1) % n);
  }

  /* The deal before this change, kept only so work saved against it still
     marks as it did: a list left as that deal had lines in the right place
     that nobody moved there, and they must not start counting now. */
  function oldDeal(b){
    const out = shuffled(((b && b.items) || []).length, b && b.id);
    if (out.length > 1 && out.every((x, i) => x === i)) out.push(out.shift());
    return out;
  }

  function untouched(b, v){
    if (!Array.isArray(v)) return true;
    const given = v.join(",");
    return given === deal(b).join(",") || given === oldDeal(b).join(",");
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
