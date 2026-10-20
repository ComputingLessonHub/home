/* ===================================================================
   docs-import.js — turns a Word file (.docx) into a document the lesson
   page can show beside the work. Builder only, like slides-import.js,
   whose zip reader it borrows.

   A Word document flows; it is not a set of fixed pages. So it is read
   into plain HTML rather than placed like a slide: headings, paragraphs,
   lists, tables, pictures, links and text boxes, keeping the bold,
   colours, sizes and alignment it was written with. It is drawn as paper
   (white, dark text) in every theme for the same reason a slide is: the
   colours were chosen against white, and turning them over for dark mode
   loses a highlighter or a red "do not" line.

   Numbering is counted here, not left to <ol>. Worksheets number their
   questions and put an answer table between each one, and an <ol> would
   start again at 1 after every table. Word keeps one count per list for
   the whole document, and so does this.

   Pictures go to the images table by id like everything else in the
   builder; headers, footers, footnotes and comments are left out.
   =================================================================== */
(function(){
"use strict";

const Z = () => window.hubSlideImport.zip;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (v) => Math.round(v * 10) / 10;
function kid(n, name){
  if (!n) return null;
  for (let c = n.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c;
  return null;
}
function kids(n, name){
  const out = [];
  if (!n) return out;
  for (let c = n.firstElementChild; c; c = c.nextElementSibling) if (!name || c.localName === name) out.push(c);
  return out;
}
/* Word attributes are all w:val, w:w and so on. */
const val = (n, a) => n ? n.getAttribute("w:" + (a || "val")) : null;
const on = (n) => !!n && !/^(0|false|off|none)$/i.test(val(n) || "1");

/* ---------------- styles ----------------
   A paragraph's look is its style (and the styles that one is based on),
   then whatever is set on the paragraph itself. Each style is flattened
   into plain objects once. */
function readRun(rPr, out){
  out = out || {};
  if (!rPr) return out;
  const b = kid(rPr, "b"); if (b) out.b = on(b);
  const i = kid(rPr, "i"); if (i) out.i = on(i);
  const u = kid(rPr, "u"); if (u) out.u = (val(u) || "single") !== "none";
  const st = kid(rPr, "strike"); if (st) out.strike = on(st);
  const caps = kid(rPr, "caps"); if (caps) out.caps = on(caps);
  const van = kid(rPr, "vanish"); if (van) out.hidden = on(van);
  const sz = kid(rPr, "sz"); if (sz) out.sz = parseInt(val(sz), 10) / 2;
  const col = kid(rPr, "color"); if (col && val(col) && val(col) !== "auto") out.color = "#" + val(col);
  else if (col && val(col) === "auto") out.color = null;
  const hl = kid(rPr, "highlight"); if (hl) out.hl = HIGHLIGHT[val(hl)] || null;
  const shd = kid(rPr, "shd"); if (shd && val(shd, "fill") && !/auto/i.test(val(shd, "fill"))) out.hl = "#" + val(shd, "fill");
  const va = kid(rPr, "vertAlign"); if (va) out.va = val(va);
  const f = kid(rPr, "rFonts");
  if (f) out.font = val(f, "ascii") || val(f, "hAnsi") || (val(f, "asciiTheme") ? "+" + val(f, "asciiTheme") : out.font);
  return out;
}
const HIGHLIGHT = { yellow:"#FFFF00", green:"#00FF00", cyan:"#00FFFF", magenta:"#FF00FF", blue:"#0000FF", red:"#FF0000",
                    darkBlue:"#000080", darkCyan:"#008080", darkGreen:"#008000", darkMagenta:"#800080", darkRed:"#800000",
                    darkYellow:"#808000", darkGray:"#808080", lightGray:"#C0C0C0", black:"#000000", white:"#FFFFFF" };
function readPara(pPr, out){
  out = out || {};
  if (!pPr) return out;
  const jc = kid(pPr, "jc"); if (jc) out.jc = val(jc);
  const ind = kid(pPr, "ind");
  if (ind){
    const left = val(ind, "left") || val(ind, "start");
    if (left !== null) out.left = parseInt(left, 10) || 0;
    if (val(ind, "hanging") !== null) out.hang = parseInt(val(ind, "hanging"), 10) || 0;
    if (val(ind, "firstLine") !== null) out.first = parseInt(val(ind, "firstLine"), 10) || 0;
  }
  const sp = kid(pPr, "spacing");
  if (sp){
    if (val(sp, "before") !== null) out.before = parseInt(val(sp, "before"), 10) || 0;
    if (val(sp, "after") !== null) out.after = parseInt(val(sp, "after"), 10) || 0;
    if (val(sp, "line") !== null && (val(sp, "lineRule") || "auto") === "auto") out.line = parseInt(val(sp, "line"), 10) / 240;
  }
  const num = kid(pPr, "numPr");
  if (num){
    const id = kid(num, "numId"), lv = kid(num, "ilvl");
    if (id) out.numId = val(id);
    if (lv) out.ilvl = parseInt(val(lv), 10) || 0;
  }
  const shd = kid(pPr, "shd"); if (shd && val(shd, "fill") && !/auto/i.test(val(shd, "fill"))) out.shade = "#" + val(shd, "fill");
  if (kid(pPr, "pageBreakBefore") && on(kid(pPr, "pageBreakBefore"))) out.breakBefore = true;
  return out;
}
function readStyles(doc){
  const out = { byId: {}, run: {}, para: {} };
  if (!doc) return out;
  const defs = doc.getElementsByTagNameNS("*", "docDefaults")[0];
  if (defs){
    readRun(kid(kid(defs, "rPrDefault"), "rPr"), out.run);
    readPara(kid(kid(defs, "pPrDefault"), "pPr"), out.para);
  }
  kids(doc.documentElement, "style").forEach(s => {
    out.byId[val(s, "styleId")] = {
      type: val(s, "type"), name: (val(kid(s, "name")) || "").toLowerCase(),
      based: val(kid(s, "basedOn")), rPr: kid(s, "rPr"), pPr: kid(s, "pPr"),
      isDefault: val(s, "default") === "1"
    };
  });
  return out;
}
function chain(styles, id){
  const list = [];
  let s = id && styles.byId[id], guard = 0;
  while (s && guard++ < 20){ list.unshift(s); s = s.based ? styles.byId[s.based] : null; }
  return list;
}

/* ---------------- numbering ---------------- */
function readNumbering(doc){
  const abstract = {}, nums = {};
  if (!doc) return { abstract, nums };
  kids(doc.documentElement, "abstractNum").forEach(a => {
    const levels = {};
    kids(a, "lvl").forEach(l => {
      levels[val(l, "ilvl")] = {
        fmt: val(kid(l, "numFmt")) || "decimal", text: val(kid(l, "lvlText")) || "",
        start: parseInt(val(kid(l, "start")) || "1", 10),
        font: val(kid(kid(l, "rPr"), "rFonts"), "ascii") || "",
        left: (() => { const ind = kid(kid(l, "pPr"), "ind"); return ind ? parseInt(val(ind, "left") || val(ind, "start") || "0", 10) : null; })()
      };
    });
    abstract[val(a, "abstractNumId")] = levels;
  });
  kids(doc.documentElement, "num").forEach(n => {
    const overrides = {};
    kids(n, "lvlOverride").forEach(o => {
      const so = kid(o, "startOverride");
      if (so) overrides[val(o, "ilvl")] = parseInt(val(so), 10);
    });
    nums[val(n, "numId")] = { abs: val(kid(n, "abstractNumId")), overrides };
  });
  return { abstract, nums };
}
/* The same Symbol and Wingdings letters PowerPoint uses for bullets. */
const DINGS = { "":"•", "":"▪", "":"➢", "":"✓", "":"❖",
                "":"■", "":"●", "":"◻", "":"❑", o:"◦", "§":"▪" };
function roman(n){
  const r = [["m",1000],["cm",900],["d",500],["cd",400],["c",100],["xc",90],["l",50],["xl",40],["x",10],["ix",9],["v",5],["iv",4],["i",1]];
  let out = ""; r.forEach(([s, v]) => { while (n >= v){ out += s; n -= v; } }); return out;
}
function counterText(fmt, n){
  if (fmt === "lowerLetter") return String.fromCharCode(96 + ((n - 1) % 26) + 1);
  if (fmt === "upperLetter") return String.fromCharCode(64 + ((n - 1) % 26) + 1);
  if (fmt === "lowerRoman") return roman(n);
  if (fmt === "upperRoman") return roman(n).toUpperCase();
  return String(n);
}

/* ---------------- the whole file ---------------- */
async function readDocx(file, opts){
  opts = opts || {};
  const say = opts.progress || function(){};
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open Word files. Try Chrome or Edge.");
  const z = Z();
  const zip = z.readZip(await file.arrayBuffer());
  const xml = async (p) => zip[p] ? z.parse(await z.textOf(zip[p])) : null;
  const body = await xml("word/document.xml");
  if (!body) throw new Error("That does not look like a Word file. Old .doc files need saving as .docx first.");
  say("Reading the document…");
  const styles = readStyles(await xml("word/styles.xml"));
  const numbering = readNumbering(await xml("word/numbering.xml"));
  const theme = await xml("word/theme/theme1.xml");
  const themeFont = (k) => {
    if (!theme) return "";
    const f = theme.getElementsByTagNameNS("*", k === "major" ? "majorFont" : "minorFont")[0];
    const l = f && kid(f, "latin");
    return l ? l.getAttribute("typeface") || "" : "";
  };
  const rels = {};
  const relDoc = await xml("word/_rels/document.xml.rels");
  kids(relDoc && relDoc.documentElement, "Relationship").forEach(r => {
    const ext = r.getAttribute("TargetMode") === "External";
    rels[r.getAttribute("Id")] = { target: ext ? r.getAttribute("Target") : z.resolve("word/document.xml", r.getAttribute("Target")), ext };
  });
  const fontOf = (f) => {
    if (!f) return "";
    if (/^\+?major/i.test(f)) return themeFont("major");
    if (/^\+?minor/i.test(f)) return themeFont("minor");
    return f;
  };
  const baseRun = Object.assign({ sz: 11 }, styles.run);
  const defaultPara = Object.values(styles.byId).find(s => s.type === "paragraph" && s.isDefault);
  const basePara = Object.assign({}, styles.para);
  if (defaultPara){ chain(styles, Object.keys(styles.byId).find(k => styles.byId[k] === defaultPara)).forEach(s => { readRun(s.rPr, baseRun); readPara(s.pPr, basePara); }); }
  const baseFont = fontOf(baseRun.font) || "Calibri";

  const counts = {};          // numId -> [count per level]
  const skipped = { pictures: 0, charts: 0, footnotes: 0 };
  const media = [];           // { target, holder: placeholder token }
  const outline = [];
  let headingN = 0;

  /* -- one run of text -- */
  /* What the text of the paragraph being read actually looks like, as
     opposed to what its style says: a heading style with the bold taken
     off is an ordinary line. */
  let stats = null;
  function runHtml(text, rp){
    if (!text || rp.hidden) return "";
    if (stats){
      const n = text.replace(/s/g, "").length;
      stats.chars += n;
      if (rp.b) stats.bold += n;
      stats.sz = Math.max(stats.sz, rp.sz || baseRun.sz);
    }
    const st = [];
    const sz = rp.sz || baseRun.sz;
    if (Math.abs(sz - baseRun.sz) > 0.2) st.push("font-size:" + r1(sz / baseRun.sz) + "em");
    if (rp.b) st.push("font-weight:700");
    if (rp.i) st.push("font-style:italic");
    if (rp.u || rp.strike) st.push("text-decoration:" + (rp.u ? "underline " : "") + (rp.strike ? "line-through" : ""));
    if (rp.caps) st.push("text-transform:uppercase");
    if (rp.color && /^#[0-9a-f]{6}$/i.test(rp.color)) st.push("color:" + rp.color);
    if (rp.hl && /^#[0-9a-f]{6}$/i.test(rp.hl)) st.push("background:" + rp.hl);
    const face = fontOf(rp.font);
    if (face && face !== baseFont && !/["<>;]/.test(face)) st.push("font-family:'" + face.replace(/'/g, "") + "',var(--body)");
    let inner = esc(text).replace(/\t/g, '<span class="dc-tab"></span>');
    if (rp.va === "superscript") inner = "<sup>" + inner + "</sup>";
    else if (rp.va === "subscript") inner = "<sub>" + inner + "</sub>";
    return st.length ? '<span style="' + st.join(";") + '">' + inner + "</span>" : inner;
  }

  /* -- what a paragraph holds: runs, links, pictures, text boxes -- */
  function inlineOf(p, prun, rstyleChain){
    let html = "", field = 0, inResult = false;
    const walk = (n, link) => {
      kids(n).forEach(c => {
        const ln = c.localName;
        if (ln === "r"){
          const rPr = kid(c, "rPr");
          const rp = Object.assign({}, prun);
          const rs = kid(rPr, "rStyle");
          if (rs) chain(styles, val(rs)).forEach(s => readRun(s.rPr, rp));
          readRun(rPr, rp);
          kids(c).forEach(part => {
            const pn = part.localName;
            if (pn === "fldChar"){
              const t = val(part, "fldCharType");
              if (t === "begin"){ field++; inResult = false; }
              else if (t === "separate") inResult = true;
              else if (t === "end"){ field = Math.max(0, field - 1); inResult = false; }
              return;
            }
            if (field && !inResult) return;            // a field's instruction, not its text
            if (pn === "t") html += wrapLink(runHtml(part.textContent, rp), link);
            else if (pn === "tab") html += '<span class="dc-tab"></span>';
            else if (pn === "br"){
              const type = val(part, "type");
              html += type === "page" ? '<br class="dc-break">' : "<br>";
            }
            else if (pn === "noBreakHyphen") html += "-";
            else if (pn === "sym") html += esc(DINGS[String.fromCharCode(parseInt(val(part, "char") || "F0B7", 16))] || "•");
            else if (pn === "drawing") html += drawing(part);
            else if (pn === "pict") html += vml(part);
            else if (pn === "AlternateContent") html += alternate(part);
            else if (pn === "footnoteReference" || pn === "endnoteReference") skipped.footnotes++;
          });
        }
        else if (ln === "hyperlink"){
          const rel = rels[c.getAttribute("r:id")];
          const href = rel && rel.ext && /^(https?:|mailto:)/i.test(rel.target) ? rel.target : null;
          walk(c, href);
        }
        else if (ln === "fldSimple" || ln === "smartTag" || ln === "ins" || ln === "customXml") walk(c, link);
        else if (ln === "sdt") walk(kid(c, "sdtContent"), link);
        else if (ln === "AlternateContent") html += alternate(c);
        else if (ln === "oMath" || ln === "oMathPara") html += esc(c.textContent);
      });
    };
    walk(p, null);
    return html;
  }
  function wrapLink(h, href){ return href && h ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + h + "</a>" : h; }
  function alternate(n){
    const choice = kid(n, "Choice"), fb = kid(n, "Fallback");
    const src = choice && (choice.getElementsByTagNameNS("*", "drawing")[0]) ? choice : fb || choice;
    if (!src) return "";
    let h = "";
    kids(src).forEach(c => {
      if (c.localName === "drawing") h += drawing(c);
      else if (c.localName === "pict") h += vml(c);
    });
    return h;
  }
  /* A picture, or a text box drawn as a shape. Kept to the width it had
     on the page, and never wider than the window it is shown in. */
  function drawing(d){
    const holder = kid(d, "inline") || kid(d, "anchor");
    if (!holder) return "";
    const ext = kid(holder, "extent");
    const wpx = ext ? Math.round(parseInt(ext.getAttribute("cx"), 10) / 9525) : 0;
    const blip = holder.getElementsByTagNameNS("*", "blip")[0];
    if (blip){
      const rel = rels[blip.getAttribute("r:embed")];
      if (!rel || rel.ext){ skipped.pictures++; return ""; }
      return picture(rel.target, wpx, holder.localName === "anchor");
    }
    const box = holder.getElementsByTagNameNS("*", "txbxContent")[0];
    if (box) return '<div class="dc-textbox">' + blocks(box) + "</div>";
    if (holder.getElementsByTagNameNS("*", "chart")[0] || holder.getElementsByTagNameNS("*", "relIds")[0]) skipped.charts++;
    return "";
  }
  function vml(p){
    const im = p.getElementsByTagNameNS("*", "imagedata")[0];
    if (im){
      const rel = rels[im.getAttribute("r:id")];
      if (rel && !rel.ext){
        const style = (im.parentNode && im.parentNode.getAttribute("style")) || "";
        const w = /width:([\d.]+)pt/.exec(style);
        return picture(rel.target, w ? Math.round(parseFloat(w[1]) * 96 / 72) : 0, false);
      }
    }
    const box = p.getElementsByTagNameNS("*", "txbxContent")[0];
    return box ? '<div class="dc-textbox">' + blocks(box) + "</div>" : "";
  }
  function picture(target, wpx, floated){
    const token = "\u0001PIC" + media.length + "\u0001";
    media.push({ target, wpx, floated });
    return token;
  }

  /* -- a paragraph -- */
  function paragraph(p){
    const pPr = kid(p, "pPr");
    const ps = kid(pPr, "pStyle");
    const styleId = ps ? val(ps) : null;
    const pp = Object.assign({}, basePara), prun = Object.assign({}, baseRun);
    const sc = chain(styles, styleId);
    sc.forEach(s => { readPara(s.pPr, pp); readRun(s.rPr, prun); });
    readPara(pPr, pp);
    /* The paragraph mark's own formatting (pPr/rPr) is not the text's,
       and is left alone: it is often bold on a line that is not. */
    stats = { chars: 0, bold: 0, sz: 0 };
    const inner = inlineOf(p, prun);
    const looks = stats;
    stats = null;
    /* A text box inside the paragraph is block content, and a <p> cannot
       hold one: the browser closes the paragraph early and the rest of
       the line lands outside it. Those paragraphs are a <div>. */
    const holdsBlocks = /class="dc-textbox"/.test(inner);
    const styleName = sc.length ? sc[sc.length - 1].name : "";
    const level = /^heading (\d)$/.exec(styleName);
    const isTitle = styleName === "title";
    const st = [];
    const align = { center:"center", right:"right", end:"right", both:"justify", distribute:"justify" }[pp.jc];
    if (align) st.push("text-align:" + align);
    if (pp.before) st.push("margin-top:" + r1(pp.before / 20) + "pt");
    st.push("margin-bottom:" + r1((pp.after === undefined ? 0 : pp.after) / 20) + "pt");
    if (pp.line && Math.abs(pp.line - 1) > 0.05) st.push("line-height:" + r1(Math.max(1, pp.line) * 1.2));
    if (pp.shade) st.push("background:" + pp.shade + ";padding:2pt 4pt");
    /* Indents are kept but capped: a teacher's two-inch indent on paper
       is most of a slides-width window. */
    let left = Math.min(pp.left || 0, 1440);

    let marker = "";
    if (pp.numId && pp.numId !== "0" && numbering.nums[pp.numId]){
      const num = numbering.nums[pp.numId];
      const levels = numbering.abstract[num.abs] || {};
      const lv = pp.ilvl || 0;
      const def = levels[lv] || { fmt: "bullet", text: "•" };
      const c = counts[pp.numId] = counts[pp.numId] || [];
      const start = num.overrides[lv] !== undefined ? num.overrides[lv] : def.start;
      c[lv] = (c[lv] === undefined ? start - 1 : c[lv]) + 1;
      for (let k = lv + 1; k < 9; k++) c[k] = undefined;
      if (def.fmt === "bullet"){
        const ch = def.text || "•";
        marker = DINGS[ch] || (/symbol|wingdings/i.test(def.font) ? "•" : ch);
      } else if (def.fmt !== "none"){
        marker = def.text.replace(/%(\d)/g, (m, k) => {
          const L = parseInt(k, 10) - 1;
          const d = levels[L] || def;
          return counterText(d.fmt, c[L] === undefined ? d.start : c[L]);
        });
      }
      if (pp.left === undefined && def.left !== null) left = Math.min(def.left, 1440);
      if (!left) left = 360 * (lv + 1);
    }
    if (left) st.push("padding-left:" + r1(left / 20) + "pt");
    if (marker){
      const hang = Math.min(pp.hang || 360, left || 360);
      st.push("text-indent:-" + r1(hang / 20) + "pt");
      marker = '<span class="dc-num" style="width:' + r1(hang / 20) + 'pt">' + esc(marker) + "</span>";
    } else if (pp.first) st.push("text-indent:" + r1(pp.first / 20) + "pt");

    const brk = pp.breakBefore ? '<hr class="dc-pagebreak">' : "";
    const body = marker + (inner || "<br>");
    const attrs = ' style="' + st.join(";") + '"';
    if ((level || isTitle) && inner){
      const n = isTitle ? 1 : Math.min(6, parseInt(level[1], 10) + 1);
      const id = "h" + (++headingN);
      if (textOf(inner)) outline.push({ id, n, text: textOf(inner) });
      return brk + "<h" + n + ' id="' + id + '"' + attrs + ">" + body + "</h" + n + ">";
    }
    /* A paragraph styled like a heading without being one ("BHead",
       "Question heading") still deserves a place in the contents when it
       is short, bold and bigger than the text around it. */
    if (inner && !marker && !holdsBlocks && looks.chars && looks.bold / looks.chars > 0.8 && looks.sz >= baseRun.sz + 2 && textOf(inner).length < 90){
      const id = "h" + (++headingN);
      outline.push({ id, n: 3, text: textOf(inner) });
      return brk + '<p id="' + id + '" class="dc-head"' + attrs + ">" + body + "</p>";
    }
    const tag = holdsBlocks ? "div" : "p";
    return brk + "<" + tag + (holdsBlocks ? ' class="dc-p"' : "") + attrs + ">" + body + "</" + tag + ">";
  }
  function textOf(h){
    const d = document.createElement("div");
    d.innerHTML = h.replace(/\u0001PIC\d+\u0001/g, "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  /* -- a table -- */
  function table(t){
    const tblPr = kid(t, "tblPr");
    const style = val(kid(tblPr, "tblStyle")) || "";
    const borders = kid(tblPr, "tblBorders");
    const noBorders = borders && kids(borders).every(b => /^(nil|none)$/.test(val(b) || ""));
    const ruled = !noBorders && (!!borders || /grid|table ?grid|light|medium|plain/i.test(style + " " + ((styles.byId[style] || {}).name || "")));
    const grid = kids(kid(t, "tblGrid"), "gridCol").map(g => parseInt(val(g, "w"), 10) || 0);
    const total = grid.reduce((a, b) => a + b, 0) || 1;
    const rows = kids(t, "tr");
    /* vertical merges: a cell marked "restart" spans down over every
       "continue" cell in the same column below it */
    const cellsByRow = rows.map(tr => {
      let col = 0;
      return kids(tr, "tc").map(tc => {
        const pr = kid(tc, "tcPr");
        const span = parseInt(val(kid(pr, "gridSpan")) || "1", 10);
        const vm = kid(pr, "vMerge");
        const cell = { tc, pr, col, span, merge: vm ? (val(vm) === "restart" ? "start" : "cont") : null, rows: 1 };
        col += span;
        return cell;
      });
    });
    cellsByRow.forEach((cells, r) => cells.forEach(cell => {
      if (cell.merge !== "start") return;
      for (let k = r + 1; k < cellsByRow.length; k++){
        const below = cellsByRow[k].find(c => c.col === cell.col);
        if (below && below.merge === "cont") cell.rows++; else break;
      }
    }));
    const colgroup = grid.length ? "<colgroup>" + grid.map(w => '<col style="width:' + r1(w / total * 100) + '%">').join("") + "</colgroup>" : "";
    const body = cellsByRow.map(cells => "<tr>" + cells.map(cell => {
      if (cell.merge === "cont") return "";
      const st = [];
      const shd = kid(cell.pr, "shd");
      if (shd && val(shd, "fill") && !/auto/i.test(val(shd, "fill"))) st.push("background:#" + val(shd, "fill"));
      const va = val(kid(cell.pr, "vAlign"));
      if (va === "center") st.push("vertical-align:middle"); else if (va === "bottom") st.push("vertical-align:bottom");
      const tcb = kid(cell.pr, "tcBorders");
      if (tcb) kids(tcb).forEach(b => {
        const side = { top:"top", bottom:"bottom", left:"left", start:"left", right:"right", end:"right" }[b.localName];
        if (!side) return;
        if (/^(nil|none)$/.test(val(b) || "")) st.push("border-" + side + ":0");
        else {
          const c = val(b, "color"), w = parseInt(val(b, "sz") || "4", 10) / 8;
          st.push("border-" + side + ":" + r1(Math.max(0.5, w)) + "pt solid " + (c && c !== "auto" ? "#" + c : "currentColor"));
        }
      });
      return "<td" + (cell.span > 1 ? ' colspan="' + cell.span + '"' : "") + (cell.rows > 1 ? ' rowspan="' + cell.rows + '"' : "") +
             (st.length ? ' style="' + st.join(";") + '"' : "") + ">" + blocks(cell.tc) + "</td>";
    }).join("") + "</tr>").join("");
    return '<div class="dc-tablewrap"><table class="dc-table' + (ruled ? " ruled" : "") + '">' + colgroup + body + "</table></div>";
  }

  /* -- everything inside a body, a cell or a text box -- */
  function blocks(n){
    let h = "";
    kids(n).forEach(c => {
      if (c.localName === "p") h += paragraph(c);
      else if (c.localName === "tbl") h += table(c);
      else if (c.localName === "sdt") h += blocks(kid(c, "sdtContent"));
      else if (c.localName === "customXml") h += blocks(c);
      else if (c.localName === "AlternateContent") h += alternate(c);
    });
    return h;
  }

  let html = blocks(body.getElementsByTagNameNS("*", "body")[0]);

  /* -- the pictures, once each -- */
  const done = {};
  for (let k = 0; k < media.length; k++){
    const m = media[k];
    say("Adding picture " + (k + 1) + " of " + media.length + "…");
    if (!(m.target in done)){
      const ext = (m.target.split(".").pop() || "").toLowerCase();
      const mime = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", bmp:"image/bmp", webp:"image/webp", svg:"image/svg+xml" }[ext];
      let made = null;
      if (mime && zip[m.target] && opts.picture){
        try{ made = await opts.picture(new Blob([await z.bytesOf(zip[m.target])], { type: mime }), m.target); }catch(e){}
      }
      done[m.target] = made;
    }
    const made = done[m.target];
    let tag = "";
    if (!made) skipped.pictures++;
    else {
      const w = m.wpx ? ' style="width:' + m.wpx + 'px"' : "";
      tag = made.imgId ? '<img data-img="' + esc(made.imgId) + '" alt=""' + w + ">"
                       : '<img src="' + esc(made.src) + '" alt=""' + w + ">";
      if (m.floated) tag = '<span class="dc-float">' + tag + "</span>";
    }
    html = html.replace("\u0001PIC" + k + "\u0001", tag);
  }

  /* -- a name for it -- */
  const core = await xml("docProps/core.xml");
  const titleNode = core && core.getElementsByTagNameNS("*", "title")[0];
  let title = (titleNode && titleNode.textContent.trim()) || (outline[0] && outline[0].text) || "";
  if (!title) title = String(file.name || "Document").replace(/\.docx$/i, "");

  /* line spacing and size for the document as a whole */
  return { title: title.slice(0, 120), html, outline, font: baseFont, pt: baseRun.sz,
           words: textOf(html).split(/\s+/).filter(Boolean).length, skipped };
}

window.hubDocImport = { readDocx };
})();
