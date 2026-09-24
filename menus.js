/* ===================================================================
   menus.js — putting a small menu where it will actually fit.

   Tries below the button, then above, then to the left, then to the
   right. If none of those has room — a very small screen — the menu
   is shown as a pop-up in the middle instead, the way everything else
   behaves on a phone.
   =================================================================== */
(function(){
  "use strict";

  const GAP = 6;

  function fits(space, need){ return space >= need; }

  /* Work out where a menu should go and put it there.
     btn  — the button that opens it
     menu — the menu itself, already filled in and inside a .menuwrap */
  window.placeMenu = function(btn, menu){
    if (!btn || !menu) return "hidden";
    const wrap = menu.parentNode;
    if (wrap && wrap.classList) wrap.classList.remove("up", "left", "right");
    menu.classList.remove("as-modal");
    menu.style.removeProperty("top");
    menu.style.removeProperty("bottom");
    menu.style.removeProperty("left");
    menu.style.removeProperty("right");

    /* Measured at the width its own words want, not the width it happens to
       have been squeezed into. A menu hangs off a button barely wider than an
       icon, so measuring it in place said it needed 32px and every position
       looked like a fit. */
    const wasHidden = menu.hidden;
    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.width = "max-content";
    menu.style.maxWidth = "none";
    const box = btn.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    const need = { h: size.height || 160, w: size.width || 180 };
    menu.style.removeProperty("width");
    menu.style.removeProperty("max-width");
    const room = {
      below: window.innerHeight - box.bottom - GAP,
      above: box.top - GAP,
      left:  box.left - GAP,
      right: window.innerWidth - box.right - GAP
    };
    menu.style.visibility = "";
    if (wasHidden) menu.hidden = true;

    /* Once a menu is as wide as the screen it stops being a menu hanging off
       a button and becomes a pop-up, which is how everything else behaves on
       a phone. */
    if (need.w > window.innerWidth - 24) return "modal";
    if (fits(room.below, need.h)) return "down";          // the usual place
    if (fits(room.above, need.h)){ wrap.classList.add("up"); return "up"; }
    if (fits(room.left, need.w)){ wrap.classList.add("left"); return "left"; }
    if (fits(room.right, need.w)){ wrap.classList.add("right"); return "right"; }
    return "modal";                                        // nowhere to put it
  };

  /* Show the same choices as a pop-up, for when nothing else fits. */
  window.menuAsPopup = function(title, items){
    const back = document.createElement("div");
    back.className = "modal-back";
    const box = document.createElement("div");
    box.className = "modal menu-modal";
    const x = document.createElement("button");
    x.className = "btn-ghost iconbtn modal-x";
    x.textContent = "\u2715";
    x.addEventListener("click", () => back.remove());
    box.appendChild(x);
    if (title){
      const h = document.createElement("h2");
      h.textContent = title;
      box.appendChild(h);
    }
    items.forEach(it => {
      const b = document.createElement("button");
      b.className = "menu-modal-item";
      b.textContent = it[0];
      b.addEventListener("click", () => { back.remove(); it[1](); });
      box.appendChild(b);
    });
    back.appendChild(box);
    back.addEventListener("mousedown", (e) => { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  };

  /* Open a menu, choosing the pop-up when there is no room anywhere.
     items is only needed for the pop-up version. */
  window.openMenu = function(btn, menu, title, items){
    const where = window.placeMenu(btn, menu);
    if (where === "modal" && items && items.length){
      menu.hidden = true;
      window.menuAsPopup(title, items);
      return;
    }
    menu.hidden = false;
  };
})();
