# Starter files

Files a student downloads and opens in another program: a `.psd` for
Photoshop, a `.sb3` for Scratch, a spreadsheet to finish off.

**They live here and not in the database**, for the same reason pictures live
in `images/`: GitHub Pages serves this folder for nothing, and the database is
5GB shared across every student's work.

## Handing one out

A **Link to a site** task with **A file to download** turned on, and the
address written relative to the site:

```json
{ "type": "link", "url": "files/7-2-poster-starter.psd", "title": "Get the starter file",
  "download": true, "app": "Photoshop" }
```

The button saves the file rather than opening a tab. When the student clicks
the downloaded file, Windows opens it in whatever program owns that kind of
file, so on a school machine where Photoshop is the default for `.psd` it
starts Photoshop with the file already open.

`download` only works for a file in this folder. A file kept on OneDrive or
anywhere else opens in a new tab as an ordinary link.

## Naming

`<year>-<unit>-<what it is>.<ext>`, lower case, hyphens, so the folder sorts
by year group:

```
7-2-poster-starter.psd
8-4-album-cover-layers.psd
```

## Before you commit one

Keep them small. A starter file is downloaded by a whole class at once on the
school's connection, and every version committed stays in the repository's
history for good. In Photoshop, flatten anything students do not need as a
layer, keep the canvas no bigger than the task needs, and save with
**Maximise compatibility** off. Under 2MB is a good aim.
