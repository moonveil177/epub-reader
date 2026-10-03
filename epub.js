/* Folio – reading EPUBs: unzip, find contents/chapters/cover, clean up sections.
   Errors carry a `code`; app.js turns it into a message in the user's language. */
'use strict';
const epubError = code => Object.assign(new Error(code), { code });

/* ---------- minimal ZIP reader (uses the browser's built-in decompressor) ---------- */
const Zip = (() => {
  const td = new TextDecoder('utf-8');

  async function inflate(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function open(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    const min = Math.max(0, u8.length - 65557);
    let e = u8.length - 22;
    for (; e >= min; e--) if (dv.getUint32(e, true) === 0x06054b50) break;
    if (e < min) throw epubError('invalid');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const files = new Map();
    const lower = new Map();
    for (let n = 0; n < count && p + 46 <= u8.length; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
      files.set(name, { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) });
      lower.set(name.toLowerCase(), name);
      p += 46 + nl + xl + cl;
    }
    const find = name => files.get(name) || files.get(lower.get(String(name).toLowerCase()));
    async function bytes(name) {
      const f = find(name);
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(start, start + f.csize);
      if (f.method === 0) return raw;
      if (f.method === 8) return inflate(raw);
      throw epubError('compression');
    }
    return { has: n => !!find(n), bytes };
  }
  return { open };
})();

