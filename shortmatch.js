/* ============================================================
   Marking a short answer.

   A short answer is marked the way a Microsoft Forms question is: what the
   student wrote has to BE one of the answers the teacher accepts, not merely
   mention a keyword somewhere inside a paragraph.

   Exact matching on its own is too brittle for eleven year olds typing on
   school laptops and phones, so the comparison forgives everything that
   cannot have been meant:

     capitals        CPU, cpu and Cpu are the same answer
     spacing         spaces at either end, doubled spaces, and spaces around
                     the middle of an answer
     pasting         curly quotes, long dashes and non-breaking spaces, which
                     is what arrives when a student copies out of Word
     apostrophes     and hyphens, from both sides, always: "dont" for "don't"
     and hyphens     and "non volatile" for "non-volatile" are spelling, not
                     a wrong answer
     stray symbols   but only the ones this question never uses. If no
                     accepted answer has a full stop in it, a full stop the
                     student typed was a mistake and is ignored. If one of
                     them is "x + y" then the plus sign is part of the answer
                     and is kept.

   That last rule is why the accepted answers have to be handed in alongside
   the student's: what counts as noise depends on the question being asked.
   ============================================================ */
(function(){

/* What a paste out of Word turns into, so it compares as what was typed. */
const TIDY = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, "-"],
  [/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " "],
  [/[\u200B-\u200D\uFEFF]/g, ""]
];

/* Anything that is not a letter, a number or a space. */
const SYMBOL = /[^\p{L}\p{N} ]/gu;

function tidy(x){
  let s = String(x === null || x === undefined ? "" : x);
  TIDY.forEach(pair => { s = s.replace(pair[0], pair[1]); });
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/* Every symbol that appears in at least one accepted answer. Those are the
   ones the question is actually using, so they survive the comparison. */
function symbolsInUse(answers){
  const keep = new Set();
  (answers || []).forEach(a => {
    const found = tidy(a).match(SYMBOL);
    if (found) found.forEach(ch => keep.add(ch));
  });
  return keep;
}

/* One piece of text reduced to the shape that is compared. Spaces go last,
   after the symbols, so "C. P. U." and "CPU" end up the same. */
function shape(text, keep){
  return tidy(text)
    .replace(SYMBOL, ch => (keep.has(ch) ? ch : ""))
    .replace(/['-]/g, "")
    .replace(/\s+/g, "");
}

/* The accepted answers of a block, tidied up and with the blanks dropped. */
function accepted(b){
  const list = (b && Array.isArray(b.answers)) ? b.answers : [];
  return list.map(x => String(x === null || x === undefined ? "" : x).trim()).filter(Boolean);
}

/* What the student wrote, ready to be compared against this question's
   answers. Exposed so the builder can tell a teacher when two of the answers
   they have typed would count as the same one. */
function normalise(text, answers){
  return shape(text, symbolsInUse(answers));
}

/* The accepted answer the student matched, or "" for none. An empty answer
   never matches, even if a teacher has left an accepted answer that is
   nothing but symbols and so reduces to nothing. */
function matched(given, answers){
  const list = (answers || []).filter(Boolean);
  if (!String(given === null || given === undefined ? "" : given).trim()) return "";
  const keep = symbolsInUse(list);
  const want = shape(given, keep);
  if (!want) return "";
  for (let i = 0; i < list.length; i++){
    if (shape(list[i], keep) === want) return list[i];
  }
  return "";
}

/* ---------- the old way ----------
   Short answers written before this change were marked by keywords: every
   group of alternatives had to turn up somewhere inside the answer. Those
   lessons are already out with classes and are still marked the way they were
   written, so nobody's work changes score overnight. Reopening one in the
   builder converts it, and from then on it is marked by the list above. */
function normKeyword(x){
  return String(x || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,!?;:'"]+$/g, "");
}
function keywordGroups(b){
  return (b && Array.isArray(b.keywords)) ? b.keywords.filter(g => Array.isArray(g) && g.length) : [];
}

/* Is this block still one of the old keyword ones? */
function legacy(b){
  return !accepted(b).length && keywordGroups(b).length > 0;
}

/* One place decides whether a short answer is right, so the lesson page, the
   assessment mark and the teacher's markbook can never disagree about it.

   Returns { ok, mode, accepted, matched, groups }:
     mode "answers"   marked against the accepted answers
     mode "keywords"  an older block, marked the way it was written
     mode "none"      nothing to mark against, so nothing can be right */
function mark(b, given){
  const list = accepted(b);
  if (list.length){
    const hit = matched(given, list);
    return { ok: !!hit, mode:"answers", accepted: list, matched: hit, groups: [] };
  }
  const groups = keywordGroups(b);
  if (groups.length){
    const ans = normKeyword(given);
    const hits = groups.map((g, i) => ({
      ok: g.some(k => ans.includes(normKeyword(k))),
      label: (b.keywordLabels && b.keywordLabels[i]) || ("key idea " + (i + 1))
    }));
    return { ok: hits.every(h => h.ok), mode:"keywords", accepted: [], matched: "", groups: hits };
  }
  return { ok:false, mode:"none", accepted: [], matched: "", groups: [] };
}

window.shortAnswer = { mark, accepted, normalise, legacy };

})();
