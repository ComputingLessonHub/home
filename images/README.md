# Pictures

Pictures a lesson shows: diagrams to label, photographs, anything a task
points at with a URL.

**They live here and not in the database.** GitHub Pages serves this folder
for nothing and caches it; the database is 5GB shared across every student's
work, and a picture in there is paid for once per lesson and read back on
every page load. A `picture` or `label` task stores the address, never the
image.

## Naming

`<spec point>-<what it is>.png`, lower case, hyphens:

```
j277-1-1-1-cpu-diagram.png
j277-2-2-1-trace-table.png
h446-1-4-2-linked-list.png
```

The spec point first, so the folder sorts the way the specification does and
a picture can be found without opening it.

## Referring to one

A relative address, because the site is served from the repository root and
the lesson pages sit beside this folder:

```json
{ "type": "picture", "url": "images/j277-1-1-1-cpu-diagram.png", "alt": "..." }
```

That works on GitHub Pages, on a laptop serving the folder, and in offline
mode, which an address pointing at a server would not.

## Before you commit one

`tools/onenote-extract.js` does this for you: it encodes every picture as a
JPEG as well, keeps whichever file is smaller, and writes only that one.

Which wins is not always the JPEG, and it is worth knowing why. Over the
eleven pictures in the three example OneNote pages, at quality 82:

| | as PNG | as JPEG | |
|---|---|---|---|
| Birmingham map | 448KB | **53KB** | 88% smaller |
| exam paper with a photo on it | 117KB | **81KB** | 31% smaller |
| screenshot of an exam question | **35KB** | 64KB | 83% bigger |
| worksheet of tables | **27KB** | 59KB | 120% bigger |

Six of the eleven were bigger as a JPEG. PNG is built for flat colour and
hard edges, which is exactly what black text on white is; JPEG is built for
photographs. Forcing JPEG on everything would double most of this folder and
put a soft fringe on the type.

**Text is not a picture.** A screenshot of a paragraph cannot be reflowed on
a phone, read aloud, searched, or corrected. Those belong in a Paragraph
task as real words. This folder is for the pictures that are actually
pictures.
