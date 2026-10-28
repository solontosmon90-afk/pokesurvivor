/* mods.js — modificadores con deslizadores (sólo tu copia local) */
G.Mods = (() => {
  const KEY = 'ps.mods';
  // Cada deslizador mueve a la vez una recompensa (gain) y su coste (cost).
  // Para cambiar el equilibrio, edita los "base". Más pares: añade una entrada.
  const PAIRS = [
    { id: 'treasure', title: 'Treasure vs Toughness', min: -4, max: 8,
      gain: { key: 'coins', label: 'Coin drops', base: 1.2 },
      cost: { key: 'enemyHp', label: 'Enemy HP', base: 1.12 } },
    { id: 'crowd', title: 'Experience vs Crowd', min: -4, max: 8,
      gain: { key: 'xp', label: 'EXP gained', base: 1.2 },
      cost: { key: 'spawn', label: 'Enemy count', base: 1.08 } }
  ];

  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { st = {}; }
  const clampS = (p, s) => Math.max(p.min, Math.min(p.max, Math.round(+s || 0)));
  for (const p of PAIRS) st[p.id] = clampS(p, st[p.id]);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* nada */ } };

  const mult = {};
  function recalc() {
    for (const p of PAIRS) {
      mult[p.gain.key] = Math.pow(p.gain.base, st[p.id]);
      mult[p.cost.key] = Math.pow(p.cost.base, st[p.id]);
    }
  }
  recalc();
  const v = k => (mult[k] != null ? mult[k] : 1);
  const fmt = x => '×' + x.toFixed(2);

  const el = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const btnCss = (bg, fg) => 'flex:1;padding:12px;border:0;border-radius:10px;font-weight:700;font-size:16px;font-family:inherit;cursor:pointer;background:' + bg + ';color:' + fg;

  let panel = null, rows = [];

  function build() {
    panel = el('div', 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(10,20,48,.94);color:#fff;font-size:15px;line-height:1.4;font-family:inherit');
    // Que el juego no se coma los toques ni las teclas de este panel.
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup'])
      panel.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    const box = el('div', 'width:100%;max-width:460px;max-height:100%;overflow:auto;background:#0f1d3d;border:2px solid #ffd84a;border-radius:12px;padding:14px 16px;box-sizing:border-box');
    box.append(el('h2', 'margin:0 0 6px;color:#ffd84a', 'Modifiers'));
    box.append(el('p', 'margin:0 0 4px;color:#b8c4e0', 'Slide right for more reward and a harder game, left for easier and less reward. Applies from your next run.'));
    rows = PAIRS.map(p => {
      const wrap = el('div', 'margin:16px 0');
      const head = el('div', 'display:flex;justify-content:space-between;font-weight:700;color:#ffd84a');
      const val = el('span');
      head.append(el('span', '', p.title), val);
      const input = el('input', 'width:100%;margin:8px 0;touch-action:manipulation');
      input.type = 'range'; input.min = p.min; input.max = p.max; input.step = 1; input.value = st[p.id];
      const gain = el('div', 'color:#7dffb0'), cost = el('div', 'color:#ff8a8a');
      wrap.append(head, input, gain, cost);
      const refresh = () => {
        const s = st[p.id];
        input.value = s;
        val.textContent = (s > 0 ? '+' : '') + s;
        gain.textContent = 'Reward: ' + p.gain.label + ' ' + fmt(v(p.gain.key));
        cost.textContent = 'Cost: ' + p.cost.label + ' ' + fmt(v(p.cost.key));
      };
      input.addEventListener('input', () => { st[p.id] = clampS(p, input.value); save(); recalc(); refresh(); });
      box.append(wrap);
      refresh();
      return refresh;
    });
    const btns = el('div', 'display:flex;gap:8px;margin-top:8px');
    const reset = el('button', btnCss('#33436b', '#fff'), 'Reset');
    const close = el('button', btnCss('#ffd84a', '#0a1430'), 'Close');
    reset.addEventListener('click', () => { for (const p of PAIRS) st[p.id] = 0; save(); recalc(); rows.forEach(r => r()); });
    close.addEventListener('click', () => { panel.style.display = 'none'; });
    btns.append(reset, close);
    box.append(btns);
    panel.append(box);
    document.body.appendChild(panel);
  }

  function open() {
    if (!panel) build();
    rows.forEach(r => r());
    panel.style.display = 'flex';
  }

  // Botón en el menú principal (se añade cuando el menú aparece por primera vez).
  function addButton() {
    if (document.getElementById('mods-open')) return;
    const list = document.querySelector('#scr-menu .menu-list');
    if (!list) return;
    const b = el('button');
    b.id = 'mods-open'; b.type = 'button'; b.className = 'menu-item';
    b.append('Modifiers', el('small', '', 'Trade rewards for difficulty'));
    b.addEventListener('click', e => { e.stopPropagation(); open(); });
    list.appendChild(b);
  }
  setInterval(() => {
    const m = document.getElementById('scr-menu');
    if (m && !m.classList.contains('hidden')) addButton();
  }, 500);

  return { v, open, PAIRS };
})();
