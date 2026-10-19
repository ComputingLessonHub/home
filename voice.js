/* Student Voice: one short question at the end of a standard assessment,
   about how the half term went rather than about Computing itself.

   One list, read by three screens: the lesson page draws a question from it,
   the builder offers it, and the markbook adds up what came back.

   Each student is asked ONE of the questions the lesson asks, picked at
   random the first time their summary is drawn. One question is a moment;
   five in a row is a form, and a form at the end of a test is something a
   child clicks through. Across a class of thirty the five questions still
   each get a handful of answers.

   What is saved, under __voice in their work:
     { __asked: "help", help: 2 }       answered
     { __asked: "help", __skipped: true } pressed Skip
   __asked is the question they were given, kept so it is the same question
   every time they come back to the page; the answer is the position of the
   option they picked. So the wording of a question or an option can be
   improved here freely, but options are only ever added to the end of a
   list, never put in a different order or taken out, or every answer
   already saved would quietly mean something else. The same goes for an
   option's icon, which sits at the same position as its words.

   The scales were once five points with a middle one. They are four now,
   so nobody can sit on the fence. Work saved in v12.9 has no __asked, and
   that is how its five point answers are told apart and read across in
   answerOf(); the middle answer has nowhere to go and is read as none.

   A lesson that asks lists the ids it asks, in lesson.voice. A question
   taken out of this file is simply not drawn and not counted; whatever was
   saved against it stays in the work, unread. */
(function(){
  /* short is the markbook's name for a question, where the whole of it
     will not fit. A scale runs from worst to best, and its icons are faces
     to match, so it reads as how you feel rather than as an answer that
     could be wrong. ordered says the options run from least to most, which
     the markbook turns round so the most is at the top; a choice between
     different things has no top. */
  /* Drawn the way the rest of the site draws its icons, on a 24 unit grid in
     the colour of whatever they sit in, rather than as emoji: an emoji is a
     different picture on every computer and none of them look like the
     site. Each is only the inside of an <svg>; draw() wraps it. */
  const FACE = '<circle cx="12" cy="12" r="9.5"/><path d="M9 10h.01M15 10h.01" stroke-width="2.4"/>';
  const FACES = [
    FACE + '<path d="M8.4 16.8Q12 13.2 15.6 16.8"/>',
    FACE + '<path d="M9 16.2Q12 14.6 15 16.2"/>',
    FACE + '<path d="M9 14.4Q12 16.8 15 14.4"/>',
    FACE + '<path d="M7.8 13.6Q12 19.2 16.2 13.6Z"/>'
  ];
  /* A dial with its needle low, upright or high, for how fast it went. */
  const DIAL = '<path d="M4 16.5a8 8 0 0 1 16 0"/><circle cx="12" cy="16.5" r="1.3"/>';
  function draw(inside, size){
    const s = size || 24;
    return '<svg class="hi" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + inside + '</svg>';
  }
  const QUESTIONS = [
    { id: "supported", kind: "scale", ordered: true, short: "Supported",
      ask: "How well supported did you feel in your Computing lessons this half term?",
      options: ["Not at all", "Not very well", "Well", "Very well"], icons: FACES },
    { id: "enjoy", kind: "scale", ordered: true, short: "Enjoyed",
      ask: "How much did you enjoy Computing this half term?",
      options: ["Not at all", "Not much", "Quite a lot", "A lot"], icons: FACES },
    { id: "confident", kind: "scale", ordered: true, short: "Confident",
      ask: "How confident do you feel about what you learnt this half term?",
      options: ["Not at all", "Not very", "Quite", "Very"], icons: FACES },
    { id: "help", kind: "choice", short: "Help from",
      ask: "When you are stuck in a Computing lesson, where do you most like to get help from?",
      options: ["My teacher", "The lesson on this website", "The slides on the board", "Someone sitting near me"],
      /* a hand going up, a laptop, the board with a slide on it, and two
         people side by side */
      icons: ['<circle cx="9.5" cy="7.5" r="2.8"/><path d="M4.5 20.5v-3.8a5 5 0 0 1 9.4-2.4"/><path d="M13.6 12.8L17.6 5"/><circle cx="18.2" cy="3.9" r="1.1"/>',
              '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 18.8h19"/>',
              '<rect x="3.5" y="3.5" width="17" height="11.5" rx="1.5"/><path d="M12 15v3.3M8.3 20.8l3.7-2.5 3.7 2.5"/><path d="M7 11.5l3-3 2.4 2.4L16.8 7"/>',
              '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.6.1 4.4 1.7 5 4.4"/>'] },
    { id: "pace", kind: "choice", ordered: true, short: "Speed",
      ask: "How was the speed of your Computing lessons this half term?",
      options: ["Too slow", "About right", "Too fast"],
      icons: [DIAL + '<path d="M11 15.6L6.6 12.2"/>', DIAL + '<path d="M12 15.2V9.6"/>', DIAL + '<path d="M13 15.6l4.4-3.4"/>'] }
  ];
  const byId = {};
  QUESTIONS.forEach(q => { byId[q.id] = q; });
  /* A v12.9 five point answer, by position, onto the four point scale. */
  const FROM_FIVE = [0, 1, null, 2, 3];

  /* The questions a lesson asks, in this file's order, leaving out any id it
     names that no longer exists. Nothing at all for a lesson that does not
     ask, or for anything but a standard assessment. */
  function asked(lesson){
    if (!lesson || !lesson.assessment || lesson.practical || !Array.isArray(lesson.voice)) return [];
    return QUESTIONS.filter(q => lesson.voice.indexOf(q.id) >= 0);
  }

  /* A saved answer, read back safely: a position that is not one of the
     question's options is no answer at all. */
  function answerOf(data, q){
    const box = data && data.__voice;
    if (!box || typeof box !== "object") return null;
    let v = box[q.id];
    if (typeof v !== "number") return null;
    if (q.kind === "scale" && !box.__asked) v = v >= 0 && v < 5 ? FROM_FIVE[v] : null;
    return (v !== null && v >= 0 && v < q.options.length) ? v : null;
  }
  /* Pressed Skip: asked, and chose not to say. */
  function skippedOf(data){
    const box = data && data.__voice;
    return !!(box && typeof box === "object" && box.__skipped);
  }

  /* The question this student was given, or null if they have not been
     given one yet. A question they answered counts even without __asked,
     so work saved before __asked was written still says something. */
  function givenOf(data){
    const box = data && data.__voice;
    if (!box || typeof box !== "object") return null;
    if (byId[box.__asked]) return byId[box.__asked];
    return QUESTIONS.find(q => answerOf(data, q) !== null) || null;
  }

  /* An option's icon as markup ready to put on the page, or "" for none. */
  function iconOf(q, i, size){
    const inside = q && q.icons && q.icons[i];
    return inside ? draw(inside, size) : "";
  }
  window.studentVoice = { QUESTIONS: QUESTIONS, byId: byId, asked: asked,
                          answerOf: answerOf, skippedOf: skippedOf, givenOf: givenOf, iconOf: iconOf };
})();
