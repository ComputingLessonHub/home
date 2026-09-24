/* ======================================================================
   THE LINE THAT SAYS WHERE A DRAGGED THING WILL LAND

   Every list on this site that can be reordered used to answer the wrong
   question while something was being dragged over it. Outlining the row
   under the pointer says "this one", when what a teacher is asking is
   "above it, or below it?". So a task dropped between two others landed
   somewhere nobody predicted, and the only way to find out was to let go
   and look.

   This draws a line in the gap it would actually go into, and hands the
   caller back the slot that line is pointing at, so what is drawn and what
   happens on the drop are worked out by the same piece of code rather than
   by two that can disagree.

   Two more things it exists to fix, both measured rather than guessed:

   The line is one element, fixed to the window, drawn over the top of the
   list. Putting a real element into the list instead pushes everything
   below it down by its own height, which moves the row under the pointer,
   which moves the line, which moves the row. It never settles.

   `left()` is here because a dragleave does not mean what it looks like.
   The browser fires one at the old element every time the pointer crosses
   from one child to another, and those bubble, so a box that turns its
   highlight off on any dragleave flickers several times a second while the
   pointer is sitting still inside it.
   ====================================================================== */
(function(){
"use strict";

let bar = null;

function theBar(){
  if (bar && bar.parentNode) return bar;
  bar = document.createElement("div");
  bar.className = "dragline";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  return bar;
}
function hide(){ if (bar) bar.hidden = true; }

/* Did the pointer really leave `box`, or has it only crossed onto something
   inside it? relatedTarget is what the pointer went to, and it is empty in
   some browsers, so where it is missing the point itself is asked instead. */
function left(box, ev){
  let to = ev && ev.relatedTarget;
  if (!to && ev && typeof ev.clientX === "number"){
    try{ to = document.elementFromPoint(ev.clientX, ev.clientY); }catch(e){ to = null; }
  }
  return !to || !box.contains(to);
}

/* The item under the pointer, or failing that the nearest one to it. Nearest
   matters more than it sounds: lists here are drawn with a gap between the
   rows, and a pointer in the gap is over the container and nothing else. */
function pick(items, x, y){
  for (let i = 0; i < items.length; i++){
    const r = items[i].getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
  }
  let best = 0, bestGap = Infinity;
  items.forEach((e, i) => {
    const r = e.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const gap = dx * dx + dy * dy;
    if (gap < bestGap){ bestGap = gap; best = i; }
  });
  return best;
}

/* Work out where a drop here would land, and draw the line there.

     box     the list, only so the line can be kept inside it
     items   the rows, in the order they are drawn
     ev      the dragover
     opts.across   a strip that runs left to right, or a grid of tiles
     opts.into     given a row, whether the drop could go inside it

   Back comes { at, slot, into }. `into` is the row the pointer is sitting in
   the middle of, when that row can hold things; otherwise it is null and
   `slot` is the place the thing would take in `items`, from 0 to items.length.
*/
function mark(box, items, ev, opts){
  opts = opts || {};
  const across = !!opts.across;
  items = (items || []).filter(e => e && e.getBoundingClientRect);
  if (!items.length){ hide(); return { at: -1, slot: 0, into: null }; }

  const x = ev.clientX, y = ev.clientY;
  const at = pick(items, x, y);
  const r = items[at].getBoundingClientRect();
  const size = (across ? r.width : r.height) || 1;
  const part = Math.min(1, Math.max(0, ((across ? x - r.left : y - r.top)) / size));

  /* The middle of something that can hold other things means inside it, and
     the quarter at each end means beside it. Anything that cannot hold things
     simply splits in half. Without the two bands there is no way to say
     "inside this group" and "between these two groups" with one pointer. */
  if (opts.into && opts.into(items[at]) && part > 0.28 && part < 0.72){
    hide();
    return { at: at, slot: -1, into: items[at] };
  }

  const slot = at + (part >= 0.5 ? 1 : 0);
  draw(box, items, at, slot, across);
  return { at: at, slot: slot, into: null };
}

function draw(box, items, at, slot, across){
  const clip = box.getBoundingClientRect();
  const here = items[at].getBoundingClientRect();
  const next = items[slot] ? items[slot].getBoundingClientRect() : null;
  const prev = items[slot - 1] ? items[slot - 1].getBoundingClientRect() : null;

  /* Halfway through the gap, so the line sits between the two rows rather
     than on top of one of them. */
  let along;
  if (next && prev) along = ((across ? prev.right : prev.bottom) + (across ? next.left : next.top)) / 2;
  else if (next)    along = (across ? next.left : next.top) - 2;
  else if (prev)    along = (across ? prev.right : prev.bottom) + 2;
  else              along = across ? here.left : here.top;

  /* A list that scrolls can have the gap in question just off the end of
     what is on screen, and a line drawn there would be painted over
     whatever happens to be outside the list. */
  const lo = across ? clip.left : clip.top;
  const hi = across ? clip.right : clip.bottom;
  along = Math.min(hi - 2, Math.max(lo + 2, along));

  /* Across the row it is pointing at, not across the whole list: in the grid
     of tiles on the hub the list is several rows deep and a line the height
     of all of them says nothing about which row it means. */
  const el = theBar();
  el.hidden = false;
  if (across){
    el.style.left   = Math.round(along - 1.5) + "px";
    el.style.top    = Math.round(Math.max(clip.top, here.top)) + "px";
    el.style.width  = "3px";
    el.style.height = Math.round(Math.max(6, Math.min(clip.bottom, here.bottom)
                                             - Math.max(clip.top, here.top))) + "px";
  } else {
    el.style.left   = Math.round(here.left) + "px";
    el.style.top    = Math.round(along - 1.5) + "px";
    el.style.width  = Math.round(here.width) + "px";
    el.style.height = "3px";
  }
}

/* Nobody has to remember to put it away. A drag ends exactly one of two
   ways and both of them are listened for here, so a list that forgets
   cannot leave a line lying across the screen. */
["dragend", "drop"].forEach(t => window.addEventListener(t, hide, true));

window.dragLine = { mark: mark, hide: hide, left: left };

})();
