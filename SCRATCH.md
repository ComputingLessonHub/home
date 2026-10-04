# Block coding (Scratch) tasks

A Coding task can be **Blocks (Scratch)**: the Scratch 3 editor inside the
lesson. The work saves with the rest of the student's lesson, through the same
`/api/submit` call and database record as every other task. It needs no new
Azure resources.

## Where the files are

| File | What it is |
|---|---|
| `scratch/gui/` | The Scratch Foundation's editor (`@scratch/scratch-gui`, AGPL-3.0), fetched by `scratch/vendor.sh`. Nothing in it is edited except the address it loads its own files from (see `vendor.sh`). |
| `scratch/editor.html`, `scratch/editor.js` | The hub's own page around the editor. It starts the editor with a project, hides what students cannot use, and hands the project back for saving through `window.hubScratch`. |
| `scratch/about.html` | Licence, source code and trademark notice, linked under every task. |
| `scratchhub.js` | Shared by the lesson page and the builder: the list of blocks a checklist can ask about, the project summary, and the code that mounts the editor frame. |
| `lesson.html` | The `scratch` task (`rScratch`), plus the gate, score, offline and PDF handling. |
| `author.html`, `author-editors.js` | The builder: the third choice under Coding task, the starter project editor, and Scratch checklist lines. |
| `autograder.js` | `runScratchChecks`, which reads `project.json`. |

To move to a newer Scratch editor, change `VERSION` in `scratch/vendor.sh`,
run `sh scratch/vendor.sh` from the top of the repository, and try a task
before committing. `editor.js` and `editor.html` hide some buttons by the
class names the build gives them.

## What is saved, and why it fits

The database keeps a lesson's work as one record of at most 2 MB. A whole
`.sb3` file can be bigger than that, because one recorded song can be. So a
task's answer holds only:

```
{ project: {...project.json...},     the scripts, sprites and variables, typically 5-200 KB
  own:     { "md5.svg": "base64" },  only the pictures the student drew themselves
  shot:    "data:image/jpeg...",     a 240x180 picture of the stage, about 10 KB
  runs, changed, checks, manual }
```

The following files are left out, because the editor can always fetch them
again:

- Sprites, backdrops and sounds from the **Scratch library**. The editor
  fetches these by name from `cdn.assets.scratch.mit.edu`, or from wherever
  `SCRATCH_ASSETS` in `config.js` points.
- Anything in the **teacher's starter project**. That is stored once, in the
  lesson.
- The **new-project cat and blank backdrop**, which are built into the editor.

**Limits:** `project.json` at most 500,000 characters, and `own` at most
500,000 characters of base64. A project over either limit is not saved: the
last version that fitted stays saved, and the student is told what to delete,
naming the biggest costume. A teacher's starter project gets 300,000 of each,
because it lives inside the lesson record.

**What students cannot do in a lesson:**

- upload pictures or sounds, through the buttons or by dragging a file in
- record sound
- change a sound (the effects, and cut and paste, each store a new copy of
  the whole sound)
- use **Convert to Bitmap**

**What the teacher can do in the starter editor:** all of the above, and open
a `.sb3` file.

Face and Video Sensing are hidden for everyone, because the editor frame is
never given the camera.

## How it behaves

- **Student:** the editor starts when the task scrolls into view and stops
  any running scripts when it leaves the screen. The task has **Start
  again**, **Download** (a `.sb3` file, which is also how work is handed in
  when the site runs with `OFFLINE: true`) and **Full screen**.
- **Teacher viewing work, and the builder preview:** the task shows the
  stage picture and "2 sprites, 5 scripts, 23 blocks". **Open in the block
  editor** loads the project itself.
- **Checklist kinds:**
  - uses a block (forever, repeat, if, say, broadcast and so on), with at
    least, exactly or at most a count
  - number of sprites, scripts or variables
  - most costumes on one sprite
  - green flag clicks
  - teacher-ticked lines

  Lines tick as the project changes, and again after the green flag. They
  count towards gates, the markbook and assessments the same way Python and
  web checklists do.

## Still to do outside this repository

- **`/api/submit` (Function App):** refuse a `scratch` answer whose `project`
  or `own` is over the limits above, so a hand-edited request cannot push a
  record over 2 MB. The browser already enforces the limits, so this is a
  backstop, not a fix.
- **The school's web filter:** check from a student PC that it allows
  `cdn.assets.scratch.mit.edu`. If it does not, copy the library files the
  lessons use onto the site and set `SCRATCH_ASSETS` in `config.js`.

## Licence and name

- The editor is AGPL-3.0. It is served unmodified apart from its file
  address.
- `scratch/about.html` links to its source code, and to this site's own code
  that connects it to the lessons.
- The editor runs in its own frame and talks to the lesson page only through
  `window.hubScratch`, so the hub's code stays a separate program.
- The task is called "Block coding" in the hub. The Scratch name is used only
  to say what the editor is, with the Scratch Foundation's trademark notice
  on the About page.
