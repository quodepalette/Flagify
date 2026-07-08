(function () {
  /*** UTILITIES ***/
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => [...el.querySelectorAll(s)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);

  /*** DOM ***/
  const app = qs('#app');
  const progressBar = qs('#progressBar');
  const badgeProgress = qs('#badgeProgress');
  const scoreLine = qs('#scoreLine');
  const flagIndexEl = qs('#flagIndex');
  const flagTotalEl = qs('#flagTotal');
  const flagImg = qs('#flagImg');
  const flagLabel = qs('#flagLabel');
  const choicesEl = qs('#choices');
  const hintCapital = qs('#hintCapital');
  const hintContinent = qs('#hintContinent');
  const btnSkip = qs('#btnSkip');
  const btnReset = qs('#btnReset');
  const btnReview = qs('#btnReview');
  const reviewDialog = qs('#reviewDialog');
  const btnCloseReview = qs('#btnCloseReview');
  const reviewList = qs('#reviewList');
  const btnPracticeWrong = qs('#btnPracticeWrong');
  const btnReturnMain = qs('#btnReturnMain');
  const resumeDialog = qs('#resumeDialog');
  const btnResume = qs('#btnResume');
  const btnNewRun = qs('#btnNewRun');
  const streakEl = qs('#streak');
  const accuracyEl = qs('#accuracy');
  const playedEl = qs('#played');
  const themeToggle = qs('#themeToggle input');
  const practiceBanner = qs('#practiceBanner');
  const flagBox = qs('#flagBox');
  const endCard = qs('#endCard');
  const endEmoji = qs('#endEmoji');
  const endTitle = qs('#endTitle');
  const endSub = qs('#endSub');
  const endScore = qs('#endScore');
  const endAccuracy = qs('#endAccuracy');
  const btnPlayAgain = qs('#btnPlayAgain');
  const btnEndReview = qs('#btnEndReview');
  const srAnnounce = qs('#srAnnounce');
  const stampBadge = qs('#stampBadge');

  const STORAGE_KEY = 'flagship.v1';

  /*** PWA — REGISTER SERVICE WORKER ***/
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .catch((err) => console.warn('Service worker registration failed:', err));
    });
  }
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // Tweens the displayed number instead of snapping straight to the new
  // value — small bit of life for the stat badges without being showy.
  function animateCount(el, toValue, suffix = '') {
    const fromValue = parseInt(el.dataset.count || '0', 10) || 0;
    el.dataset.count = toValue;
    if (prefersReducedMotion || fromValue === toValue) {
      el.textContent = toValue + suffix;
      return;
    }
    const duration = 350;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(fromValue + (toValue - fromValue) * eased);
      el.textContent = val + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /*** GAME STATE ***/
  let countries = [];
  let order = [];
  let index = 0;
  let correct = 0;
  let answered = 0;
  let streak = 0;
  let wrongBank = [];
  let practiceWrong = false;
  let mainBackup = null;
  let finished = false;
  // Practice-mode keeps its own score/streak so it never pollutes the
  // main run's numbers while you're retrying missed flags.
  let practiceCorrect = 0;
  let practiceAnswered = 0;
  let practiceStreak = 0;

  /*** THEME ***/
  const savedTheme = localStorage.getItem('flagship.theme') || 'light';
  document.documentElement.dataset.theme = savedTheme;
  themeToggle.checked = savedTheme === 'dark';
  themeToggle.addEventListener('change', () => {
    const now = themeToggle.checked ? 'dark' : 'light';
    document.documentElement.dataset.theme = now;
    localStorage.setItem('flagship.theme', now);
  });

  /*** DATA FETCH ***/
  // The REST Countries v3.1 endpoint this used to call has been shut down
  // (it now returns { success:false } for every request — see
  // https://restcountries.com/docs/legacy-api-deprecation). The replacement
  // v5 API requires a signed-up API key, which isn't safe to ship in
  // client-side code for a static site. Instead we ship a small local
  // dataset (same fields the game needs) and pull flag images from
  // REST Countries' free, keyless Flag CDN.
  function flagUrls(cca2) {
    const code = cca2.toLowerCase();
    return {
      svg: `https://flags.restcountries.com/v5/svg/${code}.svg`,
      png: `https://flags.restcountries.com/v5/w320/${code}.png`,
    };
  }

  async function fetchCountries() {
    try {
      const res = await fetch('countries-data.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      countries = data
        .map((c) => ({
          cca2: c.cca2,
          name: { common: c.name },
          capital: c.capital ? [c.capital] : [],
          continents: c.region ? [c.region] : [],
          region: c.region,
          flags: flagUrls(c.cca2),
        }))
        .sort((a, b) => a.name.common.localeCompare(b.name.common));
    } catch (err) {
      console.error('Failed to load country data:', err);
      app.hidden = false;
      app.innerHTML =
        '<div class="card" style="padding:2rem; text-align:center;">' +
        "Sorry — we couldn't load the flag data. Please check your connection and refresh the page." +
        '</div>';
      throw err;
    }
  }

  function buildOrder() {
    order = countries.map((c) => c.cca2);
    shuffle(order);
  }

  function save() {
    const payload = {
      order,
      index,
      correct,
      answered,
      streak,
      wrongBank,
      practiceWrong,
      finished,
      mainBackup,
      practiceCorrect,
      practiceAnswered,
      practiceStreak,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    updateProgressBadge();
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function resetAll() {
    correct = 0;
    answered = 0;
    streak = 0;
    index = 0;
    wrongBank = [];
    practiceWrong = false;
    mainBackup = null;
    finished = false;
    practiceCorrect = 0;
    practiceAnswered = 0;
    practiceStreak = 0;
    btnReturnMain.hidden = true;
    btnReturnMain.classList.remove('pulse');
    practiceBanner.hidden = true;
    buildOrder();
    render();
    save();
  }

  function currentCountry() {
    return countries.find((c) => c.cca2 === order[index]);
  }

  function others(count, except) {
    const pool = countries.filter((c) => c.cca2 !== except);
    shuffle(pool);
    return pool.slice(0, count);
  }

  function updateProgressBadge() {
    const numerator = finished ? order.length : index;
    const pct = order.length
      ? Math.round((numerator / order.length) * 100)
      : 0;
    badgeProgress.textContent = pct + '%';
    progressBar.style.width = pct + '%';
  }

  function updateStats() {
    flagIndexEl.textContent = Math.min(index + 1, order.length);
    flagTotalEl.textContent = order.length;
    // While practicing, show the isolated practice numbers so the main
    // run's score never appears to move around underneath you.
    const curCorrect = practiceWrong ? practiceCorrect : correct;
    const curAnswered = practiceWrong ? practiceAnswered : answered;
    const curStreak = practiceWrong ? practiceStreak : streak;
    scoreLine.textContent = `${curCorrect} / ${curAnswered}`;
    const pct = curAnswered ? Math.round((curCorrect / curAnswered) * 100) : 0;
    animateCount(accuracyEl, pct, '%');
    animateCount(playedEl, curAnswered);
    animateCount(streakEl, curStreak, '🔥');
    streakEl.classList.toggle('streakHot', curStreak > 0);
  }

  function setFlag(c) {
    stampBadge.className = 'stampBadge';
    stampBadge.textContent = '';
    flagImg.onerror = () => {
      if (flagImg.src !== c.flags.png) {
        flagImg.src = c.flags.png;
      } else {
        flagImg.onerror = null;
        flagImg.removeAttribute('src');
        flagLabel.textContent = 'Guess the country (flag image unavailable)';
      }
    };
    flagImg.src = c.flags.svg || c.flags.png;
    flagImg.alt = `Flag of ${c.name.common}`;
    flagLabel.textContent = 'Guess the country';
    hintCapital.textContent = Array.isArray(c.capital)
      ? c.capital[0] || '—'
      : c.capital || '—';
    hintContinent.textContent =
      (c.continents && c.continents[0]) || c.region || '—';
  }

  function makeChoices(c) {
    const answers = [c, ...others(2, c.cca2)];
    shuffle(answers);
    choicesEl.innerHTML = '';
    answers.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.dataset.cca2 = opt.cca2;
      b.innerHTML = `<span class="kbd">${i + 1}</span> ${opt.name.common}`;
      b.addEventListener('click', () => pick(opt.cca2, b));
      choicesEl.appendChild(b);
    });
  }

  let locked = false;
  async function pick(code, btn) {
    if (locked) return;
    locked = true;
    const c = currentCountry();
    const nodes = qsa('.choice', choicesEl);
    nodes.forEach((n) => (n.disabled = true));

    const correctBtn = nodes.find((n) => n.dataset.cca2 === c.cca2);
    const isRight = code === c.cca2;
    if (isRight) {
      correctBtn.classList.add('correct');
    } else {
      btn.classList.add('wrong');
      correctBtn.classList.add('correct');
      wrongBank.push({
        code: c.cca2,
        picked: code,
      });
    }

    if (practiceWrong) {
      practiceAnswered++;
      if (isRight) {
        practiceCorrect++;
        practiceStreak++;
      } else {
        practiceStreak = 0;
      }
    } else {
      answered++;
      if (isRight) {
        correct++;
        streak++;
      } else {
        streak = 0;
      }
    }

    srAnnounce.textContent = isRight
      ? `Correct! ${c.name.common}.`
      : `Not quite. The answer was ${c.name.common}.`;

    stampBadge.textContent = isRight ? '✓ Correct' : '✗ Try Again';
    stampBadge.className = 'stampBadge show ' + (isRight ? 'ok' : 'no');
    // force reflow so the animation restarts if the same class is reapplied quickly
    void stampBadge.offsetWidth;

    updateStats();
    save();
    await wait(600);
    next();
    locked = false;
  }

  function next() {
    if (index < order.length - 1) {
      index++;
      render();
      save();
    } else {
      finished = true;
      render();
      save();
    }
  }

  function skip() {
    if (locked || finished) return;
    if (index < order.length - 1) {
      index++;
      render();
      save();
    } else {
      finished = true;
      render();
      save();
    }
  }

  function showEndScreen() {
    flagBox.hidden = true;
    choicesEl.hidden = true;
    endCard.hidden = false;
    hintCapital.textContent = '—';
    hintContinent.textContent = '—';
    btnSkip.disabled = true;

    const curCorrect = practiceWrong ? practiceCorrect : correct;
    const curAnswered = practiceWrong ? practiceAnswered : answered;
    const pct = curAnswered ? Math.round((curCorrect / curAnswered) * 100) : 0;
    endScore.textContent = `${curCorrect} / ${curAnswered}`;
    animateCount(endAccuracy, pct, '%');

    if (practiceWrong) {
      endEmoji.textContent = '💪';
      endTitle.textContent = 'Practice complete!';
      endSub.textContent = 'Hit "Return to Main Game" above to keep going.';
      btnPlayAgain.textContent = '↩ Return to Main Game';
      btnEndReview.hidden = true;
      btnReturnMain.classList.add('pulse');
    } else {
      endEmoji.textContent = '🎉';
      endTitle.textContent = 'All done!';
      endSub.textContent = `You went through every flag — ${pct}% accuracy.`;
      btnPlayAgain.textContent = '🔄 Play Again';
      btnEndReview.hidden = wrongBank.length === 0;
    }
  }

  function render() {
    practiceBanner.hidden = !practiceWrong;
    if (finished) {
      showEndScreen();
      updateStats();
      updateProgressBadge();
      return;
    }
    flagBox.hidden = false;
    choicesEl.hidden = false;
    endCard.hidden = true;
    btnSkip.disabled = false;
    const c = currentCountry();
    if (!c) return;
    setFlag(c);
    makeChoices(c);
    updateStats();
    updateProgressBadge();
  }

  /*** REVIEW MODAL ***/
  function openReview() {
    reviewList.innerHTML = '';
    if (!wrongBank.length) {
      const d = document.createElement('div');
      d.textContent = 'No mistakes yet!';
      d.style.color = 'var(--muted)';
      reviewList.appendChild(d);
    } else {
      const seen = new Set();
      wrongBank
        .slice()
        .reverse()
        .forEach((item) => {
          if (seen.has(item.code)) return;
          seen.add(item.code);
          const c = countries.find((cc) => cc.cca2 === item.code);
          const li = document.createElement('div');
          li.className = 'listItem';
          li.innerHTML = `<div><strong>${c?.name?.common || item.code}</strong>
                                                                    <div style="color:var(--muted); font-size:12px;">
                                                                    Capital: ${
                                                                      Array.isArray(
                                                                        c?.capital
                                                                      )
                                                                        ? c
                                                                            .capital[0] ||
                                                                          '—'
                                                                        : c?.capital ||
                                                                          '—'
                                                                    }
                                                                    • Continent: ${
                                                                      (c?.continents &&
                                                                        c
                                                                          .continents[0]) ||
                                                                      c?.region ||
                                                                      '—'
                                                                    }</div></div>`;
          reviewList.appendChild(li);
        });
    }
    reviewDialog.showModal();
  }

  function practiceWrongOn() {
    if (!wrongBank.length) {
      reviewDialog.close();
      return;
    }
    mainBackup = {
      order: [...order],
      index,
      correct,
      answered,
      streak,
      finished,
    };
    order = [...new Set(wrongBank.map((w) => w.code))];
    index = 0;
    finished = false;
    practiceWrong = true;
    practiceCorrect = 0;
    practiceAnswered = 0;
    practiceStreak = 0;
    btnReturnMain.classList.remove('pulse');
    render();
    save();
    reviewDialog.close();
    btnReturnMain.hidden = false;
  }

  function returnMain() {
    if (mainBackup) {
      ({ order, index, correct, answered, streak, finished } = mainBackup);
      practiceWrong = false;
      practiceCorrect = 0;
      practiceAnswered = 0;
      practiceStreak = 0;
      render();
      save();
      mainBackup = null;
      btnReturnMain.hidden = true;
      btnReturnMain.classList.remove('pulse');
    }
  }

  /*** WIRE UP ***/
  btnSkip.onclick = skip;
  const resetDialog = qs('#resetDialog');
  const btnConfirmReset = qs('#btnConfirmReset');

  btnReset.onclick = () => {
    if (resetDialog) resetDialog.showModal();
  };

  if (btnConfirmReset) {
    btnConfirmReset.onclick = () => {
      resetDialog.close();
      resetAll();
    };
  }

  btnReview.onclick = openReview;
  btnCloseReview.onclick = () => reviewDialog.close();
  btnPracticeWrong.onclick = practiceWrongOn;
  btnReturnMain.onclick = returnMain;
  btnPlayAgain.onclick = () => {
    if (practiceWrong) {
      returnMain();
    } else {
      resetAll();
    }
  };
  btnEndReview.onclick = openReview;
  btnResume.onclick = () => {
    resumeDialog.close();
    render();
  };
  btnNewRun.onclick = () => {
    resumeDialog.close();
    resetAll();
  };

  /*** KEYBOARD SHORTCUTS ***/
  document.addEventListener('keydown', (e) => {
    if (locked || finished) return;
    if (document.querySelector('dialog[open]')) return;
    if (!['1', '2', '3'].includes(e.key)) return;
    const btn = qsa('.choice', choicesEl)[Number(e.key) - 1];
    if (btn && !btn.disabled) btn.click();
  });

  /*** INIT ***/
  (async function init() {
    try {
      await fetchCountries();
    } catch {
      return;
    }
    buildOrder();
    const saved = load();
    if (saved) {
      ({
        order,
        index,
        correct,
        answered,
        streak,
        wrongBank,
        practiceWrong,
        finished,
        mainBackup,
        practiceCorrect,
        practiceAnswered,
        practiceStreak,
      } = saved);
      finished = finished || false;
      mainBackup = mainBackup || null;
      practiceCorrect = practiceCorrect || 0;
      practiceAnswered = practiceAnswered || 0;
      practiceStreak = practiceStreak || 0;
      if (practiceWrong && mainBackup) {
        btnReturnMain.hidden = false;
        if (finished) btnReturnMain.classList.add('pulse');
      }
      resumeDialog.showModal();
    }
    app.hidden = false;
    render();
    save();
  })();
})();

