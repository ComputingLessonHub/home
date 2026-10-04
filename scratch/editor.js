/* =====================================================================
   scratch/editor.js, the hub's side of the block editor.

   The page around this frame (a lesson, or the lesson builder) calls
   window.hubScratch.boot() once the frame has loaded, and from then on reads
   the project back with snapshot() whenever it saves.

   What gets saved, and why it is small
   ------------------------------------
   A Scratch project is project.json (the scripts, sprites and variables)
   plus one file for every costume and sound. Saving all of that with every
   piece of work would not fit: the database keeps a lesson's work as one
   record of at most 2MB, and one sound can be bigger than that. So:

     project   project.json, as it is. Usually 5-200KB.
     own       only the costumes and sounds the student made themselves,
               base64, keyed by their file name (md5.ext).

   Everything from the Scratch library is left out, because the editor
   fetches it again by name from the Scratch library server. So is anything
   from the starter project, which the lesson already holds, and the cat and
   blank backdrop every new project starts with, which the editor carries
   inside itself. Both parts have a limit; a project over either one is not
   saved, and the student is told what to delete.

   What a student cannot do
   ------------------------
   Upload a file, record a sound, or change a sound (the effects, and cut and
   paste, each store a new copy of the whole sound). editor.html hides the
   buttons; this file stops the same things happening by dragging a file in
   or by any button that got through. The paint editor's Convert to Bitmap is
   hidden too: drawings stay as vectors, a few KB each, where a bitmap is
   hundreds. A teacher building a starter project can do all of it, within
   smaller limits, because a starter project is kept inside the lesson.
   ===================================================================== */
