/* Folio – interface: library, reader, highlights, stats. */
'use strict';
(() => {
  /* ---------- small helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
    return e;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Language: 'auto' follows the device, otherwise 'en' or 'de'. All text lives in i18n.js.
  const lang = () => (S.lang === 'de' || S.lang === 'en' ? S.lang : (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en');
  const tr = (key, ...args) => {
    const v = I18N[lang()][key] !== undefined ? I18N[lang()][key] : I18N.en[key];
    return typeof v === 'function' ? v(...args) : v !== undefined ? v : key;
  };
  const locale = () => (lang() === 'de' ? 'de-DE' : /^en/i.test(navigator.language || '') ? navigator.language : 'en-US');
  const nf = { format: (n, digits) => Number(n).toLocaleString(locale(), digits == null ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits }) };
  const esc = str => String(str).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  function fmtDur(sec) {
    const m = Math.round(sec / 60);
    if (m < 1) return sec > 0 ? '< 1 min' : '0 min';
    if (m < 60) return m + ' min';
    const hh = Math.floor(m / 60), mm = m % 60;
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const shift = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  };
  const F1 = 'M12.9 2.3c.2 2.6 1.6 4.2 3.1 5.9 1.6 1.8 3.2 3.8 3.2 6.8a7.2 7.2 0 0 1-14.4 0c0-2.3 1-4.2 2.500-5.600.1 1.400.7 2.500 1.700 3.100-.2-3.700.9-7.600 3.900-10.200z';
  const F2 = 'M12 20.6a3.1 3.1 0 0 1-3.100-3.100c0-1.800 1.300-2.700 2.200-4.300.5 1.300 1.100 1.900 2.100 2.800.9.8 1.900 1.500 1.900 2.900A3.100 3.100 0 0 1 12 20.600z';
  let flameN = 0;
  function flame(lit) {
    const id = 'fg' + (++flameN);
    return `<svg class="flame-big" viewBox="0 0 24 24" aria-hidden="true">${lit ? `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-hi)"/></linearGradient></defs>` : ''}<path d="${F1}" style="fill:${lit ? `url(#${id})` : 'var(--surface2)'}"/><path d="${F2}" style="fill:${lit ? 'var(--accent-core)' : 'var(--surface)'}"/></svg>`;
  }

  /* ---------- settings ---------- */
  const FONTS = {
    lora: ['Lora', "'Lora',ui-serif,Georgia,serif"],
    newyork: ['New York', "ui-serif,'New York',Georgia,serif"],
    iowan: ['Iowan', "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif"],
    charter: ['Charter', "Charter,'Bitstream Charter',Georgia,serif"],
    georgia: ['Georgia', 'Georgia,serif'],
    system: ['System', "system-ui,-apple-system,'Inter','Helvetica Neue',sans-serif"],
    avenir: ['Avenir', "'Avenir Next',Avenir,system-ui,sans-serif"],
  };
  // Accent colors: [name, tone for the dark app, tone for the light app]. Shown names come from i18n.js.
  const ACCENTS = {
    brass: ['Brass', '#e3b75e', '#8a6410'], amber: ['Amber', '#f29c52', '#ad4f0c'], coral: ['Coral', '#ff8d7a', '#c03f2c'],
    rose: ['Rose', '#f590b5', '#b73266'], lilac: ['Lilac', '#bda6f7', '#6b4fcf'], ink: ['Ink', '#8eb1ff', '#2f5ccf'],
    sky: ['Sky', '#6fc8f2', '#0d709f'], teal: ['Teal', '#5fd4c6', '#0a776b'], moss: ['Moss', '#93d28c', '#2a7a36'],
    lime: ['Lime', '#cddf6b', '#5d7000'], sand: ['Sand', '#d9c7a8', '#7a6a52'], graphite: ['Graphite', '#e8e2d6', '#2b2723'],
  };
  // Reading page presets: [name, background, text]
  const PAGES = { app: ['Match app'], paper: ['Paper', '#f6f1e7', '#221d18'], sepia: ['Sepia', '#ecdcc0', '#3d2f20'], gray: ['Gray', '#2b2a28', '#d6d0c4'], black: ['Black', '#000000', '#b9b3a7'], custom: ['Custom'] };
  const COLORS = { y: '#f5cf3d', g: '#63c284', b: '#6ea8ee', p: '#ee85ad' };
  const S = {
    lang: 'auto', ui: 'auto', accent: 'brass', page: 'app', pageBg: '#f1e9da', pageFg: '#2a2520',
    font: 'lora', size: 19, lh: 1.6, margin: 24, para: 'space', justify: false, wake: false, goal: 10, hint: true,
    ach: null, goalDay: '', finishedN: 0,
  };
  try { Object.assign(S, JSON.parse(localStorage.getItem('folio.settings') || '{}')); } catch (_) { /* keep defaults */ }
  if (!FONTS[S.font]) S.font = 'lora';
  if (!ACCENTS[S.accent]) S.accent = 'brass';
  if (!PAGES[S.page]) S.page = 'app';
  const saveS = () => { try { localStorage.setItem('folio.settings', JSON.stringify(S)); } catch (_) { /* ignore */ } };

  /* ---------- colors ---------- */
  const rgb = hex => { const x = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join(''); };
  const lum = hex => { const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => S.ui === 'dark' || (S.ui === 'auto' && mqDark.matches);
  const scroller = $('#scroller'), bookEl = $('#book'), readerEl = $('#reader');
  let view = 'library';
  let T = {};
  function applyTheme() {
    const dark = isDark();
    const acc = ACCENTS[S.accent][dark ? 1 : 2];
    T = dark
      ? { bg: mix(acc, '#141312', 0.03), surface: mix(acc, '#201e1c', 0.05), surface2: mix(acc, '#2e2b28', 0.08), fg: '#efe9dd', muted: '#a49c8f', line: 'rgba(255,244,225,.1)', on: '#17130e' }
      : { bg: mix(acc, '#f3efe7', 0.05), surface: mix(acc, '#fefcf8', 0.02), surface2: mix(acc, '#e8e2d6', 0.07), fg: '#201c18', muted: '#6d665b', line: 'rgba(40,30,15,.11)', on: '#ffffff' };
    T.accent = acc;
    let pb, pf;
    if (S.page === 'custom') { pb = S.pageBg; pf = S.pageFg; }
    else if (S.page === 'app') { pb = T.bg; pf = dark ? '#ddd6c8' : T.fg; }
    else { pb = PAGES[S.page][1]; pf = PAGES[S.page][2]; }
    T.pageBg = pb;
    const vars = {
      '--bg': T.bg, '--surface': T.surface, '--surface2': T.surface2, '--fg': T.fg, '--muted': T.muted, '--line': T.line,
      '--accent': acc, '--on-accent': T.on, '--accent-soft': mix(acc, T.surface, dark ? 0.2 : 0.14),
      '--accent-hi': mix('#fff3d0', acc, dark ? 0.45 : 0.3), '--accent-core': mix('#ffffff', acc, 0.66),
      '--h0': T.surface2, '--h1': mix(acc, T.surface2, 0.28), '--h2': mix(acc, T.surface2, 0.5), '--h3': mix(acc, T.surface2, 0.75), '--h4': acc,
      '--page-bg': pb, '--page-fg': pf, '--page-muted': mix(pf, pb, 0.56), '--page-line': mix(pf, pb, 0.17),
      '--rf': FONTS[S.font][1], '--rs': S.size + 'px', '--rl': String(S.lh), '--rm': S.margin + 'px',
    };
    const de = document.documentElement;
    for (const [k, v] of Object.entries(vars)) de.style.setProperty(k, v);
    de.dataset.ui = dark ? 'dark' : 'light';
    readerEl.dataset.page = lum(pb) < 0.3 ? 'dark' : 'light';
    bookEl.classList.toggle('justify', !!S.justify);
    bookEl.classList.toggle('indent', S.para === 'indent');
    $('meta[name="theme-color"]').content = view === 'reader' ? pb : T.bg;
  }
  mqDark.addEventListener('change', applyTheme);

  /* ---------- views, sheets, toast ---------- */
  function show(name) {
    view = name;
    for (const v of ['library', 'reader', 'stats']) {
      const el = $('#' + v);
      const on = v === name;
      if (on && el.hidden) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
      el.hidden = !on;
    }
    $('#tabbar').classList.toggle('away', name === 'reader');
    for (const b of document.querySelectorAll('#tabbar [data-go]')) { if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    $('meta[name="theme-color"]').content = name === 'reader' ? T.pageBg : T.bg;
  }
  let sheetOnClose = null, sheetOutT = 0;
  function openSheet(title, body, opts = {}) {
    const sheet = $('#sheet'), wrap = $('#sheet-wrap');
    const reopen = !wrap.hidden && !wrap.classList.contains('out');
    clearTimeout(sheetOutT);
    wrap.classList.remove('out');
    sheet.textContent = '';
    sheet.append(h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'sheet-done', onclick: closeSheet }, tr('done'))));
    if (opts.tabs) sheet.append(opts.tabs);
    const b = h('div', { class: 'sheet-body' }, body);
    sheet.append(b);
    sheetOnClose = opts.onClose || null;
    hideToast();
    sheet.style.animation = reopen ? 'none' : '';
    wrap.hidden = false;
    return b;
  }
  function closeSheet() {
    const wrap = $('#sheet-wrap');
    if (wrap.hidden || wrap.classList.contains('out')) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const f = sheetOnClose;
    sheetOnClose = null;
    if (f) f();
    R.lastInput = performance.now();
    if (reduced()) { wrap.hidden = true; return; }
    wrap.classList.add('out');
    sheetOutT = setTimeout(() => { wrap.hidden = true; wrap.classList.remove('out'); }, 210);
  }
  const sheetOpen = () => !$('#sheet-wrap').hidden && !$('#sheet-wrap').classList.contains('out');
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); $('#celebrate').hidden = true; } });

  let toastT;
  function toast(msg, sticky) {
    const t = $('#toast');
    t.hidden = true;
    t.textContent = msg;
    void t.offsetWidth;
    t.hidden = false;
    clearTimeout(toastT);
    if (!sticky) toastT = setTimeout(() => { t.hidden = true; }, msg.length > 40 ? 4500 : 1800);
  }
  function hideToast() { clearTimeout(toastT); $('#toast').hidden = true; }

  function seg(options, value, onPick, attr = 'aria-pressed') {
    const box = h('div', { class: 'seg' }, Object.entries(options).map(([k, label]) => h('button', {
      [attr]: String(k === value),
      onclick: ev => { for (const b of box.children) b.setAttribute(attr, String(b === ev.currentTarget)); onPick(k); },
    }, label)));
    return box;
  }

  /* ---------- celebrations ---------- */
  function confetti() {
    if (reduced()) return;
    const c = $('#confetti');
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.hidden = false;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cols = [T.accent, '#f5cf3d', '#63c284', '#6ea8ee', '#ee85ad', T.fg];
    const P = Array.from({ length: 120 }, (_, i) => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 60, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 15 - 3,
      w: Math.random() * 7 + 5, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.45, c: cols[i % cols.length],
    }));
    const t0 = performance.now(), LIFE = 2400;
    (function frame(t) {
      const age = t - t0;
      g.clearRect(0, 0, innerWidth, innerHeight);
      g.globalAlpha = clamp(1 - (age - LIFE * 0.6) / (LIFE * 0.4), 0, 1);
      for (const p of P) {
        p.vy += 0.36; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2 * (0.6 + Math.abs(Math.sin(p.a))));
        g.restore();
      }
      if (age < LIFE) requestAnimationFrame(frame); else c.hidden = true;
    })(t0);
  }
  function celebrate(title, lines) {
    const box = $('#celebrate');
    box.textContent = '';
    const close = () => { box.hidden = true; };
    box.append(h('div', { class: 'cele', role: 'alertdialog', 'aria-label': title },
      h('div', { html: flame(true) }), h('h2', {}, title), lines.map(l => h('p', { html: l })),
      h('button', { class: 'btn', onclick: close }, tr('cele.ok'))));
    box.onclick = e => { if (e.target === box) close(); };
    box.hidden = false;
    confetti();
  }

  /* ---------- stats data ---------- */
  let day = null;
  async function loadDay() {
    const k = dayKey();
    if (!day || day.date !== k) day = (await DB.get('days', k)) || { date: k, seconds: 0, words: 0, books: {} };
    return day;
  }
  function streaks(days) {
    const today = dayKey();
    const met = new Set(days.filter(d => d.met || (d.date === today && d.seconds >= S.goal * 60)).map(d => d.date));
    let cur = 0;
    let k = met.has(today) ? today : shift(today, -1);
    while (met.has(k)) { cur++; k = shift(k, -1); }
    let best = 0, run = 0, prev = null;
    for (const d of Array.from(met).sort()) {
      run = prev && shift(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return { cur, best, met };
  }
  const CATS = {
    time: ['<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4l2.600 1.600"/>'],
    words: ['<path d="M5.500 8h13M5.500 12h13M5.500 16h7.500"/>'],
    streak: [`<path d="${F1}"/>`],
    books: ['<path d="M4.500 6.500c2.500-1 5-1 7.500.6 2.500-1.600 5-1.600 7.500-.6v11c-2.500-1-5-1-7.500.6-2.500-1.600-5-1.600-7.500-.6zM12 7.100v11"/>'],
  };
  const ACH = [
    // [id, category, threshold (seconds / words / days / books), number shown on the medal]
    ['t1', 'time', 3600, 1], ['t10', 'time', 36000, 10], ['t50', 'time', 180000, 50], ['t100', 'time', 360000, 100],
    ['w10', 'words', 1e4, 1e4], ['w100', 'words', 1e5, 1e5], ['w500', 'words', 5e5, 5e5], ['w1000', 'words', 1e6, 1e6],
    ['s3', 'streak', 3, 3], ['s7', 'streak', 7, 7], ['s30', 'streak', 30, 30], ['s100', 'streak', 100, 100],
    ['b1', 'books', 1, 1], ['b5', 'books', 5, 5], ['b10', 'books', 10, 10], ['b25', 'books', 25, 25],
  ];
  const achShort = a => tr('ach.' + a[1] + '.s', a[3]);
  const achLong = a => tr('ach.' + a[1] + '.l', a[3], nf.format(a[3]));
  function achievements(days) {
    const vals = {
      time: days.reduce((a, d) => a + d.seconds, 0), words: days.reduce((a, d) => a + d.words, 0),
      streak: streaks(days).best, books: S.finishedN || 0,
    };
    return { vals, unlocked: ACH.filter(a => vals[a[1]] >= a[2]).map(a => a[0]) };
  }
  let pendingCelebrate = null;
  function celebrateIfDue(days) {
    const finished = pendingCelebrate && pendingCelebrate.finished;
    pendingCelebrate = null;
    const now = achievements(days).unlocked;
    const today = dayKey();
    const tDay = days.find(d => d.date === today);
    const goalMet = !!tDay && (tDay.met || tDay.seconds >= S.goal * 60);
    if (S.ach == null) { S.ach = now; S.goalDay = goalMet ? today : ''; saveS(); if (!finished) return; }
    const fresh = now.filter(id => !S.ach.includes(id));
    const goalNew = goalMet && S.goalDay !== today;
    if (!fresh.length && !goalNew && !finished) return;
    S.ach = now;
    if (goalNew) S.goalDay = today;
    saveS();
    const { cur } = streaks(days);
    const lines = [];
    if (finished) lines.push(tr('cele.youRead', esc(finished)));
    if (goalNew) lines.push(tr('cele.streak', cur));
    for (const id of fresh.slice(0, 3)) lines.push(tr('cele.new', achLong(ACH.find(a => a[0] === id))));
    if (fresh.length > 3) lines.push(tr('cele.moreN', fresh.length - 3));
    celebrate(tr(finished ? 'cele.finished' : goalNew ? 'cele.goal' : 'cele.ach'), lines);
  }

  /* ---------- library ---------- */
  let coverUrls = [];
  function coverEl(b) {
    if (b.cover) {
      const u = URL.createObjectURL(new Blob([b.cover.data], { type: b.cover.type }));
      coverUrls.push(u);
      return { el: h('button', { class: 'cover', 'aria-label': tr('open', b.title) }, h('img', { src: u, alt: '' })), glow: `url("${u}")` };
    }
    let hash = 0;
    for (const c of b.title) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    const hue = hash % 360;
    const g1 = `hsl(${hue} 32% 34%)`, g2 = `hsl(${(hue + 28) % 360} 38% 17%)`;
    return {
      el: h('button', { class: 'cover gen', style: `--g1:${g1};--g2:${g2}`, 'aria-label': tr('open', b.title) }, h('span', { class: 't' }, b.title), h('span', { class: 'a' }, b.author || '')),
      glow: `linear-gradient(160deg, hsl(${hue} 60% 50%), hsl(${(hue + 28) % 360} 60% 30%))`,
    };
  }
  const speedOf = s => (s && s.words > 1500 && s.seconds > 300 ? clamp(s.words / (s.seconds / 60), 120, 500) : 230);
  let firstPaint = true;
  async function renderLibrary() {
    const [books, states, days] = await Promise.all([DB.all('books'), DB.all('state'), DB.all('days')]);
    const st = new Map(states.map(s => [s.bookId, s]));
    books.sort((a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt));
    coverUrls.forEach(u => URL.revokeObjectURL(u));
    coverUrls = [];
    $('#library').classList.toggle('intro', firstPaint);
    firstPaint = false;

    const cur = books.find(b => b.lastOpenedAt && st.has(b.id));
    const hero = $('#hero');
    hero.textContent = '';
    if (cur) {
      const s = st.get(cur.id);
      const pct = Math.round((s.pct || 0) * 100);
      const left = (cur.words || 0) * (1 - (s.pct || 0));
      const c = coverEl(cur);
      const open = () => openBook(cur.id);
      c.el.addEventListener('click', open);
      hero.append(h('section', { class: 'hero', style: `--cover:${c.glow}` },
        h('div', { class: 'hero-glow' }), c.el,
        h('div', { class: 'hero-body' },
          h('h2', { class: 'hero-title' }, cur.title),
          cur.author ? h('div', { class: 'hero-author' }, cur.author) : null,
          h('div', { class: 'hero-chapter' }, pct >= 100 ? tr('hero.finished') : s.chapter || tr('hero.notStarted')),
          h('div', { class: 'track' }, h('i', { style: `width:${Math.max(pct, 1)}%` })),
          h('div', { class: 'hero-meta' }, h('b', {}, tr('pct', pct)), left > 50 && pct < 100 ? h('span', {}, tr('left', fmtDur(left / speedOf(s) * 60))) : null),
          h('button', { class: 'btn', onclick: open }, tr(pct >= 100 ? 'hero.again' : pct > 0 ? 'hero.continue' : 'hero.read'))),
        h('button', { class: 'more', 'aria-label': tr('options', cur.title), html: ICON.more, onclick: () => bookSheet(cur, s) })));
    }
    const rest = books.filter(b => b !== cur);
    const grid = $('#book-grid');
    grid.textContent = '';
    rest.forEach((b, i) => {
      const s = st.get(b.id);
      const pct = s ? Math.round((s.pct || 0) * 100) : 0;
      const c = coverEl(b);
      c.el.addEventListener('click', () => openBook(b.id));
      grid.append(h('div', { class: 'card', style: `--i:${i + 2}` }, c.el,
        pct >= 100 ? h('span', { class: 'badge-done', title: tr('read'), html: ICON.check }) : null,
        s && pct > 0 && pct < 100 ? h('div', { class: 'track' }, h('i', { style: `width:${pct}%` })) : null,
        h('div', { class: 'card-title' }, b.title),
        h('div', { class: 'card-foot' }, h('span', { class: 'card-sub' }, b.author || (s ? '' : tr('new'))),
          h('button', { class: 'more', 'aria-label': tr('options', b.title), html: ICON.more, onclick: () => bookSheet(b, s) }))));
    });
    $('#shelf-head').hidden = !rest.length;
    $('#shelf-head h2').textContent = tr(cur ? 'lib.more' : 'lib.all');
    $('#shelf-n').textContent = rest.length;
    $('#lib-empty').hidden = books.length > 0;

    const { cur: run } = streaks(days);
    $('#streak-n').textContent = run;
    $('#streak-chip').classList.toggle('lit', run > 0);
    $('#streak-chip').setAttribute('aria-label', tr('streak.aria', run));
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    $('#install-hint').hidden = !(ios && !standalone && S.hint);
    if (pendingCelebrate || S.ach == null) celebrateIfDue(days);
  }
  function bookSheet(b, s) {
    let armed = false;
    const del = h('button', { class: 'btn danger', onclick: async () => {
      if (!armed) { armed = true; del.textContent = tr('book.reallyDelete'); return; }
      await DB.del('books', b.id); await DB.del('files', b.id); await DB.del('state', b.id);
      for (const m of await DB.byIndex('marks', 'book', b.id)) await DB.del('marks', m.id);
      closeSheet(); renderLibrary();
    } }, tr('book.delete'));
    const fact = (v, l) => h('div', { class: 'fact' }, h('b', {}, v), h('span', {}, l));
    openSheet(b.title, [
      b.author ? h('p', { class: 'info' }, b.author) : null,
      h('div', { class: 'facts' },
        fact(tr('pct', s ? Math.round((s.pct || 0) * 100) : 0), tr('fact.read')),
        fact(fmtDur(s ? s.seconds : 0), tr('fact.time')),
        fact(nf.format(b.words || 0), tr('fact.words'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => { closeSheet(); openBook(b.id); } }, tr('hero.read')), del),
    ]);
  }

  /* ---------- Import ---------- */
  async function shrinkCover(blob) {
    if (!blob) return null;
    try {
      const bmp = await createImageBitmap(blob);
      const w = Math.min(480, bmp.width), hh = Math.round(bmp.height * w / bmp.width);
      const c = h('canvas', { width: w, height: hh });
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, hh);
      g.drawImage(bmp, 0, 0, w, hh);
      const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
      if (out) return { data: await out.arrayBuffer(), type: 'image/jpeg' };
    } catch (_) { /* fall back to the original image */ }
    return blob.size < 3e6 ? { data: await blob.arrayBuffer(), type: blob.type } : null;
  }
  async function importOne(file, existing) {
    const data = await file.arrayBuffer();
    const epub = await Epub.open(data);
    try {
      const title = epub.title || file.name.replace(/\.epub$/i, '');
      if (existing.some(b => b.title === title && b.author === epub.author && b.size === data.byteLength)) throw Object.assign(new Error('dup'), { code: 'dup' });
      const secWords = await epub.wordCounts();
      const id = uid();
      const meta = {
        id, title, author: epub.author, addedAt: Date.now(), lastOpenedAt: 0, size: data.byteLength,
        secWords, words: secWords.reduce((a, b) => a + b, 0), cover: await shrinkCover(await epub.cover()),
      };
      await DB.put('files', { id, data });
      await DB.put('books', meta);
      existing.push(meta);
    } finally { epub.dispose(); }
  }
  async function importFiles(files) {
    if (!files.length) return;
    if (typeof DecompressionStream === 'undefined') return toast(tr('err.old'));
    toast(files.length > 1 ? tr('import.many', files.length) : tr('import.one'), true);
    const existing = await DB.all('books');
    const errors = [];
    for (const f of files) {
      try { await importOne(f, existing); } catch (e) { errors.push(tr('import.err', f.name, tr('err.' + ((e && e.code) || 'unreadable')))); }
    }
    hideToast();
    if (errors.length) toast(errors.join(' – '));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    renderLibrary();
  }
  const fileIn = $('#file');
  const pick = () => { fileIn.value = ''; fileIn.click(); };
  $('#btn-add').addEventListener('click', pick);
  $('#btn-add-empty').addEventListener('click', pick);
  fileIn.addEventListener('change', () => importFiles(Array.from(fileIn.files)));
  $('#hint-close').addEventListener('click', () => { S.hint = false; saveS(); $('#install-hint').hidden = true; });

  /* =====================================================================
     Reader
     ===================================================================== */
  const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,dd,dt,td,th,figcaption,div';
  const IDLE_MS = 90000;   // after 90 s without scrolling or tapping the reader counts as away
  const WPS = 10;          // words credited per second of reading: at most 600 words a minute
  const BUDGET_CAP = 300;  // reading credit cannot be saved up beyond this many words
  const R = { id: null, meta: null, epub: null, st: null, marks: [], secs: new Map(), first: 0, last: -1, gen: 0, loadingGen: -1,
    budget: 0, lastTick: 0, lastInput: 0, timer: null, tickN: 0, chrome: false, chromeAt: 0, hold: 0, scrubbing: false, dirty: false,
    sel: null, hadSel: false, selGone: 0, back: null, wake: null, finishedNow: false };

  const newState = id => ({ bookId: id, pos: { s: 0, b: 0, o: 0 }, pct: 0, read: {}, done: {}, seconds: 0, words: 0 });
  const nSecs = () => R.epub.spine.length;

  async function openBook(id) {
    const [meta, file] = await Promise.all([DB.get('books', id), DB.get('files', id)]);
    if (!meta || !file) return toast(tr('err.notfound'));
    let epub;
    try { epub = await Epub.open(file.data); } catch (e) { return toast(tr('err.open')); }
    const saved = await DB.get('state', id);
    Object.assign(R, {
      id, meta, epub, st: saved || newState(id), marks: await DB.byIndex('marks', 'book', id),
      budget: 0, lastTick: performance.now(), lastInput: performance.now(), tickN: 0, dirty: true, back: null, finishedNow: false, scrubbing: false,
    });
    await loadDay();
    meta.lastOpenedAt = Date.now();
    DB.put('books', meta);
    bookEl.lang = epub.lang || lang();
    $('#jump-back').hidden = true;
    show('reader');
    setChrome(false);
    await renderFrom(R.st.pos.s, saved ? R.st.pos : null);
    clearInterval(R.timer);
    R.timer = setInterval(tick, 1000);
    persist(true);   // save right away so the book shows as "current" even if the app is closed immediately
    wakeLock();
  }
  async function closeBook() {
    clearInterval(R.timer);
    hideSelBar();
    setChrome(false);
    await persist(true);
    if (R.wake) { try { R.wake.release(); } catch (_) { /* ignore */ } R.wake = null; }
    pendingCelebrate = { finished: R.finishedNow ? R.meta.title : '' };
    R.gen++;
    bookEl.textContent = '';
    R.secs.clear();
    if (R.epub) R.epub.dispose();
    R.id = R.epub = null;
    show('library');
    renderLibrary();
  }
  async function wakeLock() {
    if (!S.wake || !navigator.wakeLock || !R.id || document.hidden) return;
    try { R.wake = await navigator.wakeLock.request('screen'); } catch (_) { /* not available */ }
  }

  /* ----- loading sections ----- */
  async function addSection(i, prepend) {
    const gen = R.gen;
    const sec = await R.epub.section(i);
    const imgs = Array.from(sec.querySelectorAll('img'));
    if (imgs.length) {
      await Promise.race([
        Promise.all(imgs.map(im => (im.decode ? im.decode().catch(() => {}) : null))),
        new Promise(r => setTimeout(r, 2500)),
      ]);
    }
    if (gen !== R.gen) return;
    const blocks = [];
    for (const e of sec.querySelectorAll(BLOCKS)) {
      if (e.querySelector(BLOCKS)) continue;
      const w = Epub.countWords(e.textContent);
      if (w) blocks.push({ el: e, w });
    }
    if (!blocks.length) { const w = Epub.countWords(sec.textContent); if (w) blocks.push({ el: sec, w }); }
    const total = blocks.reduce((a, b) => a + b.w, 0);
    const saved = R.st.read[i];
    const counted = new Set(saved === -1 ? blocks.keys() : saved || []);
    let cw = 0;
    for (const b of counted) if (blocks[b]) cw += blocks[b].w;
    const info = { i, el: sec, blocks, total, counted, cw };
    for (const m of R.marks) if (m.type === 'hl' && m.s === i) wrapRange(sec, m);
    if (prepend) {
      const before = scroller.scrollHeight;
      bookEl.prepend(sec);
      R.first = i;
      $('#top-more').hidden = R.first === 0;
      scroller.scrollTop += scroller.scrollHeight - before;
    } else {
      bookEl.append(sec);
      R.last = i;
      $('#top-more').hidden = R.first === 0;
    }
    R.secs.set(i, info);
    $('#book-end').hidden = R.last < nSecs() - 1;
    if (!total && !R.st.done[i]) R.st.done[i] = true;
  }
  async function maybeLoadMore() {
    if (R.loadingGen === R.gen) return;
    const g = R.gen;
    R.loadingGen = g;
    try {
      while (g === R.gen && R.last < nSecs() - 1 && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < scroller.clientHeight * 2) {
        await addSection(R.last + 1, false);
      }
    } finally { if (R.loadingGen === g) R.loadingGen = -1; }
  }
  async function renderFrom(s, target) {
    flushRead();
    const g = ++R.gen;
    s = clamp(s | 0, 0, nSecs() - 1);
    bookEl.textContent = '';
    R.secs.clear();
    R.first = s; R.last = s - 1;
    $('#top-more').hidden = s === 0;
    $('#book-end').hidden = true;
    scroller.scrollTop = 0;
    R.loadingGen = g;
    try { await addSection(s, false); } finally { if (R.loadingGen === g) R.loadingGen = -1; }
    if (g !== R.gen) return;
    if (target) scrollToTarget(Object.assign({}, target, { s }));
    await maybeLoadMore();
    if (g !== R.gen) return;
    if (target) scrollToTarget(Object.assign({}, target, { s }));
    updatePos();
  }
  $('#btn-prev').addEventListener('click', async () => {
    if (R.first <= 0 || R.loadingGen === R.gen) return;
    const g = R.gen;
    R.loadingGen = g;
    try { await addSection(R.first - 1, true); } finally { if (R.loadingGen === g) R.loadingGen = -1; }
  });

  /* ----- position ----- */
  function scrollToTarget(t) {
    const info = R.secs.get(t.s);
    if (!info) return;
    let e = null, o = 0, padTop = 76;
    if (t.hid) e = info.el.querySelector(`mark[data-hid="${t.hid}"]`);
    else if (t.frag) e = info.el.querySelector(`[data-id="${CSS.escape(t.frag)}"]`);
    else if (t.frac != null && info.blocks.length) {
      const goal = t.frac * info.total;
      let acc = 0, b = 0;
      while (b < info.blocks.length - 1 && acc + info.blocks[b].w < goal) { acc += info.blocks[b].w; b++; }
      if (b > 0 || R.first !== t.s) { e = info.blocks[b].el; padTop = 34; }
    } else if (t.b != null && info.blocks[t.b]) { e = info.blocks[t.b].el; o = t.o || 0; if (!t.jump) padTop = 0; }
    if (!e) { e = info.el; padTop = 0; if (R.first === t.s && !t.frag && !t.hid && !t.b) { scroller.scrollTop = 0; return; } }
    const r = e.getBoundingClientRect();
    scroller.scrollTop += r.top - scroller.getBoundingClientRect().top + o * r.height - padTop;
  }
  async function goTo(t) {
    R.hold = performance.now();
    if (R.secs.has(t.s)) { scrollToTarget(t); updatePos(); } else await renderFrom(t.s, t);
    R.chromeAt = R.backAt = scroller.scrollTop;
    R.hold = performance.now();
  }
  function secPrefix(i) { let n = 0; for (let k = 0; k < i; k++) n += R.meta.secWords[k] || 0; return n; }
  function locate(p) {
    const sw = R.meta.secWords, tw = R.meta.words || 0;
    if (!tw) { const x = p * nSecs(); const i = clamp(Math.floor(x), 0, nSecs() - 1); return { i, frac: x - i }; }
    let rest = p * tw, i = 0;
    while (i < nSecs() - 1 && rest > (sw[i] || 0)) { rest -= sw[i] || 0; i++; }
    return { i, frac: sw[i] ? clamp(rest / sw[i], 0, 1) : 0 };
  }
  function updatePos() {
    if (!R.id) return;
    const top = scroller.getBoundingClientRect().top;
    for (let i = R.first; i <= R.last; i++) {
      const info = R.secs.get(i);
      if (!info) continue;
      const r = info.el.getBoundingClientRect();
      if (r.bottom <= top + 1 && i < R.last) continue;
      const bl = info.blocks;
      let lo = 0, hi = bl.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (bl[m].el.getBoundingClientRect().bottom > top + 1) hi = m; else lo = m + 1; }
      const b = Math.min(lo, Math.max(0, bl.length - 1));
      let o = 0, frac;
      if (bl.length) {
        const br = bl[b].el.getBoundingClientRect();
        o = clamp((top - br.top) / Math.max(1, br.height), -3, 1);
        let before = 0;
        for (let k = 0; k < b; k++) before += bl[k].w;
        frac = (before + clamp(o, 0, 1) * bl[b].w) / Math.max(1, info.total);
      } else frac = clamp((top - r.top) / Math.max(1, r.height), 0, 1);
      R.st.pos = { s: i, b, o };
      R.st.chapter = chapterTitle(i);
      const tw = R.meta.words || 0;
      let pct = tw ? (secPrefix(i) + frac * (R.meta.secWords[i] || 0)) / tw : (i + frac) / nSecs();
      const atEnd = R.last === nSecs() - 1 && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < scroller.clientHeight * 0.4;
      if (atEnd && !$('#book-end').hidden && $('#book-end').getBoundingClientRect().top < scroller.getBoundingClientRect().bottom) pct = 1;
      R.st.pct = clamp(pct, 0, 1);
      // A book only counts as finished if it was actually read, not when a link jumps to the endnotes
      if (R.st.pct >= 1 && !R.st.finishedAt && R.st.words >= (R.meta.words || 0) * 0.3) { R.st.finishedAt = Date.now(); S.finishedN = (S.finishedN || 0) + 1; saveS(); R.finishedNow = true; }
      R.dirty = true;
      if (R.chrome) updateControls();
      return;
    }
  }
  let scrollRaf = 0, posT = 0;
  scroller.addEventListener('scroll', () => {
    R.lastInput = performance.now();
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!R.id) return;
      if (R.chrome && !R.scrubbing && performance.now() - R.hold > 700 && Math.abs(scroller.scrollTop - R.chromeAt) > 28) setChrome(false);
      if (!$('#jump-back').hidden && performance.now() - R.hold > 700 && Math.abs(scroller.scrollTop - R.backAt) > scroller.clientHeight * 0.5) $('#jump-back').hidden = true;
      maybeLoadMore();
      clearTimeout(posT);
      posT = setTimeout(updatePos, 140);
    });
  }, { passive: true });
  for (const ev of ['pointerdown', 'keydown', 'wheel']) readerEl.addEventListener(ev, () => { R.lastInput = performance.now(); }, { passive: true });

  /* ----- reading time and words actually read -----
     A paragraph is credited once it has been fully on screen and enough reading time
     has passed for it. Each paragraph counts once per book. */
  function credit() {
    const sr = scroller.getBoundingClientRect();
    let got = 0;
    outer:
    for (let i = R.first; i <= R.last; i++) {
      const info = R.secs.get(i);
      if (!info || info.counted.size >= info.blocks.length) continue;
      const r = info.el.getBoundingClientRect();
      if (r.top > sr.bottom) break;
      if (r.bottom < sr.top - sr.height * 1.5) continue;
      const from = i === R.st.pos.s ? Math.max(0, R.st.pos.b - 60) : 0;
      for (let b = from; b < info.blocks.length; b++) {
        if (info.counted.has(b)) continue;
        const br = info.blocks[b].el.getBoundingClientRect();
        if (br.bottom < sr.top - sr.height * 1.5) continue;        // skipped far past: does not count
        const tall = br.height > sr.height * 0.8;
        if (tall ? br.bottom > sr.bottom + br.height * 0.3 : br.bottom > sr.bottom - 2) break outer; // not fully visible yet
        const need = Math.min(info.blocks[b].w, BUDGET_CAP);
        if (R.budget < need) break outer;                           // scrolled too fast: not enough reading time yet
        R.budget -= need;
        info.counted.add(b);
        info.cw += info.blocks[b].w;
        got += info.blocks[b].w;
      }
      if (info.total && info.cw >= info.total * 0.9) R.st.done[i] = true;
    }
    if (got) { R.st.words += got; day.words += got; }
  }
  function tick() {
    if (!R.id) return;
    const now = performance.now();
    let dt = (now - R.lastTick) / 1000;
    R.lastTick = now;
    if (document.hidden || sheetOpen() || now - R.lastInput > IDLE_MS) return;
    dt = Math.min(dt, 2);
    const k = dayKey();
    if (!day || day.date !== k) { if (day) DB.put('days', day); day = { date: k, seconds: 0, words: 0, books: {} }; }
    R.st.seconds += dt;
    day.seconds += dt;
    day.books[R.id] = (day.books[R.id] || 0) + dt;
    if (!day.met && day.seconds >= S.goal * 60) day.met = true;
    R.budget = Math.min(R.budget + dt * WPS, BUDGET_CAP);
    credit();
    R.dirty = true;
    if (++R.tickN % 10 === 0) persist();
  }
  function flushRead() {
    if (!R.st) return;
    for (const [i, info] of R.secs) {
      if (info.counted.size) R.st.read[i] = info.counted.size >= info.blocks.length ? -1 : Array.from(info.counted);
    }
  }
  async function persist(force) {
    if (!R.id || (!R.dirty && !force)) return;
    R.dirty = false;
    flushRead();
    try { await DB.put('state', R.st); if (day) await DB.put('days', day); } catch (_) { /* retried on the next save */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist(true);
    else { R.lastTick = performance.now(); wakeLock(); }
  });
  addEventListener('pagehide', () => persist(true));

  /* ----- controls ----- */
  const scrub = $('#scrub');
  function tocIndex(s) { let k = -1; R.epub.toc.forEach((e, i) => { if (e.s <= s) k = i; }); return k; }
  function chapterTitle(s) { const k = tocIndex(s); return k >= 0 ? R.epub.toc[k].label : R.meta.title; }
  function updateControls() {
    const left = (R.meta.words || 0) * (1 - R.st.pct);
    $('#ctl-chapter').textContent = chapterTitle(R.st.pos.s);
    $('#ctl-pct').textContent = left > 50 ? tr('pctLeft', Math.round(R.st.pct * 100), fmtDur(left / speedOf(R.st) * 60)) : tr('pct', Math.round(R.st.pct * 100));
    if (!R.scrubbing) { scrub.value = Math.round(R.st.pct * 1000); scrub.style.setProperty('--p', R.st.pct * 100 + '%'); }
    $('#btn-bm').classList.toggle('on', !!visibleBm());
    $('#ctl-return').hidden = !R.back;
  }
  function setChrome(on) {
    R.chrome = on;
    R.chromeAt = scroller.scrollTop;
    readerEl.classList.toggle('chrome-on', on);
    if (on && R.id) { updatePos(); updateControls(); }
  }
  scroller.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && bookEl.contains(a)) { e.preventDefault(); return followLink(a); }
    const m = e.target.closest('mark.hl');
    if (m) return hlSheet(m.dataset.hid);
    if (e.target.closest('button')) return;
    const sel = getSelection();
    if ((sel && !sel.isCollapsed) || Date.now() - R.selGone < 500) return;
    setChrome(!R.chrome);
  });
  $('#btn-back').addEventListener('click', closeBook);
  function showJumpBack() {
    const jb = $('#jump-back');
    jb.hidden = false;
    clearTimeout(R.backT);
    R.backT = setTimeout(() => { jb.hidden = true; }, 8000);
  }
  function returnToBack() {
    const t = R.back;
    R.back = null;
    clearTimeout(R.backT);
    $('#jump-back').hidden = true;
    $('#ctl-return').hidden = true;
    if (t) goTo(t).then(() => { if (R.chrome) updateControls(); });
  }
  $('#ctl-return').addEventListener('click', returnToBack);
  scrub.addEventListener('input', () => {
    if (!R.scrubbing) { R.scrubbing = true; updatePos(); R.back = Object.assign({}, R.st.pos); }
    R.hold = performance.now();
    const p = scrub.value / 1000;
    scrub.style.setProperty('--p', p * 100 + '%');
    $('#ctl-chapter').textContent = chapterTitle(locate(p).i);
    $('#ctl-pct').textContent = tr('pct', Math.round(p * 100));
  });
  scrub.addEventListener('change', async () => {
    const { i, frac } = locate(scrub.value / 1000);
    await goTo({ s: i, frac });
    R.scrubbing = false;
    updateControls();
    showJumpBack();
  });

  function followLink(a) {
    const href = a.dataset.href || '';
    if (!href) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      if (/^(https?|mailto):/i.test(href)) window.open(href, '_blank', 'noopener');
      return;
    }
    const sec = a.closest('section.sec');
    const [p, frag] = href.split('#');
    const s = p ? R.epub.spineIndex(Epub.resolve(Epub.dirOf(sec.dataset.path), p)) : +sec.dataset.sec;
    if (s < 0) return;
    updatePos();
    R.back = Object.assign({}, R.st.pos);
    showJumpBack();
    setChrome(false);
    goTo({ s, frag: frag || '' });
  }
  $('#jump-back').addEventListener('click', returnToBack);

  /* ----- highlights ----- */
  const XHTML = 'http://www.w3.org/1999/xhtml';
  function wrapRange(sec, m) {
    const tw = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    const todo = [];
    let pos = 0, n;
    while ((n = tw.nextNode())) {
      const len = n.data.length;
      const a = Math.max(m.start, pos), b = Math.min(m.end, pos + len);
      if (a < b && n.parentNode.namespaceURI === XHTML && n.data.slice(a - pos, b - pos).trim()) todo.push([n, a - pos, b - pos]);
      pos += len;
      if (pos >= m.end) break;
    }
    for (const [node, a, b] of todo) {
      let t = node;
      if (a > 0) t = t.splitText(a);
      if (b - a < t.data.length) t.splitText(b - a);
      const mk = h('mark', { class: 'hl', 'data-hid': m.id, 'data-c': m.color, 'data-n': m.note ? '1' : null });
      t.parentNode.insertBefore(mk, t);
      mk.appendChild(t);
    }
  }
  function unwrap(id) {
    for (const mk of bookEl.querySelectorAll(`mark[data-hid="${id}"]`)) {
      const p = mk.parentNode;
      while (mk.firstChild) p.insertBefore(mk.firstChild, mk);
      mk.remove();
      p.normalize();
    }
  }
  function selInfo() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const rg = sel.getRangeAt(0);
    const start0 = rg.startContainer.nodeType === 1 ? rg.startContainer : rg.startContainer.parentElement;
    const sec = start0 && start0.closest && start0.closest('section.sec');
    if (!sec || !bookEl.contains(sec)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(sec);
    pre.setEnd(rg.startContainer, rg.startOffset);
    const start = pre.toString().length;
    let end;
    if (sec.contains(rg.endContainer)) { pre.setEnd(rg.endContainer, rg.endOffset); end = pre.toString().length; } else end = sec.textContent.length;
    const text = rg.toString().replace(/\s+/g, ' ').trim();
    if (end <= start || !text) return null;
    return { s: +sec.dataset.sec, start, end, text: text.slice(0, 600), rect: rg.getBoundingClientRect() };
  }
  const selbar = $('#selbar');
  function hideSelBar() { selbar.hidden = true; }
  document.addEventListener('selectionchange', () => {
    if (view !== 'reader' || sheetOpen()) return;
    const si = selInfo();
    if (si) {
      R.sel = si; R.hadSel = true;
      const low = si.rect.top + si.rect.height / 2 > innerHeight * 0.55;
      const cls = 'glass ' + (low ? 'at-top' : 'at-bottom');
      if (selbar.className !== cls) selbar.className = cls;
      selbar.hidden = false;
      if (R.chrome) setChrome(false);
    } else {
      if (R.hadSel) { R.hadSel = false; R.selGone = Date.now(); }
      clearTimeout(R.selT);
      R.selT = setTimeout(() => { if (!selInfo()) hideSelBar(); }, 350);
    }
  });
  selbar.addEventListener('pointerdown', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    const si = selInfo() || R.sel;
    if (!si) return;
    const m = { id: uid(), bookId: R.id, type: 'hl', s: si.s, start: si.start, end: si.end, text: si.text, color: btn.dataset.c || 'y', note: '', chapter: chapterTitle(si.s), at: Date.now() };
    R.marks.push(m);
    const info = R.secs.get(m.s);
    if (info) wrapRange(info.el, m);
    getSelection().removeAllRanges();
    R.sel = null; R.selGone = Date.now();
    hideSelBar();
    await DB.put('marks', m);
    if (btn.dataset.note) hlSheet(m.id, true);
  });
  function hlSheet(id, focus) {
    const m = R.marks.find(x => x.id === id);
    if (!m) return;
    setChrome(false);
    const quote = h('p', { class: 'hl-quote', style: `--c:${COLORS[m.color]}` }, m.text);
    const colors = h('div', { class: 'hl-colors' }, Object.keys(COLORS).map(c => h('button', {
      class: 'dot' + (c === m.color ? ' on' : ''), 'data-c': c, 'aria-label': tr('hl.changeColor'),
      onclick: ev => {
        m.color = c;
        for (const d of colors.children) d.classList.toggle('on', d === ev.currentTarget);
        quote.style.setProperty('--c', COLORS[c]);
        for (const mk of bookEl.querySelectorAll(`mark[data-hid="${id}"]`)) mk.dataset.c = c;
        DB.put('marks', m);
      },
    })));
    const ta = h('textarea', { class: 'note-in', placeholder: tr('hl.notePh'), 'aria-label': tr('hl.note') });
    ta.value = m.note || '';
    let removed = false;
    openSheet(tr('hl.title'), [quote, colors, ta,
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: async () => {
        removed = true;
        R.marks = R.marks.filter(x => x.id !== id);
        unwrap(id);
        await DB.del('marks', id);
        closeSheet();
      } }, tr('hl.delete')))],
    { onClose: () => {
      if (removed) return;
      const note = ta.value.trim();
      if (note !== (m.note || '')) {
        m.note = note;
        DB.put('marks', m);
        for (const mk of bookEl.querySelectorAll(`mark[data-hid="${id}"]`)) { if (note) mk.dataset.n = '1'; else delete mk.dataset.n; }
      }
    } });
    if (focus) setTimeout(() => ta.focus(), 60);
  }

  /* ----- bookmarks ----- */
  function visibleBm() {
    const sr = scroller.getBoundingClientRect();
    return R.marks.find(m => {
      if (m.type !== 'bm') return false;
      const info = R.secs.get(m.s);
      const bl = info && info.blocks[m.b];
      if (!bl) return false;
      const r = bl.el.getBoundingClientRect();
      return r.bottom > sr.top + 4 && r.top < sr.bottom - 4;
    });
  }
  $('#btn-bm').addEventListener('click', async () => {
    const ex = visibleBm();
    if (ex) {
      R.marks = R.marks.filter(m => m.id !== ex.id);
      await DB.del('marks', ex.id);
    } else {
      updatePos();
      const { s, b } = R.st.pos;
      const info = R.secs.get(s);
      const text = info && info.blocks[b] ? info.blocks[b].el.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
      const m = { id: uid(), bookId: R.id, type: 'bm', s, b, text, chapter: chapterTitle(s), pct: R.st.pct, at: Date.now() };
      R.marks.push(m);
      await DB.put('marks', m);
    }
    updateControls();
  });

  /* ----- contents / bookmarks / highlights ----- */
  function tocSheet(tab = 'toc') {
    const names = { toc: tr('toc.contents'), bm: tr('toc.bookmarks'), hl: tr('toc.highlights') };
    const tabs = seg(names, tab, k => tocSheet(k), 'aria-selected');
    tabs.classList.add('sheet-tabs');
    const fmtDate = t => new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    const jump = t => { closeSheet(); setChrome(false); goTo(t); };
    const removeBtn = m => h('button', { class: 'del', 'aria-label': tr('delete'), html: ICON.x, onclick: async () => {
      R.marks = R.marks.filter(x => x.id !== m.id);
      if (m.type === 'hl') unwrap(m.id);
      await DB.del('marks', m.id);
      tocSheet(tab);
    } });
    let body;
    if (tab === 'toc') {
      const toc = R.epub.toc.length ? R.epub.toc : R.epub.spine.map((_, i) => ({ label: tr('toc.section', i + 1), s: i, frag: '', depth: 0 }));
      const cur = R.epub.toc.length ? tocIndex(R.st.pos.s) : R.st.pos.s;
      const doneSec = i => R.st.done[i] || (R.meta.secWords[i] || 0) < 10;
      body = h('ul', { class: 'list' }, toc.map((e, k) => {
        let end = nSecs();
        for (let j = k + 1; j < toc.length; j++) if (toc[j].s > e.s) { end = toc[j].s; break; }
        let done = true, any = false;
        for (let i = e.s; i < end; i++) { if (!doneSec(i)) done = false; if (R.st.done[i] && (R.meta.secWords[i] || 0) >= 10) any = true; }
        return h('li', {},
          h('button', { class: 'row' + (k === cur ? ' cur' : ''), style: `padding-left:${e.depth * 16}px`, 'aria-current': k === cur ? 'true' : null,
            onclick: () => jump({ s: e.s, frag: e.frag }) }, e.label),
          done && any ? h('span', { class: 'tick', title: tr('read'), html: ICON.check }) : null);
      }));
      setTimeout(() => { const c = $('#sheet .row.cur'); if (c) c.scrollIntoView({ block: 'center' }); }, 0);
    } else {
      const items = R.marks.filter(m => m.type === tab).sort((a, b) => a.s - b.s || (a.b || a.start || 0) - (b.b || b.start || 0));
      body = items.length ? h('ul', { class: 'list' }, items.map(m => h('li', {},
        h('button', { class: 'row', onclick: () => jump(m.type === 'bm' ? { s: m.s, b: m.b, jump: true } : { s: m.s, hid: m.id }) },
          h('span', { class: 'quote' }, m.type === 'hl' ? h('span', { class: 'swatch', style: `--c:${COLORS[m.color]}` }) : null, m.text || '…'),
          m.note ? h('span', { class: 'note' }, m.note) : null,
          h('span', { class: 'sub' }, [m.chapter, fmtDate(m.at)].filter(Boolean).join(', '))),
        removeBtn(m))))
        : h('p', { class: 'none' }, tr(tab === 'bm' ? 'toc.noBm' : 'toc.noHl'));
    }
    openSheet(R.meta.title, body, { tabs });
  }
  $('#btn-toc').addEventListener('click', () => { setChrome(false); tocSheet(); });

  /* ----- appearance ----- */
  function withAnchor(fn) {
    if (!R.id) { fn(); return; }
    updatePos();
    const pos = Object.assign({}, R.st.pos);
    fn();
    requestAnimationFrame(() => { R.hold = performance.now(); scrollToTarget(pos); });
  }
  const change = fn => withAnchor(() => { fn(); saveS(); applyTheme(); });
  function stepper(label, get, set, fmt) {
    const out = h('output', {}, fmt(get()));
    const mk = (txt, dir, aria) => h('button', { 'aria-label': aria, onclick: () => { change(() => set(dir)); out.textContent = fmt(get()); } }, txt);
    return h('div', { class: 'set' }, h('span', {}, label), h('div', { class: 'stepper' }, mk('−', -1, tr('set.smaller', label)), out, mk('+', 1, tr('set.larger', label))));
  }
  function toggle(label, key, after) {
    const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!S[key]), 'aria-label': label, onclick: () => {
      change(() => { S[key] = !S[key]; });
      sw.setAttribute('aria-checked', String(!!S[key]));
      if (after) after();
    } });
    return h('div', { class: 'set' }, h('span', {}, label), sw);
  }
  function settingsSheet() {
    const group = (title, ...kids) => h('div', { class: 'group' }, title ? h('h3', {}, title) : null, kids);
    const press = (box, el) => { for (const b of box.children) b.setAttribute('aria-pressed', String(b === el)); };

    const preview = R.id ? null : h('div', { class: 'preview' },
      h('p', {}, tr('preview.1')),
      h('p', {}, tr('preview.2')));
    const syncPreview = () => { if (preview) { preview.classList.toggle('indent', S.para === 'indent'); preview.classList.toggle('justify', !!S.justify); } };
    syncPreview();

    const accents = h('div', { class: 'accents' }, Object.keys(ACCENTS).map(k => h('button', {
      class: 'accent', 'aria-label': tr('accent.' + k), 'aria-pressed': String(S.accent === k), 'data-k': k, html: ICON.check,
      onclick: ev => { press(accents, ev.currentTarget); change(() => { S.accent = k; }); paintAccents(); paintPages(); },
    })));
    const paintAccents = () => { for (const b of accents.children) { const a = ACCENTS[b.dataset.k]; b.style.setProperty('--c', a[isDark() ? 1 : 2]); b.style.setProperty('--oc', isDark() ? '#17130e' : '#fff'); } };

    const pickers = h('div', { class: 'pickers' });
    const mkPicker = (label, key) => {
      const inp = h('input', { type: 'color', value: S[key], 'aria-label': label });
      inp.addEventListener('input', () => { S[key] = inp.value; saveS(); applyTheme(); paintPages(); });
      return h('label', { class: 'picker' }, inp, label);
    };
    pickers.append(mkPicker(tr('set.bg'), 'pageBg'), mkPicker(tr('set.text'), 'pageFg'));
    const pages = h('div', { class: 'swatches' }, Object.keys(PAGES).map(k => h('button', {
      class: 'swatch-btn', 'aria-pressed': String(S.page === k), 'data-k': k,
      onclick: ev => { press(pages, ev.currentTarget); change(() => { S.page = k; }); paintPages(); },
    }, h('i', {}, 'Aa'), tr('page.' + k))));
    const paintPages = () => {
      for (const b of pages.children) {
        const k = b.dataset.k;
        const [bg, fg] = k === 'app' ? [T.bg, T.fg] : k === 'custom' ? [S.pageBg, S.pageFg] : [PAGES[k][1], PAGES[k][2]];
        b.firstChild.style.cssText = `background:${bg};color:${fg}`;
      }
      pickers.hidden = S.page !== 'custom';
    };

    const fonts = h('div', { class: 'fonts' }, Object.entries(FONTS).map(([k, [name, stack]]) => h('button', {
      class: 'font', style: `font-family:${stack}`, 'aria-pressed': String(S.font === k),
      onclick: ev => { press(fonts, ev.currentTarget); change(() => { S.font = k; }); },
    }, name)));

    openSheet(tr('set.title'), [
      preview,
      group(tr('set.app'), seg({ auto: tr('set.auto'), light: tr('set.light'), dark: tr('set.dark') }, S.ui, k => { change(() => { S.ui = k; }); paintAccents(); paintPages(); })),
      group(tr('set.accent'), accents),
      group(tr('set.page'), pages, pickers),
      group(tr('set.font'), fonts),
      group('', h('div', { class: 'rows' },
        stepper(tr('set.size'), () => S.size, d => { S.size = clamp(S.size + d, 13, 32); }, v => v + ' px'),
        stepper(tr('set.lh'), () => S.lh, d => { S.lh = clamp(Math.round((S.lh + d * 0.1) * 10) / 10, 1.2, 2.2); }, v => nf.format(v, 1)),
        stepper(tr('set.margin'), () => S.margin, d => { S.margin = clamp(S.margin + d * 4, 8, 56); }, v => v + ' px'),
        h('div', { class: 'set' }, h('span', {}, tr('set.para')), seg({ space: tr('set.space'), indent: tr('set.indent') }, S.para, k => { change(() => { S.para = k; }); syncPreview(); })),
        toggle(tr('set.justify'), 'justify', syncPreview),
        navigator.wakeLock ? toggle(tr('set.wake'), 'wake', () => { if (S.wake) wakeLock(); else if (R.wake) { R.wake.release(); R.wake = null; } }) : null)),
      group(tr('set.language'), seg({ auto: tr('set.auto'), en: 'English', de: 'Deutsch' }, S.lang, k => {
        S.lang = k;
        saveS();
        applyLang();
        settingsSheet();   // rebuild this sheet in the new language
      })),
    ]);
    paintAccents();
    paintPages();
  }
  $('#btn-aa').addEventListener('click', () => { setChrome(false); settingsSheet(); });
  $('#btn-settings').addEventListener('click', settingsSheet);

  /* =====================================================================
     Stats
     ===================================================================== */
  function ring(size, r, sw, frac, extra = '') {
    const c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${sw}"/><circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${sw}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-to="${c * (1 - clamp(frac, 0, 1))}"${frac > 0.004 ? '' : ' stroke-opacity="0"'}/>${extra}</svg>`;
  }
  function runRings(root) {
    const go = () => { for (const c of root.querySelectorAll('.ring-fg')) c.style.strokeDashoffset = c.dataset.to; };
    if (reduced()) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
  }
  function countUp(el, to, fmt) {
    if (reduced() || to <= 0) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), D = 800;
    (function f(t) {
      const k = clamp((t - t0) / D, 0, 1);
      el.textContent = fmt(to * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }
  async function renderStats(animate = true) {
    const [days, states, books] = await Promise.all([DB.all('days'), DB.all('state'), DB.all('books')]);
    const body = $('#stats-body');
    const keepScroll = $('#stats').scrollTop;
    body.textContent = '';
    body.className = 'stack' + (animate ? ' pop-in' : '');
    const today = dayKey();
    const byDate = new Map(days.map(d => [d.date, d]));
    const tDay = byDate.get(today) || { seconds: 0, words: 0 };
    const { cur, best, met } = streaks(days);
    const goalSec = S.goal * 60;
    const wd = date => date.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '');
    const fmtDay = k => (k === today ? tr('today') : keyDate(k).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));

    // streak
    const week = h('div', { class: 'week', role: 'img', 'aria-label': tr('st.week') });
    for (let n = -6; n <= 0; n++) {
      const k = shift(today, n), d = byDate.get(k);
      const ok = met.has(k);
      const inner = ok ? '<circle class="fill" cx="17" cy="17" r="15.500"/><path d="M11.500 17.500l3.700 3.700 7.300-7.700"/>' : '';
      week.append(h('span', { class: (ok ? 'met ' : '') + (n === 0 ? 'today' : ''), html: ring(34, 13.5, 4, ok ? 0 : (d ? d.seconds / goalSec : 0), inner) + wd(keyDate(k)) }));
    }
    const num = h('span', {}, String(cur));
    body.append(h('section', { class: 'panel streak' + (cur > 0 ? ' lit' : '') },
      h('div', { html: flame(cur > 0) }),
      h('div', {},
        h('div', { class: 'streak-num' }, num, h('small', {}, tr('st.inRow', cur))),
        h('div', { class: 'streak-sub' }, cur > 0 ? (met.has(today) ? tr('st.doneToday', best) : tr('st.keep')) : best > 0 ? tr('st.restart', best) : tr('st.start'))),
      week));
    if (animate) countUp(num, cur, v => String(Math.round(v)));

    // today
    const minsToday = tDay.seconds / 60;
    const leftSec = Math.max(0, goalSec - tDay.seconds);
    const GOALS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
    const gStep = dir => () => { S.goal = GOALS[clamp((GOALS.indexOf(S.goal) < 0 ? 1 : GOALS.indexOf(S.goal)) + dir, 0, GOALS.length - 1)]; saveS(); renderStats(false); };
    body.append(h('section', { class: 'panel' }, h('h2', {}, tr('today')), h('div', { class: 'today-grid' },
      h('div', { class: 'goal-ring', role: 'img', 'aria-label': tr('st.goalAria', Math.floor(minsToday), S.goal) },
        h('div', { html: ring(124, 52, 11, tDay.seconds / goalSec) }), h('div', { class: 'gr-num' }, h('b', {}, String(Math.floor(minsToday))), h('span', {}, tr('st.ofMin', S.goal)))),
      h('div', { class: 'today-side' },
        h('p', { html: leftSec > 0 ? tr('st.toGoal', fmtDur(leftSec)) : tr('st.goalDone') }),
        h('p', { html: tr('st.wordsRead', nf.format(Math.round(tDay.words))) }),
        h('div', { class: 'stepper' }, h('button', { 'aria-label': tr('st.goalDown'), onclick: gStep(-1) }, '−'), h('output', {}, tr('st.goal', S.goal)), h('button', { 'aria-label': tr('st.goalUp'), onclick: gStep(1) }, '+'))))));

    // totals
    const totalSec = days.reduce((a, d) => a + d.seconds, 0);
    const totalWords = days.reduce((a, d) => a + d.words, 0);
    const speed = totalSec > 300 && totalWords > 500 ? Math.round(totalWords / (totalSec / 60)) : 0;
    const tile = (to, fmt, l) => { const v = h('div', { class: 'v' }, fmt(to)); if (animate) countUp(v, to, fmt); return h('div', { class: 'tile' }, v, h('div', { class: 'l' }, l)); };
    body.append(h('div', { class: 'tiles' },
      tile(totalSec, v => (v >= 3600 ? nf.format(v / 3600, 1) + ' h' : Math.round(v / 60) + ' min'), tr('st.totalTime')),
      tile(totalWords, v => nf.format(Math.round(v)), tr('st.words')),
      tile(speed, v => (speed ? nf.format(Math.round(v)) : '–'), tr('st.wpm')),
      tile(days.filter(d => d.seconds >= 60).length, v => String(Math.round(v)), tr('st.days'))));

    // calendar: one hue, stronger means more reading (steps are relative to the daily goal)
    const WEEKS = 16;
    const dow = (keyDate(today).getDay() + 6) % 7;       // Monday = 0
    const start = shift(today, -dow - (WEEKS - 1) * 7);
    const level = d => { const s = d ? d.seconds : 0; return s < 60 ? 0 : s < goalSec / 2 ? 1 : s < goalSec ? 2 : s < goalSec * 2 ? 3 : 4; };
    const readout = h('div', { class: 'readout', 'aria-live': 'polite' });
    const gridEl = h('div', { class: 'heat-grid' });
    const months = h('div', { class: 'heat-months', style: `--weeks:${WEEKS}` });
    let lastMonth = -1;
    const monthMarks = [];
    for (let w = 0; w < WEEKS; w++) {
      for (let r = 0; r < 7; r++) {
        const k = shift(start, w * 7 + r);
        const future = k > today;
        gridEl.append(h('i', { 'data-k': k, 'data-l': future ? null : String(level(byDate.get(k))), class: future ? 'future' : null }));
      }
      const m = keyDate(shift(start, w * 7 + 6)).getMonth();
      if (m !== lastMonth && w < WEEKS - 1) monthMarks.push([w, keyDate(shift(start, w * 7 + 6)).toLocaleDateString(locale(), { month: 'short' }).replace('.', '')]);
      lastMonth = m;
    }
    monthMarks.forEach(([w, name], i) => { if (!monthMarks[i + 1] || monthMarks[i + 1][0] - w >= 3) months.append(h('span', { style: `grid-column:${w + 1}` }, name)); });
    const pickCell = k => {
      for (const c of gridEl.children) c.classList.toggle('sel', c.dataset.k === k);
      const d = byDate.get(k);
      readout.innerHTML = tr('st.readout', fmtDay(k), fmtDur(d ? d.seconds : 0), nf.format(Math.round(d ? d.words : 0)));
    };
    const onPoint = e => { const c = document.elementFromPoint(e.clientX, e.clientY); if (c && c.dataset && c.dataset.k && !c.classList.contains('future') && gridEl.contains(c)) pickCell(c.dataset.k); };
    gridEl.addEventListener('pointerdown', onPoint);
    gridEl.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') onPoint(e); });
    const dayLabels = h('div', { class: 'heat-days', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5, 6].map(i => h('span', {}, i % 2 ? '' : wd(new Date(2024, 0, 1 + i, 12)))));   // 1 Jan 2024 was a Monday
    body.append(h('section', { class: 'panel' }, h('h2', {}, tr('st.cal'), h('small', {}, tr('st.weeks', WEEKS))), readout,
      h('div', { class: 'heat' }, months, dayLabels, gridEl),
      h('div', { class: 'heat-legend', 'aria-hidden': 'true' }, tr('st.less'), [0, 1, 2, 3, 4].map(l => h('i', { style: `background:var(--h${l})` })), tr('st.more'))));
    pickCell(today);

    // achievements
    const { vals, unlocked } = achievements(days);
    const rows = Object.entries(CATS).map(([cat, [icon]]) => {
      let firstLocked = true, idx = 0;
      return h('div', { class: 'ach-row' }, h('div', { class: 'ach-cat' }, tr('cat.' + cat)), ACH.filter(a => a[1] === cat).map(a => {
        const got = vals[cat] >= a[2];
        const prog = !got && firstLocked ? vals[cat] / a[2] : 0;
        if (!got) firstLocked = false;
        const c = 2 * Math.PI * 20;
        const svg = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="m-fill" cx="22" cy="22" r="${got ? 21 : 17}"/>${got ? '' : `<circle class="ring-bg" cx="22" cy="22" r="20" stroke-width="2.500"/><circle class="ring-fg" cx="22" cy="22" r="20" stroke-width="2.500" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-to="${c * (1 - clamp(prog, 0, 1))}"${prog > 0.004 ? '' : ' stroke-opacity="0"'}/>`}<g class="m-ic" transform="translate(10 10)">${icon}</g></svg>`;
        return h('div', { class: 'medal' + (got ? ' got' : ''), style: `--i:${idx++}`, title: achLong(a) + (got ? tr('st.reached') : ''), html: svg + `<span>${achShort(a)}</span>` });
      }));
    });
    body.append(h('section', { class: 'panel' }, h('h2', {}, tr('st.ach'), h('small', {}, tr('st.of', unlocked.length, ACH.length))), rows));

    // books
    const title = new Map(books.map(b => [b.id, b.title]));
    const list = states.filter(s => s.seconds >= 30 && title.has(s.bookId)).sort((a, b) => b.seconds - a.seconds);
    if (list.length) {
      body.append(h('section', { class: 'panel' }, h('h2', {}, tr('st.books')), h('ul', { class: 'booklist' },
        list.map(s => h('li', {}, h('span', { class: 't' }, title.get(s.bookId)), h('span', { class: 'n' }, fmtDur(s.seconds)),
          h('span', { class: 'w' }, tr('st.bookLine', nf.format(Math.round(s.words)), Math.round((s.pct || 0) * 100))))))));
    }
    body.append(h('p', { class: 'foot' }, tr('st.foot')));
    runRings(body);
    $('#stats').scrollTop = animate ? 0 : keepScroll;
  }
  async function go(name) {
    if (name === view) return;
    if (name === 'stats') await renderStats(true);
    show(name);
    if (name === 'library') renderLibrary();
  }
  for (const b of document.querySelectorAll('#tabbar [data-go]')) b.addEventListener('click', () => go(b.dataset.go));
  $('#streak-chip').addEventListener('click', () => go('stats'));

  /* ---------- language ---------- */
  // Static text in index.html carries data-i18n attributes; everything else is rendered through tr().
  function applyLang() {
    document.documentElement.lang = lang();
    for (const e of document.querySelectorAll('[data-i18n]')) e.textContent = tr(e.dataset.i18n);
    for (const e of document.querySelectorAll('[data-i18n-html]')) e.innerHTML = tr(e.dataset.i18nHtml);
    for (const e of document.querySelectorAll('[data-i18n-aria]')) e.setAttribute('aria-label', tr(e.dataset.i18nAria));
    if (view === 'stats') renderStats(false);
    else if (view === 'library') renderLibrary();
    else if (R.id && R.chrome) updateControls();
  }

  /* ---------- start ---------- */
  applyTheme();
  applyLang();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
