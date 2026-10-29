/* lan.js: LAN co-op over the same Wi-Fi / hotspot. No internet, no Firebase. Android app only. */
(() => {
  const PORT = 8765, MAX = 4;
  const Cap = window.Capacitor;
  const native = !!(Cap && Cap.registerPlugin && Cap.isNativePlatform && Cap.isNativePlatform());
  const Lan = native ? Cap.registerPlugin('PsLan') : null;

  const wait = setInterval(() => {
    if (typeof G !== 'undefined' && G.Net && G.DB && G.UI && G.Flow && G.Coop) { clearInterval(wait); init(); }
  }, 250);

  function init() {
    const N = G.Net;
    const ready = !!(Lan && N.deliver && N.emitPeer);
    const S = { on: false, host: false, started: false, seen: false, me: '', hostUid: '', members: [], addrs: [], msg: '',
                conn: new Map(), uidConn: new Map(), pending: new Map() };

    const el = (tag, css, text) => {
      const e = document.createElement(tag);
      e.setAttribute('translate', 'no');
      if (css) e.style.cssText = css;
      if (text != null) e.textContent = text;
      return e;
    };
    const newUid = () => 'L' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    const myInfo = () => {
      const s = G.DB.save, dex = s && s.partner;
      return { name: String(G.DB.user || 'Player').slice(0, 16), dex: dex || 0,
               shiny: !!(s && s.partnerShiny && dex && G.DB.ownsShiny(dex)) };
    };
    const cleanMembers = list => (Array.isArray(list) ? list : []).slice(0, MAX).map(x => ({
      uid: String((x && x.uid) || '').slice(0, 24), name: String((x && x.name) || 'Player').slice(0, 16),
      dex: Math.floor(+(x && x.dex)) || 0, shiny: !!(x && x.shiny === true)
    })).filter(x => x.uid && G.DEX_BY[x.dex]);

    // ---- sending ----
    const raw = (id, obj) => {
      if (!Lan || !id) return;
      S.pending.set(id, (S.pending.get(id) || 0) + 1);
      Lan.send({ id, data: JSON.stringify(obj) }).catch(() => {})
        .then(() => S.pending.set(id, Math.max(0, (S.pending.get(id) || 1) - 1)));
    };
    const gsend = (id, msg) => raw(id, { t: 'g', d: msg });

    // ---- plug into the game's network layer ----
    if (ready) {
      const orig = { send: N.send, toHost: N.toHost, broadcast: N.broadcast, mode: N.mode, slow: N.slow, busy: N.busy, peers: N.peers };
      N.send = (to, msg) => { if (!S.on) return orig.send(to, msg); const id = S.uidConn.get(to); if (id) gsend(id, msg); };
      N.toHost = msg => { if (!S.on) return orig.toHost(msg); if (!S.host) gsend('host', msg); };
      N.broadcast = (msg, except) => {
        if (!S.on) return orig.broadcast(msg, except);
        for (const [u, id] of S.uidConn) if (u !== except) gsend(id, msg);
      };
      N.mode = u => (S.on ? (S.uidConn.has(u) ? 'direct' : 'closed') : orig.mode(u));
      N.slow = u => (S.on ? false : orig.slow(u));
      N.busy = u => (S.on ? (S.pending.get(S.uidConn.get(u)) || 0) > 24 : orig.busy(u));
      N.peers = () => (S.on ? [...S.uidConn.keys()] : orig.peers());
      const patch = (name, fn) => {
        const d = Object.getOwnPropertyDescriptor(N, name);
        Object.defineProperty(N, name, { configurable: true, enumerable: true,
          get() { const v = fn(); return v === undefined ? (d && d.get ? d.get.call(N) : d && d.value) : v; } });
      };
      patch('uid', () => (S.on ? S.me : undefined));
      patch('isHost', () => (S.on ? S.host : undefined));
      patch('hostUid', () => (S.on ? S.hostUid : undefined));

      Lan.addListener('message', ev => onLine(ev.id, ev.data)).catch(() => {});
      Lan.addListener('closed', ev => {
        if (!S.on) return;
        if (S.host) dropConn(ev.id); else if (ev.id === 'host') lostHost();
      }).catch(() => {});
    }

    // ---- receiving ----
    function onLine(id, line) {
      if (!S.on) return;
      let m;
      try { m = JSON.parse(line); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (S.host) hostRecv(id, m); else guestRecv(m);
    }

    function hostRecv(id, m) {
      if (m.t === 'hello') {
        const uid = String(m.uid || ''), dex = Math.floor(+m.dex);
        const bad = S.started ? 'The game already started.'
          : S.members.length >= MAX ? 'The room is full.'
          : (!/^[A-Za-z0-9]{3,24}$/.test(uid) || S.uidConn.has(uid) || uid === S.me || !G.DEX_BY[dex]) ? 'Could not join.' : '';
        if (bad) { raw(id, { t: 'full', why: bad }); setTimeout(() => Lan.closeConn({ id }).catch(() => {}), 300); return; }
        const name = String(m.name || 'Player').replace(/[^A-Za-z0-9_\u00f1\u00d1\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da ]/g, '').trim().slice(0, 16) || 'Player';
        S.conn.set(id, uid); S.uidConn.set(uid, id);
        S.members.push({ uid, name, dex, shiny: m.shiny === true });
        sendRoom(); render();
      } else if (m.t === 'g') {
        const uid = S.conn.get(id);
        if (uid) N.deliver(uid, m.d);
      } else if (m.t === 'bye') {
        dropConn(id);
      }
    }

    function guestRecv(m) {
      if (m.t === 'room') {
        S.hostUid = String(m.host || '');
        S.members = cleanMembers(m.members);
        if (S.hostUid) S.uidConn.set(S.hostUid, 'host');
        render();
      } else if (m.t === 'full') {
        const why = String(m.why || 'Could not join.');
        reset(); S.msg = why;
        Lan.stop().catch(() => {});
        render();
      } else if (m.t === 'g') {
        if (m.d && m.d.k === 'start') { S.started = true; hidePanel(); }
        N.deliver(S.hostUid, m.d);
      } else if (m.t === 'bye') {
        lostHost();
      }
    }

    function sendRoom() { for (const id of S.conn.keys()) raw(id, { t: 'room', host: S.me, members: S.members }); }

    function dropConn(id) {
      const uid = S.conn.get(id);
      S.conn.delete(id); S.pending.delete(id);
      if (!uid) return;
      S.uidConn.delete(uid);
      S.members = S.members.filter(x => x.uid !== uid);
      N.emitPeer(uid);                 // lets the co-op code drop that player
      sendRoom(); render();
    }

    function lostHost() {
      const hu = S.hostUid;
      reset();
      S.msg = 'Lost the connection to the host.';
      if (hu) N.emitPeer(hu);
      Lan.stop().catch(() => {});
      render();
    }

    function reset() {
      S.on = false; S.host = false; S.started = false; S.seen = false;
      S.members = []; S.addrs = []; S.hostUid = '';
      S.conn.clear(); S.uidConn.clear(); S.pending.clear();
    }

    // ---- actions ----
    async function hostGame() {
      const info = myInfo();
      if (!info.dex) { S.msg = 'Log in and pick your partner Pok\u00e9mon first.'; render(); return; }
      reset(); S.msg = '';
      try {
        const r = await Lan.startServer({ port: PORT });
        S.addrs = (r && r.addresses) || [];
      } catch (e) { S.msg = 'Could not start: ' + ((e && e.message) || e); render(); return; }
      S.on = true; S.host = true; S.me = newUid(); S.hostUid = S.me;
      S.members = [{ uid: S.me, name: info.name, dex: info.dex, shiny: info.shiny }];
      render();
    }

    async function join(ip) {
      ip = String(ip || '').trim();
      const info = myInfo();
      if (!info.dex) { S.msg = 'Log in and pick your partner Pok\u00e9mon first.'; render(); return; }
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { S.msg = 'Type the host\u2019s address, like 192.168.43.1'; render(); return; }
      try { localStorage.setItem('ps.lanip', ip); } catch (e) { /* nada */ }
      reset(); S.msg = 'Connecting\u2026'; S.me = newUid(); render();
      try { await Lan.connect({ host: ip, port: PORT }); }
      catch (e) { S.msg = 'Could not connect: ' + ((e && e.message) || e); render(); return; }
      S.on = true; S.host = false; S.msg = '';
      raw('host', { t: 'hello', uid: S.me, name: info.name, dex: info.dex, shiny: info.shiny, v: 1 });
      render();
    }

    function hostStart() {
      if (!S.host || S.members.length < 2 || S.started || G.Coop.active) return;
      if (!G.Flow || typeof G.Flow.startCoop !== 'function') { S.msg = 'This build has no co-op start function.'; render(); return; }
      S.started = true;
      const cfg = { k: 'start', seed: Math.floor(Math.random() * 2147483647), host: S.me,
                    members: S.members.map(x => ({ uid: x.uid, name: x.name, dex: x.dex, shiny: !!x.shiny })) };
      N.broadcast(cfg);
      hidePanel();
      G.Flow.startCoop(cfg);
    }

    function leave() {
      if (S.on) {
        if (S.host) { for (const id of S.conn.keys()) raw(id, { t: 'bye' }); } else raw('host', { t: 'bye' });
      }
      reset(); S.msg = '';
      setTimeout(() => Lan.stop().catch(() => {}), 200);
      render();
    }

    // ---- panel ----
    let panel = null, body = null;
    const row = (...kids) => { const r = el('div', 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px'); r.append(...kids); return r; };
    const line = (text, css) => el('p', 'margin:6px 0;' + (css || ''), text);
    const btn = (label, bg, fn, off) => {
      const b = el('button', 'flex:1;min-width:110px;padding:12px;border:0;border-radius:10px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;color:#0a1430;background:' + bg + (off ? ';opacity:.45' : ''), label);
      b.type = 'button';
      if (!off) b.addEventListener('click', fn);
      return b;
    };

    function ensurePanel() {
      if (panel) return;
      panel = el('div', 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(10,20,48,.95);color:#fff;font-size:15px;line-height:1.4');
      for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'])
        panel.addEventListener(ev, e => e.stopPropagation(), { passive: true });
      const box = el('div', 'width:100%;max-width:460px;max-height:100%;overflow:auto;background:#0f1d3d;border:2px solid #ffd84a;border-radius:12px;padding:14px 16px;box-sizing:border-box');
      box.append(el('h2', 'margin:0 0 8px;color:#ffd84a', 'LAN Co-op'));
      body = el('div');
      box.append(body);
      panel.append(box);
      document.body.appendChild(panel);
    }
    function showPanel() { ensurePanel(); panel.style.display = 'flex'; render(); }
    function hidePanel() { if (panel) panel.style.display = 'none'; }

    function memberList() {
      const wrap = el('div', 'margin:8px 0;padding:8px 10px;background:#0a1430;border-radius:8px');
      S.members.forEach((m, i) => {
        const d = G.DEX_BY[m.dex];
        wrap.append(line(m.name + ' \u2013 ' + (d ? d.name : '?') + (i === 0 ? ' (host)' : ''), 'margin:3px 0'));
      });
      return wrap;
    }

    function render() {
      if (!panel || panel.style.display === 'none') return;
      body.textContent = '';
      if (!native) { body.append(line('LAN co-op only works in the Android app.'), row(btn('Close', '#cfd8ee', hidePanel))); return; }
      if (!ready) {
        body.append(line(!Lan ? 'The LAN plugin is not part of this build.' : 'js/net/net.js is missing the small edit (deliver, emitPeer).', 'color:#ff8a8a'), row(btn('Close', '#cfd8ee', hidePanel)));
        return;
      }
      if (S.msg) body.append(line(S.msg, 'color:#ffd84a'));
      if (!S.on) {
        body.append(line('Both phones must be on the same Wi-Fi or hotspot. One phone hosts; the others type its address.', 'color:#b8c4e0'));
        body.append(row(btn('Host a game', '#ffd84a', hostGame)));
        body.append(line('Or join a friend:', 'margin-top:16px;font-weight:700'));
        const inp = el('input', 'width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #33436b;background:#0a1430;color:#fff;font-size:16px');
        inp.setAttribute('inputmode', 'decimal');
        inp.setAttribute('placeholder', 'Host address, e.g. 192.168.43.1');
        try { inp.value = localStorage.getItem('ps.lanip') || ''; } catch (e) { /* nada */ }
        body.append(inp, row(btn('Join', '#7dffb0', () => join(inp.value)), btn('Close', '#cfd8ee', hidePanel)));
      } else if (S.host) {
        body.append(line('You are hosting. Tell your friends this address:', 'color:#b8c4e0'));
        body.append(line(S.addrs.length ? S.addrs.join('   ') : 'No address found. Is Wi-Fi or the hotspot on?', 'font-size:22px;font-weight:700;color:#ffd84a;word-break:break-all'));
        body.append(memberList());
        body.append(row(btn('Start game', '#ffd84a', hostStart, S.members.length < 2 || S.started), btn('Stop', '#ff8a8a', leave)));
        body.append(row(btn('Close', '#cfd8ee', hidePanel)));
      } else {
        body.append(line('Connected. Waiting for the host to start the game\u2026', 'color:#7dffb0'));
        body.append(memberList());
        body.append(row(btn('Leave', '#ff8a8a', leave), btn('Close', '#cfd8ee', hidePanel)));
      }
    }

    // ---- menu button + rematch handling ----
    function addMenuButton() {
      const list = document.querySelector('#scr-menu .menu-list');
      if (!list || document.getElementById('lan-menu')) return;
      const b = el('button');
      b.id = 'lan-menu'; b.type = 'button'; b.className = 'menu-item';
      b.append('LAN Co-op', el('small', '', 'Play with friends on the same Wi-Fi or hotspot'));
      b.addEventListener('click', e => { e.stopPropagation(); showPanel(); });
      list.appendChild(b);
    }
    setInterval(() => {
      if (S.on && S.started) {
        if (G.Coop.active) S.seen = true;
        else if (S.seen) { S.started = false; S.seen = false; sendRoom(); }
      }
      addMenuButton();
    }, 500);
  }
})();
