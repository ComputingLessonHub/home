/* Reading a Photoshop file in the browser, for a Screenshot task set to
   take one.

   The file itself is never uploaded. A student's .psd is anywhere from 5MB
   to well over 50MB, and the whole database is 5GB, so what leaves their
   computer is what a screenshot would have been (the finished picture,
   shrunk the same way) and a few kilobytes describing how it was made.

   Two things are read:

   The picture. A PSD carries a flattened copy of the finished image beside
   its layers, put there for programs that cannot draw layers. Photoshop only
   fills it in when Maximise compatibility is ticked on saving; without it
   the copy is blank, and resource 1057 says so, which is how the student is
   told what to do rather than handing in a white rectangle.

   The stats. Every layer's record (its name, kind, blend mode, mask, layer
   style, the words in a text layer) sits in a small block near the start of
   the file, ahead of the layers' pixels. Only that block and the flattened
   picture are read; the layer pixels, which are most of a big file, are
   skipped over, so a 200MB file does not have to fit in a school computer's
   memory at once.

   Everything comes back as plain data. What it means and how it is shown is
   lesson.html's business.

   The format is Adobe's "Photoshop File Formats Specification". Only the
   ordinary .psd is read; the large document format (.psb) is turned away
   with a sentence saying how to save as .psd instead. */
