/* =====================================================================
   timetable.js, a teacher's timetable and the Home dashboard built on it.

     Timetable    the periods of the day, which class is in each one, a
                  Week A and a Week B, and the holidays. Opened from the
                  Timetable button on the Classes screen.
     Week A / B   the weeks alternate, but a holiday week does not count:
                  Week A, then half term, then Week B.
     Holidays     one day or many. A single day off leaves the week as it
                  is; a week with no school days in it at all is skipped.
     Dashboard    Home shows today's lessons in period order, what is live
                  now, what is coming up and what is waiting on the teacher.
                  Settings > Console layout > Home dashboard turns it off.

   Each teacher has their own timetable. It is offered to the server
   (/api/teacher/timetable) and kept in this browser as well, so it still
   works, on this machine, before the server knows how to keep one.

   Classic script loaded after the console's own: meCode, show, el, $ and
   the rest are read by name at the time they are used.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof VIEWS === "undefined" || typeof OFFLINE === "undefined") return;
  const UI = window.hubUI;
  const ic = (n, s) => UI ? UI.icon(n, s) : "";
  const toast = (words, o) => { if (UI) UI.toast(words, o); };

  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
  const SHORT = ["Mon","Tue","Wed","Thu","Fri"];
  /* Things that fill a period without being a class. */
  const OTHERS = ["PPA","Duty","Meeting","Cover"];

  /* ================= dates ================= */
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseDay = (s) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const toMins = (t) => { const m = /^(\d\d?):(\d\d)$/.exec(String(t || "")); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fromMins = (n) => pad(Math.floor(n / 60) % 24) + ":" + pad(n % 60);
  const longDate = (d) => d.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  const shortDate = (d) => d.toLocaleDateString(undefined, { day:"numeric", month:"short" });
  const dayName = (d) => d.toLocaleDateString(undefined, { weekday:"long" });
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ================= the timetable itself ================= */
  function blank(){
    return {
      v: 1,
      twoWeek: true,
      anchor: isoDay(mondayOf(new Date())),   // a Monday...
      anchorWeek: "A",     // ...and which week it is
      periods: [
        { id:"p1", name:"P1", start:"08:50", end:"09:50" },
        { id:"p2", name:"P2", start:"09:50", end:"10:50" },
        { id:"p3", name:"P3", start:"11:10", end:"12:10" },
        { id:"p4", name:"P4", start:"12:10", end:"13:10" },
        { id:"p5", name:"P5", start:"14:00", end:"15:00" }
      ],
      slots: { A:{}, B:{} },   // slots[week][day 1-5][period id] = { cls | text, room }
      holidays: [],            // { id, name, start, end } as YYYY-MM-DD
      savedAt: ""
    };
  }
  /* Whatever came back, from the server or from an older copy in this
     browser, made into the shape above. */
  function normal(t){
    const b = blank();
    if (!t || typeof t !== "object") return b;
    const out = {
      v: 1,
      twoWeek: t.twoWeek !== false,
      anchor: parseDay(t.anchor) ? t.anchor : b.anchor,
      anchorWeek: t.anchorWeek === "B" ? "B" : "A",
      periods: Array.isArray(t.periods) ? t.periods.filter(p => p && p.id).map(p => ({
        id: String(p.id), name: String(p.name || ""), start: toMins(p.start) === null ? "" : p.start,
        end: toMins(p.end) === null ? "" : p.end })) : b.periods,
      slots: { A:{}, B:{} },
      holidays: Array.isArray(t.holidays) ? t.holidays.filter(h => h && parseDay(h.start)).map(h => ({
        id: String(h.id || newId("h")), name: String(h.name || "Holiday"),
        start: h.start, end: parseDay(h.end) && h.end >= h.start ? h.end : h.start })) : [],
      savedAt: String(t.savedAt || "")
    };
    ["A","B"].forEach(w => {
      const src = (t.slots && t.slots[w]) || {};
      for (let d = 1; d <= 5; d++){
        const day = src[d] || src[String(d)];
        if (!day) continue;
        Object.keys(day).forEach(pid => {
          const s = day[pid];
          if (!s || (!s.cls && !s.text)) return;
          (out.slots[w][d] = out.slots[w][d] || {})[pid] = {
            cls: s.cls ? String(s.cls) : "", text: s.cls ? "" : String(s.text || ""), room: String(s.room || "") };
        });
      }
    });
    return out;
  }
  const sortedPeriods = (t) => t.periods.slice().sort((a, b) => (toMins(a.start) ?? 9999) - (toMins(b.start) ?? 9999));

  /* ---------- holidays and weeks ---------- */
  function holidayOn(t, day){
    const s = typeof day === "string" ? day : isoDay(day);
    return t.holidays.find(h => h.start <= s && s <= h.end) || null;
  }
  /* A week with no school day left in it. One day off is still a school
     week, and still counts as its A or B. */
  function holidayWeek(t, monday){
    for (let i = 0; i < 5; i++) if (!holidayOn(t, addDays(monday, i))) return false;
    return true;
  }
  /* "A", "B", "" for a one-week timetable, or null for a holiday week.
     Counted from the week the teacher said was A or B, one flip for every
     school week in between, so holiday weeks leave the order alone. */
  function weekOf(t, date){
    const mon = mondayOf(date);
    if (holidayWeek(t, mon)) return null;
    if (!t.twoWeek) return "";
    const a = mondayOf(parseDay(t.anchor) || mon);
    let flips = 0, guard = 0;
    if (mon > a){
      for (let w = addDays(a, 7); w <= mon && guard < 600; w = addDays(w, 7), guard++) if (!holidayWeek(t, w)) flips++;
    } else if (mon < a){
      for (let w = mon; w < a && guard < 600; w = addDays(w, 7), guard++) if (!holidayWeek(t, w)) flips++;
    }
    return ((t.anchorWeek === "B" ? 1 : 0) + flips) % 2 ? "B" : "A";
  }
  /* The first Monday on or after this one that is not a holiday week. */
  function nextSchoolMonday(t, from){
    let w = mondayOf(from);
    for (let i = 0; i < 60 && holidayWeek(t, w); i++) w = addDays(w, 7);
    return w;
  }
  /* What a day holds: nothing because it is a weekend or a holiday, or the
     lessons in period order. */
  function dayPlan(t, date){
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return { kind:"weekend", list:[] };
    const hol = holidayOn(t, date);
    if (hol) return { kind:"holiday", holiday: hol, list:[] };
    const week = weekOf(t, date);
    const table = t.slots[week === "B" ? "B" : "A"][dow] || {};
    const list = sortedPeriods(t).filter(p => table[p.id]).map(p => ({ period: p, slot: table[p.id] }));
    return { kind:"school", week, list };
  }
  function nextSchoolDay(t, from){
    for (let i = 1; i < 120; i++){
      const d = addDays(from, i);
      const p = dayPlan(t, d);
      if (p.kind === "school") return { date: d, plan: p };
    }
    return null;
  }
  const hasLessons = (t) => ["A","B"].some(w => Object.keys(t.slots[w]).some(d => Object.keys(t.slots[w][d] || {}).length));
  const slotName = (s) => s.cls || s.text || "";

  /* ================= keeping it ================= */
  let tt = null, ttFor = null, loading = null;
  let serverKeeps = null;           // null until asked, then whether the server kept it
  const who = () => (typeof meCode === "string" ? meCode : "") || "";
  const localKey = () => "hub_timetable:" + (who() || "_all");

  function readLocal(){
    try{ return JSON.parse(localStorage.getItem(localKey()) || "null"); }catch(e){ return null; }
  }
  function load(force){
    const me = who();
    if (tt && ttFor === me && !force) return Promise.resolve(tt);
    if (loading && loading.me === me) return loading.p;
    const p = (async () => {
      const local = readLocal();
      let remote = null;
      if (!OFFLINE && API && (typeof TOKEN === "undefined" || TOKEN || KEY)){
        try{
          const r = await fetch(API + "/api/teacher/timetable?teacher=" + encodeURIComponent(me),
                                { headers: H(), cache:"no-store" });
          if (r.ok){ const d = await r.json(); serverKeeps = true; remote = d.timetable || null; }
          else serverKeeps = false;
        }catch(e){ serverKeeps = false; }
      }
      /* The newer of the two, so a timetable made on this machine before the
         server could keep one is not lost the day it starts to. */
      const pick = remote && local ? ((remote.savedAt || "") >= (local.savedAt || "") ? remote : local)
                                   : (remote || local);
      if (who() !== me) return tt;         // they changed teacher while this was out
      tt = normal(pick);
      ttFor = me;
      if (serverKeeps && local && pick === local) push();
      return tt;
    })();
    loading = { me, p };
    p.finally(() => { if (loading && loading.p === p) loading = null; });
    return p;
  }
  let pushTimer = null;
  function save(){
    if (!tt) return;
    tt.savedAt = new Date().toISOString();
    try{ localStorage.setItem(localKey(), JSON.stringify(tt)); }catch(e){}
    savedNote("Saving…");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
  }
  async function push(){
    if (!tt || OFFLINE || !API){ savedNote("Saved in this browser"); return; }
    const body = JSON.stringify({ teacher: ttFor || "", timetable: tt });
    try{
      const r = await fetch(API + "/api/teacher/timetable", { method:"POST", headers: HJ(), body });
      if (!r.ok) throw new Error(String(r.status));
      serverKeeps = true;
      savedNote("Saved");
    }catch(e){
      serverKeeps = false;
      savedNote("Saved in this browser only. The server does not keep timetables yet, so other computers will not see it.");
    }
  }
  function savedNote(words){ const s = $("ttSaved"); if (s) s.textContent = words; }

  /* ================= the editor ================= */
  let editWeek = "A";
  function open(){
    show("timetableView");
    paintEditor();
  }
  async function paintEditor(){
    const box = $("ttBody");
    if (!box) return;
    if (!tt || ttFor !== who()){
      box.innerHTML = "";
      box.appendChild(UI ? UI.skeleton("rows", 5) : waiting("Loading your timetable"));
    }
    await load();
    if ($("timetableView").hidden) return;
    if (serverKeeps === false) savedNote("Kept in this browser only until the server can keep timetables.");
    else if (tt.savedAt) savedNote("Saved");
    else savedNote("");
    box.innerHTML = "";
    box.appendChild(weeksSection());
    box.appendChild(gridSection());
    box.appendChild(periodsSection());
    box.appendChild(holidaysSection());
    if (UI && UI.swapEmoji) UI.swapEmoji(box);
  }
  function section(icon, title, note){
    const s = el("section","tt-section");
    const h = el("h3","dash-head");
    h.innerHTML = ic(icon, 18);
    h.appendChild(el("span","", title));
    s.appendChild(h);
    if (note) s.appendChild(el("p","hint tt-note", note));
    return s;
  }
  function switchBtn(title, words, onNow, fn){
    const b = el("button","set-switch" + (onNow ? " on" : ""));
    b.type = "button";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", onNow ? "true" : "false");
    const w = el("span","set-switch-words");
    w.appendChild(el("b","", title));
    w.appendChild(el("span","", words));
    b.appendChild(w);
    const k = el("span","set-switch-knob"); k.setAttribute("aria-hidden", "true");
    b.appendChild(k);
    b.addEventListener("click", fn);
    return b;
  }
  function chip(words, onNow, fn){
    const c = el("button","chip-filter" + (onNow ? " on" : ""), words);
    c.type = "button";
    c.setAttribute("aria-pressed", onNow ? "true" : "false");
    c.addEventListener("click", fn);
    return c;
  }

  /* ---------- Week A and Week B ---------- */
  function weeksSection(){
    const s = section("calendar", "Weeks");
    s.appendChild(switchBtn("Two-week timetable",
      "Week A and Week B take turns. Holiday weeks are skipped, so the week after a holiday carries on from the week before it.",
      tt.twoWeek, () => { tt.twoWeek = !tt.twoWeek; if (!tt.twoWeek) editWeek = "A"; save(); paintEditor(); }));
    const today = new Date();
    if (tt.twoWeek){
      const base = nextSchoolMonday(tt, today);
      const thisWeek = +base === +mondayOf(today);
      const now = weekOf(tt, base);
      const row = el("div","tt-row");
      row.appendChild(el("span","tt-label", thisWeek ? "This week is" : "Week commencing " + shortDate(base) + " is"));
      ["A","B"].forEach(w => row.appendChild(chip("Week " + w, now === w, () => {
        tt.anchor = isoDay(base); tt.anchorWeek = w; save(); paintEditor(); paintHome();
      })));
      s.appendChild(row);
      if (!thisWeek) s.appendChild(el("p","hint tt-note","This week is a holiday, so the choice is for the next week back at school."));
    }
    /* The next few weeks, so a teacher can see the holidays doing their job. */
    const ahead = el("div","tt-ahead");
    const from = mondayOf(today);
    for (let i = 0; i < 8; i++){
      const mon = addDays(from, i * 7);
      const w = weekOf(tt, mon);
      const c = el("span","tt-wk" + (w === null ? " hol" : w === "B" ? " b" : " a") + (i === 0 ? " now" : ""));
      c.appendChild(el("span","tt-wk-date", i === 0 ? "This week" : shortDate(mon)));
      c.appendChild(el("b","", w === null ? "Holiday" : w ? "Week " + w : "School"));
      ahead.appendChild(c);
    }
    s.appendChild(ahead);
    return s;
  }

  /* ---------- the grid of lessons ---------- */
  function classList(){
    const mine = (typeof myClasses === "function" && typeof allClasses === "function") ? myClasses(allClasses()) : [];
    return mine.map(g => g.name).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric:true }));
  }
  function gridSection(){
    const s = section("classes", "Lessons",
      "Choose the class you teach in each period. Leave a period empty when you are free.");
    if (tt.twoWeek){
      const tabs = el("div","tt-row");
      ["A","B"].forEach(w => tabs.appendChild(chip("Week " + w, editWeek === w, () => { editWeek = w; paintEditor(); })));
      const other = editWeek === "A" ? "B" : "A";
      const copy = el("button","btn-ghost bmini2 tt-copy","Copy Week " + editWeek + " to Week " + other);
      copy.type = "button";
      copy.addEventListener("click", () => {
        const was = JSON.stringify(tt.slots[other]);
        tt.slots[other] = JSON.parse(JSON.stringify(tt.slots[editWeek]));
        save(); paintEditor(); paintHome();
        toast("Week " + editWeek + " copied to Week " + other, { action:"Undo", onAction: () => {
          tt.slots[other] = JSON.parse(was); save(); paintEditor(); paintHome();
        } });
      });
      tabs.appendChild(copy);
      s.appendChild(tabs);
    }
    const week = tt.twoWeek ? editWeek : "A";
    const periods = sortedPeriods(tt);
    if (!periods.length){
      s.appendChild(el("p","hint","Add the periods of your day below first."));
      return s;
    }
    const classes = classList();
    const scroll = el("div","tt-scroll");
    const table = el("table","tt-grid");
    const hr = el("tr");
    hr.appendChild(el("th","tt-corner",""));
    const todayDow = new Date().getDay();
    const todayWeek = weekOf(tt, new Date());
    DAYS.forEach((d, i) => {
      const th = el("th","", "");
      th.appendChild(el("span","tt-dlong", d));
      th.appendChild(el("span","tt-dshort", SHORT[i]));
      if (todayDow === i + 1 && (!tt.twoWeek || todayWeek === week)) th.classList.add("tt-today");
      hr.appendChild(th);
    });
    table.appendChild(hr);
    periods.forEach(p => {
      const tr = el("tr");
      const th = el("th","tt-period");
      th.appendChild(el("b","", p.name || "Period"));
      if (p.start || p.end) th.appendChild(el("span","", (p.start || "?") + "–" + (p.end || "?")));
      tr.appendChild(th);
      for (let d = 1; d <= 5; d++) tr.appendChild(cell(week, d, p, classes));
      table.appendChild(tr);
    });
    scroll.appendChild(table);
    s.appendChild(scroll);
    return s;
  }
  function cell(week, day, period, classes){
    const td = el("td","tt-cell");
    const days = tt.slots[week];
    const slot = (days[day] && days[day][period.id]) || null;
    const put = (next) => {
      days[day] = days[day] || {};
      if (!next || (!next.cls && !next.text)){
        delete days[day][period.id];
        if (!Object.keys(days[day]).length) delete days[day];
      } else days[day][period.id] = next;
      save(); paintHome();
    };
    const sel = document.createElement("select");
    sel.className = "tt-sel";
    sel.setAttribute("aria-label", DAYS[day - 1] + " " + (period.name || "period") + (tt.twoWeek ? ", Week " + week : ""));
    const add = (parent, value, words) => {
      const o = document.createElement("option"); o.value = value; o.textContent = words; parent.appendChild(o); return o;
    };
    add(sel, "", "—");
    const names = classes.slice();
    if (slot && slot.cls && names.indexOf(slot.cls) < 0) names.push(slot.cls);   // a class that has since gone
    if (names.length){
      const g = document.createElement("optgroup"); g.label = "Classes";
      names.forEach(n => add(g, "c:" + n, n));
      sel.appendChild(g);
    }
    const g2 = document.createElement("optgroup"); g2.label = "Not a class";
    OTHERS.forEach(n => add(g2, "t:" + n, n));
    add(g2, "other", "Something else…");
    sel.appendChild(g2);
    const custom = slot && slot.text && OTHERS.indexOf(slot.text) < 0;
    sel.value = !slot ? "" : slot.cls ? "c:" + slot.cls : custom ? "other" : "t:" + slot.text;
    td.appendChild(sel);

    const text = el("input","tt-in tt-text");
    text.type = "text";
    text.placeholder = "What is it?";
    text.maxLength = 30;
    text.setAttribute("aria-label", "What is in this period");
    text.value = custom ? slot.text : "";
    text.hidden = !custom;
    td.appendChild(text);

    const room = el("input","tt-in tt-room");
    room.type = "text";
    room.placeholder = "Room";
    room.maxLength = 12;
    room.setAttribute("aria-label", "Room");
    room.value = (slot && slot.room) || "";
    room.hidden = !slot;
    td.appendChild(room);

    td.classList.toggle("filled", !!slot);
    sel.addEventListener("change", () => {
      const v = sel.value;
      const r = room.value.trim();
      if (!v){ put(null); text.hidden = true; room.hidden = true; td.classList.remove("filled"); return; }
      if (v === "other"){
        text.hidden = false; room.hidden = false; td.classList.add("filled");
        text.value = text.value || "";
        text.focus();
        if (text.value.trim()) put({ cls:"", text: text.value.trim(), room: r });
        return;
      }
      text.hidden = true; room.hidden = false; td.classList.add("filled");
      put(v.slice(0, 2) === "c:" ? { cls: v.slice(2), text:"", room: r } : { cls:"", text: v.slice(2), room: r });
    });
    text.addEventListener("change", () => {
      const t = text.value.trim();
      put(t ? { cls:"", text: t, room: room.value.trim() } : null);
      if (!t){ sel.value = ""; text.hidden = true; room.hidden = true; td.classList.remove("filled"); }
    });
    room.addEventListener("change", () => {
      const cur = days[day] && days[day][period.id];
      if (!cur) return;
      cur.room = room.value.trim();
      save(); paintHome();
    });
    return td;
  }

  /* ---------- the periods of the day ---------- */
  function periodsSection(){
    const s = section("progress", "Periods",
      "The same periods every day. Names and times can be anything your school uses.");
    const list = el("div","tt-list");
    const periods = sortedPeriods(tt);
    periods.forEach(p => {
      const row = el("div","tt-line");
      const name = el("input","tt-in tt-pname");
      name.type = "text"; name.value = p.name; name.maxLength = 16; name.placeholder = "Name";
      name.setAttribute("aria-label", "Period name");
      name.addEventListener("change", () => { p.name = name.value.trim() || p.name; save(); paintEditor(); paintHome(); });
      const start = timeIn(p.start, "Starts");
      const end = timeIn(p.end, "Ends");
      const fix = () => {
        p.start = start.value; p.end = end.value;
        if (toMins(p.start) !== null && toMins(p.end) !== null && toMins(p.end) <= toMins(p.start))
          p.end = fromMins(toMins(p.start) + 60);
        save(); paintEditor(); paintHome();
      };
      start.addEventListener("change", fix);
      end.addEventListener("change", fix);
      const x = el("button","btn-ghost iconbtn","\u{1F5D1}");
      x.type = "button"; x.title = "Remove " + (p.name || "this period");
      x.addEventListener("click", () => {
        const was = JSON.stringify(tt);
        tt.periods = tt.periods.filter(q => q.id !== p.id);
        ["A","B"].forEach(w => Object.keys(tt.slots[w]).forEach(d => { delete tt.slots[w][d][p.id]; }));
        save(); paintEditor(); paintHome();
        toast((p.name || "Period") + " removed", { action:"Undo", onAction: () => {
          tt = normal(JSON.parse(was)); save(); paintEditor(); paintHome();
        } });
      });
      row.appendChild(name);
      row.appendChild(start);
      row.appendChild(el("span","tt-dash","to"));
      row.appendChild(end);
      row.appendChild(x);
      list.appendChild(row);
    });
    s.appendChild(list);
    const addBtn = el("button","btn-ghost bmini2","+ Add a period");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      const last = periods[periods.length - 1];
      const from = last && toMins(last.end) !== null ? toMins(last.end) : 9 * 60;
      tt.periods.push({ id: newId("p"), name: "P" + (tt.periods.length + 1), start: fromMins(from), end: fromMins(from + 60) });
      save(); paintEditor();
    });
    s.appendChild(addBtn);
    return s;
  }
  function timeIn(value, label){
    const i = el("input","tt-in tt-time");
    i.type = "time"; i.value = value || ""; i.step = 300;
    i.setAttribute("aria-label", label);
    return i;
  }

  /* ---------- holidays ---------- */
  function schoolDaysIn(h){
    let n = 0;
    const a = parseDay(h.start), b = parseDay(h.end);
    if (!a || !b) return 0;
    for (let d = a; d <= b && n < 400; d = addDays(d, 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++;
    return n;
  }
  function holidaysSection(){
    const s = section("calendar", "Holidays",
      "Half terms, INSET days, bank holidays: anything from one day upwards. There are no lessons on a holiday, " +
      "and a week that is all holiday does not count as Week A or Week B.");
    const list = el("div","tt-list");
    const today = isoDay(new Date());
    const hols = tt.holidays.slice().sort((a, b) => a.start.localeCompare(b.start));
    if (!hols.length) list.appendChild(el("p","hint","No holidays yet."));
    hols.forEach(h => {
      const row = el("div","tt-line tt-hol" + (h.end < today ? " past" : ""));
      const name = el("input","tt-in tt-hname");
      name.type = "text"; name.value = h.name; name.maxLength = 40; name.placeholder = "Name";
      name.setAttribute("aria-label", "Holiday name");
      name.addEventListener("change", () => { h.name = name.value.trim() || "Holiday"; save(); paintHome(); });
      const from = dateIn(h.start, "First day");
      const to = dateIn(h.end, "Last day");
      const fix = () => {
        if (!from.value) return;
        h.start = from.value;
        h.end = to.value && to.value >= from.value ? to.value : from.value;
        save(); paintEditor(); paintHome();
      };
      from.addEventListener("change", fix);
      to.addEventListener("change", fix);
      const n = schoolDaysIn(h);
      const count = el("span","tt-count", n === 1 ? "1 day" : n + " days");
      const x = el("button","btn-ghost iconbtn","\u{1F5D1}");
      x.type = "button"; x.title = "Remove " + h.name;
      x.addEventListener("click", () => {
        const was = JSON.stringify(tt.holidays);
        tt.holidays = tt.holidays.filter(q => q.id !== h.id);
        save(); paintEditor(); paintHome();
        toast(h.name + " removed", { action:"Undo", onAction: () => {
          tt.holidays = JSON.parse(was); save(); paintEditor(); paintHome();
        } });
      });
      row.appendChild(name);
      row.appendChild(from);
      row.appendChild(el("span","tt-dash","to"));
      row.appendChild(to);
      row.appendChild(count);
      row.appendChild(x);
      list.appendChild(row);
    });
    s.appendChild(list);
    const addBtn = el("button","btn-ghost bmini2","+ Add a holiday");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      const d = isoDay(new Date());
      tt.holidays.push({ id: newId("h"), name: "Holiday", start: d, end: d });
      save();
      paintEditor().then(() => {
        /* the new one sorts by its date, which is today, so find it that way */
        const fresh = Array.from($("ttBody").querySelectorAll(".tt-hname"))
          .find(r => r.value === "Holiday" && r.closest(".tt-line").querySelector(".tt-date").value === d);
        if (fresh){ fresh.focus(); fresh.select(); }
      });
    });
    s.appendChild(addBtn);
    return s;
  }
  function dateIn(value, label){
    const i = el("input","tt-in tt-date");
    i.type = "date"; i.value = value || "";
    i.setAttribute("aria-label", label);
    return i;
  }

  /* ================= Home: the dashboard ================= */
  let paintNo = 0, clock = null;
  function greeting(){
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }
  function dashOn(){ return !OFFLINE && (!UI || UI.pref("homeDash")); }
  function clearHome(){
    const v = $("homeView");
    if (v) v.classList.remove("homedash");
    ["homeGreet","homeDash"].forEach(id => { const e = $(id); if (e) e.remove(); });
    clearInterval(clock); clock = null;
  }
  function holders(){
    const v = $("homeView");
    v.classList.add("homedash");
    let greet = $("homeGreet");
    if (!greet){
      greet = el("div","home-greet"); greet.id = "homeGreet";
      const head = v.querySelector(".viewhead") || v.querySelector("h2");
      if (head && head.nextSibling) v.insertBefore(greet, head.nextSibling); else v.appendChild(greet);
    }
    let dash = $("homeDash");
    if (!dash){ dash = el("div","classdash homedash-grid"); dash.id = "homeDash"; v.appendChild(dash); }
    return { greet, dash };
  }
  async function paintHome(){
    if (!dashOn()){ clearHome(); return; }
    const v = $("homeView");
    if (!v || v.hidden) return;
    const { greet, dash } = holders();
    const no = ++paintNo;
    const signedIn = typeof TOKEN !== "undefined" && !!TOKEN;
    const entry = document.body.classList.contains("entry-open");
    /* Behind the sign-in there is nobody to show anything for yet, so it is
       the shape of the dashboard and nothing more. */
    if (!signedIn || (entry && !dash.dataset.painted)){
      greet.innerHTML = "";
      greet.appendChild(el("p","home-date", longDate(new Date())));
      dash.innerHTML = "";
      if (UI) dash.appendChild(UI.skeleton("tiles", 4));
      return;
    }
    if (entry) return;                     // keep what is there under the picker
    if (!dash.dataset.painted){ dash.innerHTML = ""; if (UI) dash.appendChild(UI.skeleton("tiles", 4)); }
    await load();
    if (no !== paintNo) return;
    paintGreet(greet);
    /* Today first, from the timetable alone, so the most useful panel is up
       before anything has been asked of the server. */
    dash.innerHTML = "";
    dash.dataset.painted = "1";
    const today = panel(dash, "calendar", "Today");
    today.id = "dashToday";
    paintToday(today);
    const live = panel(dash, "eye", "Live now");
    const soon = panel(dash, "bell", "Coming up");
    const needs = panel(dash, "key", "Needs you");
    [live, soon, needs].forEach(p => p.appendChild(UI ? UI.skeleton("lines", 3) : waiting("Loading")));
    clearInterval(clock);
    clock = setInterval(() => {
      const t = $("dashToday");
      if (!t || $("homeView").hidden) return;
      paintToday(t);
      paintGreet($("homeGreet"));
    }, 60000);

    let resets = [];
    await Promise.all([
      loadCatalogue().catch(() => {}),
      fetch(API + "/api/teacher/resets", { headers: H(), cache:"no-store" }).then(r => r.json())
        .then(d => { resets = d.requests || []; }).catch(() => {})
    ]);
    if (no !== paintNo) return;
    const mine = new Set(classList().map(n => String(n).toLowerCase()));
    const ours = (name) => !who() || mine.has(String(name || "").toLowerCase());
    paintLive(live, ours);
    paintSoon(soon, ours);
    paintNeeds(needs, resets.filter(x => ours(x.group_name)));
  }
  function panel(dash, icon, title){
    const p = el("section","dash-panel");
    const h = el("h3","dash-head");
    h.innerHTML = ic(icon, 18);
    h.appendChild(el("span","", title));
    p.appendChild(h);
    dash.appendChild(p);
    return p;
  }
  function count(p, n){
    const h = p.querySelector(".dash-head");
    let c = h.querySelector(".dash-count");
    if (!c){ c = el("span","dash-count"); h.appendChild(c); }
    c.textContent = String(n);
  }
  function body(p){
    Array.from(p.children).forEach(k => { if (!k.classList.contains("dash-head")) k.remove(); });
  }
  const btn = (words, cls, fn) => { const b = el("button", cls || "btn-ghost bmini2", words); b.type = "button"; b.addEventListener("click", fn); return b; };
  function row(p, words, sub, buttons, extra){
    const r = el("div","dash-row" + (extra ? " " + extra : ""));
    const t = el("div","dash-words");
    t.appendChild(el("b","", words));
    if (sub) t.appendChild(el("span","", sub));
    r.appendChild(t);
    (buttons || []).forEach(b => r.appendChild(b));
    p.appendChild(r);
    return r;
  }

  function paintGreet(greet){
    if (!greet || !tt) return;
    greet.innerHTML = "";
    const name = who() ? ((typeof teacherNames === "object" && teacherNames[who()]) || who()) : "";
    greet.appendChild(el("p","home-hello", greeting() + (name ? ", " + name : "")));
    const line = el("p","home-date", longDate(new Date()));
    const now = new Date();
    const plan = dayPlan(tt, now);
    const w = weekOf(tt, now);
    if (plan.kind === "holiday") line.appendChild(el("span","home-chip hol", plan.holiday.name));
    else if (w === null) line.appendChild(el("span","home-chip hol","Holiday week"));
    else if (w) line.appendChild(el("span","home-chip " + (w === "B" ? "b" : "a"), "Week " + w));
    greet.appendChild(line);
  }

  /* ---------- today's lessons ---------- */
  function paintToday(p){
    body(p);
    const now = new Date();
    const head = p.querySelector(".dash-head span:not(.hi-wrap):not(.dash-count)");
    if (!hasLessons(tt)){
      if (head) head.textContent = "Today";
      p.appendChild(el("p","hint","Add your timetable and the classes you teach today will be here, in period order."));
      p.appendChild(btn("Set up your timetable", "btn-primary bmini2", open));
      return;
    }
    const plan = dayPlan(tt, now);
    const mins = now.getHours() * 60 + now.getMinutes();
    let list = plan.list, when = now, label = "Today";
    const done = plan.kind === "school" && list.length &&
                 list.every(x => toMins(x.period.end) !== null && toMins(x.period.end) <= mins);
    if (plan.kind !== "school" || !list.length || done){
      const why = plan.kind === "weekend" ? "No lessons today, it is the weekend."
                : plan.kind === "holiday" ? "No lessons today: " + plan.holiday.name + "."
                : done ? "That is everything for today."
                : "No lessons on your timetable today.";
      p.appendChild(el("p","hint dash-why", why));
      const next = nextSchoolDay(tt, now);
      if (!next){ if (head) head.textContent = "Today"; return; }
      when = next.date;
      list = next.plan.list;
      const tomorrow = isoDay(addDays(now, 1)) === isoDay(when);
      label = tomorrow ? "Tomorrow" : dayName(when);
      p.appendChild(el("p","dash-sub", "Next: " + (tomorrow ? "tomorrow" : longDate(when)) +
        (next.plan.week ? ", Week " + next.plan.week : "")));
      if (!list.length) p.appendChild(el("p","hint","Nothing on your timetable that day."));
    }
    if (head) head.textContent = label;
    count(p, list.filter(x => x.slot.cls).length);
    const isToday = when === now;
    let nextMarked = false;
    list.forEach(x => {
      const a = toMins(x.period.start), b = toMins(x.period.end);
      let state = "";
      if (isToday && a !== null && b !== null){
        if (mins >= b) state = "done";
        else if (mins >= a) state = "now";
        else if (!nextMarked){ state = "next"; nextMarked = true; }
      }
      const r = el("div","dash-row tt-lesson" + (state ? " " + state : ""));
      const time = el("div","tt-when");
      time.appendChild(el("b","", x.period.name || "Period"));
      time.appendChild(el("span","", x.period.start || ""));
      r.appendChild(time);
      const t = el("div","dash-words");
      const title = el("b","", slotName(x.slot));
      if (state === "now") title.appendChild(el("span","home-chip now","Now"));
      if (state === "next") title.appendChild(el("span","home-chip next", a !== null ? "In " + until(a - mins) : "Next"));
      t.appendChild(title);
      const sub = [(x.period.start && x.period.end) ? x.period.start + "–" + x.period.end : "", x.slot.room ? "Room " + x.slot.room : ""]
                  .filter(Boolean).join("  ·  ");
      if (sub) t.appendChild(el("span","", sub));
      r.appendChild(t);
      if (x.slot.cls) r.appendChild(btn("Open", "btn-ghost bmini2", () => openClass(x.slot.cls)));
      p.appendChild(r);
    });
    const foot = el("div","dash-foot");
    foot.appendChild(btn("Edit timetable", "btn-ghost bmini2", open));
    p.appendChild(foot);
  }
  function until(n){
    if (n < 60) return n + " min";
    const h = Math.floor(n / 60), m = n % 60;
    return h + " hr" + (m ? " " + m + " min" : "");
  }

  /* ---------- what is open to students now ---------- */
  const liveNow = (a) => {
    if (!a || !a.published) return false;
    const now = new Date().toISOString();
    if (a.release_at && a.release_at > now) return false;
    if (a.close_on && a.close_on < isoDay(new Date())) return false;
    return true;
  };
  function paintLive(p, ours){
    body(p);
    const live = (assigns || []).filter(a => ours(a.group_name) && liveNow(a));
    count(p, live.length);
    if (!live.length){ p.appendChild(el("p","hint","Nothing is open to your classes at the moment.")); return; }
    const byClass = new Map();
    live.forEach(a => {
      const k = a.group_name;
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k).push(a);
    });
    Array.from(byClass.keys()).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric:true })).slice(0, 8).forEach(g => {
      const list = byClass.get(g);
      const names = list.map(a => titleOf(a.lesson_id));
      row(p, g, names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : ""),
          [btn("Open", "btn-ghost bmini2", () => openClass(g))]);
    });
    if (byClass.size > 8) p.appendChild(el("p","hint","And " + (byClass.size - 8) + " more classes."));
  }

  /* ---------- what is on its way ---------- */
  function paintSoon(p, ours){
    body(p);
    const now = new Date();
    const nowIso = now.toISOString();
    const week = addDays(now, 7).toISOString();
    const items = [];
    (assigns || []).filter(a => ours(a.group_name) && a.published).forEach(a => {
      if (a.release_at && a.release_at > nowIso && a.release_at < week)
        items.push({ at: a.release_at, words: titleOf(a.lesson_id), sub: a.group_name + "  ·  opens " + niceDate(a.release_at) + " at " + hhmm(a.release_at), g: a.group_name });
      else if (liveNow(a) && a.close_on){
        const close = parseDay(a.close_on);
        if (close && close <= addDays(now, 3))
          items.push({ at: a.close_on + "T23:59", words: titleOf(a.lesson_id), sub: a.group_name + "  ·  closes " + niceDate(a.close_on), g: a.group_name });
      }
    });
    items.sort((a, b) => a.at.localeCompare(b.at));
    /* the next holiday, however far off */
    const todayIso = isoDay(now);
    const hol = tt.holidays.filter(h => h.start > todayIso).sort((a, b) => a.start.localeCompare(b.start))[0];
    count(p, items.length);
    if (!items.length && !hol) p.appendChild(el("p","hint","Nothing scheduled for the next seven days."));
    items.slice(0, 6).forEach(x => row(p, x.words, x.sub, [btn("Open", "btn-ghost bmini2", () => openClass(x.g))]));
    if (hol){
      const days = Math.round((parseDay(hol.start) - parseDay(todayIso)) / 86400000);
      if (items.length) p.appendChild(el("p","dash-sub","Next holiday"));
      row(p, hol.name, niceDate(hol.start) + (hol.end !== hol.start ? " to " + niceDate(hol.end) : "") +
          "  ·  in " + days + " day" + (days === 1 ? "" : "s"));
    }
  }

  /* ---------- waiting on the teacher ---------- */
  function paintNeeds(p, resets){
    body(p);
    count(p, resets.length);
    if (!resets.length) p.appendChild(el("p","hint","No password requests from your classes."));
    resets.slice(0, 5).forEach(x => row(p, x.display_name || x.username,
      (x.group_name ? x.group_name + "  ·  " : "") + "wants a new password"));
    if (resets.length) p.appendChild(btn("Password updates", "btn-primary bmini2", () => { const b = $("pwBtn"); if (b) b.click(); }));
    /* a nudge towards the timetable while it is empty */
    if (!hasLessons(tt)){
      p.appendChild(el("p","dash-sub","Timetable"));
      row(p, "Not set up yet", "Home can list the classes you teach today once it is.",
          [btn("Set up", "btn-ghost bmini2", open)]);
    }
  }

  /* ================= hooking in ================= */
  const baseShow = window.show;
  window.show = function(view){
    const out = baseShow.apply(this, arguments);
    if (view === "homeView" || view === "keyView" || view === "whoView") paintHome();
    return out;
  };
  window.addEventListener("hubui", (e) => {
    if (e.detail && e.detail.name === "homeDash"){ const d = $("homeDash"); if (d) delete d.dataset.painted; paintHome(); }
  });
  /* Whatever is on screen already, since the sign-in may have gone up first. */
  if ($("homeView") && !$("homeView").hidden) paintHome();

  window.timetable = { open, paintEditor, paintHome, load,
                       weekOf: (d) => tt ? weekOf(tt, d || new Date()) : undefined,
                       _test: { normal, weekOf, dayPlan, holidayWeek, nextSchoolDay } };
})();
