/* ===================================================================
   pyhub.js — everything the built-in Python IDE needs on top of Pyodide.

   Two halves:
     1. window.hubDraw(...)   — the canvas that Python's turtle draws on
     2. window.HUB_PY_BOOT    — Python source run once per Pyodide session:
                                a turtle module, an input() that works in a
                                browser, and a guard against endless loops.

   Nothing here talks to the network or the database.
   =================================================================== */

(function(){
  "use strict";

  /* ---------- the drawing surface ---------- */
  let C = null, ctx = null, W = 0, HGT = 0;

  window.hubTurtleAttach = function(canvas){
    C = canvas || null;
    if (!C){ ctx = null; return; }
    ctx = C.getContext("2d");
    W = C.width; HGT = C.height;
    window.hubTurtleClear();
  };
  window.hubTurtleClear = function(){
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, HGT);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, HGT);
  };
  // turtle coordinates: (0,0) in the middle, y upwards — like real turtle
  function tx(x){ return W/2 + Number(x); }
  function ty(y){ return HGT/2 - Number(y); }

  window.hubDraw = function(op, a, b, c, d, e, f){
    if (!ctx) return;
    if (op === "line"){
      ctx.beginPath();
      ctx.moveTo(tx(a), ty(b));
      ctx.lineTo(tx(c), ty(d));
      ctx.strokeStyle = e || "#3B352C";
      ctx.lineWidth = Number(f) || 2;
      ctx.lineCap = "round";
      ctx.stroke();
    } else if (op === "dot"){
      ctx.beginPath();
      ctx.arc(tx(a), ty(b), Number(c) || 3, 0, Math.PI*2);
      ctx.fillStyle = d || "#3B352C";
      ctx.fill();
    } else if (op === "fill"){
      let pts = [];
      try{ pts = JSON.parse(a); }catch(err){ return; }
      if (pts.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i][0]), ty(pts[i][1]));
      ctx.closePath();
      ctx.fillStyle = b || "#DC8A3E";
      ctx.fill();
    } else if (op === "text"){
      ctx.fillStyle = d || "#3B352C";
      ctx.font = (Number(e) || 14) + "px 'Lexend', sans-serif";
      ctx.fillText(String(c), tx(a), ty(b));
    } else if (op === "bg"){
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = a || "#FFFFFF";
      ctx.fillRect(0, 0, W, HGT);
    }
  };

  /* ---------- Python side ---------- */
  window.HUB_PY_BOOT = `
import sys, io, math, time, types, builtins, json

# ---------------------------------------------------------------- turtle
class _Vec(tuple):
    def __new__(cls, x, y):
        return tuple.__new__(cls, (round(float(x), 6) + 0.0, round(float(y), 6) + 0.0))
    def __repr__(self):
        return "(%.2f,%.2f)" % (self[0], self[1])
    def __str__(self):
        return self.__repr__()

class _HubTurtle:
    def __init__(self):
        self.reset_state()

    def reset_state(self):
        self.x = 0.0
        self.y = 0.0
        self.h = 0.0            # heading, degrees, 0 = east
        self.down = True
        self.col = "#3B352C"
        self.wid = 2.0
        self._poly = None
        self._fillcol = "#DC8A3E"

    # --- movement ---
    def _to(self, nx, ny):
        if self.down:
            _draw("line", self.x, self.y, nx, ny, self.col, self.wid)
        self.x = nx
        self.y = ny
        if self._poly is not None:
            self._poly.append([self.x, self.y])

    def forward(self, dist):
        r = math.radians(self.h)
        self._to(self.x + dist*math.cos(r), self.y + dist*math.sin(r))
    def backward(self, dist):
        self.forward(-dist)
    def right(self, ang):
        self.h = (self.h - ang) % 360
    def left(self, ang):
        self.h = (self.h + ang) % 360
    def goto(self, nx, ny=None):
        if ny is None:
            nx, ny = nx[0], nx[1]
        self._to(float(nx), float(ny))
    def setx(self, nx):
        self._to(float(nx), self.y)
    def sety(self, ny):
        self._to(self.x, float(ny))
    def home(self):
        self._to(0.0, 0.0)
        self.h = 0.0
    def setheading(self, ang):
        self.h = float(ang) % 360
    def circle(self, radius, extent=360):
        radius = float(radius)
        extent = float(extent)
        steps = max(8, int(abs(extent) / 6) + 1)
        step_ang = extent / steps
        step_len = 2 * math.pi * abs(radius) * (abs(step_ang)/360.0)
        for _ in range(steps):
            if radius >= 0:
                self.left(step_ang / 2.0)
                self.forward(step_len)
                self.left(step_ang / 2.0)
            else:
                self.right(step_ang / 2.0)
                self.forward(step_len)
                self.right(step_ang / 2.0)
    def dot(self, size=6, colour=None):
        _draw("dot", self.x, self.y, float(size), colour or self.col)

    # --- pen ---
    def penup(self):
        self.down = False
    def pendown(self):
        self.down = True
    def pensize(self, w=None):
        if w is None:
            return self.wid
        self.wid = float(w)
    def pencolor(self, *a):
        if a:
            self.col = _colour(*a)
        return self.col
    def color(self, *a):
        if a:
            self.col = _colour(a[0])
            self._fillcol = _colour(a[1]) if len(a) > 1 else self.col
        return self.col
    def fillcolor(self, *a):
        if a:
            self._fillcol = _colour(*a)
        return self._fillcol
    def begin_fill(self):
        self._poly = [[self.x, self.y]]
    def end_fill(self):
        if self._poly and len(self._poly) > 2:
            _draw("fill", json.dumps(self._poly), self._fillcol)
        self._poly = None
    def write(self, text, move=False, align="left", font=("Lexend", 14, "normal")):
        size = 14
        try:
            size = float(font[1])
        except Exception:
            pass
        _draw("text", self.x, self.y, str(text), self.col, size)

    # --- position ---
    def position(self):
        return _Vec(self.x, self.y)
    def pos(self):
        return _Vec(self.x, self.y)
    def xcor(self):
        return self.x
    def ycor(self):
        return self.y
    def heading(self):
        return self.h
    def towards(self, nx, ny=None):
        if ny is None:
            nx, ny = nx[0], nx[1]
        return math.degrees(math.atan2(float(ny)-self.y, float(nx)-self.x)) % 360
    def distance(self, nx, ny=None):
        if ny is None:
            nx, ny = nx[0], nx[1]
        return math.hypot(float(nx)-self.x, float(ny)-self.y)

    # --- things that make no sense here, kept so code still runs ---
    def speed(self, *a):
        return 0
    def hideturtle(self):
        pass
    def showturtle(self):
        pass
    def isvisible(self):
        return True
    def clear(self):
        _clear()
    def reset(self):
        _clear()
        self.reset_state()
    def stamp(self):
        return 0
    def shape(self, *a):
        pass
    def undo(self):
        pass

_NAMED = {
    "red": "#D9534F", "blue": "#3D7BD9", "green": "#3E9E62", "yellow": "#E8C33C",
    "orange": "#DC8A3E", "purple": "#8C5BC4", "pink": "#E58AB4", "brown": "#8A6642",
    "black": "#22201C", "white": "#FFFFFF", "grey": "#8A8A8A", "gray": "#8A8A8A",
    "cyan": "#3FBFCF", "magenta": "#CF4FA8", "lime": "#77C43E", "navy": "#2A3E77",
    "gold": "#D9A93C", "silver": "#BFBFBF", "violet": "#9A6BD1", "turquoise": "#3FC5B0",
}
def _colour(*a):
    if len(a) == 3:
        def _c(v):
            v = float(v)
            if v <= 1:
                v = v * 255
            return max(0, min(255, int(v)))
        return "rgb(%d,%d,%d)" % (_c(a[0]), _c(a[1]), _c(a[2]))
    c = a[0]
    if isinstance(c, (tuple, list)) and len(c) == 3:
        return _colour(c[0], c[1], c[2])
    s = str(c).strip()
    return _NAMED.get(s.lower(), s)

class _HubScreen:
    def bgcolor(self, *a):
        if a:
            _draw("bg", _colour(*a))
    def setup(self, *a, **k):
        pass
    def title(self, *a):
        pass
    def tracer(self, *a, **k):
        pass
    def update(self):
        pass
    def exitonclick(self):
        pass
    def mainloop(self):
        pass
    def listen(self):
        pass
    def onkey(self, *a, **k):
        pass
    def onkeypress(self, *a, **k):
        pass
    def onclick(self, *a, **k):
        pass
    def screensize(self, *a, **k):
        pass
    def clear(self):
        _clear()

_screen = _HubScreen()
_default = _HubTurtle()

def _make_turtle_module():
    m = types.ModuleType("turtle")
    m.Turtle = _HubTurtle
    m.Pen = _HubTurtle
    m.Screen = lambda: _screen
    m.getscreen = lambda: _screen
    for name in ["forward", "backward", "right", "left", "goto", "setx", "sety", "home",
                 "setheading", "circle", "dot", "penup", "pendown", "pensize", "pencolor",
                 "color", "fillcolor", "begin_fill", "end_fill", "write", "position", "pos",
                 "xcor", "ycor", "heading", "towards", "distance", "speed", "hideturtle",
                 "showturtle", "clear", "reset", "stamp", "shape", "undo"]:
        setattr(m, name, getattr(_default, name))
    m.fd = _default.forward
    m.bk = _default.backward
    m.back = _default.backward
    m.rt = _default.right
    m.lt = _default.left
    m.pu = _default.penup
    m.pd = _default.pendown
    m.up = _default.penup
    m.down = _default.pendown
    m.setpos = _default.goto
    m.setposition = _default.goto
    m.seth = _default.setheading
    m.width = _default.pensize
    m.bgcolor = _screen.bgcolor
    m.done = lambda *a, **k: None
    m.mainloop = lambda *a, **k: None
    m.exitonclick = lambda *a, **k: None
    m.tracer = lambda *a, **k: None
    m.update = lambda *a, **k: None
    m.title = lambda *a, **k: None
    m.setup = lambda *a, **k: None
    m.listen = lambda *a, **k: None
    m.onkey = lambda *a, **k: None
    m.onkeypress = lambda *a, **k: None
    m.onclick = lambda *a, **k: None
    return m

sys.modules["turtle"] = _make_turtle_module()

def _hub_reset_turtle():
    _default.reset_state()

# ------------------------------------------------------------- input()
_hub_queue = []

def _hub_set_inputs(lines):
    global _hub_queue
    _hub_queue = [x for x in (lines or [])]

class HubNeedsInput(Exception):
    def __init__(self, prompt):
        Exception.__init__(self, prompt)
        self.prompt = prompt

def _hub_input(prompt=""):
    text = str(prompt)
    if _hub_queue:
        value = str(_hub_queue.pop(0))
        print(text + value)
        return value
    # nothing left to answer with: hand control back so the console can ask
    raise HubNeedsInput(text)

builtins.input = _hub_input

# -------------------------------------------------- sleep and endless loops
class HubTooLong(Exception):
    pass

# Almost every module is here, and anything Pyodide keeps as a separate
# download is fetched before the program runs. These few cannot exist in a
# browser tab at all, so say why rather than leaving a bare ModuleNotFoundError.
_NO_MODULE = {
    "tkinter": "tkinter opens desktop windows, which a web page cannot do. Use turtle to draw here.",
    "pygame": "pygame needs a desktop window. Use turtle to draw here.",
    "winsound": "winsound only works in desktop Python on Windows. This editor has no sound.",
    "playsound": "This editor has no sound.",
    "simpleaudio": "This editor has no sound.",
    "msvcrt": "msvcrt is a Windows desktop module. Use input() to read what somebody types.",
    "curses": "curses draws into a terminal window, and this editor does not have one.",
    "termios": "termios needs a terminal window, and this editor does not have one.",
    "pty": "pty needs a terminal window, and this editor does not have one.",
    "tty": "tty needs a terminal window, and this editor does not have one.",
    "socket": "socket opens network connections, which a web page is not allowed to do.",
    "smtplib": "Sending email needs a network connection a web page is not allowed to make.",
    "ftplib": "This needs a network connection a web page is not allowed to make.",
    "subprocess": "This runs other programs on a computer, and there is no computer to run them on here.",
    "multiprocessing": "This starts extra copies of Python, which a web page cannot do.",
}

_deadline = [0.0]
_ticks = [0]
_limit = [10.0]

# ------------------------------------------------ recording what a run did
# JavaScript has one thread. While Python is running, nothing on the page can
# be redrawn, so a real time.sleep froze the whole tab: a program that said
# hello, waited two seconds and then asked a question showed nothing at all
# for two seconds and then everything at once, question included.
#
# So the program is never slowed down while it runs. It runs flat out and
# writes down what it did, in order: text printed, waits asked for, turtle
# drawing. The console plays that list back afterwards, doing the waits in
# JavaScript where the page stays alive and each line arrives when it should.
_events = []
_pending = []

def _flush_text():
    if _pending:
        _events.append(["out", "".join(_pending)])
        del _pending[:]

def _emit(event):
    # text written before this moment has to be pinned down first, or it would
    # play back after the wait it was printed before
    _flush_text()
    _events.append(event)

def _draw(op, *args):
    _emit(["draw", op, list(args)])

def _clear():
    _emit(["clear"])

class _HubOut(io.TextIOBase):
    def write(self, text):
        text = str(text)
        _pending.append(text)
        return len(text)
    def writable(self):
        return True
    def flush(self):
        pass

def _hub_text():
    return "".join([e[1] for e in _events if e[0] == "out"]) + "".join(_pending)

# ---------------------------------------------------------------- waiting
_SLEEP_TOTAL = 20.0   # the most one program may keep the console waiting
_SLEEP_ONE = 10.0     # the most any single wait may take

_sleep_left = [_SLEEP_TOTAL]
_sleep_told = [False]

# The waiting happens after the program has finished, so the real clock knows
# nothing about it and a program that timed itself across a sleep read back
# almost zero. Nudging the clock forward by whatever was asked for gives the
# answer a person would expect. The guard below keeps the real clock on
# purpose, or a sleepy program would look like an endless loop.
_real_time = time.time
_real_monotonic = time.monotonic
_real_perf = time.perf_counter
_clock_shift = [0.0]

def _hub_sleep(seconds):
    try:
        seconds = float(seconds)
    except Exception:
        return
    if seconds <= 0:
        return
    asked = seconds
    seconds = min(seconds, _SLEEP_ONE, max(0.0, _sleep_left[0]))
    if seconds < asked and not _sleep_told[0]:
        _sleep_told[0] = True
        print("(the wait was made shorter so you are not left staring at the screen)")
    if seconds <= 0:
        return
    _sleep_left[0] -= seconds
    _clock_shift[0] += seconds
    _emit(["wait", seconds])

time.sleep = _hub_sleep
time.time = lambda: _real_time() + _clock_shift[0]
time.monotonic = lambda: _real_monotonic() + _clock_shift[0]
time.perf_counter = lambda: _real_perf() + _clock_shift[0]

# --------------------------------------------------------- endless loops
def _hub_guard(frame, event, arg):
    _ticks[0] += 1
    if _ticks[0] % 400 == 0 and _real_time() > _deadline[0]:
        raise HubTooLong("Your program was still running after " + str(int(_limit[0])) + " seconds. Is there a loop that never ends?")
    return _hub_guard

def _hub_run(source, seconds=10.0):
    global _hub_queue
    del _events[:]
    del _pending[:]
    _sleep_left[0] = _SLEEP_TOTAL
    _sleep_told[0] = False
    _clock_shift[0] = 0.0
    _ticks[0] = 0
    _limit[0] = seconds
    _deadline[0] = _real_time() + seconds
    _hub_reset_turtle()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = _HubOut()
    ok = True
    try:
        code = compile(source, "your program", "exec")
        sys.settrace(_hub_guard)
        exec(code, {"__name__": "__main__"})
    except HubNeedsInput as ask:
        sys.settrace(None)
        sys.stdout, sys.stderr = old_out, old_err
        _flush_text()
        return json.dumps({"status": "input", "out": _hub_text(),
                           "events": _events, "prompt": ask.prompt})
    except HubTooLong as stop:
        ok = False
        print("")
        print("--- stopped ---")
        print(str(stop))
    except KeyboardInterrupt as stop:
        ok = False
        print("")
        print(str(stop))
    except ModuleNotFoundError as miss:
        ok = False
        name = str(getattr(miss, "name", "") or "").split(".")[0]
        print("There is no module called " + (name or "that") + " here.")
        if name in _NO_MODULE:
            print(_NO_MODULE[name])
        else:
            print("Check the spelling. Nearly all of Python works here, apart from a few things a web page cannot do.")
    except FileNotFoundError as miss:
        # Without this the traceback filter below leaves only "File your
        # program, line 1", because the line that says what went wrong is the
        # one it drops. A child reading that has nothing at all to go on, and
        # in the practice sandbox, where they upload the file themselves, the
        # answer is nearly always a capital letter in the name.
        ok = False
        print("There is no file called " + str(getattr(miss, "filename", "") or "that") + " here.")
        print("Check the name matches exactly, including capital letters.")
    except SyntaxError as err:
        ok = False
        print("There is a typo in your code on line " + str(err.lineno) + ":")
        print("  " + (err.text or "").rstrip())
        print(str(err.msg))
    except Exception:
        ok = False
        import traceback
        lines = traceback.format_exc().splitlines()
        keep = [l for l in lines if "your program" in l or not l.strip().startswith("File")]
        print("\\n".join(keep[1:] if len(keep) > 1 else keep))
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = old_out, old_err
    _flush_text()
    return json.dumps({"status": "done", "out": _hub_text(),
                       "events": _events, "ok": ok})
`;

  /* ---------- starting Python ----------
     Lived in lesson.html until the practice sandbox wanted the same thing.
     One Pyodide per page however many editors are on it: it is tens of
     megabytes off a CDN and a second copy would be a second download.

     `status` is somewhere to say that Python is coming, usually the console
     the student is looking at. The first run is the slow one. */
  let py = null, coming = null, booted = false;
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";

  function startPyodide(status){
    if (py) return Promise.resolve(py);
    if (!coming){
      if (status) status.textContent = "Loading Python… (first run only)";
      coming = new Promise((done, stop) => {
        const sc = document.createElement("script");
        sc.src = PYODIDE + "pyodide.js";
        sc.onload = done;
        sc.onerror = () => stop(new Error("Could not load Python."));
        document.head.appendChild(sc);
      }).then(() => loadPyodide({ indexURL: PYODIDE }))
        .then((p) => { py = p; return p; });
    }
    return coming;
  }

  /* Pyodide plus the turtle, the input() and the endless-loop guard above,
     which are what make a student's program behave like Python rather than
     like a web page. Run once per page. */
  window.hubPython = {
    async start(status){
      const p = await startPyodide(status);
      if (!booted){ p.runPython(window.HUB_PY_BOOT); booted = true; }
      return p;
    },
    /* Pyodide only starts with part of Python. sqlite3, ssl and lzma sit
       beside it as separate downloads, as does everything past the standard
       library such as numpy, matplotlib and pandas. Without this, "import
       sqlite3" came back as "No module named sqlite3" even though the module
       was on the CDN waiting to be asked for. Reading the imports out of the
       student's own code and fetching whatever they named is what makes those
       work.
       Quiet on failure on purpose: if the download is blocked the run carries
       on and the missing module message above explains it in words a child can
       read, which beats stopping the editor. */
    async loadImports(p, code, status){
      if (!p || typeof p.loadPackagesFromImports !== "function") return;
      try{
        await p.loadPackagesFromImports(code, {
          messageCallback: () => { if (status) status.textContent = "Getting the module you asked for…"; },
          errorCallback: () => {}
        });
      }catch(e){ /* a typo in their code lands here too; the run reports it properly */ }
    }
  };
})();