(function(){

  const SAY = {
    notPsd:  "That is not a Photoshop file. Choose a file whose name ends in .psd.",
    psb:     "That file was saved in Photoshop's large document format. In Photoshop, choose File, " +
             "Save As, pick Photoshop (*.PSD) and try again.",
    noMerged:"Photoshop did not save a picture of your work inside this file. In Photoshop, choose File, " +
             "Save As, save it again and tick Maximise compatibility when it asks.",
    depth32: "This page cannot show a 32 bit picture. In Photoshop, choose Image, Mode, 8 Bits/Channel, " +
             "then save it again.",
    mode:    "This page cannot show a picture in that colour mode. In Photoshop, choose Image, Mode, " +
             "RGB Color, then save it again.",
    broken:  "That file could not be read. Try saving it again in Photoshop."
  };
  function fail(why){ const e = new Error(why); e.forStudent = true; return e; }

  /* ---------- reading bytes ----------
     A cursor over one slice of the file. Every number in a PSD is big-endian. */
  function Reader(buf, base){
    this.v = new DataView(buf);
    this.p = 0;
    this.base = base || 0;        // where this slice starts in the file
  }
  Reader.prototype = {
    left(){ return this.v.byteLength - this.p; },
    need(n){ if (this.p + n > this.v.byteLength) throw new RangeError("past the end"); },
    u8(){ this.need(1); return this.v.getUint8(this.p++); },
    i8(){ this.need(1); return this.v.getInt8(this.p++); },
    u16(){ this.need(2); const x = this.v.getUint16(this.p); this.p += 2; return x; },
    i16(){ this.need(2); const x = this.v.getInt16(this.p); this.p += 2; return x; },
    u32(){ this.need(4); const x = this.v.getUint32(this.p); this.p += 4; return x; },
    i32(){ this.need(4); const x = this.v.getInt32(this.p); this.p += 4; return x; },
    f64(){ this.need(8); const x = this.v.getFloat64(this.p); this.p += 8; return x; },
    skip(n){ this.need(n); this.p += n; },
    bytes(n){ this.need(n); const b = new Uint8Array(this.v.buffer, this.v.byteOffset + this.p, n); this.p += n; return b; },
    ascii(n){ const b = this.bytes(n); let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(b[i]); return s; },
    key(){ return this.ascii(4); },
    /* A pascal string: a length byte then that many bytes, the whole thing
       padded to a multiple of `pad`. */
    pascal(pad){
      const n = this.u8();
      const s = this.ascii(n);
      const used = n + 1;
      if (pad > 1 && used % pad) this.skip(pad - used % pad);
      return s;
    },
    /* Four bytes of length in UTF-16 characters, then the characters. */
    unicode(){
      const n = this.u32();
      let s = "";
      for (let i = 0; i < n; i++){ const c = this.u16(); if (c) s += String.fromCharCode(c); }
      return s;
    }
  };
  /* Moves the cursor onto the next 8BIM or 8B64 within three bytes, since
     tagged blocks are padded to two bytes by some writers and four by
     others and the length does not always say which. */
  function atSig(r){
    for (let k = 0; k < 4 && r.p + k + 4 <= r.v.byteLength; k++){
      const at = r.p + k;
      const s = String.fromCharCode(r.v.getUint8(at), r.v.getUint8(at + 1), r.v.getUint8(at + 2), r.v.getUint8(at + 3));
      if (s === "8BIM" || s === "8B64"){ r.p = at; return true; }
    }
    return false;
  }
  async function slice(file, at, len){
    const end = Math.min(file.size, at + len);
    if (at >= end) return new Reader(new ArrayBuffer(0), at);
    return new Reader(await file.slice(at, end).arrayBuffer(), at);
  }

  /* ---------- descriptors ----------
     Text layers, layer styles and layer comps keep their settings as Adobe
     "descriptors", a typed tree of keyed values. This reads one into plain
     objects and arrays, keyed by the four letter code. Anything it has no
     use for is read and thrown away; anything it cannot read throws, and
     the caller keeps whatever it had by then. */
  function descKey(r){ const n = r.u32(); return r.ascii(n === 0 ? 4 : n); }
  function descriptor(r){
    r.unicode();                  // the class's display name
    descKey(r);                   // the class id
    const count = r.u32();
    const out = {};
    for (let i = 0; i < count; i++){
      const k = descKey(r);
      out[k] = descValue(r, r.key());
    }
    return out;
  }
  function descValue(r, type){
    switch (type){
      case "Objc": case "GlbO": return descriptor(r);
      case "VlLs": { const n = r.u32(); const a = []; for (let i = 0; i < n; i++) a.push(descValue(r, r.key())); return a; }
      case "doub": return r.f64();
      case "UntF": r.key(); return r.f64();
      case "UnFl": { r.key(); const n = r.u32(); const a = []; for (let i = 0; i < n; i++) a.push(r.f64()); return a; }
      case "TEXT": return r.unicode();
      case "enum": descKey(r); return descKey(r);
      case "long": return r.i32();
      case "comp": r.skip(8); return 0;
      case "bool": return !!r.u8();
      case "type": case "GlbC": r.unicode(); return descKey(r);
      case "alis": case "tdta": case "Pth ": { const n = r.u32(); return r.bytes(n); }
      case "obj ": {
        const n = r.u32();
        for (let i = 0; i < n; i++){
          const kind = r.key();
          if (kind === "prop"){ r.unicode(); descKey(r); descKey(r); }
          else if (kind === "Clss"){ r.unicode(); descKey(r); }
          else if (kind === "Enmr"){ r.unicode(); descKey(r); descKey(r); descKey(r); }
          else if (kind === "rele"){ r.unicode(); descKey(r); r.u32(); }
          else if (kind === "Idnt" || kind === "indx"){ r.u32(); }
          else if (kind === "name"){ r.unicode(); descKey(r); r.unicode(); }
          else throw new Error("reference " + kind);
        }
        return null;
      }
      default: throw new Error("descriptor type " + type);
    }
  }

  /* ---------- what the four letter codes mean ---------- */
  const BLEND = {
    pass:"Pass through", norm:"Normal", diss:"Dissolve", dark:"Darken", "mul ":"Multiply",
    idiv:"Colour burn", lbrn:"Linear burn", dkCl:"Darker colour", lite:"Lighten", scrn:"Screen",
    "div ":"Colour dodge", lddg:"Linear dodge (add)", lgCl:"Lighter colour", over:"Overlay",
    sLit:"Soft light", hLit:"Hard light", vLit:"Vivid light", lLit:"Linear light", pLit:"Pin light",
    hMix:"Hard mix", diff:"Difference", smud:"Exclusion", fsub:"Subtract", fdiv:"Divide",
    "hue ":"Hue", "sat ":"Saturation", colr:"Colour", "lum ":"Luminosity"
  };
  const ADJUST = {
    levl:"Levels", curv:"Curves", brit:"Brightness/Contrast", blnc:"Colour balance",
    hue2:"Hue/Saturation", "hue ":"Hue/Saturation", selc:"Selective colour", mixr:"Channel mixer",
    grdm:"Gradient map", phfl:"Photo filter", expA:"Exposure", vibA:"Vibrance", nvrt:"Invert",
    thrs:"Threshold", post:"Posterise", blwh:"Black and white", clrL:"Colour lookup"
  };
  const FILL = { SoCo:"Solid colour", GdFl:"Gradient", PtFl:"Pattern" };
  /* Layer style effects as lfx2 names them, and the lists CC uses when one
     effect is stacked more than once. */
  const EFFECT = {
    DrSh:"Drop shadow", IrSh:"Inner shadow", OrGl:"Outer glow", IrGl:"Inner glow",
    ebbl:"Bevel and emboss", ChFX:"Satin", SoFi:"Colour overlay", GrFl:"Gradient overlay",
    patternFill:"Pattern overlay", FrFX:"Stroke"
  };
  const EFFECT_MULTI = {
    dropShadowMulti:"DrSh", innerShadowMulti:"IrSh", solidFillMulti:"SoFi",
    gradientFillMulti:"GrFl", frameFXMulti:"FrFX"
  };
  const MODE = { 0:"Bitmap", 1:"Greyscale", 2:"Indexed", 3:"RGB", 4:"CMYK", 7:"Multichannel", 8:"Duotone", 9:"Lab" };

  function effectsIn(fx){
    if (!fx || fx.masterFXSwitch === false) return [];
    const on = [];
    Object.keys(EFFECT).forEach(k => {
      const e = fx[k];
      if (e && e.enab !== false && on.indexOf(EFFECT[k]) < 0) on.push(EFFECT[k]);
    });
    Object.keys(EFFECT_MULTI).forEach(k => {
      (Array.isArray(fx[k]) ? fx[k] : []).forEach(e => {
        const name = EFFECT[EFFECT_MULTI[k]];
        if (e && e.enab !== false && on.indexOf(name) < 0) on.push(name);
      });
    });
    return on;
  }

  /* The fonts a text layer uses are in its EngineData, a PostScript-like
     text blob. /FontSet lists every font the layer knows of, Photoshop's
     default among them whether used or not, as /Name (þÿ...) in UTF-16
     behind a byte order mark with backslash escapes. Which of them the words
     are actually set in is /Font n, a position in that list, in each run of
     /StyleRun; the style sheet's own /Font is the fallback for a layer with
     no runs. AdobeInvisFont is Photoshop's marker for hidden characters,
     never a font anyone chose. */
  function fontsIn(engine){
    if (!engine || !engine.length) return [];
    let s = "";
    for (let i = 0; i < engine.length; i++) s += String.fromCharCode(engine[i]);
    const setAt = s.indexOf("/FontSet");
    if (setAt < 0) return [];
    const setEnd = s.indexOf("]", setAt);
    const set = s.slice(setAt, setEnd < 0 ? undefined : setEnd);
    const names = [];
    const re = /\/Name\s*\(\xFE\xFF((?:\\[\s\S]|[^\\)])*)\)/g;
    let m;
    while ((m = re.exec(set))){
      const raw = m[1].replace(/\\([\s\S])/g, "$1");
      let name = "";
      for (let i = 0; i + 1 < raw.length; i += 2) name += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
      names.push(name.trim());
    }
    const picked = (from, to) => {
      const part = s.slice(from, to);
      const found = [];
      const fr = /\/Font\s+(\d+)/g;
      let f;
      while ((f = fr.exec(part))) found.push(Number(f[1]));
      return found;
    };
    const runAt = s.indexOf("/StyleRun");
    const resAt = s.indexOf("/ResourceDict");
    let used = runAt >= 0 ? picked(runAt, resAt > runAt ? resAt : setAt) : [];
    if (!used.length){
      const sheetAt = s.indexOf("/StyleSheetSet");
      if (sheetAt >= 0) used = picked(sheetAt, setAt > sheetAt ? setAt : undefined).slice(0, 1);
    }
    const out = [];
    used.forEach(i => {
      const name = names[i];
      if (name && name !== "AdobeInvisFont" && out.indexOf(name) < 0 && out.length < 20) out.push(name);
    });
    return out;
  }

  /* ---------- one layer record ---------- */
  function layerRecord(r){
    const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
    const channels = r.u16();
    r.skip(channels * 6);               // channel id and length, for pixels never read
    if (r.key() !== "8BIM") throw new Error("blend signature");
    const blend = r.key();
    const opacity = r.u8();
    const clipping = r.u8();
    const flags = r.u8();
    r.u8();
    const extraLen = r.u32();
    const extraEnd = r.p + extraLen;
    const maskLen = r.u32();
    let mask = false, maskOff = false, maskBlank = false;
    if (maskLen >= 18){
      const mt = r.i32(), ml = r.i32(), mb = r.i32(), mr = r.i32();
      const fill = r.u8();
      maskOff = !!(r.u8() & 2);          // flags: bit 1 is "mask disabled"
      r.skip(maskLen - 18);
      mask = true;
      /* Nothing painted on it: no area of its own and white everywhere
         else. Every adjustment layer arrives with one of these, so it says
         nothing about what the student did. */
      maskBlank = (mb <= mt || mr <= ml) && fill === 255;
    } else r.skip(maskLen);
    r.skip(r.u32());                    // blending ranges
    let name = r.pascal(4);

    const L = { name, blend, opacity, clipped: clipping === 1, hidden: !!(flags & 2),
                empty: right <= left || bottom <= top, mask, maskOff, maskBlank };
    while (r.p + 12 <= extraEnd){
      if (!atSig(r)) break;
      const sig = r.key();
      const key = r.key();
      const len = r.u32();
      const start = r.p, end = start + len;
      try{
        if (key === "luni") L.name = r.unicode();
        else if (key === "lsct" || key === "lsdk") L.section = r.u32();
        else if (key === "iOpa") L.fill = r.u8();
        else if (key === "TySh"){
          r.u16(); r.skip(48); r.u16(); r.u32();
          const d = descriptor(r);
          L.text = typeof d["Txt "] === "string" ? d["Txt "] : "";
          L.fonts = fontsIn(d.EngineData);
          L.kind = "text";
        }
        else if (key === "tySh"){ L.kind = "text"; L.text = ""; }
        else if (key === "SoLd" || key === "PlLd" || key === "SoLE") L.kind = "smart";
        else if (key === "vmsk" || key === "vsms") L.vector = true;
        else if (key === "vscg") L.fillKind = "Shape";
        else if (FILL[key]) L.fillKind = FILL[key];
        else if (ADJUST[key]) L.adjust = ADJUST[key];
        else if (key === "lfx2" || key === "lmfx"){
          r.u32(); r.u32();
          const fx = effectsIn(descriptor(r));
          L.effects = (L.effects || []).concat(fx.filter(x => !(L.effects || []).includes(x)));
        }
        else if (key === "lrFX" && !L.effects) L.oldEffects = true;
      }catch(e){ /* one block it could not read; the rest of the layer stands */ }
      r.p = end;
    }
    r.p = extraEnd;
    return L;
  }

  /* Records run bottom to top. A group is a closing marker (type 3) at the
     bottom, the layers in it, then the folder itself (1 open, 2 closed) at
     the top, so walking backwards from the top gives the Layers panel as the
     student sees it, and the marker is where a group ends. */
  function arrange(records){
    const out = [];
    let depth = 0;
    for (let i = records.length - 1; i >= 0; i--){
      const L = records[i];
      if (L.section === 3){ depth = Math.max(0, depth - 1); continue; }
      let kind = L.kind;
      if (L.section === 1 || L.section === 2) kind = "group";
      else if (!kind && L.adjust) kind = "adjust";
      else if (!kind && L.fillKind && L.vector) kind = "shape";
      else if (!kind && L.fillKind) kind = "fill";
      else if (!kind) kind = "pixel";

      const row = { n: String(L.name || "").slice(0, 60), k: kind };
      if (depth) row.d = depth;
      if (L.hidden) row.h = 1;
      if (kind === "adjust") row.a = L.adjust;
      if (kind === "fill") row.a = L.fillKind;
      if (L.effects && L.effects.length) row.fx = L.effects;
      else if (L.oldEffects) row.fx = ["Layer style"];
      if (L.mask) row.m = L.maskBlank ? 3 : L.maskOff ? 2 : 1;
      if (L.vector && kind !== "shape") row.vm = 1;
      if (L.clipped) row.c = 1;
      if (L.blend && L.blend !== "norm" && !(kind === "group" && L.blend === "pass"))
        row.b = BLEND[L.blend] || L.blend;
      if (L.opacity < 255) row.o = Math.round(L.opacity / 2.55);
      if (L.fill !== undefined && L.fill < 255) row.f = Math.round(L.fill / 2.55);
      if (kind === "text"){
        row.t = String(L.text || "").replace(/\r/g, "\n").trim().slice(0, 300);
        if (L.fonts && L.fonts.length) row.fo = L.fonts;
      }
      if (kind === "pixel" && L.empty) row.e = 1;
      out.push(row);
      if (kind === "group") depth++;
      if (out.length >= 300) break;
    }
    return out;
  }

  /* The layer info block: a count then that many records. A negative count
     means the flattened picture's first extra channel is its transparency. */
  function layerInfo(r){
    let count = r.i16();
    const transparent = count < 0;
    count = Math.abs(count);
    const records = [];
    for (let i = 0; i < count; i++){
      try{ records.push(layerRecord(r)); }
      catch(e){ break; }               // ran past what was read, or a record it cannot follow
    }
    return { records, transparent, count };
  }

  /* ---------- image resources ----------
     Each is 8BIM, an id, a name, a length. The ones wanted here are small. */
  function resources(r, end, into){
    while (r.p + 12 <= end){
      if (r.key() !== "8BIM") break;
      const id = r.u16();
      r.pascal(2);
      const len = r.u32();
      const start = r.p;
      try{
        if (id === 1005){                   // resolution
          const h = r.u32() / 65536, unit = r.u16();
          into.ppi = Math.round(unit === 2 ? h * 2.54 : h);
        } else if (id === 1057){            // version info: was the flattened picture written?
          r.u32();
          into.merged = !!r.u8();
          r.unicode();                      // writer, always "Adobe Photoshop"
        } else if (id === 1032){            // grid and guides
          r.u32(); r.u32(); r.u32();
          into.guides = r.u32();
        } else if (id === 1065){            // layer comps
          r.u32();
          const d = descriptor(r);
          if (Array.isArray(d.list)) into.comps = d.list.length;
        } else if (id === 1060){            // XMP
          let s = "";
          const b = r.bytes(len);
          try{ s = new TextDecoder("utf-8").decode(b); }catch(e){}
          xmp(s, into);
        }
      }catch(e){}
      r.p = start + len + (len % 2);
    }
  }

  /* XMP is the file's own history: what made it, when it was created and
     last saved, each save, and the other files whose contents were pasted or
     placed into it (photoshop:DocumentAncestors). The history is written
     whether or not Photoshop's own History Log preference is on. */
  function xmp(s, into){
    if (!s) return;
    const attr = (name) => {
      const m = s.match(new RegExp(name + '\\s*=\\s*"([^"]*)"')) ||
                s.match(new RegExp("<" + name + ">([^<]*)</" + name + ">"));
      return m ? m[1].trim() : "";
    };
    const tool = attr("xmp:CreatorTool");
    if (tool) into.tool = tool.slice(0, 80);
    const made = attr("xmp:CreateDate");
    if (made) into.created = made;
    const changed = attr("xmp:ModifyDate") || attr("xmp:MetadataDate");
    if (changed) into.modified = changed;
    const original = attr("xmpMM:OriginalDocumentID");
    if (original) into.docId = original.slice(0, 80);

    /* Each history event is an rdf:li, written either as attributes or as
       child elements depending on the version that wrote it. */
    const saves = [];
    const history = (s.match(/<xmpMM:History>[\s\S]*?<\/xmpMM:History>/) || [""])[0];
    const events = history.match(/<rdf:li\b[^>]*?(?:\/>|>[\s\S]*?<\/rdf:li>)/g) || [];
    events.forEach(ev => {
      const act = (ev.match(/stEvt:action\s*=\s*"([^"]*)"/) || ev.match(/<stEvt:action>([^<]*)</) || [])[1];
      const when = (ev.match(/stEvt:when\s*=\s*"([^"]*)"/) || ev.match(/<stEvt:when>([^<]*)</) || [])[1];
      if (act === "saved" && when) saves.push(when);
    });
    if (saves.length){
      into.saves = saves.length;
      into.days = Array.from(new Set(saves.map(w => w.slice(0, 10)))).length;
      if (!into.modified) into.modified = saves[saves.length - 1];
    }
    const anc = s.match(/<photoshop:DocumentAncestors>[\s\S]*?<\/photoshop:DocumentAncestors>/);
    if (anc) into.ancestors = (anc[0].match(/<rdf:li>/g) || []).length;
  }

  /* ---------- the files placed into it ----------
     A smart object's own file travels in a global lnk2/lnkD/lnk3 block, one
     entry after another, each starting with its length and carrying its
     original file name near the front. Only the front of each is read. */
  async function placedFiles(file, at, len, into){
    let p = at;
    const end = at + len;
    while (p + 16 < end && into.length < 30){
      const r = await slice(file, p, 600);
      try{
        const hi = r.u32(), lo = r.u32();
        const size = hi * 4294967296 + lo;
        const type = r.key();
        if (!/^liF[DEA]$/.test(type) || size <= 0) break;
        r.u32();                             // version
        r.pascal(1);                         // unique id
        const name = r.unicode().slice(0, 80);
        if (name && into.indexOf(name) < 0) into.push(name);
        p += 8 + size;
        p += (4 - (p - at) % 4) % 4;
      }catch(e){ break; }
    }
  }

  /* ---------- the flattened picture ----------
     Planar: every row of the first channel, then the next channel, each row
     either raw or PackBits. Decoded straight into a picture no more than
     MAX_SIDE across, taking every step-th pixel, so a poster at 300 ppi does
     not need its full size in memory; the canvas then smooths it down the
     rest of the way, as a screenshot is. */
  const MAX_SIDE = 2800;
  function unpackRow(src, at, len, out){
    let i = at, o = 0;
    const stop = at + len, n = out.length;
    while (i < stop && o < n){
      let c = src[i++];
      if (c > 127) c -= 256;
      if (c >= 0){
        const k = Math.min(c + 1, n - o, stop - i);
        for (let j = 0; j < k; j++) out[o++] = src[i++];
      } else if (c !== -128){
        const k = Math.min(1 - c, n - o);
        const v = src[i++];
        for (let j = 0; j < k; j++) out[o++] = v;
      }
    }
  }

  async function picture(file, at, h){
    const r0 = await slice(file, at, 2);
    const compression = r0.u16();
    if (compression !== 0 && compression !== 1) throw fail(SAY.broken);
    const { width: w, height: ht, channels, depth, mode } = h;
    const bytesPer = depth === 16 ? 2 : 1;
    const rowBytes = depth === 1 ? Math.ceil(w / 8) : w * bytesPer;

    const colour = mode === 3 ? 3 : mode === 4 ? 4 : 1;
    const wanted = Math.min(channels, colour + (h.transparent ? 1 : 0));
    const step = Math.max(1, Math.ceil(Math.max(w, ht) / MAX_SIDE));
    const ow = Math.ceil(w / step), oh = Math.ceil(ht / step);
    const planes = [];
    for (let c = 0; c < wanted; c++) planes.push(new Uint8Array(ow * oh));

    let counts = null, dataAt = at + 2;
    if (compression === 1){
      const cr = await slice(file, at + 2, channels * ht * 2);
      counts = new Uint32Array(channels * ht);
      for (let i = 0; i < counts.length; i++) counts[i] = cr.u16();
      dataAt = at + 2 + channels * ht * 2;
    }
    const row = new Uint8Array(rowBytes);
    let planeAt = dataAt;
    for (let c = 0; c < wanted; c++){
      let planeLen = 0;
      if (counts){ for (let y = 0; y < ht; y++) planeLen += counts[c * ht + y]; }
      else planeLen = rowBytes * ht;
      const pr = await slice(file, planeAt, planeLen);
      const src = new Uint8Array(pr.v.buffer);
      let p = 0;
      const plane = planes[c];
      for (let y = 0; y < ht; y++){
        const len = counts ? counts[c * ht + y] : rowBytes;
        if (y % step === 0){
          if (counts) unpackRow(src, p, len, row);
          else row.set(src.subarray(p, p + rowBytes));
          const oy = (y / step) * ow;
          for (let x = 0, ox = 0; x < w; x += step, ox++){
            let v;
            if (depth === 1) v = (row[x >> 3] & (128 >> (x & 7))) ? 0 : 255;   // 1 is black
            else v = row[x * bytesPer];                                         // 16 bit: the high byte
            plane[oy + ox] = v;
          }
        }
        p += len;
      }
      planeAt += planeLen;
    }

    const canvas = document.createElement("canvas");
    canvas.width = ow; canvas.height = oh;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(ow, oh);
    const px = img.data;
    const pal = h.palette;
    for (let i = 0, o = 0; i < ow * oh; i++, o += 4){
      let R, G, B;
      if (mode === 3){ R = planes[0][i]; G = planes[1][i]; B = planes[2][i]; }
      else if (mode === 4){
        /* Stored inverted, 0 for full ink. A straight conversion, not a
           colour-managed one, so a CMYK file comes out close rather than
           exact; it is a picture to mark, not to print. */
        const C = planes[0][i], M = planes[1][i], Y = planes[2][i], K = planes[3][i] / 255;
        R = C * K; G = M * K; B = Y * K;
      }
      else if (mode === 2 && pal){ const k = planes[0][i]; R = pal[k]; G = pal[k + 256]; B = pal[k + 512]; }
      else { R = G = B = planes[0][i]; }
      /* Transparent parts go onto white, as they would print. */
      if (h.transparent && planes[colour]){
        const a = planes[colour][i] / 255;
        R = R * a + 255 * (1 - a); G = G * a + 255 * (1 - a); B = B * a + 255 * (1 - a);
      }
      px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /* ---------- the whole file ----------
     Resolves to { canvas, stats }. Rejects with an Error whose message can
     be shown to a student as it is. */
  async function readPsd(file){
    if (!file) throw fail(SAY.notPsd);
    const hr = await slice(file, 0, 26 + 4);
    if (hr.left() < 30 || hr.key() !== "8BPS") throw fail(SAY.notPsd);
    const version = hr.u16();
    if (version === 2) throw fail(SAY.psb);
    if (version !== 1) throw fail(SAY.notPsd);
    hr.skip(6);
    const channels = hr.u16(), height = hr.u32(), width = hr.u32(), depth = hr.u16(), mode = hr.u16();
    if (depth === 32) throw fail(SAY.depth32);
    if ([0, 1, 2, 3, 4, 8].indexOf(mode) < 0) throw fail(SAY.mode);
    if (!width || !height) throw fail(SAY.broken);

    const h = { width, height, channels, depth, mode, transparent: false };
    const stats = { v: 1, file: String(file.name || "").slice(0, 80), bytes: file.size,
                    w: width, h: height, mode: MODE[mode] || String(mode), depth };

    let p = 26;
    const colourLen = hr.u32();
    if (mode === 2 && colourLen >= 768){
      const cr = await slice(file, p + 4, 768);
      h.palette = cr.bytes(768);
    }
    p += 4 + colourLen;

    const rl = await slice(file, p, 4);
    const resLen = rl.u32();
    /* The resources are small apart from the thumbnail and the odd
       embedded profile, so read them whole up to a generous limit. */
    const rr = await slice(file, p + 4, Math.min(resLen, 8 * 1024 * 1024));
    try{ resources(rr, rr.v.byteLength, stats); }catch(e){}
    p += 4 + resLen;

    const ll = await slice(file, p, 8);
    const layerMaskLen = ll.u32();
    const layerMaskEnd = p + 4 + layerMaskLen;
    let records = [];
    if (layerMaskLen > 4){
      const infoLen = ll.u32();
      const infoAt = p + 8;
      if (infoLen > 2){
        /* Only the records are wanted, and they come first; the pixels they
           describe follow. A few megabytes covers hundreds of layers. */
        const lr = await slice(file, infoAt, Math.min(infoLen, 16 * 1024 * 1024));
        const got = layerInfo(lr);
        records = got.records;
        h.transparent = got.transparent;
        stats.layerCount = got.count;
      }
      /* After the layer info and the global mask come tagged blocks for the
         whole document. A 16 bit file keeps its layers here, in Lr16; the
         placed files and patterns are here too. */
      let q = infoAt + infoLen;
      const gm = await slice(file, q, 4);
      q += 4 + gm.u32();
      const placed = [];
      while (q + 12 <= layerMaskEnd){
        const tr = await slice(file, q, 12);
        const sig = tr.key();
        if (sig !== "8BIM" && sig !== "8B64") break;
        const key = tr.key();
        const len = tr.u32();
        const at = q + 12;
        try{
          if ((key === "Lr16" || key === "Lr32") && !records.length){
            const lr = await slice(file, at, Math.min(len, 16 * 1024 * 1024));
            const got = layerInfo(lr);
            records = got.records;
            h.transparent = got.transparent;
            stats.layerCount = got.count;
          } else if (key === "lnk2" || key === "lnkD" || key === "lnk3"){
            await placedFiles(file, at, len, placed);
          } else if (key === "Patt" || key === "Pat2" || key === "Pat3"){
            /* Photoshop writes the block into every file, empty or not, so
               it is the patterns inside it that are counted: each one its
               length, then itself, padded to four bytes. */
            const pr = await slice(file, at, Math.min(len, 8 * 1024 * 1024));
            let n = 0;
            while (pr.p + 4 <= pr.v.byteLength){
              const size = pr.u32();
              if (!size || pr.p + size > pr.v.byteLength) break;
              n++;
              pr.p += size + ((4 - size % 4) % 4);
            }
            if (n) stats.patterns = (stats.patterns || 0) + n;
          }
        }catch(e){}
        q = at + len;
        /* Padded to two bytes or four depending on the block and the
           version that wrote it, so look for where the next one starts. */
        const nr = await slice(file, q, 8);
        q += atSig(nr) ? nr.p : 0;
      }
      if (placed.length) stats.placed = placed;
    }
    stats.layers = arrange(records);
    /* Saved selections: channels beyond the colours and the transparency. */
    const colour = mode === 3 ? 3 : mode === 4 ? 4 : 1;
    const alphas = channels - colour - (h.transparent ? 1 : 0);
    if (alphas > 0) stats.alphas = alphas;

    /* A file with layers and no flattened picture. One with only a
       Background has nothing to flatten, and its picture is always there. */
    if (stats.merged === false && records.length > 1) throw fail(SAY.noMerged);
    delete stats.merged;

    let canvas;
    try{ canvas = await picture(file, layerMaskEnd, h); }
    catch(e){ throw e && e.forStudent ? e : fail(SAY.broken); }
    return { canvas, stats };
  }

  window.readPsd = readPsd;
  window.isPsdFile = (file) => !!file && (/\.psd$/i.test(file.name || "") || file.type === "image/vnd.adobe.photoshop");
})();
