/* =====================================================================
   scratchhub.js, what the lesson page and the lesson builder share about
   block coding (Scratch) tasks.

     SCRATCH_BLOCKS        the blocks a checklist line can ask about, by
                           the name a teacher knows them by
     scratchHub.mount()    puts the block editor (scratch/editor.html) in a
                           frame and starts it with a project
     scratchHub.summary()  "2 sprites, 5 scripts" from a saved project
     scratchHub.count()    how many of some blocks a project uses

   The editor itself, and what is and is not saved, is scratch/editor.js.
   Nothing here touches the network beyond loading that page.
   ===================================================================== */
(function(){
  "use strict";

  /* [key, what a teacher picks, the opcodes that count]. The key is what a
     checklist line stores, so the wording can change without breaking a
     lesson already written. Several opcodes under one name where a student
     would think of them as one thing: "say" with or without the seconds. */
  const BLOCKS = [
    ["flag",       "when green flag clicked",    ["event_whenflagclicked"]],
    ["key",        "when key pressed",           ["event_whenkeypressed"]],
    ["clicked",    "when this sprite clicked",   ["event_whenthisspriteclicked"]],
    ["receive",    "when I receive",             ["event_whenbroadcastreceived"]],
    ["broadcast",  "broadcast",                  ["event_broadcast", "event_broadcastandwait"]],
    ["forever",    "forever",                    ["control_forever"]],
    ["repeat",     "repeat",                     ["control_repeat"]],
    ["until",      "repeat until",               ["control_repeat_until"]],
    ["if",         "if (with or without else)",  ["control_if", "control_if_else"]],
    ["ifelse",     "if ... else",                ["control_if_else"]],
    ["wait",       "wait",                       ["control_wait"]],
    ["waituntil",  "wait until",                 ["control_wait_until"]],
    ["clone",      "create clone",               ["control_create_clone_of"]],
    ["stop",       "stop",                       ["control_stop"]],
    ["move",       "move steps",                 ["motion_movesteps"]],
    ["turn",       "turn",                       ["motion_turnright", "motion_turnleft"]],
    ["goto",       "go to x: y:",                ["motion_gotoxy"]],
    ["glide",      "glide",                      ["motion_glidesecstoxy", "motion_glideto"]],
    ["point",      "point in direction",         ["motion_pointindirection"]],
    ["changexy",   "change x or y by",           ["motion_changexby", "motion_changeyby"]],
    ["setxy",      "set x or y to",              ["motion_setx", "motion_sety"]],
    ["bounce",     "if on edge, bounce",         ["motion_ifonedgebounce"]],
    ["say",        "say",                        ["looks_say", "looks_sayforsecs"]],
    ["think",      "think",                      ["looks_think", "looks_thinkforsecs"]],
    ["costume",    "switch or next costume",     ["looks_switchcostumeto", "looks_nextcostume"]],
    ["backdrop",   "switch or next backdrop",    ["looks_switchbackdropto", "looks_switchbackdroptoandwait", "looks_nextbackdrop"]],
    ["showhide",   "show or hide",               ["looks_show", "looks_hide"]],
    ["sound",      "play sound",                 ["sound_play", "sound_playuntildone"]],
    ["ask",        "ask and wait",               ["sensing_askandwait"]],
    ["answer",     "answer",                     ["sensing_answer"]],
    ["touching",   "touching ...?",              ["sensing_touchingobject", "sensing_touchingcolor", "sensing_coloristouchingcolor"]],
    ["keypressed", "key pressed?",               ["sensing_keypressed"]],
    ["random",     "pick random",                ["operator_random"]],
    ["compare",    "a comparison (=, <, >)",     ["operator_equals", "operator_lt", "operator_gt"]],
    ["logic",      "and, or, not",               ["operator_and", "operator_or", "operator_not"]],
    ["maths",      "+ - * /",                    ["operator_add", "operator_subtract", "operator_multiply", "operator_divide"]],
    ["join",       "join",                       ["operator_join"]],
    ["setvar",     "set variable to",            ["data_setvariableto"]],
    ["changevar",  "change variable by",         ["data_changevariableby"]],
    ["list",       "add to a list",              ["data_addtolist"]],
    ["define",     "define (a block of their own)", ["procedures_definition"]],
    ["pen",        "pen down",                   ["pen_penDown"]]
  ];
  window.SCRATCH_BLOCKS = BLOCKS;

  /* Every real block in the project, sprite by sprite. A variable dragged
     out onto the workspace on its own is stored as an array rather than a
     block, and the little shadow blocks inside inputs (the 10 in "move 10
     steps") are not blocks a student placed, so both are skipped. */
  function eachBlock(project, fn){
    ((project && project.targets) || []).forEach(t => {
      const blocks = (t && t.blocks) || {};
      Object.keys(blocks).forEach(id => {
        const bl = blocks[id];
        if (!bl || Array.isArray(bl) || typeof bl !== "object" || bl.shadow) return;
        fn(bl, t);
      });
    });
  }

  function count(project, opcodes){
    const want = new Set(opcodes || []);
    let n = 0;
    eachBlock(project, bl => { if (want.has(bl.opcode)) n++; });
    return n;
  }

  function summary(project){
    const out = { sprites: 0, scripts: 0, blocks: 0, variables: 0, costumes: 0 };
    ((project && project.targets) || []).forEach(t => {
      if (!t) return;
      if (!t.isStage) out.sprites++;
      if (!t.isStage) out.costumes += (t.costumes || []).length;
      out.variables += Object.keys(t.variables || {}).length;
    });
    eachBlock(project, bl => {
      out.blocks++;
      if (bl.topLevel) out.scripts++;
    });
    return out;
  }

  function plural(n, word){ return n + " " + word + (n === 1 ? "" : "s"); }
  function describe(project){
    if (!project) return "Not started yet";
    const s = summary(project);
    return [plural(s.sprites, "sprite"), plural(s.scripts, "script"), plural(s.blocks, "block")].join(", ");
  }

  /* config.js can point library files somewhere on this site. Written
     there relative to the site, it is made whole here, because the editor's
     own page is a folder further down and would read it from there. */
  function assetAddress(){
    const said = String((window.HUB && window.HUB.SCRATCH_ASSETS) || "").trim();
    if (!said) return "";
    try{
      const at = said.indexOf("{md5ext}");
      if (at < 0) return new URL(said, location.href).href;
      return new URL(said.slice(0, at), location.href).href + said.slice(at);
    }catch(e){ return said; }
  }

  /* The editor in a frame, started with a project.

     opts: project, own, base, starter, mode ("student", "teacher" or "view"),
           onChange, onRun, limits. See scratch/editor.js for what each one
           means.

     Returns { frame, ready }, where ready resolves to the editor's
     window.hubScratch once the project is on screen, or null if the editor
     could not start (a school filter blocking it, a very old browser). */
  function mount(holder, opts){
    const o = opts || {};
    const frame = document.createElement("iframe");
    frame.className = "scratch-frame";
    frame.title = "Block editor";
    frame.setAttribute("allow", "fullscreen");
    const ready = new Promise(resolve => {
      frame.addEventListener("load", () => {
        let hs = null;
        try{ hs = frame.contentWindow && frame.contentWindow.hubScratch; }catch(e){}
        if (!hs || !hs.boot){ resolve(null); return; }
        hs.boot({
          project: o.project || null,
          own: o.own || null,
          base: o.base || null,
          starter: o.starter || null,
          mode: o.mode || "student",
          assets: assetAddress(),
          onChange: o.onChange,
          onRun: o.onRun,
          limits: o.limits
        }).then(() => resolve(hs), () => resolve(null));
      }, { once: true });
    });
    frame.src = "scratch/editor.html";
    holder.appendChild(frame);
    return { frame: frame, ready: ready };
  }

  window.scratchHub = { mount: mount, summary: summary, describe: describe, count: count,
                        blocks: BLOCKS };
})();
