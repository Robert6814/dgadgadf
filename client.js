(() => {
  const $ = (sel) => document.querySelector(sel);
  
  // Screens
  const introScreen = $('#intro-screen');
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
  
  // Card detail modal
  const cardDetailModal = $('#card-detail-modal');
  const modalOverlay = $('.modal-overlay');
  const modalClose = $('.modal-close');
  const detailCardName = $('#detail-card-name');
  const detailCardClan = $('#detail-card-clan');
  const detailCardGrade = $('#detail-card-grade');
  const detailCardStats = $('#detail-card-stats');
  const detailCardSkill = $('#detail-card-skill');
  const detailCardArt = $('#detail-card-art');
  
  // Attack animation
  const attackAnimation = $('#attack-animation');

  let ws;
  let myId = null;
  let latest = null;

  // Selection state
  let mulliganSelected = new Set();
  let selectedHandIndex = null;
  let selectedAttackerSlot = null;
  let selectedBoosterSlot = null;
  let selectedTargetSlot = null;

  // Event queue
  let lastSeenSeq = null;
  let eventQueue = [];
  let processingQueue = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    
    ws.onopen = () => showStatus('Connecting…');
    
    ws.onclose = () => showStatus('Disconnected. Refresh to reconnect.');
    
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'waiting') {
        showStatus('Waiting for opponent… (open in another tab or device)');
      } else if (msg.type === 'assigned') {
        myId = msg.playerId;
        hideIntroScreen();
        hideStatus();
      } else if (msg.type === 'opponent_disconnected') {
        showStatus('Opponent disconnected.');
      } else if (msg.type === 'error') {
        showStatus(msg.error, true);
      } else if (msg.type === 'state') {
        latest = msg.state;
        ingestEvents(latest.events || []);
        render();
      }
    };
  }

  // Intro screen
  function hideIntroScreen() {
    introScreen.classList.add('hidden');
  }

  // Card detail modal functions
  function openCardDetail(card) {
    if (!card || card.hidden) return;
    
    detailCardName.textContent = card.name;
    detailCardClan.textContent = `${card.clan} • Grade ${card.grade}`;
    detailCardGrade.textContent = `G${card.grade}`;
    
    const clanEmoji = card.clan === 'Radiant Sword' ? '⚔' : '🔥';
    detailCardArt.textContent = clanEmoji;
    
    detailCardStats.innerHTML = `
      <div class="stat-item">
        <div class="stat-label">Power</div>
        <div class="stat-value">${card.power}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Shield</div>
        <div class="stat-value">${card.shield || 0}</div>
      </div>
      ${card.trigger ? `
        <div class="stat-item">
          <div class="stat-label">Trigger</div>
          <div class="stat-value">${card.trigger.type.toUpperCase()}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Trigger Pow</div>
          <div class="stat-value">+${card.trigger.power}</div>
        </div>
      ` : ''}
      ${card.critical ? `
        <div class="stat-item">
          <div class="stat-label">Critical</div>
          <div class="stat-value">${card.critical}</div>
        </div>
      ` : ''}
    `;
    
    if (card.skill) {
      detailCardSkill.innerHTML = `<strong>Skill:</strong> ${card.skill.effect}${card.skill.amount ? ` (${card.skill.amount})` : ''}`;
    } else {
      detailCardSkill.innerHTML = '';
    }
    
    cardDetailModal.classList.remove('hidden');
  }

  function closeCardDetail() {
    cardDetailModal.classList.add('hidden');
  }

  modalClose.addEventListener('click', closeCardDetail);
  modalOverlay.addEventListener('click', closeCardDetail);

  // Attack animation
  function triggerAttackAnimation() {
    const line = document.createElement('div');
    line.className = 'attack-line';
    attackAnimation.appendChild(line);
    setTimeout(() => line.remove(), 600);
  }

  // Event queue: popups + ability-order toasts
  function ingestEvents(events) {
    if (lastSeenSeq === null) {
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
      if (!e) {
        processingQueue = false;
        return;
      }
      
      if (REVEAL_TYPES.has(e.type)) {
        runReveal(e, step);
      } else {
        if (e.type === 'attack_declared') {
          triggerAttackAnimation();
        }
        runToast(e);
        setTimeout(step, 550);
      }
    }
  }

  function runReveal(e, done) {
    let label = '';
    let sub = '';
    let labelClass = '';
    
    if (e.type === 'ride') {
      label = `${e.playerName} RIDES!`;
    } else if (e.type === 'drive_check') {
      labelClass = 'drive';
      label = e.driveTotal === 2 ? `DRIVE CHECK ${e.driveIndex}/2 — TWIN DRIVE!!` : `DRIVE CHECK ${e.driveIndex}`;
      sub = e.card.trigger ? `${e.card.trigger.type.toUpperCase()} TRIGGER — +${e.card.trigger.power} power` : 'No trigger';
    } else if (e.type === 'damage_check') {
      labelClass = 'damage';
      label = `${e.playerName} — DAMAGE CHECK`;
      sub = e.card.trigger ? `${e.card.trigger.type.toUpperCase()} TRIGGER!` : '';
    }
    
    revealLabel.className = 'reveal-label ' + labelClass;
    revealLabel.textContent = label;
    revealCard.className = 'card reveal-card ' + clanClass(e.card?.clan) + (e.card && e.card.trigger ? ' trigger-glow' : '');
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
    setTimeout(advance, e.type === 'ride' ? 1800 : 2000);
  }

  function runToast(e) {
    let text = '';
    let cls = '';
    
    if (e.type === 'attack_declared') {
      text = `<span class="toast-tag">⚔ ATTACK</span>${e.attackerName} → ${e.targetSlot}${e.isTwinDrive ? ' (Twin Drive!!)' : ''}`;
    } else if (e.type === 'guard') {
      cls = 'guard';
      text = `<span class="toast-tag">🛡 GUARD</span>${e.card.name} (+${e.shield})`;
    } else if (e.type === 'intercept') {
      cls = 'guard';
      text = `<span class="toast-tag">🛡 INTERCEPT</span>${e.card.name} (+${e.shield})`;
    } else if (e.type === 'trigger_effect') {
      text = `<span class="toast-tag">✦ TRIGGER</span>${e.text}`;
    } else if (e.type === 'skill') {
      text = `<span class="toast-tag">✦ SKILL</span>${e.cardName}: ${e.text}`;
    } else if (e.type === 'battle_result') {
      cls = e.hit ? 'hit' : 'guard';
      text = e.hit
        ? `<span class="toast-tag">💥 HIT</span>${e.attackTotal} vs ${e.defenseTotal}${e.critAmount ? ` — ${e.critAmount} damage!` : ''}`
        : `<span class="toast-tag">🛡 BLOCKED</span>${e.attackTotal} vs ${e.defenseTotal}`;
    } else {
      return;
    }
    
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.innerHTML = text;
    toastStack.appendChild(el);
    
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  function showStatus(text, isError) {
    statusBanner.textContent = text;
    statusBanner.classList.remove('hidden');
    statusBanner.style.borderLeftColor = isError ? 'var(--crimson)' : 'var(--gold)';
    if (!isError) setTimeout(() => { if (statusBanner.textContent === text) hideStatus(); }, 5000);
  }

  function hideStatus() {
    statusBanner.classList.add('hidden');
  }

  function send(type, payload) {
    ws.send(JSON.stringify({ type, ...payload }));
  }

  function clanClass(clan) {
    return clan === 'Radiant Sword' ? 'radiant-sword' : clan === 'Ashen Fang' ? 'ashen-fang' : '';
  }

  function cardInner(card) {
    if (!card) return '';
    if (card.hidden) return '<div class="card-name">🂠</div>';
    
    return `
      <div class="card-art">${card.clan === 'Radiant Sword' ? '⚔' : '🔥'}</div>
      ${card.trigger ? `<div class="trigger-tag">${card.trigger.type}</div>` : ''}
      <div class="card-name">${card.name}</div>
      <div class="card-clan">${card.clan} · G${card.grade}</div>
      <div class="card-stats">
        <span class="card-power">⚔ ${card.power}</span>
        <span class="card-shield">${card.shield ? '🛡 ' + card.shield : ''}</span>
      </div>
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

  // Mulligan
  function renderMulligan() {
    const me = latest.players[myId];
    mulliganHandEl.innerHTML = '';
    
    me.hand.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'hand-card ' + clanClass(card.clan) + ' card';
      if (mulliganSelected.has(i)) el.classList.add('selected');
      el.innerHTML = cardInner(card);
      el.onclick = () => {
        if (mulliganSelected.has(i)) mulliganSelected.delete(i);
        else mulliganSelected.add(i);
        renderMulligan();
      };
      mulliganHandEl.appendChild(el);
    });
    
    mulliganConfirmBtn.onclick = () => {
      send('mulligan', { indices: Array.from(mulliganSelected) });
      mulliganSelected.clear();
    };
  }

  // Board rendering
  function renderBoard() {
    if (!latest) return;
    
    opponentArea.innerHTML = '';
    youArea.innerHTML = '';
    
    const opponent = latest.players[latest.order[0] === myId ? latest.order[1] : latest.order[0]];
    const me = latest.players[myId];
    
    renderPlayerArea(opponentArea, opponent, opponent.id === myId);
    renderPlayerArea(youArea, me, me.id === myId);
    renderBattleStrip();
    renderPhaseBar();
    renderHand(me);
    renderActionBar();
    renderLog();
  }

  function renderPlayerArea(container, p, isMe) {
    const header = document.createElement('div');
    header.className = 'player-header';
    header.innerHTML = `
      <div>
        <div style="color:var(--text); font-weight:700;">${p.name}</div>
        <div class="zone-counts">
          <span>Deck: <b>${p.deckCount}</b></span>
          <span>Hand: <b>${p.hand.length}</b></span>
          <span>Damage: <b>${p.damageZone.length}</b>/${p.maxDamage}</span>
        </div>
      </div>
      ${latest.turnPlayer === p.id ? '<span class="active-tag">ACTIVE TURN</span>' : ''}
    `;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'field-grid';

    const battle = latest.battle;
    const isMyTurnBattlePhase = latest.phase === 'battle' && latest.turnPlayer === myId;
    const isMyTurnBattlePhaseGlobal = () => isMyTurnBattlePhase;
    const isOpponent = p.id !== myId;
    const inGuardStep = battle && battle.stage === 'guard' && battle.targetId === myId;
    const pidIsMe = p.id === myId;

    const slotEl = (label, card, opts = {}) => {
      const el = document.createElement('div');
      el.className = 'slot card ' + (card ? clanClass(card.clan) : '') + (opts.rested ? ' rested' : '') + (opts.selectable ? ' selectable' : '') + (opts.selected ? ' selected' : '') + (label === 'VG' ? ' vg' : '') + (opts.empty ? ' empty' : '');
      el.innerHTML = card ? cardInner(card) : '';
      el.className += ' card';
      el.setAttribute('data-slot', label);
      
      if (opts.onClick) el.onclick = opts.onClick;
      if (card) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          if (!opts.selectable) openCardDetail(card);
        });
      }
      
      const labelEl = document.createElement('div');
      labelEl.className = 'slot-label';
      labelEl.textContent = label;
      el.appendChild(labelEl);
      
      return el;
    };

    const makeAttackerSlot = (label, card, rested) => {
      const canSelectAttacker = isMyTurnBattlePhase && card && !rested;
      const selected = selectedAttackerSlot === label;
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
      const canCall = latest.phase === 'main' && latest.turnPlayer === myId && pidIsMe && !card && selectedHandIndex !== null;
      return slotEl(label, card, {
        selectable: canCall,
        empty: !card,
        onClick: canCall ? () => { send('call', { handIndex: selectedHandIndex, slot: label }); selectedHandIndex = null; } : null,
      });
    };

    const makeInterceptSlot = (label, card, rested) => {
      const canIntercept = inGuardStep && battle.targetId === myId && pidIsMe && !!card && !rested;
      const div = slotEl(label, card, {
        rested,
        selectable: canIntercept,
        onClick: canIntercept ? () => send('intercept', { slot: label }) : null,
      });
      if (canIntercept) div.classList.add('interceptable');
      return div;
    };

    // Back row
    ['BL', 'BC', 'BR'].forEach((slot) => {
      const card = p.rc[slot];
      const rested = !!p.restedBack[slot];
      const el = pidIsMe ? makeBoosterSlot(slot, card, rested) : slotEl(slot, card, { rested, empty: !card });
      if (pidIsMe && !card && latest.phase === 'main' && latest.turnPlayer === myId) {
        const callable = makeCallSlot(slot, card);
        grid.appendChild(callable);
      } else {
        grid.appendChild(el);
      }
    });

    // Front row
    const frontOrder = [['FL', p.rc.FL, !!p.restedFront.FL], ['VG', p.vanguard, !!p.restedFront.VG], ['FR', p.rc.FR, !!p.restedFront.FR]];
    const isTargetableOpponent = isOpponent && isMyTurnBattlePhaseGlobal() && selectedAttackerSlot;
    
    frontOrder.forEach(([slot, card, rested]) => {
      if (slot !== 'VG' && pidIsMe && !card && latest.phase === 'main' && latest.turnPlayer === myId) {
        grid.appendChild(makeCallSlot(slot, card));
      } else if (slot !== 'VG' && pidIsMe && inGuardStep && battle.targetId === myId) {
        grid.appendChild(makeInterceptSlot(slot, card, rested));
      } else if (pidIsMe) {
        grid.appendChild(makeAttackerSlot(slot, card, rested));
      } else if (isTargetableOpponent && validTargetSlots(p).includes(slot)) {
        const selected = selectedTargetSlot === slot;
        grid.appendChild(slotEl(slot, card, {
          selectable: true,
          selected,
          onClick: () => { selectedTargetSlot = slot; renderBoard(); },
        }));
      } else {
        grid.appendChild(slotEl(slot, card, { rested, empty: !card }));
      }
    });

    container.appendChild(grid);

    if (inGuardStep && battle.targetId === myId && pidIsMe) {
      const note = document.createElement('div');
      note.style.cssText = 'text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--accent-blue);margin-top:12px;padding:8px;background:var(--bg-panel-2);border-radius:4px;';
      note.textContent = `Guard Step — Shield: ${battle.guardShield}. Click cards to guard or intercept.`;
      container.appendChild(note);
    }
  }

  function validTargetSlots(player) {
    if (!latest.battle) return [];
    const b = latest.battle;
    if (b.targetSlot === 'VG') return ['VG'];
    const isFL = b.targetSlot === 'FL';
    return isFL ? ['FL', 'VG'] : ['FR', 'VG'];
  }

  function renderBattleStrip() {
    const b = latest.battle;
    if (!b) {
      battleStrip.textContent = '';
      return;
    }
    
    const atkPlayer = latest.players[b.attackerId];
    const defPlayer = latest.players[b.targetId];
    const twinTag = b.driveTotal === 2 ? ` <span class="twin-drive-tag">TWIN DRIVE!!</span>` : '';
    const driveTag = b.driveTotal > 0 ? ` · Drive ${b.driveDone}/${b.driveTotal}` : '';
    
    battleStrip.innerHTML = `
      ⚔ <strong>${atkPlayer.name}</strong>'s ${b.attacker.name} 
      <span style="color:var(--gold);">(${b.attacker.power}${b.boostPower ? '+' + b.boostPower : ''}${b.driveTriggerPower ? '+' + b.driveTriggerPower : ''})</span>
      ${twinTag} vs <strong>${defPlayer.name}</strong>'s ${b.target.name} 
      <span style="color:var(--accent-blue);">(${b.target.power})</span>
      ${driveTag}
    `;
  }

  function renderPhaseBar() {
    const phases = ['stand_draw', 'ride', 'main', 'battle', 'end'];
    phaseBar.innerHTML = phases.map((ph) =>
      `<span class="phase-pip${latest.phase === ph ? ' active' : ''}">${ph.replace('_', ' / ')}</span>`
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
        el.title = 'Click to guard';
      } else if (canRide) {
        el.onclick = () => send('ride', { handIndex: i });
        el.title = 'Click to ride';
      } else if (canPickForMain) {
        el.onclick = () => { selectedHandIndex = (selectedHandIndex === i ? null : i); renderBoard(); };
      } else {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => openCardDetail(card));
      }
      
      handArea.appendChild(el);
    });
  }

  function renderActionBar() {
    actionBar.innerHTML = '';
    const me = latest.players[myId];
    const isMyTurn = latest.turnPlayer === myId;
    const battle = latest.battle;

    const addBtn = (label, onClick, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = onClick;
      actionBar.appendChild(b);
      return b;
    };

    if (latest.winner) {
      addBtn(latest.winner === myId ? '🏆 YOU WIN!' : '💀 YOU LOST', () => location.reload(), 'btn-primary');
      return;
    }

    if (battle && battle.stage === 'guard' && battle.targetId === myId) {
      addBtn('FINISH GUARDING', () => send('finishGuardStep', {}), 'btn-primary');
      return;
    }

    if (battle) {
      const waitMsg = document.createElement('span');
      waitMsg.style.cssText = 'color:var(--text-dim);font-family:var(--font-mono);font-size:12px;';
      waitMsg.textContent = '⏳ Waiting on opponent…';
      actionBar.appendChild(waitMsg);
      return;
    }

    if (!isMyTurn) {
      const oppMsg = document.createElement('span');
      oppMsg.style.cssText = 'color:var(--text-dim);font-family:var(--font-mono);font-size:12px;';
      oppMsg.textContent = '⏳ Opponent\'s turn…';
      actionBar.appendChild(oppMsg);
      return;
    }

    if (latest.phase === 'ride') {
      addBtn('PROCEED TO MAIN →', () => send('proceedToMain', {}), 'btn-primary');
    } else if (latest.phase === 'main') {
      addBtn('PROCEED TO BATTLE →', () => send('proceedToBattle', {}), 'btn-primary');
    } else if (latest.phase === 'battle') {
      const canDeclare = selectedAttackerSlot !== null && selectedTargetSlot !== null;
      const btn = addBtn('DECLARE ATTACK', () => {
        send('declareAttack', { attackerSlot: selectedAttackerSlot, boosterSlot: selectedBoosterSlot, targetSlot: selectedTargetSlot });
        selectedAttackerSlot = null;
        selectedBoosterSlot = null;
        selectedTargetSlot = null;
      }, 'btn-primary');
      btn.disabled = !canDeclare;

      if (selectedAttackerSlot && !selectedTargetSlot) {
        const hint = document.createElement('span');
        hint.style.cssText = 'color:var(--text-dim);font-family:var(--font-mono);font-size:11px;';
        hint.textContent = '← Select an opponent unit to target';
        actionBar.appendChild(hint);
      }

      addBtn('END BATTLE PHASE', () => send('endBattlePhase', {}), 'btn-danger');
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
