/* mods.js: 2x coins / 2x EXP in the Kecleon shop + auto level-up (local copy) */
(() => {
  const PRICE = 100000;
  const LS_AUTO = 'ps.autolvl';

  const el = (tag, css, text) => {
    const e = document.createElement(tag);
    e.setAttribute('translate', 'no');
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const visible = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
  const click = e => { if (!e) return; const b = e.querySelector ? e.querySelector('button') : null; (b || e).click(); };

  const wait = setInterval(() => {
    if (typeof G !== 'undefined' && G.DB && G.Pickups && G.LevelUp && G.UI) { clearInterval(wait); init(); }
  }, 200);

  function init() {
    // (leftovers from the slider version now do nothing)
    G.Mods = { v: () => 1, PRICE };

    const boost = id => { const s = G.DB.save; return !!(s && s.boost && s.boost[id]); };

    // ---- 2x EXP: doubles the XP orbs enemies drop ----
    const origXp = G.Pickups.dropXp;
    G.Pickups.dropXp = function (x, y, value) {
      const a = Array.prototype.slice.call(arguments);
      if (boost('xp')) a[2] = value * 2;
      return origXp.apply(this, a);
    };

    // ---- 2x coins: every coin gain that gets saved is doubled ----
    let lastRef = null, lastCoins = 0;
    const origCommit = G.DB.commit;
    G.DB.commit = function () {
      const s = G.DB.save;
      if (s) {
        if (s !== lastRef) { lastRef = s; lastCoins = s.coins; }
        else if (boost('coins') && s.coins > lastCoins) s.coins += s.coins - lastCoins;
      }
      const r = origCommit.apply(this, arguments);
      const s2 = G.DB.save;
      if (s2) { lastRef = s2; lastCoins = s2.coins; }
      return r;
    };

    // ---- Kecleon shop section ----
    const BOOSTS = [
      { id: 'coins', title: '2\u00d7 Coins', desc: 'Doubles every coin you earn.' },
      { id: 'xp', title: '2\u00d7 EXP', desc: 'Doubles the experience you collect in runs.' }
    ];
    let shopMsg = '';
    function buy(id) {
      const s = G.DB.save;
      if (!s || G.DB.guest) return 'Log in with an account to buy this.';
      if (boost(id)) return '';
      if ((s.coins || 0) < PRICE) return 'Not enough coins (you need ' + PRICE.toLocaleString('en-US') + ').';
      s.coins -= PRICE;
      s.boost = s.boost || {};
      s.boost[id] = 1;
      G.DB.commit();
      if (G.UI.refreshCoins) G.UI.refreshCoins();
      return 'Bought!';
    }
    function shopSection() {
      const scr = document.getElementById('scr-shop');
      if (!scr || scr.classList.contains('hidden')) { shopMsg = ''; return; }
      const inner = scr.querySelector('.shop-inner'), body = document.getElementById('shop-body');
      if (!inner || !body || body.parentNode !== inner) return;
      let sec = document.getElementById('boost-sec');
      const sig = (G.DB.user || '') + '|' + boost('coins') + '|' + boost('xp') + '|' + shopMsg;
      if (sec && sec.dataset.sig === sig) return;
      if (!sec) {
        sec = el('div', 'margin:14px 0;padding:12px;border:2px solid #ffd84a;border-radius:10px;background:rgba(255,216,74,.08)');
        sec.id = 'boost-sec';
        inner.insertBefore(sec, body);
      }
      sec.dataset.sig = sig;
      sec.textContent = '';
      sec.append(el('h3', 'margin:0 0 8px;color:#ffd84a', 'Boosts (permanent)'));
      for (const b of BOOSTS) {
        const row = el('div', 'display:flex;align-items:center;gap:10px;margin:8px 0');
        const info = el('div', 'flex:1');
        info.append(el('div', 'font-weight:700', b.title), el('div', 'font-size:13px;opacity:.75', b.desc));
        const btn = el('button');
        btn.type = 'button';
        if (boost(b.id)) { btn.className = 'btn small ghost'; btn.textContent = 'Owned \u2713'; btn.disabled = true; }
        else {
          btn.className = 'btn small gold';
          btn.textContent = PRICE.toLocaleString('en-US');
          btn.addEventListener('click', () => { shopMsg = buy(b.id); });
        }
        row.append(info, btn);
        sec.append(row);
      }
      if (shopMsg) sec.append(el('p', 'margin:6px 0 0;font-size:13px;color:#ffd84a', shopMsg));
    }

    // ---- Auto level-up ----
    let auto = false;
    try { auto = localStorage.getItem(LS_AUTO) === '1'; } catch (e) { /* nada */ }
    const paint = b => {
      b.textContent = '';
      b.append('Auto level-up: ' + (auto ? 'ON' : 'OFF'));
      if (b.classList.contains('menu-item')) b.append(el('small', '', 'Picks your level-up cards for you'));
    };
    const toggle = () => {
      auto = !auto;
      try { localStorage.setItem(LS_AUTO, auto ? '1' : '0'); } catch (e) { /* nada */ }
      document.querySelectorAll('.auto-btn').forEach(paint);
    };
    function ensureToggles() {
      const list = document.querySelector('#scr-menu .menu-list');
      if (list && !document.getElementById('auto-menu')) {
        const b = el('button'); b.id = 'auto-menu'; b.type = 'button'; b.className = 'menu-item auto-btn';
        b.addEventListener('click', e => { e.stopPropagation(); toggle(); });
        paint(b); list.appendChild(b);
      }
      const box = document.querySelector('#scr-pause .pause-box');
      if (box && !document.getElementById('auto-pause')) {
        const b = el('button', 'margin-top:12px'); b.id = 'auto-pause'; b.type = 'button'; b.className = 'btn auto-btn';
        b.addEventListener('click', e => { e.stopPropagation(); toggle(); });
        paint(b); box.appendChild(b);
      }
    }

    let lastOffer = null, lastSeen = null;
    const origOffer = G.LevelUp.offer;
    G.LevelUp.offer = function () { const r = origOffer.apply(this, arguments); lastOffer = r; return r; };

    // Priority: evolution > new move > move upgrade > stats (survival first)
    const STAT_ORDER = ['def', 'hp', 'rgn', 'atk', 'cd', 'spd', 'mag', 'xp', 'heal'];
    const score = c => {
      if (c.type === 'evo') return 1000;
      if (c.type === 'stat' && /^Evoluciona/.test(c.tag || '')) return 900;
      if (c.type === 'new') return 800;
      if (c.type === 'up') return 600;
      const i = STAT_ORDER.indexOf(String(c.key || '').replace('stat:', ''));
      return 400 - (i < 0 ? 20 : i);
    };
    const bestIndex = list => { let bi = 0; list.forEach((c, i) => { if (score(c) > score(list[bi])) bi = i; }); return bi; };
    const pressKey = n => {
      for (const type of ['keydown', 'keyup'])
        document.dispatchEvent(new KeyboardEvent(type, { key: String(n), code: 'Digit' + n, bubbles: true }));
    };

    const seenAt = {}, tries = {};
    let lastTry = 0;
    setInterval(() => {
      ensureToggles();
      shopSection();
      const now = Date.now();
      for (const pair of [['scr-levelup', 'cards'], ['scr-bond', 'bond-cards'], ['scr-item', 'item-cards']]) {
        const scr = pair[0];
        if (!auto || !visible(scr)) { seenAt[scr] = 0; tries[scr] = 0; continue; }
        const kids = (document.getElementById(pair[1]) || {}).children || [];
        if (!kids.length) continue;
        if (scr === 'scr-levelup' && lastOffer !== lastSeen) { lastSeen = lastOffer; tries[scr] = 0; seenAt[scr] = now; continue; }
        if (!seenAt[scr]) seenAt[scr] = now;
        if (now - seenAt[scr] < 700 || now - lastTry < 600) continue;
        lastTry = now;
        tries[scr] = (tries[scr] || 0) + 1;
        let idx = 0;
        if (scr === 'scr-levelup' && lastOffer && lastOffer.length === kids.length) idx = bestIndex(lastOffer);
        if (scr === 'scr-levelup' && tries[scr] > 2) pressKey(idx + 1);
        else click(kids[idx]);
      }
    }, 300);
  }
})();
