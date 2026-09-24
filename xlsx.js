/* ===================================================================
   xlsx.js — writes a real Excel file in the browser, no library needed.

   A .xlsx is a zip of small XML files. This builds the few that Excel
   insists on, and stores them uncompressed, which keeps the whole thing
   to about a hundred lines and means nothing has to be downloaded from
   the internet — important on a filtered school network.
   =================================================================== */
(function(){
  "use strict";

  /* ---- the checksum every zip entry needs ---- */
  const CRC = (function(){
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++){
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes){
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const enc = (s) => new TextEncoder().encode(s);

  function zip(files){
    const parts = [], central = [];
    let offset = 0;
    files.forEach(f => {
      const name = enc(f.name), body = enc(f.text);
      const sum = crc32(body);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);        // version needed
      local.setUint16(6, 0, true);         // flags
      local.setUint16(8, 0, true);         // stored, not compressed
      local.setUint16(10, 0, true); local.setUint16(12, 0, true);   // time, date
      local.setUint32(14, sum, true);
      local.setUint32(18, body.length, true);
      local.setUint32(22, body.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, body);

      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true);
      dir.setUint16(4, 20, true); dir.setUint16(6, 20, true);
      dir.setUint16(8, 0, true); dir.setUint16(10, 0, true);
      dir.setUint16(12, 0, true); dir.setUint16(14, 0, true);
      dir.setUint32(16, sum, true);
      dir.setUint32(20, body.length, true);
      dir.setUint32(24, body.length, true);
      dir.setUint16(28, name.length, true);
      dir.setUint16(30, 0, true); dir.setUint16(32, 0, true);
      dir.setUint16(34, 0, true); dir.setUint16(36, 0, true);
      dir.setUint32(38, 0, true);
      dir.setUint32(42, offset, true);
      central.push(new Uint8Array(dir.buffer), name);
      offset += 30 + name.length + body.length;
    });
    let centralSize = 0;
    central.forEach(p => centralSize += p.length);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    return new Blob(all, { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                              .replace(/"/g,"&quot;").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"");
  const colName = (n) => {
    let s = "";
    while (n >= 0){ s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };

  /* rows: an array of arrays. Numbers become numbers, everything else text. */
  window.makeXlsx = function(rows, sheetName){
    const body = rows.map((row, r) => {
      const cells = row.map((v, c) => {
        const ref = colName(c) + (r + 1);
        const num = (typeof v === "number" && isFinite(v));
        if (v === null || v === undefined || v === "") return '<c r="' + ref + '"/>';
        if (num) return '<c r="' + ref + '"><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    }).join("");

    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + body + '</sheetData></worksheet>';

    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + esc((sheetName || "Sheet1").slice(0, 28)) +
      '" sheetId="1" r:id="rId1"/></sheets></workbook>';

    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
      'Target="worksheets/sheet1.xml"/></Relationships>';

    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
      'Target="xl/workbook.xml"/></Relationships>';

    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>';

    return zip([
      { name:"[Content_Types].xml", text: types },
      { name:"_rels/.rels", text: rels },
      { name:"xl/workbook.xml", text: workbook },
      { name:"xl/_rels/workbook.xml.rels", text: wbRels },
      { name:"xl/worksheets/sheet1.xml", text: sheet }
    ]);
  };

  window.saveXlsx = function(rows, sheetName, fileName){
    const blob = window.makeXlsx(rows, sheetName);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName || "markbook.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
})();

/* ======================================================================
   READING a spreadsheet.
   An .xlsx file is a zip; the sheet is XML inside it. Enough of that is
   unpicked here to pull out a grid of text, which is all the student
   import needs. No library.
   ====================================================================== */
(function(){
  "use strict";

  /* --- the smallest possible zip reader --- */
  function readZip(buf){
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);
    /* find the central directory at the end */
    let end = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--){
      if (view.getUint32(i, true) === 0x06054b50){ end = i; break; }
    }
    if (end < 0) throw new Error("That does not look like a spreadsheet.");
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
      /* the local header says where the data really starts */
      const lNameLen = view.getUint16(localAt + 26, true);
      const lExtraLen = view.getUint16(localAt + 28, true);
      const dataAt = localAt + 30 + lNameLen + lExtraLen;
      files[name] = { method: method, data: bytes.subarray(dataAt, dataAt + compSize) };
      at += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  async function unpack(entry){
    if (entry.method === 0) return new TextDecoder().decode(entry.data);
    /* deflate: the browser can do this for us */
    const stream = new Blob([entry.data]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  }

  function tagContents(xml, tag){
    const out = [];
    const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "g");
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
  }
  /* XML also lets any character be written as a number, and some writers use
     that instead of the character itself. An .xlsx out of Arbor has apostrophes
     in it as &#039;, so a reader that knew only the five named entities put
     "O&#039;Brien" in the class list. Excel shows the same file as "O'Brien".

     One pass over the string rather than a chain of replaces. A file that has
     been escaped twice holds "&amp;#039;" for a cell whose text really is
     "&#039;", and a chain that put & back first and then read numbers would
     turn that into an apostrophe the cell never had. */
  const NAMED = { lt:"<", gt:">", quot:'"', apos:"'", amp:"&" };
  const unescape2 = (t) => String(t).replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
    (whole, dec, hex, name) => {
      if (name) return NAMED[name] !== undefined ? NAMED[name] : whole;
      const code = parseInt(dec || hex, dec ? 10 : 16);
      /* Anything that is not a character leaves the text as it was found,
         rather than throwing and losing the rest of the class list. */
      if (!code || code > 0x10FFFF) return whole;
      try { return String.fromCodePoint(code); }
      catch (e){ return whole; }
    });

  /* "B3" -> column 1 */
  function colOf(ref){
    const letters = (ref.match(/^[A-Z]+/) || ["A"])[0];
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  /* Returns rows of plain text: [["First Name","Email"],["Jo","jo@x"]] */
  window.readXlsx = async function(file){
    const buf = await file.arrayBuffer();
    const files = readZip(buf);
    const sheetName = Object.keys(files).find(n => /^xl\/worksheets\/sheet1\.xml$/.test(n))
                   || Object.keys(files).find(n => /^xl\/worksheets\//.test(n));
    if (!sheetName) throw new Error("No sheet found in that file.");

    /* shared strings hold most of the text */
    let shared = [];
    if (files["xl/sharedStrings.xml"]){
      const xml = await unpack(files["xl/sharedStrings.xml"]);
      shared = tagContents(xml, "si").map(si =>
        tagContents(si, "t").map(unescape2).join(""));
    }

    const sheet = await unpack(files[sheetName]);
    const rows = [];
    tagContents(sheet, "row").forEach(rowXml => {
      const cells = [];
      const re = /<c\s([^>]*)>([\s\S]*?)<\/c>|<c\s([^>]*)\/>/g;
      let m;
      while ((m = re.exec(rowXml)) !== null){
        const attrs = m[1] || m[3] || "";
        const inner = m[2] || "";
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || "A1";
        const type = (attrs.match(/t="(\w+)"/) || [])[1] || "n";
        let value = "";
        if (type === "s"){
          const idx = parseInt(tagContents(inner, "v")[0] || "-1", 10);
          value = shared[idx] || "";
        } else if (type === "inlineStr"){
          value = tagContents(inner, "t").map(unescape2).join("");
        } else {
          value = unescape2(tagContents(inner, "v")[0] || "");
        }
        cells[colOf(ref)] = value;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      rows.push(cells);
    });
    return rows;
  };
})();
