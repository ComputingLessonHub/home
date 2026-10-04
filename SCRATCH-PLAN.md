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
  that the school filter allows it. Otherwise, add the library to the build:
  it is a few hundred MB, which is too much for GitHub Pages, so put it in
  Blob storage (see below).

### C. Make a block editor of our own on Blockly

This avoids the licence question, but it is not Scratch: there is no stage,
no sprites and no sounds. It is a different project, so it is not considered
further here.

## Saving: split the project, keep the scripts in Cosmos, put the assets in Blob storage

This is the same design scratch.mit.edu uses (a projects server and a
separate assets server). It fits the limits above:

```
work item (Cosmos, as now)                 Azure Blob Storage (new, UK South)
--------------------------------           ----------------------------------
{ ..., scratch_1: {                        assets/<md5>.<ext>   <- shared by everyone,
    project: { ...project.json... },                               written once
    assets: ["bcf4...svg", "83a9...wav"],
    bytes: 1843200, savedAt: "..." } }
```

1. **`project.json` stays in the work item**, as an ordinary task answer.
   That keeps it in the existing save, restore, marking, backup and offline
   code without changes. Cap it at around 500 KB. Real KS3 projects are far
   below that, and it leaves room inside the 2 MB item for the lesson's other
   tasks.
2. **Assets go to Blob storage, named by their hash.** Before uploading, the
   browser asks which hashes are already stored and sends only the new ones.
   The cat, the starter project's sprites and every library sprite get
   uploaded **once for the whole school**. A class of 30 remixing the same
   starter adds almost nothing. An unchanged project re-saves for the cost of
   the JSON alone.
3. **Uploads go straight from the browser to Blob storage**, using a
   short-lived SAS URL that the Function hands out. The large bytes never pass
   through the Function or Cosmos, so they cost no RU and do not hold up a
   class's hand-in. A single PUT can take far more than any project needs.
   The storage account needs a CORS rule for the site's origin.
4. **Reads** use the same route: a read SAS for the student who owns the work
   or for their teachers. The container stays **private**, because children's
   recorded voices are personal data. Hashes are hard to guess, but that is not
   access control.

### The Function changes this needs

The backend is not in this repo (`_store.js`, the Function App). `practice.js`
says the Function count is fixed ("there are eight and eight are allowed"),
so add **routes to the existing submit and teacher functions** rather than
new functions:

- `POST /api/assets/check` `{ hashes: [...] }` returns the hashes not yet
  stored, plus a write SAS for each (upload only, about 10 minutes, the exact
  blob name only).
- `GET /api/assets/read?lesson=...&task=...` returns read SASs (or one
  container-level read SAS lasting a few minutes) once it has checked that the
  caller owns the work or teaches the class.
- `/api/submit`: refuse a scratch answer whose `project` is over the cap, and
  check that every hash it lists is in storage. If one is missing, the save
  should say so instead of storing a project that cannot be opened.
- Backup and restore: add the asset hashes the work items refer to. Purge:
  remove assets nobody refers to any more. Run this as an occasional sweep
  rather than on every delete, since assets are shared.

### Limits to apply in the browser

- Refuse a single sound or costume over about **2 MB**, and a project whose
  total size is over about **10 MB**. Tell the child plainly what to cut
  ("This sound is 4 MB. Try a shorter clip.").
- Bitmap costumes can go through the same scaling as `shrinkImage`, since the
  Scratch stage is only 480x360 anyway.
- Don't save on every block drag. Save on the existing Save Work button, on
  Finish, and on a timer (for example every 60 seconds while
  `PROJECT_CHANGED` keeps firing). A JSON-only save is small, but a class of
  30 saving every few seconds would still use up the write budget.
- **Local copy:** keep it in **IndexedDB**, not `localStorage`. IndexedDB has
  room for hundreds of MB. `localStorage` is where it would fail first.
- **Leaving the tab:** a keepalive save is limited to 64 KB, so send only
  `project.json` (and only if it fits). Assets will already have been
  uploaded by the time they appear in a save.

### Costs

Blob storage (Hot, LRS, UK South) costs a couple of pence per GB a month, and
transactions cost fractions of a penny per 10,000. Even 20 GB of projects
would cost well under £1 a month. It keeps the 25 GB of Cosmos free for what
it is already used for. The Blob storage account is **a new Azure resource**,
so it will need the same IT approval the Function App and Cosmos needed.

## Offline mode (`HUB.OFFLINE = true`)

There is no backend, so keep the whole project in IndexedDB. Handing in is a
**Download .sb3** button next to the existing Save PDF, and the teacher opens
the file in the hub's editor (or in TurboWarp). This needs no server at all.

## Marking and autograding

- The marking view opens the project in the same editor iframe, read-only.
  It fetches `project.json` from the work item and the assets through a read
  SAS.
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

1. Build the TurboWarp fork (or scratch-gui) with the menus trimmed, put it in
   `/scratch/`, and add an `rScratch` task in `lesson.html`. It saves
   `project.json` into the work item. Library assets need not be saved, since
   they load from the Scratch CDN by hash. Assets the child makes, including
   any costume edited in the paint editor (which becomes a new asset), are
   kept inline as base64 within a **budget of about 1 MB**. That budget is
   room for many painted SVGs, which are a few KB each, but not for recorded
   sounds. Over the budget, the child is told what to remove. This needs no
   new Azure resources and covers most KS3 Scratch lessons. Test whether the
   school filter allows the CDN.
2. Add the Blob storage account, the asset routes and IndexedDB caching, so
   uploaded and recorded costumes and sounds work.
3. Add marking, the autograder checks, and the `.sb3` hand-in for offline mode.
