(() => {
  const $ = (sel) => document.querySelector(sel);
  const statusBanner = $('#status-banner');
  const mulliganScreen = $('#mulligan-screen');
  const mulliganHandEl = $('#mulligan-hand');
  const mulliganConfirmBtn = $('#mulligan-confirm');
  const boardScreen = $('#board');
  const opponentArea = $('#opponent-area');
  const youArea = $('#you-area');
  const battleStrip = $('#battle-strip');
  const phaseBar = $('#phase-bar');
  const handArea = $('#hand-area');
  const actionBar = $('#action-bar');
  const logPanel = $('#log-panel');
  const revealOverlay = $('#reveal-overlay');
  const revealLabel = $('#reveal-label');
  const revealCard = $('#reveal-card');
  const revealSub = $('#reveal-sub');
  const toastStack = $('#toast-stack');

  let ws;
  let myId = null;
  let latest = null;

  // ---- selection state ----
  let mulliganSelected = new Set();
  let selectedHandIndex = null; // for ride/call
  let selectedAttackerSlot = null;
  let selectedBoosterSlot = null;
  let selectedTargetSlot = null;

  // ---- event queue (ride/drive/damage popups + ability-order toasts) ----
  let lastSeenSeq = null; // null = not initialized yet (first state snapshot sets baseline)
  let eventQueue = [];
  let processingQueue = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => showStatus('Connecting…');
    ws.onclose = () => showStatus('Disconnected. Refresh to reconnect.');
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'waiting') showStatus('Waiting for an opponent to join… (open this page in another tab/device)');
      else if (msg.type === 'assigned') { myId = msg.playerId; hideStatus(); }
      else if (msg.type === 'opponent_disconnected') showStatus('Opponent disconnected.');
      else if (msg.type === 'error') showStatus(msg.error, true);
      else if (msg.type === 'state') { latest = msg.state; ingestEvents(latest.events || []); render(); }
    };
  }

  // ---------------- Event queue: popups + ability-order toasts ----------------
  function ingestEvents(events) {
    if (lastSeenSeq === null) {
      // First snapshot we ever see — don't replay pre-existing history, just set baseline.
      lastSeenSeq = events.length ? events[events.length - 1].seq : 0;
      return;
    }
    const fresh = events.filter((e) => e.seq > lastSeenSeq);
    if (!fresh.length) return;
    lastSeenSeq = fresh[fresh.length - 1].seq;
    eventQueue.push(...fresh);
    processQueue();
  }

  const REVEAL_TYPES = new Set(['ride', 'drive_check', 'damage_check']);

  function processQueue() {
    if (processingQueue) return;
    processingQueue = true;
    step();
    function step() {
      const e = eventQueue.shift();
      if (!e) { processingQueue = false; return; }
      if (REVEAL_TYPES.has(e.type)) {
        runReveal(e, step);
      } else {
        runToast(e);
        setTimeout(step, 550); // small stagger so toasts visibly resolve in order
      }
    }
  }

  function runReveal(e, done) {
    let label = '', sub = '';
    let labelClass = '';
    if (e.type === 'ride') {
      label = `${e.playerName} rides!`;
    } else if (e.type === 'drive_check') {
      labelClass = 'drive';
      label = e.driveTotal === 2 ? `Drive Check ${e.driveIndex}/2 — Twin Drive!!` : 'Drive Check';
      sub = e.card.trigger ? `${e.card.trigger.type.toUpperCase()} TRIGGER — +${e.card.trigger.power} power to ${e.playerName}` : '';
    } else if (e.type === 'damage_check') {
      labelClass = 'damage';
      label = `${e.playerName} — Damage Check`;
      sub = e.card.trigger ? `${e.card.trigger.type.toUpperCase()} TRIGGER!` : '';
    }
    revealLabel.className = labelClass;
    revealLabel.textContent = label;
    revealCard.className = 'card' + (e.card && e.card.trigger ? ' trigger-glow' : '');
    revealCard.innerHTML = cardInner(e.card);
    revealSub.textContent = sub;
    revealOverlay.classList.remove('hidden');

    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      revealOverlay.removeEventListener('click', advance);
      revealOverlay.classList.add('hidden');
      done();
    };
    revealOverlay.addEventListener('click', advance);
    setTimeout(advance, e.type === 'ride' ? 1500 : 1700);
  }

  function runToast(e) {
    let text = '';
    let cls = '';
    if (e.type === 'attack_declared') {
      text = `<span class="toast-tag">⚔ Attack</span>${e.playerName}'s ${e.attackerName} → ${e.targetSlot}${e.isTwinDrive ? ' (Twin Drive)' : ''}`;
    } else if (e.type === 'guard') {
      cls = 'guard';
      text = `<span class="toast-tag">🛡 Guard</span>${e.playerName} calls ${e.card.name} (+${e.shield})`;
    } else if (e.type === 'intercept') {
      cls = 'guard';
      text = `<span class="toast-tag">🛡 Intercept</span>${e.playerName}'s ${e.card.name} drops back to guard (+${e.shield})`;
    } else if (e.type === 'trigger_effect') {
      text = `<span class="toast-tag">✦ Trigger</span>${e.playerName} ${e.text}`;
    } else if (e.type === 'skill') {
      text = `<span class="toast-tag">✦ Skill</span>${e.cardName}: ${e.text}`;
    } else if (e.type === 'battle_result') {
      cls = e.hit ? 'hit' : 'guard';
      text = e.hit
        ? `<span class="toast-tag">💥 Hit</span>${e.attackTotal} vs ${e.defenseTotal}${e.critAmount ? ` — ${e.critAmount} damage!` : ''}`
        : `<span class="toast-tag">🛡 Blocked</span>${e.attackTotal} vs ${e.defenseTotal}`;
    } else {
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.innerHTML = text;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  function showStatus(text, isError) {
    statusBanner.textContent = text;
    statusBanner.classList.remove('hidden');
    statusBanner.style.borderLeftColor = isError ? 'var(--crimson)' : 'var(--gold)';
    if (!isError) setTimeout(() => { if (statusBanner.textContent === text) hideStatus(); }, 4000);
  }
  function hideStatus() { statusBanner.classList.add('hidden'); }

  function send(type, payload) { ws.send(JSON.stringify({ type, ...payload })); }

  function clanClass(clan) {
    return clan === 'Radiant Sword' ? 'radiant-sword' : clan === 'Ashen Fang' ? 'ashen-fang' : '';
  }

  function cardInner(card) {
    if (!card) return '';
    if (card.hidden) return `<div class="card-name">🂠</div>`;
    return `
      ${card.trigger ? `<div class="trigger-tag">${card.trigger.type}</div>` : ''}
      <div class="card-name">${card.name}</div>
      <div class="card-clan">${card.clan} · G${card.grade}</div>
      <div class="card-stats"><span class="card-power">${card.power}</span><span class="card-shield">${card.shield ? '🛡' + card.shield : ''}</span></div>
    `;
  }

  function render() {
    if (!latest) return;
    if (latest.phase === 'mulligan') {
      mulliganScreen.classList.remove('hidden');
      boardScreen.classList.add('hidden');
      renderMulligan();
    } else {
      mulliganScreen.classList.add('hidden');
      boardScreen.classList.remove('hidden');
      renderBoard();
    }
  }

  // ---------------- Mulligan ----------------
  function renderMulligan() {
    const me = latest.players[myId];
    if (!me) return;
    if (me.mulliganDone) {
      mulliganHandEl.innerHTML = '<p style="color:var(--text-dim)">Waiting for opponent to finish their mulligan…</p>';
      mulliganConfirmBtn.disabled = true;
      return;
    }
    mulliganConfirmBtn.disabled = false;
    mulliganHandEl.innerHTML = '';
    me.hand.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'hand-card ' + clanClass(card.clan) + ' card';
      if (mulliganSelected.has(i)) el.classList.add('marked-out');
      el.innerHTML = cardInner(card);
      el.onclick = () => {
        if (mulliganSelected.has(i)) mulliganSelected.delete(i); else mulliganSelected.add(i);
        renderMulligan();
      };
      mulliganHandEl.appendChild(el);
    });
  }
  mulliganConfirmBtn.onclick = () => {
    send('mulligan', { indices: Array.from(mulliganSelected) });
    mulliganSelected = new Set();
  };

  // ---------------- Board ----------------
  function renderBoard() {
    const me = latest.players[myId];
    const oppId = latest.order.find((id) => id !== myId);
    const opp = latest.players[oppId];
    if (!me || !opp) return;

    renderPlayerArea(opponentArea, opp, oppId, true);
    renderPlayerArea(youArea, me, myId, false);
    renderBattleStrip();
    renderPhaseBar();
    renderHand(me);
    renderActionBar();
    renderLog();
  }

  function isMyTurnBattlePhaseGlobal() {
    return latest.phase === 'battle' && latest.turnPlayer === myId && !latest.battle;
  }
  function validTargetSlots(opp) {
    if (!selectedAttackerSlot) return [];
    if (selectedAttackerSlot === 'VG') {
      return ['VG', 'FL', 'FR'].filter((slot) => slot === 'VG' || !!opp.rc[slot]);
    }
    return opp.rc[selectedAttackerSlot] ? [selectedAttackerSlot] : [];
  }

  function slotEl(label, card, opts) {
    const div = document.createElement('div');
    div.className = 'slot' + (label === 'VG' ? ' vg' : '') + (!card ? ' empty' : '');
    if (card) div.classList.add('card', clanClass(card.clan));
    if (opts.rested) div.classList.add('rested');
    if (opts.selectable) div.classList.add('selectable');
    if (opts.selected) div.classList.add('selected');
    div.innerHTML = `<div class="slot-label">${label}</div>` + cardInner(card);
    if (opts.onClick) div.onclick = opts.onClick;
    return div;
  }

  function renderPlayerArea(container, p, pid, isOpponent) {
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'player-header';
    header.innerHTML = `
      <span>${p.name}${pid === latest.turnPlayer ? ' <span class="active-tag">Turn</span>' : ''}</span>
      <span class="zone-counts">
        <span>Deck <b>${p.deckCount}</b></span>
        <span>Hand <b>${p.handCount}</b></span>
        <span>Damage <b>${p.damageCount}</b>/6</span>
        <span>Drop <b>${p.drop.length}</b></span>
      </span>
    `;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'field-grid';

    const battle = latest.battle;
    const inGuardStep = battle && battle.stage === 'guard';
    const isMyTurnBattlePhase = latest.phase === 'battle' && latest.turnPlayer === myId && !battle && pid === myId;

    const makeAttackerSlot = (label, card, rested) => {
      const canSelectAttacker = isMyTurnBattlePhase && card && !rested && ['VG', 'FL', 'FR'].includes(label);
      const selected = selectedAttackerSlot === label && pid === myId;
      return slotEl(label, card, {
        rested,
        selectable: canSelectAttacker,
        selected,
        onClick: canSelectAttacker ? () => { selectedAttackerSlot = label; selectedBoosterSlot = null; selectedTargetSlot = null; renderBoard(); } : null,
      });
    };
    const makeBoosterSlot = (label, card, rested) => {
      const boostTarget = { BL: 'FL', BR: 'FR', BC: 'VG' }[label];
      const canSelectBooster = isMyTurnBattlePhase && card && !rested && selectedAttackerSlot === boostTarget;
      const selected = selectedBoosterSlot === label;
      return slotEl(label, card, {
        rested,
        selectable: canSelectBooster,
        selected,
        onClick: canSelectBooster ? () => { selectedBoosterSlot = (selectedBoosterSlot === label ? null : label); renderBoard(); } : null,
      });
    };
    const makeCallSlot = (label, card) => {
      const canCall = latest.phase === 'main' && latest.turnPlayer === myId && pid === myId && !card && selectedHandIndex !== null;
      return slotEl(label, card, {
        selectable: canCall,
        onClick: canCall ? () => { send('call', { handIndex: selectedHandIndex, slot: label }); selectedHandIndex = null; } : null,
      });
    };
    const makeInterceptSlot = (label, card, rested) => {
      const canIntercept = inGuardStep && battle.targetId === myId && pid === myId && !!card && !rested;
      const div = slotEl(label, card, {
        rested,
        selectable: canIntercept,
        onClick: canIntercept ? () => send('intercept', { slot: label }) : null,
      });
      if (canIntercept) div.classList.add('interceptable');
      return div;
    };

    // back row
    ['BL', 'BC', 'BR'].forEach((slot) => {
      const card = p.rc[slot];
      const rested = !!p.restedBack[slot];
      const el = pid === myId ? makeBoosterSlot(slot, card, rested) : slotEl(slot, card, { rested });
      if (pid === myId && !card && latest.phase === 'main' && latest.turnPlayer === myId) {
        const callable = makeCallSlot(slot, card);
        grid.appendChild(callable);
      } else {
        grid.appendChild(el);
      }
    });
    // front row: FL, VG, FR
    const frontOrder = [['FL', p.rc.FL, !!p.restedFront.FL], ['VG', p.vanguard, !!p.restedFront.VG], ['FR', p.rc.FR, !!p.restedFront.FR]];
    const isTargetableOpponent = isOpponent && isMyTurnBattlePhaseGlobal() && selectedAttackerSlot;
    frontOrder.forEach(([slot, card, rested]) => {
      if (slot !== 'VG' && pid === myId && !card && latest.phase === 'main' && latest.turnPlayer === myId) {
        grid.appendChild(makeCallSlot(slot, card));
      } else if (slot !== 'VG' && pid === myId && inGuardStep && battle.targetId === myId) {
        grid.appendChild(makeInterceptSlot(slot, card, rested));
      } else if (pid === myId) {
        grid.appendChild(makeAttackerSlot(slot, card, rested));
      } else if (isTargetableOpponent && validTargetSlots(p).includes(slot)) {
        const selected = selectedTargetSlot === slot;
        grid.appendChild(slotEl(slot, card, {
          selectable: true,
          selected,
          onClick: () => { selectedTargetSlot = slot; renderBoard(); },
        }));
      } else {
        grid.appendChild(slotEl(slot, card, { rested }));
      }
    });

    container.appendChild(grid);

    // guarding UI shows under the defending player's own area
    if (inGuardStep && battle.targetId === myId && pid === myId) {
      const note = document.createElement('div');
      note.style.cssText = 'text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--gold);margin-top:4px;';
      note.textContent = `Guard step — shield so far: ${battle.guardShield}. Click hand cards to guard, or click a blue-highlighted front-row rearguard to intercept.`;
      container.appendChild(note);
    }
  }

  function renderBattleStrip() {
    const b = latest.battle;
    if (!b) { battleStrip.textContent = ''; return; }
    const atkName = latest.players[b.attackerId].name;
    const defName = latest.players[b.targetId].name;
    const twinTag = b.driveTotal === 2 ? ` <span class="twin-drive-tag">TWIN DRIVE</span>` : '';
    const driveTag = b.driveTotal > 0 ? ` · drive ${b.driveDone}/${b.driveTotal}` : '';
    battleStrip.innerHTML = `⚔ ${atkName}'s ${b.attacker.name} (${b.attacker.power}${b.boostPower ? '+' + b.boostPower : ''}${b.driveTriggerPower ? '+' + b.driveTriggerPower : ''})${twinTag} attacks ${defName}'s ${b.targetSlot} — ${b.target.name} (${b.target.power}) — stage: ${b.stage}${driveTag}`;
  }

  function renderPhaseBar() {
    const phases = ['stand_draw', 'ride', 'main', 'battle', 'end'];
    phaseBar.innerHTML = phases.map((ph) =>
      `<span class="phase-pip${latest.phase === ph ? ' active' : ''}">${ph.replace('_', '/')}</span>`
    ).join('');
  }

  function renderHand(me) {
    handArea.innerHTML = '';
    const battle = latest.battle;
    const inGuardStep = battle && battle.stage === 'guard' && battle.targetId === myId;
    const canRide = latest.phase === 'ride' && latest.turnPlayer === myId && !me.hasRiddenThisTurn;
    const canPickForMain = latest.phase === 'main' && latest.turnPlayer === myId;

    me.hand.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'hand-card ' + clanClass(card.clan) + ' card';
      if (selectedHandIndex === i) el.classList.add('selected');
      el.innerHTML = cardInner(card);

      if (inGuardStep) {
        el.onclick = () => send('guard', { handIndex: i });
      } else if (canRide) {
        el.onclick = () => send('ride', { handIndex: i });
        el.title = 'Click to ride';
      } else if (canPickForMain) {
        el.onclick = () => { selectedHandIndex = (selectedHandIndex === i ? null : i); renderBoard(); };
      }
      handArea.appendChild(el);
    });
  }

  function renderActionBar() {
    actionBar.innerHTML = '';
    const me = latest.players[myId];
    const isMyTurn = latest.turnPlayer === myId;
    const battle = latest.battle;

    const addBtn = (label, onClick, opts = {}) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (opts.primary) b.classList.add('primary');
      if (opts.danger) b.classList.add('danger');
      b.onclick = onClick;
      actionBar.appendChild(b);
      return b;
    };

    if (latest.winner) {
      addBtn(latest.winner === myId ? '🏆 You win! (refresh to play again)' : 'You lost. (refresh to play again)', () => location.reload(), { primary: true });
      return;
    }

    if (battle && battle.stage === 'guard' && battle.targetId === myId) {
      addBtn('Finish Guarding', () => send('finishGuardStep', {}), { primary: true });
      return;
    }
    if (battle) {
      actionBar.innerHTML = `<span style="color:var(--text-dim);font-family:var(--font-mono);font-size:12px;align-self:center;">Waiting on opponent…</span>`;
      return;
    }
    if (!isMyTurn) {
      actionBar.innerHTML = `<span style="color:var(--text-dim);font-family:var(--font-mono);font-size:12px;align-self:center;">Opponent's turn…</span>`;
      return;
    }

    if (latest.phase === 'ride') {
      addBtn('Proceed to Main Phase →', () => send('proceedToMain', {}), { primary: true });
    } else if (latest.phase === 'main') {
      addBtn('Proceed to Battle Phase →', () => send('proceedToBattle', {}), { primary: true });
    } else if (latest.phase === 'battle') {
      const canDeclare = selectedAttackerSlot !== null && selectedTargetSlot !== null;
      const btn = addBtn('Declare Attack', () => {
        send('declareAttack', { attackerSlot: selectedAttackerSlot, boosterSlot: selectedBoosterSlot, targetSlot: selectedTargetSlot });
        selectedAttackerSlot = null; selectedBoosterSlot = null; selectedTargetSlot = null;
      }, { primary: true });
      btn.disabled = !canDeclare;
      if (selectedAttackerSlot && !selectedTargetSlot) {
        const hint = document.createElement('span');
        hint.style.cssText = 'color:var(--text-dim);font-family:var(--font-mono);font-size:11px;align-self:center;';
        hint.textContent = 'Click an opponent unit to target it';
        actionBar.appendChild(hint);
      }
      addBtn('End Battle Phase', () => send('endBattlePhase', {}), { danger: true });
    }
  }

  function renderLog() {
    logPanel.innerHTML = latest.log.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  connect();
})();
