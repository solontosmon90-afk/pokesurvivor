/* mods.js: Kecleon shop boosts + passive, auto level-up, backup/restore (local copy) */
(() => {
  // ---- tune the economy here ----
  const BOOST_MAX = 5;            // levels of the Coin and EXP boosts
  const BOOST_PRICE = 50000;      // price of EACH level of those two
  const EDGE_MAX = 10;            // levels of Predator's Edge
  const EDGE_BASE = 30000;        // Predator's Edge: level n costs EDGE_BASE x n
  const CRIT_PER_LEVEL = 0.10;    // +10% crit damage per level
  const STEAL_PER_LEVEL = 0.01;   // +1% lifesteal per level
  const STEAL_CAP = 0.05;         // one hit never heals more than 5% of your max HP
  const LS_AUTO = 'ps.autolvl';

  const wait = setInterval(() => {
    if (typeof G !== 'undefined' && G.DB && G.Pickups && G.LevelUp && G.UI && G.RunUI && G.ShopUI && G.Enemy && G.Game) {
      clearInterval(wait); init();
    }
  }, 200);

  function init() {
    G.Mods = { v: () => 1 };   // (old slider hooks stay switched off)

    const el = (tag, css, text) => {
      const e = document.createElement(tag);
      e.setAttribute('translate', 'no');
      if (css) e.style.cssText = css;
      if (text != null) e.textContent = text;
      return e;
    };
    const isOpen = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };

    // ---- levels (stored in your save: save.boost) ----
    const MAXES = { coins: BOOST_MAX, xp: BOOST_MAX, edge: EDGE_MAX };
    const lvl = id => {
      const s = G.DB.save;
      const v = s && s.boost ? Math.floor(+s.boost[id]) || 0 : 0;
      return Math.max(0, Math.min(MAXES[id], v));
    };

    // ---- EXP boost: multiplies the XP orbs enemies drop ----
    const origXp = G.Pickups.dropXp;
    G.Pickups.dropXp = function (x, y, value) {
      const a = Array.prototype.slice.call(arguments);
      a[2] = value * (1 + lvl('xp'));
      return origXp.apply(this, a);
    };

    // ---- Coin boost: every coin gain that gets saved is multiplied ----
    let lastRef = null, lastCoins = 0;
    const origCommit = G.DB.commit;
    G.DB.commit = function () {
      const s = G.DB.save;
      if (s && s === lastRef) {
        const k = lvl('coins');
        if (k > 0 && s.coins > lastCoins) s.coins += (s.coins - lastCoins) * k;
      }
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
    const origOver = G.RunUI.showOver;
    G.RunUI.showOver = function (r, onBack) {
      const k = lvl('coins');
      if (k > 0 && r && r.coins) r = Object.assign({}, r, { coins: r.coins * (1 + k), breakdown: (r.breakdown || '') + ' \u00b7 \u00d7' + (1 + k) + ' boost' });
      return origOver.call(this, r, onBack);
    };

    // ---- Predator's Edge: crit damage + lifesteal on your direct hits ----
    let netDepth = 0, inEnemyUpdate = 0;
    if (G.Net && typeof G.Net.deliver === 'function') {
      const od = G.Net.deliver;
      G.Net.deliver = function () { netDepth++; try { return od.apply(this, arguments); } finally { netDepth--; } };
    }
    const proto = G.Enemy.prototype;
    const origUpd = proto.update;
    proto.update = function () { inEnemyUpdate++; try { return origUpd.apply(this, arguments); } finally { inEnemyUpdate--; } };
    const origHurt = proto.hurt;
    proto.hurt = function (amount, color, dirX, dirY, knock, eff) {
      const k = lvl('edge');
      if (!k || netDepth > 0 || inEnemyUpdate > 0 || this.dead) return origHurt.apply(this, arguments);
      const a = Array.prototype.slice.call(arguments);
      if (eff === 'crit') a[0] = amount * (1 + CRIT_PER_LEVEL * k);
      const before = this.hp + (this.shield || 0);
      const r = origHurt.apply(this, a);
      const pl = G.Game.player;
      if (pl && !pl.dead && pl.maxHp > 0) {
        const dealt = Math.max(0, Math.min(a[0], before));
        const heal = Math.min(dealt * STEAL_PER_LEVEL * k, pl.maxHp * STEAL_CAP);
        if (heal > 0) pl.hp = Math.min(pl.maxHp, pl.hp + heal);
      }
      return r;
    };

    // ---- Kecleon shop section ----
    const CARDS = [
      { id: 'coins', icon: 'coin', title: 'Coin Boost', max: BOOST_MAX, price: () => BOOST_PRICE,
        desc: l => 'Multiplies every coin you earn. Now \u00d7' + (1 + l) + (l < BOOST_MAX ? ', next \u00d7' + (2 + l) : '') + '.' },
      { id: 'xp', icon: 'book', title: 'EXP Boost', max: BOOST_MAX, price: () => BOOST_PRICE,
        desc: l => 'Multiplies the experience you collect in runs. Now \u00d7' + (1 + l) + (l < BOOST_MAX ? ', next \u00d7' + (2 + l) : '') + '.' },
      { id: 'edge', icon: 'fist', title: 'Predator\u2019s Edge', max: EDGE_MAX, price: l => EDGE_BASE * (l + 1),
        desc: l => {
          const c = n => Math.round(CRIT_PER_LEVEL * 100 * n), s = n => Math.round(STEAL_PER_LEVEL * 1000 * n) / 10;
          return 'Crit damage +' + c(l) + '%, lifesteal ' + s(l) + '%' + (l < EDGE_MAX ? '. Next: +' + c(l + 1) + '% / ' + s(l + 1) + '%' : '') + '.';
        } }
    ];
    function buy(id) {
      const c = CARDS.find(x => x.id === id), s = G.DB.save;
      if (!c || !s || G.DB.guest) { G.UI.toast('Log in with an account to buy this.'); G.Audio.sfx('error'); return; }
      const l = lvl(id);
      if (l >= c.max) return;
      const price = c.price(l);
      if ((s.coins || 0) < price) { G.UI.toast('Not enough coins.'); G.Audio.sfx('error'); return; }
      s.coins -= price;
      s.boost = s.boost || {};
      s.boost[id] = l + 1;
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
      const sig = [G.DB.user].concat(CARDS.map(c => lvl(c.id) + ':' + (lvl(c.id) < c.max && (s.coins || 0) >= c.price(lvl(c.id)) ? 1 : 0))).join('|');
      if (sec && sec.dataset.sig === sig) return;
      if (!sec) { sec = el('div'); sec.id = 'boost-sec'; inner.insertBefore(sec, body); }
      sec.dataset.sig = sig;
      let h = '<h3 style="margin:10px 0 6px">Boosts &amp; passives</h3><div class="upg">';
      for (const c of CARDS) {
        const l = lvl(c.id), price = c.price(l);
        const btn = l >= c.max ? '<b class="gold">MAX</b>'
          : '<button class="btn small gold" data-boost="' + c.id + '" data-sfx="none"' + ((s.coins || 0) < price ? ' disabled' : '') +
            '><span class="coin"></span> ' + price.toLocaleString('en-US') + '</button>';
        h += '<div class="panel upg-item"><div class="ic">' + G.Icons.html(c.icon, 32) + '</div><div><b>' + c.title +
          ' <small class="gold">\u00b7 Lv ' + l + '/' + c.max + '</small></b><div class="sub" style="font-size:13px">' + c.desc(l) +
          '</div></div><div class="upg-btns">' + btn + '</div></div>';
      }
      sec.innerHTML = h + '</div>';
      sec.querySelectorAll('[data-boost]').forEach(b => { b.onclick = () => buy(b.dataset.boost); });
    }

    // ---- Auto level-up (toggle sits on the pause screen) ----
    let auto = false;
    try { auto = localStorage.getItem(LS_AUTO) === '1'; } catch (e) { /* nada */ }
    const paint = b => { b.textContent = 'Auto level-up: ' + (auto ? 'ON' : 'OFF'); };
    const toggle = () => {
      auto = !auto;
      try { localStorage.setItem(LS_AUTO, auto ? '1' : '0'); } catch (e) { /* nada */ }
      const b = document.getElementById('auto-pause');
      if (b) paint(b);
    };
    function ensureToggle() {
      const box = document.querySelector('#scr-pause .pause-box');
      if (box && !document.getElementById('auto-pause')) {
        const b = el('button', 'margin-top:12px'); b.id = 'auto-pause'; b.type = 'button'; b.className = 'btn';
        b.addEventListener('click', e => { e.stopPropagation(); toggle(); });
        paint(b);
        box.insertBefore(b, document.getElementById('pause-sum'));
      }
    }

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

    // ---- Backup / Restore: all game data as text ----
    const bkKeys = () => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^ps\./.test(k) && !/^ps\.rk\./.test(k)) out.push(k);
      }
      return out;
    };
    let bk = null, bkText = null, bkMsg = null;
    function openBackup() {
      if (!bk) {
        bk = el('div', 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(10,20,48,.95);color:#fff;font-size:15px;line-height:1.4');
        for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'])
          bk.addEventListener(ev, e => e.stopPropagation(), { passive: true });
        const box = el('div', 'width:100%;max-width:480px;max-height:100%;overflow:auto;background:#0f1d3d;border:2px solid #ffd84a;border-radius:12px;padding:14px 16px;box-sizing:border-box');
        box.append(el('h2', 'margin:0 0 6px;color:#ffd84a', 'Backup / Restore'));
        box.append(el('p', 'margin:0 0 8px;color:#b8c4e0', 'Create backup turns all your game data into text: paste it into a notes app. To restore, paste it back here and tap Restore.'));
        bkText = el('textarea', 'width:100%;height:150px;box-sizing:border-box;background:#0a1430;color:#fff;border:1px solid #33436b;border-radius:8px;padding:8px;font-family:monospace;font-size:12px');
        bkText.setAttribute('spellcheck', 'false');
        bkMsg = el('p', 'margin:8px 0;min-height:1.4em;color:#7dffb0');
        const row = el('div', 'display:flex;gap:8px;flex-wrap:wrap');
        const css = bg => 'flex:1;min-width:110px;padding:12px;border:0;border-radius:10px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;color:#0a1430;background:' + bg;
        const bMake = el('button', css('#ffd84a'), 'Create backup');
        const bRest = el('button', css('#7dffb0'), 'Restore');
        const bClose = el('button', css('#cfd8ee'), 'Close');
        let armed = 0;
        bMake.onclick = () => {
          try { G.DB.commit(); } catch (e) { /* nada */ }
          const data = {};
          for (const k of bkKeys()) data[k] = localStorage.getItem(k);
          bkText.value = JSON.stringify({ psbackup: 1, data });
          bkText.focus(); bkText.select();
          try { document.execCommand('copy'); } catch (e) { /* nada */ }
          bkMsg.style.color = '#7dffb0';
          bkMsg.textContent = 'Backup created (copied if your phone allowed it). If not, long-press the text, Select all, Copy.';
        };
        bRest.onclick = () => {
          let obj = null;
          try { obj = JSON.parse(bkText.value.trim()); } catch (e) { /* nada */ }
          if (!obj || obj.psbackup !== 1 || !obj.data || typeof obj.data !== 'object') {
            bkMsg.style.color = '#ff8a8a'; bkMsg.textContent = 'That is not a valid backup.'; return;
          }
          if (!armed || Date.now() - armed > 6000) {
            armed = Date.now(); bkMsg.style.color = '#ffd84a';
            bkMsg.textContent = 'This replaces your current save. Tap Restore again to confirm.'; return;
          }
          for (const k of Object.keys(obj.data)) {
            if (/^ps\./.test(k) && typeof obj.data[k] === 'string') { try { localStorage.setItem(k, obj.data[k]); } catch (e) { /* nada */ } }
          }
          location.reload();
        };
        bClose.onclick = () => { bk.style.display = 'none'; };
        row.append(bMake, bRest, bClose);
        box.append(bkText, bkMsg, row);
        bk.append(box);
        document.body.appendChild(bk);
      }
      bkText.value = ''; bkMsg.textContent = '';
      bk.style.display = 'flex';
    }
    function addBackupButton() {
      const list = document.querySelector('#scr-menu .menu-list');
      if (list && !document.getElementById('backup-menu')) {
        const b = el('button'); b.id = 'backup-menu'; b.type = 'button'; b.className = 'menu-item';
        b.append('Backup / Restore save', el('small', '', 'Copy your save as text'));
        b.addEventListener('click', e => { e.stopPropagation(); openBackup(); });
        list.appendChild(b);
      }
    }

    // ---- main timer ----
    let lastTry = 0;
    setInterval(() => {
      ensureToggle();
      shopSection();
      trackCoins();
      addBackupButton();
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
