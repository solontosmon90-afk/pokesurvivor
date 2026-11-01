/* extras.js: 10 new equippable items + unique abilities (local copy) */
(() => {
  const wait = setInterval(() => {
    if (typeof G !== 'undefined' && G.Items && G.AbilityFX && G.Player && G.Enemy && G.Icons && G.RunUI &&
        G.Game && G.FX && G.Types && G.EnemyMgr && G.Pickups && G.Mons && G.Projectiles && G.U) {
      clearInterval(wait); init();
    }
  }, 200);

  function init() {
    let warned = false;

    // ================= NEW ITEMS =================
    const NEW_ITEMS = [
      { id: 'scopelens', name: 'Scope Lens', icon: 'shiny', desc: '+12% critical hit chance.',
        on: p => { p.critChance = (p.critChance || 0) + 0.12; }, off: p => { p.critChance = Math.max(0, (p.critChance || 0) - 0.12); } },
      { id: 'razorclaw', name: 'Razor Claw', icon: 'fist', desc: 'Critical hits deal 40% more damage.',
        on: p => { p.xCrit = (p.xCrit || 0) + 0.4; }, off: p => { p.xCrit = Math.max(0, (p.xCrit || 0) - 0.4); } },
      { id: 'bigroot', name: 'Big Root', icon: 'sprout', desc: 'Heal 4% of the damage you deal.',
        on: p => { p.xSteal = (p.xSteal || 0) + 0.04; }, off: p => { p.xSteal = Math.max(0, (p.xSteal || 0) - 0.04); } },
      { id: 'eviolite', name: 'Eviolite', icon: 'heart', desc: '+30% max HP.',
        on: p => { p._evi = Math.round(p.maxHp * 0.3); p.addMaxHp(p._evi); },
        off: p => { p.maxHp = Math.max(1, p.maxHp - (p._evi || 0)); p.hp = Math.min(p.hp, p.maxHp); p._evi = 0; } },
      { id: 'expertbelt', name: 'Expert Belt', icon: 'choiceband', desc: '+25% damage on super effective hits.' },
      { id: 'sitrusberry', name: 'Sitrus Berry', icon: 'berry', desc: 'Heals 40% HP when you drop below half (once every 60 s).' },
      { id: 'brightpowder', name: 'Bright Powder', icon: 'boot', desc: '10% chance to dodge any hit.' },
      { id: 'weaknesspolicy', name: 'Weakness Policy', icon: 'bomb', desc: 'Hit by a super effective attack: +50% damage for 8 s.' },
      { id: 'magnetstone', name: 'Magnet Stone', icon: 'magnet', desc: '+60% pickup radius.',
        on: p => { p.magnet *= 1.6; }, off: p => { p.magnet /= 1.6; } },
      { id: 'muscleband', name: 'Muscle Band', icon: 'lifeorb', desc: '+15% damage.',
        on: p => { p.atkMul *= 1.15; }, off: p => { p.atkMul /= 1.15; } }
    ];
    const ICON_ALIAS = {};
    for (const it of NEW_ITEMS) {
      if (G.Items.BY[it.id]) continue;
      ICON_ALIAS[it.id] = it.icon;
      const item = { id: it.id, name: it.name, desc: it.desc, on: it.on || (() => {}), off: it.off || (() => {}) };
      G.Items.LIST.push(item);
      G.Items.BY[it.id] = item;
    }
    // New items reuse existing icons
    const origHtml = G.Icons.html;
    G.Icons.html = function () {
      const a = Array.prototype.slice.call(arguments);
      if (ICON_ALIAS[a[0]]) a[0] = ICON_ALIAS[a[0]];
      return origHtml.apply(this, a);
    };
    const origDraw = G.Icons.draw;
    G.Icons.draw = function () {
      const a = Array.prototype.slice.call(arguments);
      if (ICON_ALIAS[a[1]]) a[1] = ICON_ALIAS[a[1]];
      return origDraw.apply(this, a);
    };

    // Item reactions: Bright Powder, Weakness Policy, Sitrus Berry
    const origPHurt = G.Player.prototype.hurt;
    G.Player.prototype.hurt = function (amount, type) {
      if (this.remote || this.dead || !this.item) return origPHurt.apply(this, arguments);
      if (this.item === 'brightpowder' && !(this.invuln > 0) && Math.random() < 0.1) {
        this.invuln = 0.3;
        G.FX.dmgText(this.x, this.y - this.bodyH - 4, 'Dodged!', '#bfe8ff');
        return;
      }
      const before = this.hp;
      const r = origPHurt.apply(this, arguments);
      if (this.hp < before && !this.dead) {
        if (this.item === 'weaknesspolicy' && type && G.Types.mult(type, this.mon.types) > 1) {
          this.addBuff('atk', 0.5, 8, 1);
          G.FX.dmgText(this.x, this.y - this.bodyH - 14, 'Weakness Policy!', '#ff9a3d', true);
        }
        if (this.item === 'sitrusberry' && this.hp < this.maxHp * 0.5 && performance.now() - (this._sitrusAt || -1e9) > 60000) {
          this._sitrusAt = performance.now();
          this.heal(this.maxHp * 0.4);
        }
      }
      return r;
    };
    // Expert Belt (super effective) and Razor Claw (crits)
    const origEHurt = G.Enemy.prototype.hurt;
    G.Enemy.prototype.hurt = function (amount, color, dirX, dirY, knock, eff) {
      const pl = G.Game.player;
      if (pl && !this.dead && (eff === 'crit' || eff === 'super')) {
        let k = 1;
        if (eff === 'crit' && pl.xCrit) k *= 1 + pl.xCrit;
        if (eff === 'super' && pl.item === 'expertbelt') k *= 1.25;
        if (k !== 1) { const a = Array.prototype.slice.call(arguments); a[0] = amount * k; return origEHurt.apply(this, a); }
      }
      return origEHurt.apply(this, arguments);
    };
    // Big Root: lifesteal on hits you land (max 8% of max HP per second)
    const origDealt = G.Player.prototype.onDealt;
    G.Player.prototype.onDealt = function (dmg) {
      origDealt.apply(this, arguments);
      if (!this.xSteal || this.dead || this.remote || !(dmg > 0)) return;
      const t = performance.now();
      if (!this._bgAt || t - this._bgAt >= 1000) { this._bgAt = t; this._bgGot = 0; }
      const heal = Math.min(dmg * this.xSteal, this.maxHp * 0.08 - this._bgGot, this.maxHp - this.hp);
      if (heal > 0) { this._bgGot += heal; this.hp += heal; }
    };

    // ================= ABILITIES =================
    const S = pl => pl._ab || (pl._ab = {});
    const T = () => performance.now() / 1000;
    const low = pl => pl.hp < pl.maxHp * 0.5;
    const mend = (pl, n) => { if (n > 0) pl.hp = Math.min(pl.maxHp, pl.hp + n); };
    const pop = (pl, text, col) => G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, text, col || '#ffffff');
    const around = (pl, r) => G.EnemyMgr.queryCircle(pl.x, pl.y, r);
    const nearest = (pl, r) => G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, r);
    const every = (pl, key, secs, dt, fn) => {
      const s = S(pl);
      s[key] = (s[key] == null ? secs : s[key]) - dt;
      if (s[key] <= 0) { s[key] = secs; fn(); }
    };
    const switched = pl => { const s = S(pl), c = s.act != null && pl.active !== s.act; s.act = pl.active; return c; };
    const MELEE = ['melee', 'dash', 'spin', 'shove', 'quake', 'charge'];
    const SHOTS = ['projectile', 'homing', 'bounce', 'boomerang', 'cone', 'beam'];
    const isKind = (m, list) => !!m && list.includes(m.kind);
    const typed = (m, type) => !!m && m.type === type;

    const AB = {};
    const def = (id, d, h) => { AB[id] = { d, h }; };

    // ---- pinch abilities (below 50% HP) ----
    def('overgrow', 'Below 50% HP: +35% damage and regenerate 2% HP/s.', {
      out: pl => (low(pl) ? 1.35 : 1),
      tick: (pl, dt) => { if (low(pl)) mend(pl, pl.maxHp * 0.02 * dt); }
    });
    def('blaze', 'Below 50% HP: +30% damage and your hits can ignite enemies.', {
      out: pl => (low(pl) ? 1.3 : 1),
      hit: (pl, e) => { if (low(pl) && Math.random() < 0.35) e.applyBurn(1); }
    });
    def('torrent', 'Below 50% HP: take 30% less damage and move 25% faster.', {
      inMul: pl => (low(pl) ? 0.7 : 1),
      speed: pl => (low(pl) ? 1.25 : 1)
    });
    def('swarm', 'Below 50% HP: all your moves recharge 25% faster.', {
      tick: pl => { const s = S(pl), on = low(pl); if (on !== !!s.sw) { pl.cdMul *= on ? 0.75 : 1 / 0.75; s.sw = on; } }
    });

    // ---- starters' hidden abilities and friends ----
    def('chlorophyll', '+20% speed and slow regeneration (0.6% HP/s).', {
      speed: () => 1.2,
      tick: (pl, dt) => mend(pl, pl.maxHp * 0.006 * dt)
    });
    def('solar-power', '+30% damage, but you lose 0.8% HP/s (never below 1).', {
      out: () => 1.3,
      tick: (pl, dt) => { pl.hp = Math.max(1, pl.hp - pl.maxHp * 0.008 * dt); }
    });
    def('rain-dish', 'Standing still heals 3% HP/s.', {
      tick: (pl, dt) => { if (!pl.walking) mend(pl, pl.maxHp * 0.03 * dt); }
    });
    def('flash-fire', 'Absorbs Fire attacks. +30% damage to burning enemies.', {
      absorb: 'fire',
      out: (pl, m, e) => (e && e.burn > 0 ? 1.3 : 1)
    });
    def('speed-boost', '+4% speed every 6 s (up to +40%). Resets when you are hurt.', {
      speed: pl => 1 + (S(pl).sb || 0) * 0.04,
      tick: (pl, dt) => every(pl, 'sbT', 6, dt, () => { const s = S(pl); s.sb = Math.min(10, (s.sb || 0) + 1); }),
      hurt: pl => { S(pl).sb = 0; }
    });
    def('unburden', '+40% speed while you carry no item.', { speed: pl => (pl.item ? 1 : 1.4) });
    def('magician', 'Your hits have a 6% chance to drop a coin.', {
      hit: (pl, e) => { if (Math.random() < 0.06) G.Pickups.drop('coin', e.x + G.U.rand(-10, 10), e.y, 3); }
    });
    def('moxie', 'Each kill gives +4% damage for 15 s (stacks up to 10 times).', {
      kill: pl => { const s = S(pl); s.mx = Math.min(10, (s.mx || 0) + 1); s.mxT = 15; },
      tick: (pl, dt) => { const s = S(pl); if (s.mxT > 0 && (s.mxT -= dt) <= 0) s.mx = 0; },
      out: pl => 1 + (S(pl).mx || 0) * 0.04
    });
    def('libero', 'Switching moves gives +30% damage for 6 s.', {
      tick: (pl, dt) => { const s = S(pl); if (switched(pl)) { s.liT = 6; pop(pl, 'Libero!', '#ffd23f'); } if (s.liT > 0) s.liT -= dt; },
      out: pl => (S(pl).liT > 0 ? 1.3 : 1)
    });
    def('protean', 'Switching moves gives +25% speed for 5 s.', {
      tick: (pl, dt) => { const s = S(pl); if (switched(pl)) { s.prT = 5; pop(pl, 'Protean!', '#9fd8ff'); } if (s.prT > 0) s.prT -= dt; },
      speed: pl => (S(pl).prT > 0 ? 1.25 : 1)
    });
    def('contrary', 'When hurt: 15% chance to heal 4% max HP.', {
      hurt: pl => { if (Math.random() < 0.15) { mend(pl, pl.maxHp * 0.04); pop(pl, 'Contrary!', '#7dffb0'); } }
    });
    def('thick-fat', 'Take 40% less damage from Fire and Ice.', {
      inMul: (pl, type) => (type === 'fire' || type === 'ice' ? 0.6 : 1)
    });
    def('sheer-force', 'No burn, poison, slow or knockback on your hits, but +30% damage.', {
      sheer: true, out: () => 1.3
    });
    def('shell-armor', 'Blocks one hit every 10 s.', {
      dodge: pl => {
        const s = S(pl), t = T();
        if (t - (s.sa == null ? -99 : s.sa) > 10) { s.sa = t; pop(pl, 'Blocked!', '#bfe8ff'); return 1; }
        return 0;
      }
    });
    def('competitive', 'When hurt: +12% damage for 8 s (stacks up to 5 times).', {
      hurt: pl => pl.addBuff('atk', 0.12, 8, 5)
    });
    def('long-reach', '+30% damage to enemies more than 160 away.', {
      out: (pl, m, e) => (e && Math.hypot(e.x - pl.x, e.y - pl.y) > 160 ? 1.3 : 1)
    });
    def('intimidate', 'Enemies close to you are slowed by 15%.', {
      tick: (pl, dt) => every(pl, 'in', 0.5, dt, () => { for (const e of around(pl, 130)) if (!e.remote && !e.arceus) e.applySlow(0.15, 0.7); })
    });
    def('liquid-voice', 'Your hits have a 20% chance to slow the target.', {
      hit: (pl, e) => { if (Math.random() < 0.2) e.applySlow(0.35, 1.5); }
    });
    def('bulletproof', 'Take 30% less damage from special attackers.', {
      inMul: (pl, type, cls) => (cls === 's' ? 0.7 : 1)
    });
    def('grassy-surge', 'Every 8 s a healing pulse restores 6% max HP.', {
      tick: (pl, dt) => every(pl, 'gs', 8, dt, () => { mend(pl, pl.maxHp * 0.06); G.FX.ring(pl.x, pl.y, 6, 80, '#7fe05a', 0.5, 3); })
    });
    def('sniper', 'Critical hits deal x2.2 instead of x1.5.', { critMul: 2.2 });
    def('unaware', 'Take 15% less damage; +15% damage to bosses.', {
      inMul: () => 0.85,
      out: (pl, m, e) => (e && e.boss ? 1.15 : 1)
    });
    def('iron-fist', 'Melee-style moves deal +35% damage.', {
      out: (pl, m) => (isKind(m, MELEE) ? 1.35 : 1)
    });
    def('reckless', '+30% damage, but you take 15% more damage.', {
      out: () => 1.3, inMul: () => 1.15
    });

    // ---- other common abilities ----
    def('static', 'Enemies that touch you have a 30% chance to be stunned for 1 s.', {
      contact: (pl, e) => { if (Math.random() < 0.3) e.applyStun(1); }
    });
    def('lightning-rod', 'Absorbs Electric. Every 7 s lightning strikes the nearest enemy.', {
      absorb: 'electric',
      tick: (pl, dt) => every(pl, 'lr', 7, dt, () => {
        const e = nearest(pl, 380);
        if (!e || e.dead) return;
        e.hurt(Math.max(30, pl.atk * 4), '#ffe14d', 0, 0, 0);
        G.FX.ring(e.x, e.y, 6, 70, '#ffe14d', 0.3, 3);
        G.FX.burst(e.x, e.y - 6, '#ffe14d', 14, 200);
      })
    });
    def('run-away', '+15% speed and 8% chance to dodge.', { speed: () => 1.15, dodge: () => 0.08 });
    def('adaptability', 'Moves of your own type deal +25% damage.', {
      out: (pl, m) => (m && pl.mon.types.includes(m.type) ? 1.25 : 1)
    });
    def('anticipation', '10% chance to dodge any hit.', { dodge: () => 0.1 });
    def('levitate', 'Hover over water and lava; Ground attacks heal you instead.', {
      levitate: true, absorb: 'ground'
    });
    def('pressure', '+10% damage for every 8 enemies near you (up to +40%).', {
      tick: (pl, dt) => every(pl, 'pr', 0.3, dt, () => { S(pl).crowd = around(pl, 160).length; }),
      out: pl => 1 + Math.min(0.4, Math.floor((S(pl).crowd || 0) / 8) * 0.1)
    });
    def('guts', '+40% damage while below 70% HP.', {
      out: pl => (pl.hp < pl.maxHp * 0.7 ? 1.4 : 1)
    });
    def('hustle', '+30% damage, but moves recharge 15% slower.', { cdMul: 1.15, out: () => 1.3 });
    def('technician', 'Fast moves (recharge under 0.8 s) deal +40% damage.', {
      out: (pl, m) => (m && m.cd < 0.8 ? 1.4 : 1)
    });
    def('huge-power', '+50% damage.', { out: () => 1.5 });
    def('pure-power', '+25% damage and critical hits deal x1.8.', { out: () => 1.25, critMul: 1.8 });
    def('sturdy', 'Survive a fatal hit with 1 HP (once per 90 s); 10% less damage while above 90% HP.', {
      sturdy: true, inMul: pl => (pl.hp > pl.maxHp * 0.9 ? 0.9 : 1)
    });
    def('natural-cure', 'Every 10 s: clear slowdowns and heal 4% max HP.', {
      tick: (pl, dt) => every(pl, 'nc', 10, dt, () => { pl.slowT = 0; mend(pl, pl.maxHp * 0.04); G.FX.ring(pl.x, pl.y, 6, 60, '#9dffb8', 0.4, 3); })
    });
    def('regenerator', 'Each kill heals 1.5% max HP.', { kill: pl => mend(pl, pl.maxHp * 0.015) });
    def('poison-point', 'Enemies that touch you are poisoned.', { contact: (pl, e) => e.applyPoison(2) });
    def('flame-body', 'Enemies that touch you are set on fire.', { contact: (pl, e) => e.applyBurn(2) });
    def('cute-charm', 'Enemies that touch you have a 25% chance to fall asleep for 2 s.', {
      contact: (pl, e) => { if (Math.random() < 0.25) e.applySleep(2); }
    });
    def('effect-spore', 'Enemies that touch you have a 25% chance to be poisoned, burned or put to sleep.', {
      contact: (pl, e) => {
        if (Math.random() >= 0.25) return;
        const r = Math.random();
        if (r < 0.34) e.applyPoison(2); else if (r < 0.67) e.applyBurn(2); else e.applySleep(2);
      }
    });
    def('rough-skin', 'Enemies that touch you take damage.', {
      contact: (pl, e) => e.hurt(6 + pl.level * 3, '#9aa6b5', e.x - pl.x, e.y - pl.y, 60)
    });
    def('iron-barbs', 'Enemies that touch you take heavy damage and are pushed back.', {
      contact: (pl, e) => e.hurt(12 + pl.level * 4, '#9aa6b5', e.x - pl.x, e.y - pl.y, 120)
    });
    def('synchronize', 'Damage you take is reflected: the nearest enemy takes 150% of it.', {
      tick: pl => { S(pl).lh = pl.hp; },
      hurt: pl => {
        const lost = Math.max(0, (S(pl).lh || pl.hp) - pl.hp), e = nearest(pl, 260);
        if (lost > 0 && e && !e.dead) e.hurt(lost * 1.5, '#ff8ad8', e.x - pl.x, e.y - pl.y, 0);
      }
    });
    def('inner-focus', '+12% critical hit chance.', { start: pl => { pl.critChance = (pl.critChance || 0) + 0.12; } });
    def('keen-eye', '+10% critical hit chance and +30% pickup radius.', {
      start: pl => { pl.critChance = (pl.critChance || 0) + 0.1; pl.magnet *= 1.3; }
    });
    def('super-luck', '+15% critical hit chance.', { start: pl => { pl.critChance = (pl.critChance || 0) + 0.15; } });
    def('serene-grace', 'Status effects from your moves are twice as strong; +10% damage.', { serene: true, out: () => 1.1 });
    def('swift-swim', '+10% speed, and +40% while in water or lava.', { speed: pl => (pl.inLiquid ? 1.4 : 1.1) });
    def('water-absorb', 'Absorbs Water attacks and regenerates 0.5% HP/s.', {
      absorb: 'water', tick: (pl, dt) => mend(pl, pl.maxHp * 0.005 * dt)
    });
    def('volt-absorb', 'Absorbs Electric attacks and moves 8% faster.', { absorb: 'electric', speed: () => 1.08 });
    def('multiscale', 'Take 50% less damage while at full HP.', { inMul: pl => (pl.hp >= pl.maxHp * 0.99 ? 0.5 : 1) });
    def('marvel-scale', 'Take 35% less damage while below 50% HP.', { inMul: pl => (low(pl) ? 0.65 : 1) });
    def('solid-rock', 'Super effective hits against you deal 40% less.', {
      inMul: (pl, type) => (type && G.Types.mult(type, pl.mon.types) > 1 ? 0.6 : 1)
    });
    def('filter', 'Super effective hits against you deal 30% less.', {
      inMul: (pl, type) => (type && G.Types.mult(type, pl.mon.types) > 1 ? 0.7 : 1)
    });
    def('magic-guard', 'Immune to lava damage and take 10% less damage.', { lavaProof: true, inMul: () => 0.9 });
    def('fur-coat', 'Take 40% less physical damage.', { inMul: (pl, type, cls) => (cls === 'p' ? 0.6 : 1) });
    def('stamina', 'Each hit you take gives +4% damage reduction for 8 s (stacks up to 8 times).', {
      hurt: pl => pl.addBuff('def', 0.04, 8, 8)
    });
    def('weak-armor', 'When hurt: +6% speed for 6 s (stacks up to 5 times).', {
      hurt: pl => pl.addBuff('spd', 0.06, 6, 5)
    });
    def('steadfast', 'When hurt: +20% speed for 4 s.', {
      hurt: pl => { S(pl).stT = 4; },
      tick: (pl, dt) => { const s = S(pl); if (s.stT > 0) s.stT -= dt; },
      speed: pl => (S(pl).stT > 0 ? 1.2 : 1)
    });
    def('analytic', '+30% damage to enemies that are almost at full HP.', {
      out: (pl, m, e) => (e && e.hp >= e.maxHp * 0.95 ? 1.3 : 1)
    });
    def('tinted-lens', 'Not very effective hits deal 50% more damage.', {
      out: (pl, m, e) => (m && e && G.Types.mult(m.type, e.types) < 1 ? 1.5 : 1)
    });
    def('mold-breaker', 'Deals 50% more damage to shielded enemies.', {
      out: (pl, m, e) => (e && e.shield > 0 ? 1.5 : 1)
    });
    def('beast-boost', 'Each kill gives +1.5% damage for the rest of the run (up to +30%).', {
      kill: pl => { const s = S(pl); s.bb = Math.min(20, (s.bb || 0) + 1); },
      out: pl => 1 + (S(pl).bb || 0) * 0.015
    });
    def('cursed-body', 'When hurt: the nearest enemy is slowed by 60% for 2 s.', {
      hurt: pl => { const e = nearest(pl, 260); if (e && !e.dead && !e.remote) e.applySlow(0.6, 2); }
    });
    def('dark-aura', 'Dark moves deal +40% damage.', { out: (pl, m) => (typed(m, 'dark') ? 1.4 : 1) });
    def('fairy-aura', 'Fairy moves deal +40% damage.', { out: (pl, m) => (typed(m, 'fairy') ? 1.4 : 1) });
    def('dragons-maw', 'Dragon moves deal +50% damage.', { out: (pl, m) => (typed(m, 'dragon') ? 1.5 : 1) });
    def('steelworker', 'Steel moves deal +40% damage.', { out: (pl, m) => (typed(m, 'steel') ? 1.4 : 1) });
    def('strong-jaw', 'Bite-range moves (melee, dash, cone) deal +30% damage.', {
      out: (pl, m) => (isKind(m, ['melee', 'cone', 'dash']) ? 1.3 : 1)
    });
    def('mega-launcher', 'Projectile and beam moves deal +30% damage.', {
      out: (pl, m) => (isKind(m, SHOTS) ? 1.3 : 1)
    });
    def('skill-link', 'Moves that fire 3 or more shots deal +30% damage.', {
      out: (pl, m) => (m && m.count >= 3 ? 1.3 : 1)
    });
    def('sharpness', '+10% critical hit chance; melee-style moves deal +20% damage.', {
      start: pl => { pl.critChance = (pl.critChance || 0) + 0.1; },
      out: (pl, m) => (isKind(m, MELEE) ? 1.2 : 1)
    });
    def('pickup', 'Each kill has a 3% chance to drop 5 coins.', {
      kill: (pl, e) => { if (Math.random() < 0.03) G.Pickups.drop('coin', e.x, e.y, 5); }
    });
    def('honey-gather', 'Each kill has a 2% chance to drop a healing berry.', {
      kill: (pl, e) => { if (Math.random() < 0.02) G.Pickups.drop('heal', e.x, e.y, 0); }
    });
    def('gluttony', 'Healing is 60% stronger and your pickup radius is 30% bigger.', {
      healMul: 1.6, start: pl => { pl.magnet *= 1.3; }
    });
    def('sand-veil', '12% chance to dodge any hit.', { dodge: () => 0.12 });
    def('snow-cloak', '12% chance to dodge any hit.', { dodge: () => 0.12 });

    // ---- plug the table into the game ----
    const BEHAVIOR = ['cdMul', 'start', 'tick', 'speed', 'steady', 'absorb', 'dodge', 'inMul', 'hurt', 'sturdy', 'healMul', 'summon',
                      'levitate', 'lavaProof', 'out', 'critMul', 'sheer', 'serene', 'hit', 'touchPoison', 'contact', 'statusCd', 'kill'];
    const FALLBACK = { speed: 1, out: 1, inMul: 1, dodge: 0 };
    function guard(o) {
      for (const k of Object.keys(o)) {
        if (typeof o[k] !== 'function') continue;
        const f = o[k], fb = FALLBACK[k];
        o[k] = function () {
          try { return f.apply(this, arguments); }
          catch (e) { if (!warned) { warned = true; console.warn('[extras] ability hook failed:', k, e); } return fb; }
        };
      }
      return o;
    }
    const origOf = G.AbilityFX.of;
    G.AbilityFX.of = function (id) {
      const base = origOf.apply(this, arguments) || {};
      const x = AB[id];
      if (!x) return base;
      const o = Object.assign({}, base);
      for (const k of BEHAVIOR) delete o[k];
      Object.assign(o, x.h);
      return guard(o);
    };

    // Pause screen: show what your ability does
    const origPause = G.RunUI.showPause;
    G.RunUI.showPause = function () {
      const r = origPause.apply(this, arguments);
      try {
        const pl = G.Game.player, x = pl && AB[pl.abilId], box = document.getElementById('pause-sum');
        if (x && box) {
          const nm = (G.Mons.abilityName && G.Mons.abilityName(pl.abilId)) || pl.abilId;
          box.insertAdjacentHTML('afterbegin', '<p class="sub" style="margin:6px 0" translate="no"><b class="gold">Ability: ' + nm + '</b><br>' + x.d + '</p>');
        }
      } catch (e) { /* nada */ }
      return r;
    };
    console.info('[extras] ' + Object.keys(AB).length + ' abilities, ' + NEW_ITEMS.length + ' items');
  }
})();
