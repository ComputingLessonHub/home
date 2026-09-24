/* ---------------------------------------------------------------------
   The order a list of lessons is shown in.

   A lesson's id is a slug of whatever it was called when it was first
   saved, and renaming it afterwards changes the title and not the id. So
   "9.1.1 - Python Essentials", written before it was numbered, is still
   python-essentials, while "9.1.2 - while loops" is 9-1-2-while-loops.
   Every list fell back to id order, which put 9.1.2 above 9.1.1 on the
   class's lessons, in the hub and on the student's home page.

   Lists therefore go in the order of the title a teacher actually reads,
   and the numbers in it are read as numbers: 9.1.10 comes after 9.1.9
   rather than between 9.1.1 and 9.1.2.

   position stays the first thing asked. Nothing writes anything but 0
   into it, so today the title decides every time, but that column is
   where an order a teacher drags into place would live and this is where
   it would take effect.
   --------------------------------------------------------------------- */
(function(){
  "use strict";

  /* Made once, because a comparison is done for every pair in every list.
     The fallback is for a browser with no Intl, where plain text order is
     at least the same order every time. */
  var collator = null;
  function compareText(a, b){
    if (!collator){
      try{ collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }); }
      catch(e){ collator = { compare: function(x, y){ return x < y ? -1 : x > y ? 1 : 0; } }; }
    }
    return collator.compare(a, b);
  }

  /* A lesson row is shaped differently in each place it comes from: the
     catalogue calls it lesson_id, the lessons folder calls it id, and a
     row that never had a title falls back to whichever it has. */
  function titleOf(l){
    return String((l && (l.title || l.lesson_id || l.id)) || "");
  }

  window.lessonOrder = {
    /* The same numbers-as-numbers comparison, for the headings a list of
       lessons is grouped under. A unit's sub-points are 2.2.1, 2.2.2 and
       2.2.10, and sorted as plain text the last of those comes second. */
    compareText: compareText,
    /* titleFor is for the console, where the title on screen comes from
       its own list of lessons rather than from the row being sorted. */
    compare: function(a, b, titleFor){
      var name = titleFor || titleOf;
      return (((a && a.position) || 0) - ((b && b.position) || 0)) ||
             compareText(name(a), name(b));
    },
    sort: function(list, titleFor){
      return (list || []).sort(function(a, b){
        return window.lessonOrder.compare(a, b, titleFor);
      });
    }
  };
})();
