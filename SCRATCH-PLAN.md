# A Scratch task: what it would take

This note looks at whether the hub can have a Scratch editor inside a lesson,
and how a child's project would be saved, given where the hub keeps its data
today. Nothing here has been built yet.

## Where saving stands now

- A lesson's work is one snapshot (`snapshot()` in `lesson.html`), with every
  task's answer in it. It goes up in one `POST /api/submit` and becomes **one
  Cosmos DB item per student per lesson**.
- **A Cosmos DB item can be at most 2 MB**, and that counts the whole JSON
  document. Base64 adds a third on top of that.
- The free tier gives **1000 RU/s and 25 GB, shared by the whole account**. A
  write costs roughly in proportion to its size. A class pressing Finish
  together is already the busy moment: the rocket screen, the 3-second
  stagger and the 503 "busy" reply in `_store.js` exist for that reason.
- The browser copy lives in `localStorage`, which allows about 5 MB in total.
  `shrinkImage` already works hard to keep screenshots near 100-150 KB for
  that reason.
- `config.js` gives writes 45 seconds before giving up. Keepalive saves (the
  one sent as the tab closes) are limited to 64 KB by the browser.

## How big a Scratch project is

An `.sb3` file is a zip of `project.json` (the scripts, sprites and variables)
plus one file for each costume and sound. The assets are already named by
their MD5 hash, e.g. `bcf454acf82e4504149f7ffe07081dbc.svg`.

| Project | `project.json` | Assets |
|---|---|---|
| The default cat project | a few KB | tens of KB |
| A typical KS3 game | 20-200 KB | 0.2-3 MB |
| A project with recorded sounds, music or photos | up to about 500 KB | 5-20 MB or more |

Nearly all the size is in **sounds** (stored as WAV) and **bitmap costumes**.
The scripts themselves are small.

**Conclusion: a whole `.sb3` cannot go into the work item.** One project with
a song in it breaks the 2 MB limit. A small project would still fill
`localStorage` and use up the class's write budget in a single save.

## The editor: three options

### A. Embed turbowarp.org or scratch.mit.edu in an iframe (no build step)

- It is cross-origin, so the hub **cannot read the project back**. Neither site
  offers a save-to-parent API.
- The only way to hand work in would be: the child chooses File > Save to your
  computer, then uploads that file into a file task. This is fiddly for
  Year 7, and the file still has to be stored somewhere.
- scratch.mit.edu also needs a Scratch account for each child, and many school
  filters block it.
- **Verdict:** fine for a lesson that only *shows* a project (the existing
  `embed` block already does this). Not suitable for saving work.

### B. Host a build of the Scratch GUI on the same site (recommended)

- Build either `scratchfoundation/scratch-gui` (AGPL-3.0 since late 2024) or
  TurboWarp's fork (GPL-3.0, faster, already exposes the VM). Publish it as
  static files under, for example, `/scratch/`. GitHub Pages can serve it: the
  build is roughly 15-30 MB, well within its limits.
- Because the editor is **same-origin**, `lesson.html` can reach the VM inside
  the iframe directly (`frame.contentWindow.vm`):
  - load: `vm.loadProject(arrayBufferOrJson)`
  - save: `vm.saveProjectSb3()` for a whole file, or `vm.toJSON()` plus
    `vm.runtime.storage` / each target's `costume.asset` and `sound.asset`
    for the separate pieces
  - notice changes: `vm.on("PROJECT_CHANGED", markDirty)`
- The fork should hide the menus that confuse things: File > Load/Save, Share,
  See Project Page and the account menu. It should keep everything else.
- **The sprite, sound and backdrop libraries** load from
  `cdn.assets.scratch.mit.edu` unless they are copied into the build. Check
  that the school filter allows it. Otherwise, copy a curated set into the
  build (see "The one dependency" below).

### C. Make a block editor of our own on Blockly

This avoids the licence question, but it is not Scratch: there is no stage,
no sprites and no sounds. It is a different project, so it is not considered
further here.

## Saving: everything in the existing work item, no new Azure resources

Recorded sounds and uploaded pictures are not needed. Without them, a
project's size comes from three things, and each has a cheap place to live.

| Part of the project | Typical size | Where it is kept |
|---|---|---|
| `project.json` (scripts, sprites, variables) | 5-200 KB | The work item, as an ordinary task answer |
| Library sprites, backdrops and sounds | Can be MBs, but already stored | Nowhere new. The project only stores each file's hash, and the editor fetches the file from the Scratch library server (`cdn.assets.scratch.mit.edu`) |
| Costumes the child paints or edits | 1-20 KB each as vector (SVG) | Inline in the work item, as base64, within a budget |

```
work item (Cosmos, as now)
{ ..., scratch_1: {
    project: { ...project.json... },
    own: { "9f2c...svg": "<base64>", ... },   <- only assets not in the Scratch library
    savedAt: "..." } }
```

