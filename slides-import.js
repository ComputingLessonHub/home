/* ===================================================================
   slides-import.js — turns a PowerPoint file into slides the site can
   draw. Builder only: a student never needs this file.

   A .pptx is a zip of XML. Every slide is read into the same structured
   shape the rest of the site keeps (see slides.js): boxes of text with
   their position, size, fill and outline, pictures, tables and lines,
   all placed as a percentage of the slide so they scale to any window.

   Kept as structure rather than as a picture of each slide for the same
   reason a whiteboard is kept as strokes: measured on a real twelve
   slide Year 7 deck, about 11KB of JSON a slide, with the pictures in the
   images table once each rather than a megabyte-sized screenshot per
   slide. The words can still be edited, read aloud and searched. A deck
   is stored once per lesson, not per student.

   What it does not try to do: charts, SmartArt, video, animations and
   WordArt effects. Those are counted and reported, so a teacher knows
   which slides to check, rather than silently left out.

   Nothing here is fetched from the internet. The zip is read by hand and
   inflated by the browser's own DecompressionStream, the same way the
   class list import reads a spreadsheet.
   =================================================================== */
(function(){
"use strict";

/* ---------------- the zip ---------------- */
function readZip(buf){
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let end = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--){
    if (view.getUint32(i, true) === 0x06054b50){ end = i; break; }
  }
  if (end < 0) throw new Error("That does not look like a PowerPoint file.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = {};
  for (let n = 0; n < count; n++){
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compSize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const lNameLen = view.getUint16(localAt + 26, true);
    const lExtraLen = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;
    files[name] = { method, data: bytes.subarray(dataAt, dataAt + compSize) };
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
async function bytesOf(entry){
  if (entry.method === 0) return entry.data;
  const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function textOf(entry){ return new TextDecoder().decode(await bytesOf(entry)); }

/* ---------------- reading XML ---------------- */
function parse(text){
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.getElementsByTagName("parsererror").length) throw new Error("A part of that file could not be read.");
  return d;
}
/* PowerPoint's XML is all namespaces, and the prefixes are not promised.
   Asking by the local name alone is what keeps this readable. */
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
function path(n, names){
  let c = n;
  for (const name of names.split("/")){ c = kid(c, name); if (!c) return null; }
  return c;
}
function desc(n, name){
  if (!n) return null;
  const all = n.getElementsByTagNameNS("*", name);
  return all.length ? all[0] : null;
}
const num = (n, a, fallback) => {
  if (!n || !n.hasAttribute(a)) return fallback;
  const v = parseInt(n.getAttribute(a), 10);
  return isNaN(v) ? fallback : v;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (v) => Math.round(v * 100) / 100;

/* ---------------- parts and the links between them ---------------- */
function relsPath(p){ const i = p.lastIndexOf("/"); return p.slice(0, i) + "/_rels/" + p.slice(i + 1) + ".rels"; }
function resolve(base, target){
  if (target.charAt(0) === "/") return target.slice(1);
  const parts = base.split("/"); parts.pop();
  target.split("/").forEach(s => { if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s); });
  return parts.join("/");
}

/* ---------------- colour ---------------- */
function hexRgb(h){ h = h.replace("#", ""); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
function rgbHex(c){ return "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function rgbHsl([r, g, b]){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn){
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslRgb([h, s, l]){
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
  return [f(h + 1/3) * 255, f(h) * 255, f(h - 1/3) * 255];
}
const PRESET = { black:"000000", white:"FFFFFF", red:"FF0000", green:"008000", blue:"0000FF", yellow:"FFFF00",
                 gray:"808080", grey:"808080", orange:"FFA500", purple:"800080" };
const MAP_DEFAULT = { bg1:"lt1", tx1:"dk1", bg2:"lt2", tx2:"dk2" };

/* A colour element, with its tints and shades applied. `node` is anything
   holding one: a solidFill, a fillRef, a gradient stop. */
function colourIn(node, ctx){
  if (!node) return null;
  const c = kids(node).find(k => /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(k.localName));
  if (!c) return null;
  let hex = null;
  const kind = c.localName;
  if (kind === "srgbClr") hex = c.getAttribute("val");
  else if (kind === "sysClr") hex = c.getAttribute("lastClr") || (c.getAttribute("val") === "window" ? "FFFFFF" : "000000");
  else if (kind === "prstClr") hex = PRESET[c.getAttribute("val")] || "000000";
  else if (kind === "scrgbClr") hex = rgbHex(["r","g","b"].map(a => num(c, a, 0) / 100000 * 255)).slice(1);
  else if (kind === "schemeClr"){
    let v = c.getAttribute("val");
    if (v === "phClr") hex = (ctx.phClr || "#000000").replace("#", "");
    else {
      v = (ctx.clrMap && ctx.clrMap[v]) || MAP_DEFAULT[v] || v;
      hex = (ctx.theme.colours[v] || "000000");
    }
  }
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  let rgb = hexRgb(hex), alpha = 1;
  kids(c).forEach(m => {
    const v = num(m, "val", 100000) / 100000;
    if (m.localName === "lumMod"){ const h = rgbHsl(rgb); h[2] *= v; rgb = hslRgb(h); }
    else if (m.localName === "lumOff"){ const h = rgbHsl(rgb); h[2] = Math.min(1, h[2] + v); rgb = hslRgb(h); }
    else if (m.localName === "tint") rgb = rgb.map(x => x + (255 - x) * (1 - v));
    else if (m.localName === "shade") rgb = rgb.map(x => x * v);
    else if (m.localName === "alpha") alpha = v;
  });
  if (alpha < 1) return "rgba(" + rgb.map(Math.round).join(",") + "," + r2(alpha) + ")";
  return rgbHex(rgb);
}

/* ---------------- the theme: colours and the two fonts ---------------- */
function readTheme(doc){
  const out = { colours: {}, major: "", minor: "" };
  if (!doc) return out;
  const scheme = desc(doc, "clrScheme");
  kids(scheme).forEach(c => {
    const v = kids(c)[0];
    if (!v) return;
    out.colours[c.localName] = v.localName === "sysClr" ? (v.getAttribute("lastClr") || "000000") : (v.getAttribute("val") || "000000");
  });
  const fonts = desc(doc, "fontScheme");
  const latin = (n) => { const l = kid(n, "latin"); return l ? l.getAttribute("typeface") || "" : ""; };
  out.major = latin(kid(fonts, "majorFont"));
  out.minor = latin(kid(fonts, "minorFont"));
  return out;
}

/* ---------------- placeholders ----------------
   A title or a body box on a slide usually says nothing about where it is
   or how big its words are: it inherits both from the layout, and the
   layout from the master. So each layout and master is read once into a
   list of its placeholders, and a slide's box is matched to them. */
function phOf(sp){
  const nv = kid(sp, "nvSpPr") || kid(sp, "nvPicPr") || kid(sp, "nvGraphicFramePr");
  const ph = path(nv, "nvPr/ph");
  if (!ph) return null;
  return { type: ph.getAttribute("type") || "obj", idx: ph.hasAttribute("idx") ? ph.getAttribute("idx") : null };
}
const MASTER_TYPE = { ctrTitle:"title", subTitle:"body", obj:"body" };
function phList(doc){
  const out = [];
  const tree = desc(doc, "spTree");
  (function walk(n){
    kids(n).forEach(c => {
      if (c.localName === "grpSp") walk(c);
      const ph = phOf(c);
      if (ph) out.push({ ph, sp: c });
    });
  })(tree);
  return out;
}
function matchPh(list, ph, master){
  if (!list || !ph) return null;
  if (!master){
    if (ph.idx !== null){
      const byIdx = list.find(x => x.ph.idx === ph.idx);
      if (byIdx) return byIdx.sp;
    }
    const byType = list.find(x => x.ph.type === ph.type);
    return byType ? byType.sp : null;
  }
  const want = MASTER_TYPE[ph.type] || ph.type;
  const hit = list.find(x => (MASTER_TYPE[x.ph.type] || x.ph.type) === want);
  return hit ? hit.sp : null;
}
function textKind(ph){
  if (!ph) return "other";
  if (ph.type === "title" || ph.type === "ctrTitle") return "title";
  if (ph.type === "body" || ph.type === "obj" || ph.type === "subTitle") return "body";
  return "other";
}

/* ---------------- one level of text style ----------------
   A paragraph's size, colour, bullet and indent come from the first of
   these that says anything: the box's own list style, then the layout's
   placeholder, the master's placeholder, the master's style for titles or
   body text, and last the presentation's default. */
function levelProps(sources, lvl, ctx){
  const want = "lvl" + (lvl + 1) + "pPr";
  const out = {};
  const set = (k, v) => { if (out[k] === undefined && v !== undefined && v !== null) out[k] = v; };
  sources.forEach(src => {
    if (!src) return;
    const p = kid(src, want);
    if (!p) return;
    if (p.hasAttribute("algn")) set("algn", p.getAttribute("algn"));
    if (p.hasAttribute("marL")) set("marL", num(p, "marL", 0));
    if (p.hasAttribute("indent")) set("indent", num(p, "indent", 0));
    if (kid(p, "buFont")) set("buFont", kid(p, "buFont").getAttribute("typeface"));
    if (kid(p, "buNone")) set("bu", "none");
    else if (kid(p, "buChar")) set("bu", bulletChar(kid(p, "buChar"), kid(p, "buFont")));
    else if (kid(p, "buAutoNum")) set("bu", "#");
    const ln = path(p, "lnSpc/spcPct");
    if (ln) set("lnSpc", num(ln, "val", 100000) / 100000);
    set("spcBef", spacing(kid(p, "spcBef")));
    set("spcAft", spacing(kid(p, "spcAft")));
    const d = kid(p, "defRPr");
    if (d){
      if (d.hasAttribute("sz")) set("sz", num(d, "sz", 1800) / 100);
      if (d.hasAttribute("b")) set("b", d.getAttribute("b") === "1");
      if (d.hasAttribute("i")) set("i", d.getAttribute("i") === "1");
      const col = colourIn(kid(d, "solidFill"), ctx);
      if (col) set("color", col);
      const latin = kid(d, "latin");
      if (latin) set("font", latin.getAttribute("typeface"));
    }
  });
  return out;
}
/* A bullet is very often a letter in Wingdings or Symbol: "q" is a hollow
   box and "§" a small square. Shown in any other font it is the letter, or
   an empty box where the character is in the private area those fonts
   use. The common ones are swapped for the shape they draw. */
const DINGS = { "§":"▪", q:"❑", "Ø":"➢", "ü":"✓", n:"■", l:"●",
                v:"❖", "Ü":"➢", "à":"➔", "è":"➔", o:"□", p:"□",
                w:"◆", u:"◆", "ª":"▪", "¨":"◻", "·":"•", "Ù":"➢",
                "ð":"➡", "â":"➡", "v":"❖" };
function bulletChar(buChar, buFont, inheritedFont){
  let ch = (buChar && buChar.getAttribute("char")) || "•";
  const face = (buFont && buFont.getAttribute("typeface")) || inheritedFont || "";
  const code = ch.charCodeAt(0);
  if (code >= 0xF000 && code <= 0xF0FF) ch = String.fromCharCode(code - 0xF000);
  if (/wingdings|symbol|webdings|marlett/i.test(face) || code >= 0xF000) return DINGS[ch] || "•";
  return ch;
}
/* Space above or below a paragraph: in points, or in lines. Returned as a
   CSS length so the paragraph can use it as it is. */
function spacing(n){
  if (!n) return undefined;
  const pts = kid(n, "spcPts"), pct = kid(n, "spcPct");
  if (pts) return "calc(var(--u)*" + r2(num(pts, "val", 0) / 100) + ")";
  if (pct) return r2(num(pct, "val", 0) / 100000 * 1.2) + "em";
  return undefined;
}
function fontName(face, ctx){
  if (!face) return "";
  if (/^\+mj/.test(face)) return ctx.theme.major;
  if (/^\+mn/.test(face)) return ctx.theme.minor;
  return face;
}
function fontCss(face){
  if (!face || /["<>;]/.test(face)) return "";
  return "font-family:'" + face.replace(/'/g, "") + "',var(--body)";
}

/* ---------------- a box's text into HTML ---------------- */
function textHtml(txBody, sources, ctx, scale, defaults){
  if (!txBody) return "";
  const paras = kids(txBody, "p");
  const nums = {};
  let any = false;
  const html = paras.map(p => {
    const pPr = kid(p, "pPr");
    const lvl = num(pPr, "lvl", 0);
    const lp = levelProps(sources, lvl, ctx);
    const algn = (pPr && pPr.getAttribute("algn")) || lp.algn || "l";
    const marL = pPr && pPr.hasAttribute("marL") ? num(pPr, "marL", 0) : (lp.marL || 0);
    const indent = pPr && pPr.hasAttribute("indent") ? num(pPr, "indent", 0) : (lp.indent || 0);
    let bu = lp.bu;
    if (pPr){
      if (kid(pPr, "buNone")) bu = "none";
      else if (kid(pPr, "buChar")) bu = bulletChar(kid(pPr, "buChar"), kid(pPr, "buFont") || null, lp.buFont);
      else if (kid(pPr, "buAutoNum")) bu = "#";
    }
    const lnPct = path(pPr, "lnSpc/spcPct");
    const lnSpc = lnPct ? num(lnPct, "val", 100000) / 100000 : (lp.lnSpc || 1);

    let first = null;
    const runs = kids(p).map(r => {
      if (r.localName === "br") return "<br>";
      if (r.localName !== "r" && r.localName !== "fld") return "";
      const t = kid(r, "t");
      const text = t ? t.textContent : "";
      if (!text) return "";
      any = true;
      const rp = kid(r, "rPr");
      const sz = (rp && rp.hasAttribute("sz") ? num(rp, "sz", 1800) / 100 : (lp.sz || defaults.sz)) * scale;
      const bold = rp && rp.hasAttribute("b") ? rp.getAttribute("b") === "1" : !!lp.b;
      const ital = rp && rp.hasAttribute("i") ? rp.getAttribute("i") === "1" : !!lp.i;
      const und = rp && rp.getAttribute("u") && rp.getAttribute("u") !== "none";
      const strike = rp && rp.getAttribute("strike") && rp.getAttribute("strike") !== "noStrike";
      const colour = colourIn(kid(rp, "solidFill"), ctx) || lp.color || defaults.color;
      const face = fontName((kid(rp, "latin") && kid(rp, "latin").getAttribute("typeface")) || lp.font || defaults.font, ctx);
      const baseline = rp ? num(rp, "baseline", 0) : 0;
      if (!first) first = { sz, face };
      const st = ["font-size:calc(var(--u)*" + r2(sz) + ")"];
      if (colour) st.push("color:" + colour);
      if (bold) st.push("font-weight:700");
      if (ital) st.push("font-style:italic");
      if (und || strike) st.push("text-decoration:" + (und ? "underline " : "") + (strike ? "line-through" : ""));
      if (face && first.face !== face) st.push(fontCss(face));
      let inner = esc(text);
      if (baseline > 0) inner = "<sup>" + inner + "</sup>";
      else if (baseline < 0) inner = "<sub>" + inner + "</sub>";
      const link = kid(rp, "hlinkClick");
      const href = link && ctx.rels[link.getAttribute("r:id")];
      if (href && href.external && /^(https?:|mailto:)/i.test(href.target))
        inner = '<a href="' + esc(href.target) + '" target="_blank" rel="noopener">' + inner + "</a>";
      return '<span style="' + st.join(";") + '">' + inner + "</span>";
    }).join("");

    /* An empty paragraph still takes a line, at the size it would have had. */
    const endSz = (() => {
      const e = kid(p, "endParaRPr");
      return (e && e.hasAttribute("sz") ? num(e, "sz", 1800) / 100 : (lp.sz || defaults.sz)) * scale;
    })();
    const sz = first ? first.sz : endSz;
    const face = first ? first.face : fontName(lp.font || defaults.font, ctx);
    const pst = ["font-size:calc(var(--u)*" + r2(sz) + ")",
                 "text-align:" + ({ ctr:"center", r:"right", just:"justify", dist:"justify" }[algn] || "left"),
                 "line-height:" + r2(1.2 * lnSpc)];
    if (face) pst.push(fontCss(face));
    const bef = spacing(kid(pPr, "spcBef")) || lp.spcBef, aft = spacing(kid(pPr, "spcAft")) || lp.spcAft;
    if (bef && paras[0] !== p) pst.push("margin-top:" + bef);
    if (aft) pst.push("margin-bottom:" + aft);
    /* Tabs and runs of spaces are kept, because teachers use them to leave
       a gap for a picture laid over the words: "Click [button] to go on".
       Squeezed out, the words slide under the picture. PowerPoint's tab
       stops are an inch apart unless the paragraph says otherwise. */
    const tab = pPr && pPr.hasAttribute("defTabSz") ? num(pPr, "defTabSz", 914400) : 914400;
    pst.push("tab-size:calc(var(--u)*" + r2(tab / 12700) + ")");
    const w = ctx.cx;
    if (marL) pst.push("padding-left:" + r2(marL / w * 100) + "cqw");
    /* A numbered list counts within its own level, and starts again
       whenever something else comes between. */
    if (runs && bu === "#") nums[lvl] = (nums[lvl] || 0) + 1; else delete nums[lvl];
    Object.keys(nums).forEach(k => { if (+k > lvl) delete nums[k]; });
    let bullet = "";
    if (runs && bu && bu !== "none"){
      const mark = bu === "#" ? nums[lvl] + "." : bu;
      const hang = indent < 0 ? -indent : 0;
      if (hang) pst.push("text-indent:-" + r2(hang / w * 100) + "cqw");
      bullet = '<span class="sl-bu"' + (hang ? ' style="width:' + r2(hang / w * 100) + 'cqw"' : "") + ">" + esc(mark) + "</span>";
    } else if (indent > 0){
      pst.push("text-indent:" + r2(indent / w * 100) + "cqw");
    }
    return '<p style="' + pst.join(";") + '">' + bullet + (runs || "<br>") + "</p>";
  }).join("");
  return any ? html : "";
}

/* ---------------- shapes ---------------- */
function xfrmOf(spPr){
  const x = kid(spPr, "xfrm");
  if (!x) return null;
  const off = kid(x, "off"), ext = kid(x, "ext");
  if (!off || !ext) return null;
  return { x: num(off, "x", 0), y: num(off, "y", 0), w: num(ext, "cx", 0), h: num(ext, "cy", 0),
           rot: num(x, "rot", 0) / 60000, flipH: x.getAttribute("flipH") === "1", flipV: x.getAttribute("flipV") === "1",
           chOff: kid(x, "chOff"), chExt: kid(x, "chExt") };
}
function place(t, xf, ctx){
  /* group coordinates out to the slide's */
  const x = xf.ox + (t.x - xf.cx0) * xf.sx, y = xf.oy + (t.y - xf.cy0) * xf.sy;
  return { x: r2(x / ctx.cx * 100), y: r2(y / ctx.cy * 100),
           w: r2(t.w * xf.sx / ctx.cx * 100), h: r2(t.h * xf.sy / ctx.cy * 100) };
}
function fillOf(spPr, style, ctx){
  if (kid(spPr, "noFill")) return null;
  const solid = kid(spPr, "solidFill");
  if (solid) return colourIn(solid, ctx);
  const grad = kid(spPr, "gradFill");
  if (grad) return gradient(grad, ctx);
  if (kid(spPr, "blipFill") || kid(spPr, "pattFill")) return null;
  const ref = path(style, "fillRef");
  if (ref && num(ref, "idx", 0) > 0) return colourIn(ref, ctx);
  return null;
}
function gradient(grad, ctx){
  const stops = kids(kid(grad, "gsLst"), "gs").map(g => {
    const c = colourIn(g, ctx);
    return c ? c + " " + r2(num(g, "pos", 0) / 1000) + "%" : null;
  }).filter(Boolean);
  if (!stops.length) return null;
  if (stops.length === 1) return stops[0].split(" ")[0];
  const lin = kid(grad, "lin");
  const ang = lin ? num(lin, "ang", 0) / 60000 : 90;
  return "linear-gradient(" + r2(ang + 90) + "deg," + stops.join(",") + ")";
}
function lineOf(spPr, style, ctx){
  const ln = kid(spPr, "ln");
  if (ln && kid(ln, "noFill")) return null;
  let colour = ln ? colourIn(kid(ln, "solidFill"), ctx) : null;
  if (!colour){
    const ref = path(style, "lnRef");
    if (ref && num(ref, "idx", 0) > 0 && !(ln && ln.firstElementChild && !kid(ln, "solidFill"))) colour = colourIn(ref, ctx);
  }
  if (!colour) return null;
  const w = ln ? num(ln, "w", 9525) : 9525;
  const dash = path(ln, "prstDash");
  return { c: colour, w: r2(w / 12700), dash: dash && dash.getAttribute("val") !== "solid" ? 1 : undefined };
}
function bodyProps(list){
  const out = {};
  list.forEach(bp => {
    if (!bp) return;
    ["anchor", "lIns", "tIns", "rIns", "bIns", "vert", "wrap"].forEach(a => {
      if (out[a] === undefined && bp.hasAttribute(a)) out[a] = bp.getAttribute(a);
    });
    const fit = kid(bp, "normAutofit");
    if (fit && out.scale === undefined) out.scale = num(fit, "fontScale", 100000) / 100000;
  });
  return out;
}
const GEOM_SKIP = /^(line|straightConnector1|bentConnector[2-5]|curvedConnector[2-5])$/;

/* Every shape on one part (a slide, its layout, or its master), placed. */
function readTree(tree, ctx, out, isSlide){
  const ident = { ox: 0, oy: 0, cx0: 0, cy0: 0, sx: 1, sy: 1 };
  (function walk(n, xf){
    kids(n).forEach(c => {
      const ln = c.localName;
      if (ln === "grpSp"){
        const g = xfrmOf(kid(c, "grpSpPr"));
        if (!g) return walk(c, xf);
        const chOff = g.chOff, chExt = g.chExt;
        const sx = chExt && num(chExt, "cx", 0) ? g.w / num(chExt, "cx", 1) : 1;
        const sy = chExt && num(chExt, "cy", 0) ? g.h / num(chExt, "cy", 1) : 1;
        const inner = { ox: xf.ox + (g.x - xf.cx0) * xf.sx, oy: xf.oy + (g.y - xf.cy0) * xf.sy,
                        cx0: chOff ? num(chOff, "x", 0) : 0, cy0: chOff ? num(chOff, "y", 0) : 0,
                        sx: xf.sx * sx, sy: xf.sy * sy };
        return walk(c, inner);
      }
      const ph = phOf(c);
      /* A layout's or master's placeholders are prompts ("Click to add
         title"), never drawn. Only the slide's own are. */
      if (ph && !isSlide) return;
      if (ln === "sp" || ln === "cxnSp") shape(c, ph, xf, ctx, out);
      else if (ln === "pic") picture(c, ph, xf, ctx, out);
      else if (ln === "graphicFrame") frame(c, xf, ctx, out);
      else if (ln === "AlternateContent"){
        const choice = kid(c, "Fallback") || kid(c, "Choice");
        if (choice) walk(choice, xf);
      }
    });
  })(tree, ident);
}
function inherited(sp, ph, ctx){
  if (!ph) return { layout: null, master: null };
  const layout = matchPh(ctx.layoutPh, ph, false);
  const master = matchPh(ctx.masterPh, layout ? phOf(layout) || ph : ph, true);
  return { layout, master };
}
function shape(sp, ph, xf, ctx, out){
  const spPr = kid(sp, "spPr");
  const style = kid(sp, "style");
  const inh = inherited(sp, ph, ctx);
  const t = xfrmOf(spPr) || xfrmOf(kid(inh.layout, "spPr")) || xfrmOf(kid(inh.master, "spPr"));
  if (!t) return;
  const pos = place(t, xf, ctx);
  const geomNode = kid(spPr, "prstGeom");
  const geom = geomNode ? geomNode.getAttribute("prst") : (kid(spPr, "custGeom") ? "cust" : "rect");

  /* a line, or a connector between two shapes */
  if (sp.localName === "cxnSp" || GEOM_SKIP.test(geom)){
    const line = lineOf(spPr, style, ctx) || { c: "#000000", w: 0.75 };
    out.push(Object.assign({ t: "line", flipH: t.flipH ? 1 : undefined, flipV: t.flipV ? 1 : undefined,
                             rot: t.rot ? r2(t.rot) : undefined, c: line.c, lw: line.w }, pos));
    return;
  }
  const blip = path(spPr, "blipFill/blip");
  if (blip){
    const target = ctx.rels[blip.getAttribute("r:embed")];
    if (target && !target.external) out.push(Object.assign({ t: "pic", media: target.target }, pos));
  }
  const fill = fillOf(spPr, style, ctx);
  const line = lineOf(spPr, style, ctx);
  const tx = kid(sp, "txBody");
  const kind = textKind(ph);
  const lst = (n) => path(n, "txBody/lstStyle");
  const sources = [kid(tx, "lstStyle"), lst(inh.layout), lst(inh.master),
                   ph ? ctx.txStyles[kind] : ctx.txStyles.other, ctx.defaultStyle];
  const bp = bodyProps([kid(tx, "bodyPr"), path(inh.layout, "txBody/bodyPr"), path(inh.master, "txBody/bodyPr")]);
  const fontRef = path(style, "fontRef");
  const defaults = { sz: 18, color: colourIn(fontRef, ctx) || null,
                     font: kind === "title" ? "+mj-lt" : "+mn-lt" };
  const html = textHtml(tx, sources, ctx, bp.scale || 1, defaults);
  if (!fill && !line && !html) return;
  if (ph && !html && !fill && !line) return;
  if (custSkip(geom, fill, line, html, ctx)) return;
  const box = Object.assign({ t: "box" }, pos);
  if (t.rot) box.rot = r2(t.rot);
  if (t.flipH) box.flipH = 1;
  if (t.flipV) box.flipV = 1;
  if (fill) box.fill = fill;
  if (line) box.line = line;
  if (geom !== "rect") box.geom = geom;
  if (html){
    box.html = html;
    const ins = (a, d) => bp[a] !== undefined ? parseInt(bp[a], 10) : d;
    box.pad = [r2(ins("lIns", 91440) / ctx.cx * 100), r2(ins("tIns", 45720) / ctx.cy * 100),
               r2(ins("rIns", 91440) / ctx.cx * 100), r2(ins("bIns", 45720) / ctx.cy * 100)];
    const anchor = bp.anchor || (kind === "title" ? "ctr" : "t");
    if (anchor !== "t") box.anchor = anchor;
    if (bp.vert && bp.vert !== "horz") box.vert = 1;
    if (bp.wrap === "none") box.nowrap = 1;
  }
  out.push(box);
}
/* A freeform shape drawn by hand (an arrow, a squiggle) is a path this
   does not draw. With words in it, the words are kept in a plain box;
   without, it is left out and counted. */
function custSkip(geom, fill, line, html, ctx){
  if (geom !== "cust" || html) return false;
  ctx.skipped.shapes++;
  return true;
}
function picture(pic, ph, xf, ctx, out){
  const spPr = kid(pic, "spPr");
  const inh = inherited(pic, ph, ctx);
  const t = xfrmOf(spPr) || xfrmOf(kid(inh.layout, "spPr")) || xfrmOf(kid(inh.master, "spPr"));
  if (!t) return;
  if (path(pic, "nvPicPr/nvPr/videoFile") || path(pic, "nvPicPr/nvPr/audioFile")) ctx.skipped.media++;
  const blipFill = kid(pic, "blipFill");
  const blip = kid(blipFill, "blip");
  const target = blip && ctx.rels[blip.getAttribute("r:embed")];
  if (!target || target.external) return;
  const item = Object.assign({ t: "pic", media: target.target }, place(t, xf, ctx));
  if (t.rot) item.rot = r2(t.rot);
  if (t.flipH) item.flipH = 1;
  if (t.flipV) item.flipV = 1;
  const src = kid(blipFill, "srcRect");
  if (src){
    const crop = ["l","t","r","b"].map(a => num(src, a, 0) / 1000);
    if (crop.some(v => v)) item.crop = crop.map(r2);
  }
  const geom = path(spPr, "prstGeom");
  if (geom && geom.getAttribute("prst") === "ellipse") item.geom = "ellipse";
  else if (geom && geom.getAttribute("prst") === "roundRect") item.geom = "roundRect";
  const line = lineOf(spPr, kid(pic, "style"), ctx);
  if (line) item.line = line;
  out.push(item);
}
function frame(gf, xf, ctx, out){
  const x = kid(gf, "xfrm");
  const off = kid(x, "off"), ext = kid(x, "ext");
  if (!off || !ext) return;
  const t = { x: num(off, "x", 0), y: num(off, "y", 0), w: num(ext, "cx", 0), h: num(ext, "cy", 0) };
  const tbl = desc(gf, "tbl");
  if (!tbl){ ctx.skipped.charts++; return; }
  const cols = kids(kid(tbl, "tblGrid"), "gridCol").map(c => num(c, "w", 0));
  const total = cols.reduce((a, b) => a + b, 0) || 1;
  const sources = [ctx.txStyles.other, ctx.defaultStyle];
  /* A cell says its own margins, fill and edges. Left to a stylesheet,
     every cell got padding and a border it never had, and a narrow panel
     of one-line labels grew to twice its height. */
  const edge = (pr, name) => {
    const ln = kid(pr, name);
    if (!ln || kid(ln, "noFill")) return "";
    const c = colourIn(kid(ln, "solidFill"), ctx);
    if (!c || /,0\)$/.test(c)) return "";
    return "calc(var(--u)*" + r2(num(ln, "w", 12700) / 12700) + ") solid " + c;
  };
  const rows = kids(tbl, "tr").map(tr => {
    const cells = kids(tr, "tc").map(tc => {
      if (tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1") return "";
      const span = num(tc, "gridSpan", 1), rspan = num(tc, "rowSpan", 1);
      const pr = kid(tc, "tcPr");
      const st = [];
      const fill = pr ? (kid(pr, "solidFill") ? colourIn(kid(pr, "solidFill"), ctx)
                       : kid(pr, "gradFill") ? gradient(kid(pr, "gradFill"), ctx) : null) : null;
      if (fill) st.push("background:" + fill);
      st.push("padding:" + r2(num(pr, "marT", 45720) / ctx.cy * 100) + "cqh " + r2(num(pr, "marR", 91440) / ctx.cx * 100) + "cqw " +
              r2(num(pr, "marB", 45720) / ctx.cy * 100) + "cqh " + r2(num(pr, "marL", 91440) / ctx.cx * 100) + "cqw");
      const anchor = pr && pr.getAttribute("anchor");
      st.push("vertical-align:" + (anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top"));
      [["lnL", "left"], ["lnR", "right"], ["lnT", "top"], ["lnB", "bottom"]].forEach(([n, side]) => {
        const e = edge(pr, n); if (e) st.push("border-" + side + ":" + e);
      });
      const html = textHtml(kid(tc, "txBody"), sources, ctx, 1, { sz: 18, color: null, font: "+mn-lt" });
      return "<td" + (span > 1 ? ' colspan="' + span + '"' : "") + (rspan > 1 ? ' rowspan="' + rspan + '"' : "") +
             ' style="' + st.join(";") + '">' + html + "</td>";
    }).join("");
    return '<tr style="height:' + r2(num(tr, "h", 0) / ctx.cy * 100) + 'cqh">' + cells + "</tr>";
  }).join("");
  const colgroup = "<colgroup>" + cols.map(w => '<col style="width:' + r2(w / total * 100) + '%">').join("") + "</colgroup>";
  out.push(Object.assign({ t: "box", html: '<table class="sl-tbl">' + colgroup + rows + "</table>", table: 1 }, place(t, xf, ctx)));
}
function backgroundOf(docs, ctx, relsList){
  for (let i = 0; i < docs.length; i++){
    const bg = desc(docs[i], "bg");
    if (!bg) continue;
    const pr = kid(bg, "bgPr");
    if (pr){
      const solid = kid(pr, "solidFill");
      if (solid) return { fill: colourIn(solid, ctx) };
      const grad = kid(pr, "gradFill");
      if (grad) return { fill: gradient(grad, ctx) };
      const blip = path(pr, "blipFill/blip");
      const target = blip && relsList[i][blip.getAttribute("r:embed")];
      if (target && !target.external) return { media: target.target };
    }
    const ref = kid(bg, "bgRef");
    if (ref) return { fill: colourIn(ref, ctx) };
  }
  return { fill: "#" + (ctx.theme.colours[(ctx.clrMap && ctx.clrMap.bg1) || "lt1"] || "FFFFFF") };
}

/* ---------------- the whole file ---------------- */
async function readPptx(file, opts){
  opts = opts || {};
  const say = opts.progress || function(){};
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open PowerPoint files. Try Chrome or Edge.");
  const zip = readZip(await file.arrayBuffer());
  const parts = {};
  const doc = async (p) => {
    if (!p || !zip[p]) return null;
    if (!parts[p]) parts[p] = parse(await textOf(zip[p]));
    return parts[p];
  };
  const relCache = {};
  const relsOf = async (p) => {
    if (relCache[p]) return relCache[p];
    const out = {};
    const d = await doc(relsPath(p));
    kids(d && d.documentElement, "Relationship").forEach(r => {
      const external = r.getAttribute("TargetMode") === "External";
      out[r.getAttribute("Id")] = { target: external ? r.getAttribute("Target") : resolve(p, r.getAttribute("Target")),
                                    type: (r.getAttribute("Type") || "").split("/").pop(), external };
    });
    return (relCache[p] = out);
  };

  const presPath = "ppt/presentation.xml";
  const pres = await doc(presPath);
  if (!pres) throw new Error("That does not look like a PowerPoint file.");
  const size = desc(pres, "sldSz");
  const cx = num(size, "cx", 12192000), cy = num(size, "cy", 6858000);
  const presRels = await relsOf(presPath);
  const order = kids(desc(pres, "sldIdLst"), "sldId").map(s => presRels[s.getAttribute("r:id")]).filter(Boolean).map(r => r.target);
  const defaultStyle = desc(pres, "defaultTextStyle");

  const skipped = { hidden: 0, charts: 0, media: 0, shapes: 0, pictures: 0 };
  const slides = [];
  const media = {};      // zip path -> the slides waiting on it
  let n = 0;
  for (const sp of order){
    n++;
    say("Reading slide " + n + " of " + order.length + "…");
    const sdoc = await doc(sp);
    if (!sdoc) continue;
    if (sdoc.documentElement.getAttribute("show") === "0"){ skipped.hidden++; continue; }
    const srels = await relsOf(sp);
    const layoutPath = (Object.values(srels).find(r => r.type === "slideLayout") || {}).target;
    const ldoc = await doc(layoutPath);
    const lrels = layoutPath ? await relsOf(layoutPath) : {};
    const masterPath = (Object.values(lrels).find(r => r.type === "slideMaster") || {}).target;
    const mdoc = await doc(masterPath);
    const mrels = masterPath ? await relsOf(masterPath) : {};
    const themePath = (Object.values(mrels).find(r => r.type === "theme") || {}).target;
    const theme = readTheme(await doc(themePath));

    const clrMapNode = desc(mdoc, "clrMap");
    const clrMap = {};
    if (clrMapNode) Array.from(clrMapNode.attributes).forEach(a => { clrMap[a.name] = a.value; });
    const over = desc(sdoc, "overrideClrMapping") || desc(ldoc, "overrideClrMapping");
    if (over) Array.from(over.attributes).forEach(a => { clrMap[a.name] = a.value; });
    const txs = desc(mdoc, "txStyles");
    const ctx = { cx, cy, theme, clrMap, skipped,
                  layoutPh: ldoc ? phList(ldoc) : [], masterPh: mdoc ? phList(mdoc) : [],
                  txStyles: { title: kid(txs, "titleStyle"), body: kid(txs, "bodyStyle"), other: kid(txs, "otherStyle") },
                  defaultStyle, rels: srels };

    const els = [];
    /* The master's and layout's own shapes, the logo in the corner and the
       coloured band, sit under the slide's, unless either says not to. */
    const showMaster = (d) => !d || d.documentElement.getAttribute("showMasterSp") !== "0";
    if (mdoc && showMaster(sdoc) && showMaster(ldoc)){
      ctx.rels = mrels; readTree(desc(mdoc, "spTree"), ctx, els, false);
    }
    if (ldoc && showMaster(sdoc)){
      ctx.rels = lrels; readTree(desc(ldoc, "spTree"), ctx, els, false);
    }
    ctx.rels = srels;
    const own = els.length;
    readTree(desc(sdoc, "spTree"), ctx, els, true);
    const bg = backgroundOf([sdoc, ldoc, mdoc].filter(Boolean), ctx, [srels, lrels, mrels]);

    /* The speaker notes, for the teacher's view only. */
    let notes = "";
    const notesPath = (Object.values(srels).find(r => r.type === "notesSlide") || {}).target;
    const ndoc = await doc(notesPath);
    if (ndoc){
      const body = phList(ndoc).find(x => x.ph.type === "body");
      if (body) notes = kids(kid(body.sp, "txBody"), "p")
        .map(p => Array.from(p.getElementsByTagNameNS("*", "t")).map(t => t.textContent).join("")).join("\n").trim();
    }
    const titleBox = (() => {
      const hit = phList(sdoc).find(x => x.ph.type === "title" || x.ph.type === "ctrTitle");
      return hit ? Array.from(hit.sp.getElementsByTagNameNS("*", "t")).map(t => t.textContent).join("").trim() : "";
    })();

    /* No title box: the first words the slide itself puts on it, which is
       nearly always what a teacher would call it. */
    const firstWords = () => {
      /* the highest words on the slide, not the first in the file */
      const hit = els.slice(own).filter(e => e.html && !e.table).sort((a, b) => a.y - b.y)[0];
      if (!hit) return "";
      const t = new DOMParser().parseFromString("<div>" + hit.html.replace(/<\/p>/g, "\n</p>") + "</div>", "text/html").body.textContent || "";
      return t.split("\n").map(x => x.replace(/\s+/g, " ").trim()).find(Boolean) || "";
    };
    const slide = { kind: "pptx", title: (titleBox || firstWords()).slice(0, 120), el: els };
    if (bg.fill) slide.bg = bg.fill;
    if (bg.media) slide.bgMedia = bg.media;
    if (notes) slide.notes = notes.slice(0, 4000);
    slides.push(slide);
    els.forEach(e => { if (e.media) (media[e.media] = media[e.media] || []).push(e); });
    if (bg.media) (media[bg.media] = media[bg.media] || []).push({ bgOf: slide });
  }

  /* The pictures, once each however many slides share them: a logo on the
     master is one upload, not one per slide. */
  const paths = Object.keys(media);
  let k = 0;
  for (const p of paths){
    k++;
    say("Adding picture " + k + " of " + paths.length + "…");
    let made = null;
    const ext = (p.split(".").pop() || "").toLowerCase();
    const mime = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", svg:"image/svg+xml",
                   webp:"image/webp", bmp:"image/bmp" }[ext];
    if (mime && zip[p] && opts.picture){
      try{ made = await opts.picture(new Blob([await bytesOf(zip[p])], { type: mime }), p); }
      catch(e){ made = null; }
    }
    if (!made) skipped.pictures++;
    media[p].forEach(e => {
      if (e.bgOf){ delete e.bgOf.bgMedia; if (made) e.bgOf.bgPic = made; return; }
      delete e.media;
      if (made) Object.assign(e, made); else e.gone = 1;
    });
  }
  slides.forEach(s => { s.el = s.el.filter(e => !e.gone); });
  return { ratio: r2(cx / cy * 1000) / 1000, hpt: r2(cy / 12700), list: slides, skipped };
}

/* The zip and XML helpers are shared with docs-import.js, which reads Word
   files the same way, rather than kept twice. */
window.hubSlideImport = { readPptx, zip: { readZip, bytesOf, textOf, parse, relsPath, resolve } };
})();