/* ---------- EPUB ---------- */
const Epub = (() => {
  const td = new TextDecoder('utf-8');
  const XLINK = 'http://www.w3.org/1999/xlink';
  const REMOVE = new Set(['script', 'style', 'link', 'meta', 'title', 'base', 'iframe', 'object', 'embed', 'form',
    'input', 'button', 'textarea', 'select', 'audio', 'video', 'noscript', 'template']);
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif' };

  const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
  function resolve(base, href) {
    href = String(href).split('#')[0];
    try { href = decodeURIComponent(href); } catch (_) { /* leave as is */ }
    const parts = (href.startsWith('/') ? href : base + href).split('/');
    const out = [];
    for (const part of parts) {
      if (part === '..') out.pop();
      else if (part && part !== '.') out.push(part);
    }
    return out.join('/');
  }
  const tags = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  function xml(str, type) {
    const doc = new DOMParser().parseFromString(str.replace(/^﻿/, ''), type || 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  }
  const countWords = t => { const m = t.match(/\S+/g); return m ? m.length : 0; };
  function countWordsHtml(src) {
    const t = src.replace(/^[\s\S]*?<body[^>]*>/i, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
      .replace(/&[a-z#0-9]+;/gi, 'x');
    return countWords(t);
  }

  /* From the book's CSS we only keep what carries meaning (italic, bold, centered …).
     Typeface, size, colors and spacing are set by the app, so every book looks equally clean. */
  function flagsOf(st) {
    const f = {};
    let any = false;
    const fs = st.fontStyle;
    if (fs) { f.i = /italic|oblique/.test(fs); any = true; }
    const fw = st.fontWeight;
    if (fw) { f.b = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600; any = true; }
    const ta = st.textAlign;
    if (ta) { f.ta = /center/.test(ta) ? 'center' : /right|end/.test(ta) ? 'right' : ''; any = true; }
    const fv = st.fontVariantCaps || st.fontVariant;
    if (fv) { f.sc = /small-caps/.test(fv); any = true; }
    const tdl = st.textDecorationLine || st.textDecoration;
    if (tdl) { f.u = /underline/.test(tdl); f.s = /line-through/.test(tdl); any = true; }
    const va = st.verticalAlign;
    if (va) { f.va = /super/.test(va) ? 'super' : /sub/.test(va) ? 'sub' : ''; any = true; }
    if (st.display === 'none') { f.hide = true; any = true; } else if (st.display) { f.hide = false; any = true; }
    return any ? f : null;
  }
  function flagRules(cssText) {
    const out = [];
    let sheet;
    try { sheet = new CSSStyleSheet(); sheet.replaceSync(cssText.replace(/@import[^;]*;/gi, '')); } catch (_) { return out; }
    const walk = rules => {
      for (const r of rules) {
        if (r.selectorText && r.style) {
          const f = flagsOf(r.style);
          if (f) out.push([r.selectorText, f]);
        } else if (r.media && r.cssRules) {
          let ok = false;
          try { ok = matchMedia(r.media.mediaText).matches; } catch (_) { /* ignore */ }
          if (ok) walk(r.cssRules);
        }
      }
    };
    try { walk(sheet.cssRules); } catch (_) { /* ignore */ }
    return out;
  }

  async function open(buffer) {
    const zip = Zip.open(buffer);
    const text = async path => { const b = await zip.bytes(path); return b ? td.decode(b).replace(/^﻿/, '') : null; };

    const cont = await text('META-INF/container.xml');
    const cdoc = cont && xml(cont);
    const root = cdoc && tags(cdoc, 'rootfile')[0];
    if (!root) throw epubError('invalid');
    const opfPath = resolve('', root.getAttribute('full-path'));
    const opfSrc = await text(opfPath);
    const opf = opfSrc && xml(opfSrc);
    if (!opf) throw epubError('unreadable');
    const base = dirOf(opfPath);

    const first = name => { const e = tags(opf, name)[0]; return e ? e.textContent.trim() : ''; };
    const title = first('title');
    const author = tags(opf, 'creator').map(e => e.textContent.trim()).filter(Boolean).join(', ');
    const lang = first('language').slice(0, 5);

    const manifest = new Map();   // id → item
    const types = new Map();      // path → media type
    for (const it of tags(opf, 'item')) {
      const href = it.getAttribute('href');
      if (!href) continue;
      const item = { path: resolve(base, href), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
      manifest.set(it.getAttribute('id'), item);
      types.set(item.path, item.type);
    }
    const spine = [];
    for (const ref of tags(opf, 'itemref')) {
      const it = manifest.get(ref.getAttribute('idref'));
      if (it && (/html|xml/i.test(it.type) || /\.x?html?$/i.test(it.path)) && !/svg/i.test(it.type) && zip.has(it.path)) spine.push(it.path);
    }
    if (!spine.length) throw epubError('notext');
    const spineIdx = new Map(spine.map((p, i) => [p, i]));

    // copy protection: encrypted text files cannot be read
    const enc = await text('META-INF/encryption.xml');
    if (enc) {
      const edoc = xml(enc);
      const locked = edoc && tags(edoc, 'CipherReference').some(c => spineIdx.has(resolve('', c.getAttribute('URI') || '')));
      if (locked) throw epubError('drm');
    }

    /* table of contents */
    let toc = [];
    const push = (label, href, baseDir, depth) => {
      if (!href) return;
      const [p, frag] = href.split('#');
      const path = p ? resolve(baseDir, p) : '';
      const s = spineIdx.has(path) ? spineIdx.get(path) : -1;
      label = (label || '').replace(/\s+/g, ' ').trim();
      if (s >= 0 && label) toc.push({ label, s, frag: frag || '', depth });
    };
    const navItem = Array.from(manifest.values()).find(i => /\bnav\b/.test(i.props));
    if (navItem) {
      const src = await text(navItem.path);
      const doc = src && (xml(src, 'application/xhtml+xml') || new DOMParser().parseFromString(src, 'text/html'));
      if (doc) {
        const navs = tags(doc, 'nav');
        const nav = navs.find(n => /\btoc\b/.test(n.getAttribute('epub:type') || n.getAttribute('type') || '')) || navs[0];
        const walk = (ol, depth) => {
          for (const li of Array.from(ol.children).filter(c => c.localName === 'li')) {
            const a = Array.from(li.children).find(c => c.localName === 'a' || c.localName === 'span');
            if (a) push(a.textContent, a.getAttribute('href'), dirOf(navItem.path), depth);
            const sub = Array.from(li.children).find(c => c.localName === 'ol');
            if (sub) walk(sub, depth + 1);
          }
        };
        const ol = nav && Array.from(nav.children).find(c => c.localName === 'ol');
        if (ol) walk(ol, 0);
      }
    }
    if (!toc.length) {
      const spineEl = tags(opf, 'spine')[0];
      const ncxItem = manifest.get(spineEl && spineEl.getAttribute('toc')) || Array.from(manifest.values()).find(i => /ncx/i.test(i.type));
      const src = ncxItem && await text(ncxItem.path);
      const doc = src && xml(src);
      if (doc) {
        const walk = (parent, depth) => {
          for (const np of Array.from(parent.children).filter(c => c.localName === 'navPoint')) {
            const lab = tags(np, 'text')[0];
            const con = Array.from(np.children).find(c => c.localName === 'content');
            push(lab && lab.textContent, con && con.getAttribute('src'), dirOf(ncxItem.path), depth);
            walk(np, depth + 1);
          }
        };
        const map = tags(doc, 'navMap')[0];
        if (map) walk(map, 0);
      }
    }

    /* cover */
    let coverPath = '';
    const coverMeta = tags(opf, 'meta').find(m => m.getAttribute('name') === 'cover');
    const coverItem = Array.from(manifest.values()).find(i => /\bcover-image\b/.test(i.props))
      || (coverMeta && manifest.get(coverMeta.getAttribute('content')))
      || Array.from(manifest.values()).find(i => /^image\//.test(i.type) && /cover/i.test(i.path));
    if (coverItem && /^image\//.test(coverItem.type || MIME[coverItem.path.split('.').pop().toLowerCase()] || '')) coverPath = coverItem.path;

    const mime = path => types.get(path) || MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream';
    const urls = new Map();
    async function url(path) {
      if (urls.has(path)) return urls.get(path);
      const b = await zip.bytes(path);
      const u = b ? URL.createObjectURL(new Blob([b], { type: mime(path) })) : null;
      urls.set(path, u);
      return u;
    }
    const cssCache = new Map();
    async function cssRules(path) {
      if (!cssCache.has(path)) cssCache.set(path, flagRules((await text(path)) || ''));
      return cssCache.get(path);
    }

    /* Return one section as a clean, safe <section>: scripts, styles and event handlers removed */
    async function section(i) {
      const path = spine[i];
      const dir = dirOf(path);
      const src = (await text(path)) || '';
      let doc = xml(src, 'application/xhtml+xml');
      let body = doc && tags(doc, 'body')[0];
      if (!body) { doc = new DOMParser().parseFromString(src, 'text/html'); body = doc.body; }

      const rules = [];
      for (const l of tags(doc, 'link')) {
        if (/stylesheet/i.test(l.getAttribute('rel') || '') && l.getAttribute('href')) rules.push(...await cssRules(resolve(dir, l.getAttribute('href'))));
      }
      for (const s of tags(doc, 'style')) rules.push(...flagRules(s.textContent));
      const flags = new Map();
      for (const [sel, f] of rules) {
        let list;
        try { list = body.querySelectorAll(sel); } catch (_) { continue; }
        for (const e of list) flags.set(e, Object.assign(flags.get(e) || {}, f));
      }

      const jobs = [];
      for (const e of Array.from(body.querySelectorAll('*'))) {
        const tag = e.localName.toLowerCase();
        if (REMOVE.has(tag)) { e.remove(); continue; }
        let f = flags.get(e);
        if (e.hasAttribute('style') && e.style) {
          const own = flagsOf(e.style);
          if (own) f = Object.assign(f || {}, own);
        }
        if (f && f.hide) { e.remove(); continue; }
        for (const a of Array.from(e.attributes)) {
          const n = a.name.toLowerCase();
          if (n.startsWith('on') || n === 'style' || n === 'class' || n === 'srcset' || n === 'sizes' || n === 'contenteditable') e.removeAttribute(a.name);
          else if (n === 'id' || (n === 'name' && tag === 'a')) { e.setAttribute('data-id', a.value); e.removeAttribute(a.name); }
        }
        if (f) {
          if (f.i != null) e.setAttribute('data-i', f.i ? '1' : '0');
          if (f.b != null) e.setAttribute('data-b', f.b ? '1' : '0');
          if (f.ta) e.setAttribute('data-ta', f.ta);
          if (f.sc) e.setAttribute('data-sc', '1');
          if (f.u) e.setAttribute('data-u', '1');
          if (f.s) e.setAttribute('data-s', '1');
          if (f.va) e.setAttribute('data-va', f.va);
        }
        if (tag === 'a' && e.hasAttribute('href')) {
          e.setAttribute('data-href', e.getAttribute('href'));
          e.setAttribute('href', '#');
        } else if (tag === 'img') {
          const s = e.getAttribute('src');
          e.removeAttribute('src');
          e.setAttribute('alt', e.getAttribute('alt') || '');
          if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s)) jobs.push(url(resolve(dir, s)).then(u => { if (u) e.setAttribute('src', u); else e.remove(); }));
          else e.remove();
        } else if (tag === 'image') {
          const s = e.getAttributeNS(XLINK, 'href') || e.getAttribute('href');
          e.removeAttributeNS(XLINK, 'href');
          e.removeAttribute('href');
          if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s)) jobs.push(url(resolve(dir, s)).then(u => { if (u) e.setAttribute('href', u); }));
        }
      }
      await Promise.all(jobs);

      const sec = document.createElement('section');
      sec.className = 'sec';
      sec.dataset.sec = i;
      sec.dataset.path = path;
      for (const n of Array.from(body.childNodes)) sec.appendChild(document.importNode(n, true));
      return sec;
    }

    async function wordCounts() {
      const out = [];
      for (const p of spine) out.push(countWordsHtml((await text(p)) || ''));
      return out;
    }
    async function cover() {
      if (!coverPath) return null;
      const b = await zip.bytes(coverPath);
      return b ? new Blob([b], { type: mime(coverPath) }) : null;
    }
    function dispose() {
      for (const u of urls.values()) if (u) URL.revokeObjectURL(u);
      urls.clear();
    }

    return {
      title, author, lang, spine, toc, section, wordCounts, cover, dispose,
      spineIndex: p => (spineIdx.has(p) ? spineIdx.get(p) : -1),
    };
  }

  return { open, resolve, dirOf, countWords };
})();