On save, the page goes through the project's assets. Any asset whose hash is
in the editor's bundled library index (or in the lesson's starter project) is
left out, because the editor can fetch it again. What remains is what the child
made, and it goes in `own`. On load, `own` is handed to the VM's storage
before the project is loaded, so those assets never get requested from the
network.

This needs **no new Function routes**. `/api/submit`, restore, marking, backup
and offline mode already carry task answers, and this is just a bigger one.

### Removing the editor features that would make files large

The hosted fork turns off:

- the **Record** sound button, and **Upload** for sprites, costumes, backdrops
  and sounds
- **Convert to Bitmap** in the paint editor. Vector costumes are a few KB;
  bitmap costumes can be hundreds. Library bitmap costumes still work, because
  they come from the library server.
- the **sound editor's effects** (Louder, Reverse, Robot and so on). Each one
  creates a new WAV file of the whole sound. Library sounds are still
  available to play.
- File > Load/Save, Share and the account menu, as before.

### Limits checked in the browser and on the server

- `project.json` at most about **500 KB**, and `own` at most about **500 KB**
  of base64. Together that is 1 MB, leaving room in the 2 MB item for the
  lesson's other tasks. A child who hits the limit is told plainly, for
  example: "Your drawings are taking up too much room. Try deleting costumes
  you are not using."
- `/api/submit` should check the same caps, so a hand-edited request cannot
  push a work item over 2 MB.
- Save on Save Work, on Finish, and on a timer (for example every 60 seconds
  while `PROJECT_CHANGED` keeps firing), not on every block dragged.
- The local copy fits in `localStorage` under these caps. Moving it to
  IndexedDB is still safer if a lesson has several Scratch tasks.
- A keepalive save (sent as the tab closes) is limited to 64 KB, so send it
  only when the answer fits. Otherwise rely on the timer save.

### Teacher starter projects

A teacher uploads a starter `.sb3` in the lesson builder. The builder strips
out library assets the same way, and refuses recorded sounds. Any other
custom assets are stored in the lesson itself, under the same 500 KB limit.
For offline lessons, that is the JSON file in `lessons/`. Teachers can upload
bitmap pictures here: the cap holds them in check, and only one copy exists
per lesson, not one per child.

### The one dependency: the Scratch library server

Library sprites, sounds and thumbnails come from
`cdn.assets.scratch.mit.edu`. Before building anything, **check from a
student PC that the school filter allows that address**. If it doesn't:

- Copy just the library items the lessons use into the site, for example
  `/scratch/assets/<md5>.<ext>`, and point the editor's asset loader there.
  GitHub Pages allows a 1 GB site, so a curated set of a few hundred items
  fits easily.
- Do not copy the whole library, which is far bigger than a curated set needs.

### Costs

Nothing new. The work items grow a little: a Scratch answer is typically
20-300 KB, against screenshots at 100-150 KB. That is well within the free
25 GB. A JSON save costs about the same in RU as a lesson with a screenshot
does now.

## Offline mode (`HUB.OFFLINE = true`)

There is no backend, so keep the whole project in IndexedDB. Handing in is a
**Download .sb3** button next to the existing Save PDF, and the teacher opens
the file in the hub's editor (or in TurboWarp). This needs no server at all.

## Marking and autograding

- The marking view opens the project in the same editor iframe, read-only.
  Everything it needs is in the work item (`project` and `own`), which the
  marking screen already fetches.
- `project.json` is plain data, so `autograder.js` could tick checklist lines
  without running anything: "uses a forever loop" (`control_forever`), "makes
  a variable", "has a when-key-pressed hat", "has at least 3 sprites". This
  is the Scratch version of what the Python checklist does now.

## Licence and name

- Scratch Foundation's GUI, VM and blocks are now **AGPL-3.0**. TurboWarp's
  fork is **GPL-3.0**. Either can be hosted, provided the **source of the
  modified editor is published**. A public fork on GitHub, linked from the
  editor's About box, meets that requirement.
- Keep the editor in **its own page and build (`/scratch/`)**, talking to the
  hub only across the iframe boundary. The hub's code then stays a separate
  program and does not take on the AGPL. Bundling the editor into
  `lesson.html`'s own code would blur that line.
- The Scratch Foundation's trademark terms restrict using the name "Scratch"
  and the cat logo for a modified editor. Call it something like "Blocks" in
  the hub, and say "based on Scratch" in the About box. This is how TurboWarp
  and similar forks handle it.
- This is a reading of the licences, not legal advice. The school or trust may
  want its own advice before going live.

## Suggested order

1. Check from a student PC that `cdn.assets.scratch.mit.edu` is reachable.
2. Build the TurboWarp fork (or scratch-gui) with the features listed above
   turned off, and put it in `/scratch/`.
3. Add an `rScratch` task to `lesson.html` and the lesson builder, saving
   `project.json` plus `own` within the caps. Add the matching cap check to
   `/api/submit`.
4. Add marking, the autograder checks, and the `.sb3` hand-in for offline
   mode.
