(() => {
  const spreads = Array.from(document.querySelectorAll(".spread"));
  const progressEl = document.getElementById("progress");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnAction = document.getElementById("btn-action");

  let index = 0;

  function isCover(el) {
    return el.dataset.type === "cover";
  }

  function updateChrome() {
    const total = spreads.length;
    const el = spreads[index];
    const label = isCover(el)
      ? "Cover"
      : el.classList.contains("is-revealed")
        ? `Reveal ${el.dataset.n} / 9`
        : `Peek ${el.dataset.n} / 9`;
    progressEl.textContent = `${label} · ${index + 1}/${total}`;

    btnPrev.disabled = index === 0 && !el.classList.contains("is-revealed");
    btnNext.disabled = index === total - 1 && (isCover(el) || el.classList.contains("is-revealed"));

    if (isCover(el)) {
      btnAction.textContent = "Open book";
      btnAction.disabled = false;
    } else if (!el.classList.contains("is-revealed")) {
      btnAction.textContent = "Reveal";
      btnAction.disabled = false;
    } else if (index < total - 1) {
      btnAction.textContent = "Next page";
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

  function revealCurrent() {
    const el = spreads[index];
    if (isCover(el)) {
      show(index + 1);
      return;
    }
    if (!el.classList.contains("is-revealed")) {
      el.classList.add("is-revealed");
      updateChrome();
    }
  }

  function next() {
    const el = spreads[index];
    if (isCover(el)) {
      show(index + 1);
      return;
    }
    if (!el.classList.contains("is-revealed")) {
      el.classList.add("is-revealed");
      updateChrome();
      return;
    }
    if (index < spreads.length - 1) show(index + 1);
  }

  function prev() {
    const el = spreads[index];
    if (!isCover(el) && el.classList.contains("is-revealed")) {
      el.classList.remove("is-revealed");
      updateChrome();
      return;
    }
    if (index > 0) {
      const prevEl = spreads[index - 1];
      // When going back to a prior spread, show its reveal (already "read")
      if (!isCover(prevEl)) prevEl.classList.add("is-revealed");
      show(index - 1);
    }
  }

  // Clicks on tap zones
  document.querySelectorAll(".tap-zone").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.classList.contains("question-tap") || btn.classList.contains("cover-tap")) {
        revealCurrent();
      } else if (btn.classList.contains("reveal-tap")) {
        next();
      }
    });
  });

  // Clicking the book stage also advances (large tap target)
  document.getElementById("book-shell").addEventListener("click", () => {
    next();
  });

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
      spreads.forEach((s) => s.classList.remove("is-revealed"));
      show(0);
    }
  });

  const params = new URLSearchParams(location.search);
  const start = parseInt(params.get('page') || '0', 10);
  const wantReveal = params.get('reveal') === '1';
  const shell = document.getElementById('book-shell');
  if (wantReveal) shell.classList.add('no-anim');
  show(Number.isFinite(start) ? start : 0);
  if (wantReveal && spreads[index] && spreads[index].dataset.type === 'spread') {
    spreads[index].classList.add('is-revealed');
    updateChrome();
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => shell.classList.remove('no-anim'));
  });
})();
