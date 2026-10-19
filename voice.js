/* Student voice: a few short questions at the end of a standard assessment,
   about how the half term went rather than about Computing itself.

   One list, read by three screens: the lesson page draws them, the builder
   offers them, and the markbook adds them up. A student's answer is saved as
   the position of the option they picked, under __voice in their work:
   { supported: 3, help: 0 }. So the wording of a question or an option can be
   improved here freely, but options are only ever added to the end of a list,
   never put in a different order or taken out, or every answer already saved
   would quietly mean something else.

   A lesson that asks lists the ids it asks, in lesson.voice. A question
   taken out of this file is simply not drawn and not counted; whatever was
   saved against it stays in the work, unread. */
(function(){
  /* short is the markbook's column heading, where the whole question will
     not fit. */
  const QUESTIONS = [
    { id: "supported", kind: "scale", short: "Supported",
      ask: "How well supported did you feel in your Computing lessons this half term?",
      options: ["Not at all", "Not very well", "OK", "Well", "Very well"] },
    { id: "enjoy", kind: "scale", short: "Enjoyed",
      ask: "How much did you enjoy Computing this half term?",
      options: ["Not at all", "Not much", "It was OK", "Quite a lot", "A lot"] },
    { id: "confident", kind: "scale", short: "Confident",
      ask: "How confident do you feel about what you learnt this half term?",
      options: ["Not at all", "Not very", "A little", "Quite", "Very"] },
    { id: "help", kind: "choice", short: "Help from",
      ask: "When you are stuck in a Computing lesson, where do you most like to get help from?",
      options: ["My teacher", "The lesson on this website", "The slides on the board", "Someone sitting near me"] },
    { id: "pace", kind: "choice", short: "Speed",
      ask: "How was the speed of your Computing lessons this half term?",
      options: ["Too slow", "About right", "Too fast"] }
  ];
  const byId = {};
  QUESTIONS.forEach(q => { byId[q.id] = q; });

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
    const v = box[q.id];
    return (typeof v === "number" && v >= 0 && v < q.options.length) ? v : null;
  }

  window.studentVoice = { QUESTIONS: QUESTIONS, byId: byId, asked: asked, answerOf: answerOf };
})();
