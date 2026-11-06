(() => {
  const spreads = Array.from(document.querySelectorAll(".spread"));
  const progressEl = document.getElementById("progress");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnAction = document.getElementById("btn-action");
  const shell = document.getElementById("book-shell");

  let index = 0;
  let turning = false;

  function isTurned(el) {
    return el.classList.contains("is-turned");
  }

  function updateChrome() {
    const total = spreads.length;
    const el = spreads[index];
    const q = el.dataset.q || "";
    const a = el.dataset.a || "";
    const label = isTurned(el)
      ? `${a} (reveal) · ${index + 1}/${total}`
      : `${q || "Peek"} · ${index + 1}/${total}`;
    progressEl.textContent = label;

    btnPrev.disabled = index === 0 && !isTurned(el);
    btnNext.disabled = index === total - 1 && isTurned(el);

    if (!isTurned(el)) {
      btnAction.textContent = index === 0 ? "Turn page" : "Turn page";
      btnAction.disabled = false;
    } else if (index < total - 1) {
      btnAction.textContent = "Next";
      btnAction.disabled = false;
    } else {
      btnAction.textContent = "The end";
      btnAction.disabled = true;
    }
  }

  function show(i) {
    index = Math.max(0, Math.min(spreads.length - 1, i));
    spreads.forEach((s, n) => {
      s.classList.toggle("active", n === index);
    });
    updateChrome();
  }

  function afterTurn(el, cb) {
    const sheet = el.querySelector(".question-sheet");
    if (!sheet || shell.classList.contains("no-anim")) {
      cb();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sheet.removeEventListener("transitionend", onEnd);
      cb();
    };
    const onEnd = (e) => {
      if (e.target === sheet && e.propertyName === "transform") finish();
    };
    sheet.addEventListener("transitionend", onEnd);
    setTimeout(finish, 850);
  }

  function turnCurrent() {
    const el = spreads[index];
    if (isTurned(el) || turning) return;
    turning = true;
    el.classList.add("is-turned");
    el.querySelector(".question-sheet")?.setAttribute("aria-hidden", "true");
    afterTurn(el, () => {
      turning = false;
      updateChrome();
    });
    updateChrome();
  }

  function unturnCurrent() {
    const el = spreads[index];
    if (!isTurned(el) || turning) return;
    turning = true;
    el.classList.remove("is-turned");
    el.querySelector(".question-sheet")?.setAttribute("aria-hidden", "false");
    afterTurn(el, () => {
      turning = false;
      updateChrome();
    });
    updateChrome();
  }

  function next() {
    if (turning) return;
    const el = spreads[index];
    if (!isTurned(el)) {
      turnCurrent();
      return;
    }
    if (index < spreads.length - 1) {
      show(index + 1);
    }
  }

  function prev() {
    if (turning) return;
    const el = spreads[index];
    if (isTurned(el)) {
      unturnCurrent();
      return;
    }
    if (index > 0) {
      const prevEl = spreads[index - 1];
      prevEl.classList.add("is-turned");
      prevEl.querySelector(".question-sheet")?.setAttribute("aria-hidden", "true");
      show(index - 1);
    }
  }

  document.querySelectorAll(".tap-zone").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      next();
    });
  });

  shell.addEventListener("click", () => next());

  btnPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    prev();
  });
  btnNext.addEventListener("click", (e) => {
    e.stopPropagation();
    next();
  });
  btnAction.addEventListener("click", (e) => {
    e.stopPropagation();
    next();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
      e.preventDefault();
      prev();
    } else if (e.key === "Home") {
      e.preventDefault();
      spreads.forEach((s) => {
        s.classList.remove("is-turned");
        s.querySelector(".question-sheet")?.setAttribute("aria-hidden", "false");
      });
      show(0);
    }
  });

  const params = new URLSearchParams(location.search);
  const start = parseInt(params.get("page") || "0", 10);
  const wantReveal = params.get("reveal") === "1";
  if (wantReveal) shell.classList.add("no-anim");
  show(Number.isFinite(start) ? start : 0);
  if (wantReveal && spreads[index]) {
    spreads[index].classList.add("is-turned");
    spreads[index].querySelector(".question-sheet")?.setAttribute("aria-hidden", "true");
    updateChrome();
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => shell.classList.remove("no-anim"));
  });
})();