(function(){
  "use strict";

  /* A student's limits. Both together leave room in the 2MB record for the
     rest of the lesson's answers. The builder asks for smaller ones for a
     starter project, which goes inside the lesson itself. */
  let LIMIT_PROJECT = 500000;       // characters of project.json
  let LIMIT_OWN     = 500000;       // characters of base64, all own assets together

  const GUI = window.GUI;
  const api = {};
  window.hubScratch = api;

  let vm = null;
  let store = null;
  let storage = null;
  let mode = "student";
  let assetHost = "";
  let loading = false;              // a load is under way: its changes are not the student's
  let onChange = null, onRun = null;
  let changeTimer = null;
  let lastShot = "";
  let shotTimer = null;
  let translateDefault = undefined;

  /* Files the editor can always find again, so they never need saving. */
  const known = new Set();
  /* What each asset is called, for telling a student which one is too big. */
  const describe = new Map();
  /* base64 already worked out, by file name. A file's name is the md5 of
     what is in it, so the same name always means the same base64. */
  const encoded = new Map();

  /* ---------- where library files come from ----------
     Scratch's own library server, unless config.js names another place. A
     school whose filter blocks Scratch can copy the files it needs onto the
     site and give their address with {md5ext} where the file name goes. */
  const DEFAULT_HOST = "https://cdn.assets.scratch.mit.edu";
  function assetUrl(assetId, dataFormat){
    const md5ext = assetId + "." + dataFormat;
    const host = assetHost || DEFAULT_HOST;
    if (host.indexOf("{md5ext}") >= 0) return host.split("{md5ext}").join(md5ext);
    return host.replace(/\/+$/, "") + "/internalapi/asset/" + md5ext + "/get/";
  }

  function makeStorage(){
    const s = new GUI.ScratchStorage();
    /* The new-project cat, its sounds and the blank backdrop, the same way
       the editor's own storage keeps them. Done again once the editor hands
       over its wording, which is what names the cat Sprite1. */
    const keepDefault = (translate) => {
      (GUI.buildDefaultProject(translate) || []).forEach(a => {
        s.builtinHelper._store(s.AssetType[a.assetType], s.DataFormat[a.dataFormat], a.data, a.id);
        if (a.assetType !== "Project") known.add(a.id + "." + String(a.dataFormat).toLowerCase());
      });
    };
    keepDefault();
    s.addWebStore(
      [s.AssetType.ImageVector, s.AssetType.ImageBitmap, s.AssetType.Sound],
      asset => assetUrl(asset.assetId, asset.dataFormat));
    return {
      scratchStorage: s,
      setProjectHost(){}, setProjectToken(){}, setProjectMetadata(){},
      setAssetHost(){}, setBackpackHost(){},
      setTranslatorFunction(translate){ translateDefault = translate; keepDefault(translate); },
      getLibraryAssetUrl: (assetId, dataFormat) => assetUrl(assetId, dataFormat),
      /* The hub saves; the editor's own Save is never shown. */
      saveProject(){ return Promise.reject(new Error("Saving is done by the lesson page.")); }
    };
  }

  /* ---------- base64, both ways, without blowing the stack ---------- */
  function toBase64(bytes){
    let bin = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(bin);
  }
  function fromBase64(text){
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function typeFor(ext){
    const S = storage.scratchStorage;
    if (ext === "svg") return S.AssetType.ImageVector;
    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif") return S.AssetType.ImageBitmap;
    return S.AssetType.Sound;
  }
  /* Put files where the editor looks first, before anything asks for them. */
  function cacheAssets(files, remember){
    if (!files || typeof files !== "object") return;
    const S = storage.scratchStorage;
    Object.keys(files).forEach(md5ext => {
      const m = /^([0-9a-f]{32})\.([a-z0-9]+)$/i.exec(md5ext);
      if (!m || typeof files[md5ext] !== "string") return;
      try{
        const ext = m[2].toLowerCase();
        S.builtinHelper._store(typeFor(ext), ext, fromBase64(files[md5ext]), m[1]);
        if (remember) known.add(m[1] + "." + ext);
      }catch(e){ console.warn("Could not unpack " + md5ext, e); }
    });
  }

  /* Every file in the Scratch library, from the lists the editor ships with.
     If they cannot be read, nothing is treated as library, which only means
     saving more than it needs to. */
  function learnLibrary(){
    const lists = ["costumes","backdrops","sprites","sounds"];
    return Promise.all(lists.map(n =>
      fetch("gui/libraries/" + n + ".json").then(r => r.ok ? r.json() : []).catch(() => [])
    )).then(all => {
      const add = (x) => { if (x && x.md5ext) known.add(x.md5ext); };
      all.forEach(list => (list || []).forEach(item => {
        add(item);
        (item.costumes || []).forEach(add);
        (item.sounds || []).forEach(add);
      }));
    });
  }

  /* ---------- keeping students to what fits ---------- */
  function lockDown(){
    document.body.classList.toggle("locked", mode !== "teacher");
    /* A file input is opened by a click the editor makes on it. Stopping
       that click stops the file picker, whichever button asked for it. */
    document.addEventListener("click", (e) => {
      if (mode === "teacher") return;
      const t = e.target;
      if (t && t.tagName === "INPUT" && t.type === "file"){ e.preventDefault(); e.stopPropagation(); }
    }, true);
    /* Dropping a picture or sound file onto the editor adds it too. */
    ["dragover","drop"].forEach(kind => document.addEventListener(kind, (e) => {
      if (mode === "teacher") return;
      const dt = e.dataTransfer;
      if (dt && dt.types && Array.prototype.indexOf.call(dt.types, "Files") >= 0){
        e.preventDefault(); e.stopPropagation();
        if (dt) dt.dropEffect = "none";
      }
    }, true));

    const tidy = () => {
      if (mode !== "teacher"){
        document.querySelectorAll('[class*="paint-editor_bitmap-button_"]').forEach(b => {
          const toBitmap = /bitmap/i.test(b.textContent || "");
          b.classList.toggle("hub-hidden", toBitmap);
        });
      }
      /* Face and video sensing want the camera. This frame never gets it. */
      document.querySelectorAll('[class*="library-item_library-item"]').forEach(item => {
        const t = (item.textContent || "").trim();
        if (/^(Face Sensing|Video Sensing)/.test(t)) item.classList.add("hub-hidden");
      });
    };
    /* The editor changes the page on every frame of a block being dragged,
       so this looks once per frame at most, just before it is drawn. */
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; tidy(); });
    }).observe(document.body, { childList:true, subtree:true });
  }

  /* ---------- what the student made ---------- */
  function originals(){
    return vm ? vm.runtime.targets.filter(t => t.isOriginal) : [];
  }
  function md5extOf(item){
    if (item.md5) return item.md5;
    if (item.asset && item.asset.assetId) return item.asset.assetId + "." + item.asset.dataFormat;
    return item.assetId + "." + item.dataFormat;
  }
  function ownAssets(){
    const out = {};
    describe.clear();
    originals().forEach(t => {
      const who = t.isStage ? "the Stage" : "the sprite “" + t.getName() + "”";
      const look = (list, what) => (list || []).forEach(item => {
        const key = md5extOf(item);
        if (!key || known.has(key) || out.hasOwnProperty(key)) return;
        if (!encoded.has(key)){
          const data = item.asset && item.asset.data;
          if (!data || !data.length) return;
          encoded.set(key, toBase64(data));
        }
        out[key] = encoded.get(key);
        describe.set(key, what + " “" + item.name + "” in " + who);
      });
      look(t.sprite.costumes, t.isStage ? "the backdrop" : "the costume");
      look(t.sprite.sounds, "the sound");
    });
    return out;
  }

  function tooBig(projectText, own){
    if (projectText.length > LIMIT_PROJECT)
      return "This project has grown too big to save. Try deleting sprites or scripts you are not using.";
    let total = 0, worst = "", worstSize = 0;
    Object.keys(own).forEach(k => {
      total += own[k].length;
      if (own[k].length > worstSize){ worstSize = own[k].length; worst = k; }
    });
    if (total > LIMIT_OWN){
      const kb = Math.round(worstSize * 3 / 4 / 1024);
      return "The pictures and sounds you made are too big to save. The biggest is "
        + (describe.get(worst) || "one of them") + " (" + kb + "KB). "
        + "Try deleting costumes you are not using, or making that one simpler.";
    }
    return "";
  }

  /* A small picture of the stage, for the marking screen and the PDF. */
  function takeShot(){
    if (!vm || !vm.renderer || !vm.renderer.requestSnapshot) return;
    try{
      vm.renderer.requestSnapshot(uri => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 240; c.height = 180;
          const g = c.getContext("2d");
          g.fillStyle = "#fff"; g.fillRect(0, 0, 240, 180);
          g.drawImage(img, 0, 0, 240, 180);
          try{ lastShot = c.toDataURL("image/jpeg", 0.6); }catch(e){}
        };
        img.src = uri;
      });
    }catch(e){}
  }
  function shotSoon(){
    clearTimeout(shotTimer);
    shotTimer = setTimeout(takeShot, 1500);
  }

  function changed(){
    if (loading) return;
    shotSoon();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => { if (onChange) try{ onChange(); }catch(e){} }, 400);
  }

  /* ---------- starting up ---------- */
  function waitForShowing(){
    return new Promise(resolve => {
      const done = () => {
        const s = store.getState().scratchGui.projectState.loadingState;
        if (s === "SHOWING_WITH_ID" || s === "SHOWING_WITHOUT_ID" || s === "ERROR"){
          unsub(); resolve(s);
        }
      };
      const unsub = store.subscribe(done);
      done();
    });
  }

  /* opts:
       project   project.json as an object, or null for a new project
       own       { md5ext: base64 } the student's own files
       base      { md5ext: base64 } the starter project's own files, from the lesson
       starter   the starter project.json: every file it uses can be found
                 again the way the starter found it, so none needs saving
       mode      "student" (the default), "teacher" or "view"
       assets    where library files come from (config.js SCRATCH_ASSETS)
       onChange  called a moment after anything in the project changes
       onRun     called when the green flag is pressed
       limits    { project, own } in characters, to change the limits     */
  api.boot = function(opts){
    const o = opts || {};
    if (api.booted) return api.booted;
    mode = o.mode === "teacher" || o.mode === "view" ? o.mode : "student";
    assetHost = String(o.assets || "");
    onChange = o.onChange || null;
    onRun = o.onRun || null;
    if (o.limits){
      if (o.limits.project > 0) LIMIT_PROJECT = o.limits.project;
      if (o.limits.own > 0) LIMIT_OWN = o.limits.own;
    }
    api.limits = { project: LIMIT_PROJECT, own: LIMIT_OWN };

    storage = makeStorage();
    cacheAssets(o.base, true);
    ((o.starter && o.starter.targets) || []).forEach(t => {
      (t.costumes || []).concat(t.sounds || []).forEach(a => { if (a && a.md5ext) known.add(a.md5ext); });
    });
    cacheAssets(o.own, false);
    lockDown();

    const S = storage.scratchStorage;
    let projectId = "0";
    if (o.project && typeof o.project === "object"){
      const text = JSON.stringify(o.project);
      S.builtinHelper._store(S.AssetType.Project, S.DataFormat.JSON,
                             new TextEncoder().encode(text), "hub");
      projectId = "hub";
    }

    api.booted = learnLibrary().then(() => {
      const app = document.getElementById("app");
      app.innerHTML = "";
      GUI.setAppElement(app);
      const state = new GUI.EditorState({ locale: "en" }, () => ({ storage }));
      store = state.store;
      vm = store.getState().scratchGui.vm;
      loading = true;
      const root = GUI.createStandaloneRoot(state, app);
      root.render({
        projectId: projectId,
        basePath: "gui/",
        canSave: false, canShare: false, canRemix: false, canCreateNew: false,
        canCreateCopy: false, canEditTitle: false, canManageFiles: false,
        canChangeLanguage: false, canChangeTheme: false, canChangeColorMode: false,
        canUseCloud: false, enableCommunity: false, backpackVisible: false,
        showComingSoon: false, menuBarHidden: true, hideTutorialProjects: true
      });
      vm.on("PROJECT_CHANGED", changed);
      vm.runtime.on("PROJECT_START", () => {
        if (onRun) try{ onRun(); }catch(e){}
        shotSoon();
      });
      return waitForShowing();
    }).then(state => {
      loading = false;
      shotSoon();
      return state !== "ERROR";
    });
    return api.booted;
  };

  /* Put a different project in: starting again from the starter, or a
     teacher replacing the starter. Resolves once it is on screen. */
  api.load = function(project, own){
    if (!vm) return Promise.reject(new Error("The editor has not started."));
    cacheAssets(own, false);
    loading = true;
    const body = project && typeof project === "object"
      ? JSON.stringify(project)
      : JSON.stringify(projectOfDefault());
    return vm.loadProject(body).then(
      () => { loading = false; shotSoon(); },
      (e) => { loading = false; throw e; });
  };
  function projectOfDefault(){
    const d = (GUI.buildDefaultProject(translateDefault) || []).find(a => a.assetType === "Project");
    return d ? JSON.parse(d.data) : {};
  }

  /* A whole .sb3 file, for a teacher bringing in a project they made
     elsewhere. Everything in it comes in, including its pictures and sounds;
     snapshot() then decides what needs keeping. */
  api.loadFile = function(buffer){
    if (!vm) return Promise.reject(new Error("The editor has not started."));
    loading = true;
    return vm.loadProject(buffer).then(
      () => { loading = false; shotSoon(); },
      (e) => { loading = false; throw e; });
  };

  /* The project as it stands, ready to save:
       { project, own, shot, problem }
     problem is a sentence for the student when it is too big to save, and
     then project and own are left out. */
  api.snapshot = function(){
    if (!vm) return null;
    const text = vm.toJSON();
    const own = ownAssets();
    const problem = tooBig(text, own);
    if (problem) return { problem: problem, shot: lastShot };
    return { project: JSON.parse(text), own: own, shot: lastShot, problem: "" };
  };

  /* Only project.json, which is all a checklist needs to read. Cheaper
     than snapshot(), which also gathers the student's own files. */
  api.project = function(){
    return vm ? JSON.parse(vm.toJSON()) : null;
  };

  /* The whole project as a .sb3 file, library files and all, for taking it
     home or handing it in when the site is running without its server. */
  api.download = function(name){
    if (!vm) return Promise.reject(new Error("The editor has not started."));
    return vm.saveProjectSb3().then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = String(name || "project").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) + ".sb3";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    });
  };

  /* Stop everything running, for when the task goes out of sight. */
  api.stop = function(){ if (vm) try{ vm.stopAll(); }catch(e){} };

  api.limits = { project: LIMIT_PROJECT, own: LIMIT_OWN };
})();
