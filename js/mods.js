/* mods.js: 2x coins / 2x EXP in the Kecleon shop + auto level-up (local copy) */
(() => {
  const PRICE = 100000;
  const LS_AUTO = 'ps.autolvl';

  const wait = setInterval(() => {
    if (typeof G !== 'undefined' && G.DB && G.Pickups && G.LevelUp && G.UI && G.RunUI && G.ShopUI) { clearInterval(wait); init(); }
  }, 200);

  function init() {
    G.Mods = { v: () => 1, PRICE };   // (old slider hooks, now neutral)

    const el = (tag, css, text) => {
      const e = document.createElement(tag);
      e.setAttribute('translate', 'no');
      if (css) e.style.cssText = css;
      if (text != null) e.textContent = text;
      return e;
    };
    const isOpen = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
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
      if (s && s === lastRef && boost('coins') && s.coins > lastCoins) s.coins += s.coins - lastCoins;
      const r = origCommit.apply(this, arguments);
      const s2 = G.DB.save;
      lastRef = s2; lastCoins = s2 ? s2.coins : 0;
      return r;
    };
    function trackCoins() {
      const s = G.DB.save;
      if (s !== lastRef) { lastRef = s; lastCoins = s ? s.coins : 0; }
      else if (s && s.coins < lastCoins) lastCoins = s.coins;
    }
    // The end-of-run screen shows the doubled payout
    const origOver = G.RunUI.showOver;
    G.RunUI.showOver = function (r, onBack) {
      if (boost('coins') && r && r.coins) r = Object.assign({}, r, { coins: r.coins * 2, breakdown: (r.breakdown || '') + ' (\u00d72 boost)' });
      return origOver.call(this, r, onBack);
    };

    // ---- Kecleon shop section ----
    const BOOSTS = [
      { id: 'coins', icon: 'coin', title: '2\u00d7 Coins', desc: 'Doubles every coin you earn. Permanent.' },
      { id: 'xp', icon: 'book', title: '2\u00d7 EXP', desc: 'Doubles the experience you collect in runs. Permanent.' }
    ];
    function buy(id) {
      const s = G.DB.save;
      if (!s || G.DB.guest) { G.UI.toast('Log in with an account to buy this.'); G.Audio.sfx('error'); return; }
      if (boost(id)) return;
      if ((s.coins || 0) < PRICE) { G.UI.toast('Not enough coins.'); G.Audio.sfx('error'); return; }
      s.coins -= PRICE;
      s.boost = s.boost || {};
      s.boost[id] = 1;
      G.DB.commit();
      G.Audio.sfx('buy');
      G.UI.refreshCoins();
      G.ShopUI.render();
      shopSection();
    }
    function shopSection() {
      const scr = document.getElementById('scr-shop');
      if (!scr || scr.classList.contains('hidden')) return;
      const inner = scr.querySelector('.shop-inner'), body = document.getElementById('shop-body'), s = G.DB.save;
      if (!inner || !body || body.parentNode !== inner || !s) return;
      let sec = document.getElementById('boost-sec');
      const sig = [G.DB.user, boost('coins'), boost('xp'), (s.coins || 0) >= PRICE].join('|');
      if (sec && sec.dataset.sig === sig) return;
      if (!sec) { sec = el('div'); sec.id = 'boost-sec'; inner.insertBefore(sec, body); }
      sec.dataset.sig = sig;
      const price = '<span class="coin"></span> ' + PRICE.toLocaleString('en-US');
      let h = '<h3 style="margin:10px 0 6px">Boosts</h3><div class="upg">';
      for (const b of BOOSTS) {
        const btn = boost(b.id) ? '<b class="gold">Owned</b>'
          : '<button class="btn small gold" data-boost="' + b.id + '" data-sfx="none"' + (s.coins < PRICE ? ' disabled' : '') + '>' + price + '</button>';
        h += '<div class="panel upg-item"><div class="ic">' + G.Icons.html(b.icon, 32) + '</div><div><b>' + b.title +
          '</b><div class="sub" style="font-size:13px">' + b.desc + '</div></div><div class="upg-btns">' + btn + '</div></div>';
      }
      sec.innerHTML = h + '</div>';
      sec.querySelectorAll('[data-boost]').forEach(btn => { btn.onclick = () => buy(btn.dataset.boost); });
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

    // Remember the cards on offer, to choose among them
    let lastOffer = null;
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

    let lastTry = 0;
    setInterval(() => {
      ensureToggles();
      shopSection();
      trackCoins();
      if (!auto) return;
      const now = Date.now();
      if (now - lastTry < 500) return;
      lastTry = now;
      if (isOpen('scr-levelup')) {
        const box = document.getElementById('cards');
        if (box && !box.classList.contains('done') && box.children.length) {
          G.RunUI.pick(lastOffer && lastOffer.length === box.children.length ? bestIndex(lastOffer) : 0);
        }
      } else if (isOpen('scr-bond')) {
        G.RunUI.pickBond(0);
      } else if (isOpen('scr-item')) {
        const k = document.getElementById('item-cards');
        if (k && k.children[0]) k.children[0].click();   // keep the item you have
      }
    }, 300);
  }
})();