/* MODERN, MINIMAL JS FOR RIPPLE + VISIBILITY + SMOOTH SCROLL
 */

(function () {
  const btn = document.getElementById('backToTopBtn');
  const rippleWrap = btn.querySelector('.ripple-wrap');
  const SHOW_AFTER = 200;
  const SCROLL_OPTIONS = { behavior: 'smooth' };

  function updateVisibility() {
    if (window.scrollY > SHOW_AFTER) {
      btn.classList.add('show');
      btn.setAttribute('aria-hidden', 'false');
    } else {
      btn.classList.remove('show');
      btn.setAttribute('aria-hidden', 'true');
    }
  }

  // CREATE A RIPPLE AT (X, Y) RELATIVE TO THE BUTTON
  function createRipple(x, y, opts = {}) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      btn.animate([{ opacity: 0.95 }, { opacity: 1 }], { duration: 120 });
      return;
    }

    const rect = btn.getBoundingClientRect();
    const cx = x - rect.left;
    const cy = y - rect.top;

    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.left = cx + 'px';
    r.style.top = cy + 'px';

    const s = document.createElement('span');
    s.className = 'ripple stroke';
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';

    rippleWrap.appendChild(r);
    rippleWrap.appendChild(s);

    requestAnimationFrame(() => {
      const maxDim = Math.max(rect.width, rect.height) * 1.9;
      r.style.transform = `translate(-50%, -50%) scale(${maxDim / 12})`;
      r.style.opacity = '0';
      s.style.transform = `translate(-50%, -50%) scale(${maxDim / 14})`;
      s.style.opacity = '0';
    });

    setTimeout(() => {
      r.remove();
      s.remove();
    }, 600);
  }

  function handleClick(ev) {
    const x =
      ev && ev.clientX
        ? ev.clientX
        : btn.getBoundingClientRect().left + btn.offsetWidth / 2;
    const y =
      ev && ev.clientY
        ? ev.clientY
        : btn.getBoundingClientRect().top + btn.offsetHeight / 2;

    createRipple(x, y);

    window.scrollTo({ top: 0, left: 0, behavior: SCROLL_OPTIONS.behavior });
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      const rect = btn.getBoundingClientRect();
      createRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
      window.scrollTo({ top: 0, left: 0, behavior: SCROLL_OPTIONS.behavior });
    }
  }

  function handlePointerDown(e) {
    if (
      e.pointerType &&
      e.pointerType !== 'mouse' &&
      e.pointerType !== 'pen' &&
      e.pointerType !== 'touch'
    )
      return;
    if (e.clientX && e.clientY) {
      createRipple(e.clientX, e.clientY);
    }
  }

  window.addEventListener('scroll', updateVisibility, { passive: true });
  window.addEventListener('load', updateVisibility);
  btn.addEventListener('click', handleClick);
  btn.addEventListener('keydown', handleKey);
  btn.addEventListener('pointerdown', handlePointerDown);

  btn.tabIndex = 0;
  btn.setAttribute('role', 'button');

  updateVisibility();

  window.__backToTop_uninstall = function () {
    window.removeEventListener('scroll', updateVisibility);
    window.removeEventListener('load', updateVisibility);
    btn.removeEventListener('click', handleClick);
    btn.removeEventListener('keydown', handleKey);
    btn.removeEventListener('pointerdown', handlePointerDown);
  };
})();

// AUTO-SET FOOTER YEAR
document.getElementById('year').textContent = new Date().getFullYear();
