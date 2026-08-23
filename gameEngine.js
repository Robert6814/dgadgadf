'use strict';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RC_SLOTS = ['BL', 'BC', 'BR', 'FL', 'FR']; // back-left/center/right, front-left/right
const BOOST_MAP = { BL: 'FL', BR: 'FR', BC: 'VG' }; // which front slot each back slot boosts

function freshPlayer(id, name, deck, starter) {
  return {
    id,
    name,
    deck: shuffle(deck),
    hand: [],
    drop: [],
    damage: [],
    bind: [],
    vanguardStack: [starter], // top of stack = active vanguard
    rc: { BL: null, BC: null, BR: null, FL: null, FR: null },
    guardianCircle: [],
    mulliganDone: false,
    hasRiddenThisTurn: false,
    restedFront: {}, // slot -> bool (VG, FL, FR)
    restedBack: {},  // slot -> bool (BL, BC, BR)
  };
}

class VanguardGame {
  constructor(id, p1, p2, decks) {
    this.id = id;
    this.log = [];
    const [deckA, deckB, starterA, starterB] = decks;

    this.state = {
      id,
      players: {
        [p1.id]: freshPlayer(p1.id, p1.name, deckA, starterA),
        [p2.id]: freshPlayer(p2.id, p2.name, deckB, starterB),
      },
      order: [p1.id, p2.id],
      turnPlayer: p1.id,
      turnNumber: 1,
      firstTurn: true, // first player skips their first draw
      phase: 'mulligan', // mulligan -> stand_draw -> ride -> main -> battle -> end
      battle: null, // active battle sub-state
      winner: null,
    };

    this.events = []; // ordered, public "things that just happened" feed for popups/toasts
    this._eventSeq = 0;

    for (const pid of this.state.order) {
      this._draw(pid, 5);
    }
  }

  _p(pid) { return this.state.players[pid]; }
  _opponent(pid) { return this.state.order.find((id) => id !== pid); }
  _addLog(msg) { this.log.push(msg); if (this.log.length > 300) this.log.shift(); }

  // Public, ordered event feed. Every entry here is information both players are
  // allowed to see (reveals, triggers, skills resolving) — the client replays these
  // in sequence as popups/toasts so ability resolution order is visible, not just implied.
  _emit(type, payload) {
    this._eventSeq += 1;
    this.events.push({ seq: this._eventSeq, type, ...payload });
    if (this.events.length > 60) this.events.shift();
  }

  _draw(pid, n) {
    const p = this._p(pid);
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        // deck-out loss condition
        this.state.winner = this._opponent(pid);
        this._addLog(`${p.name} decked out!`);
        return;
      }
      p.hand.push(p.deck.shift());
    }
  }

  _vg(pid) { return this._p(pid).vanguardStack[this._p(pid).vanguardStack.length - 1]; }

  _allUnitsInSlotOrder(pid) {
    const p = this._p(pid);
    return [
      { slot: 'VG', unit: this._vg(pid) },
      { slot: 'FL', unit: p.rc.FL },
      { slot: 'FR', unit: p.rc.FR },
      { slot: 'BL', unit: p.rc.BL },
      { slot: 'BC', unit: p.rc.BC },
      { slot: 'BR', unit: p.rc.BR },
    ];
  }

  // ---------- Mulligan ----------
  mulligan(pid, indices) {
    const p = this._p(pid);
    if (this.state.phase !== 'mulligan') return this._err('Not in mulligan phase');
    if (p.mulliganDone) return this._err('Already mulliganed');
    const idxSet = new Set(indices);
    const toBottom = p.hand.filter((_, i) => idxSet.has(i));
    p.hand = p.hand.filter((_, i) => !idxSet.has(i));
    p.deck.push(...toBottom);
    p.deck = shuffle(p.deck);
    this._draw(pid, toBottom.length);
    p.mulliganDone = true;
    this._addLog(`${p.name} mulliganed ${toBottom.length} card(s).`);

    if (this.state.order.every((id) => this._p(id).mulliganDone)) {
      this.state.phase = 'stand_draw';
      this._addLog(`${this._p(this.state.turnPlayer).name}'s turn 1 begins.`);
      this._standAndDraw();
    }
    return this._ok();
  }

  _standAndDraw() {
    const pid = this.state.turnPlayer;
    const p = this._p(pid);
    p.restedFront = {};
    p.restedBack = {};
    p.hasRiddenThisTurn = false;
    if (!(this.state.firstTurn && pid === this.state.order[0])) {
      this._draw(pid, 1);
    }
    this.state.phase = 'ride';
  }

  // ---------- Ride ----------
  ride(pid, handIndex) {
    if (this.state.phase !== 'ride') return this._err('Not in ride phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    const p = this._p(pid);
    if (p.hasRiddenThisTurn) return this._err('Already rode this turn');
    const card = p.hand[handIndex];
    if (!card) return this._err('No such card');
    const vg = this._vg(pid);
    if (card.grade < vg.grade || card.grade > vg.grade + 1) {
      return this._err(`Can't ride grade ${card.grade} onto grade ${vg.grade}`);
    }
    p.hand.splice(handIndex, 1);
    p.vanguardStack.push(card);
    p.hasRiddenThisTurn = true;
    this._addLog(`${p.name} rode ${card.name} (G${card.grade}).`);
    this._emit('ride', { playerId: pid, playerName: p.name, card });
    this._runSkill(pid, card, 'ride');
    return this._ok();
  }

  skipRide(pid) {
    if (this.state.phase !== 'ride') return this._err('Not in ride phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    this.state.phase = 'main';
    this._addLog(`${this._p(pid).name} skipped their ride.`);
    return this._ok();
  }

  proceedToMain(pid) {
    if (this.state.phase !== 'ride') return this._err('Not in ride phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    this.state.phase = 'main';
    return this._ok();
  }

  // ---------- Main: call rearguards ----------
  call(pid, handIndex, slot) {
    if (this.state.phase !== 'main') return this._err('Not in main phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    const p = this._p(pid);
    if (!RC_SLOTS.includes(slot)) return this._err('Bad slot');
    if (p.rc[slot]) return this._err('Slot occupied');
    const card = p.hand[handIndex];
    if (!card) return this._err('No such card');
    const vg = this._vg(pid);
    if (card.grade > vg.grade) return this._err(`Grade ${card.grade} too high to call (VG is G${vg.grade})`);
    p.hand.splice(handIndex, 1);
    p.rc[slot] = card;
    this._addLog(`${p.name} called ${card.name} to ${slot}.`);
    return this._ok();
  }

  proceedToBattle(pid) {
    if (this.state.phase !== 'main') return this._err('Not in main phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    this.state.phase = 'battle';
    return this._ok();
  }

  // ---------- Battle ----------
  declareAttack(pid, attackerSlot, boosterSlot, targetSlot) {
    if (this.state.phase !== 'battle') return this._err('Not in battle phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    if (this.state.battle) return this._err('An attack is already in progress');
    const p = this._p(pid);
    if (!['VG', 'FL', 'FR'].includes(attackerSlot)) return this._err('Can only attack with VG/FL/FR');
    const attacker = attackerSlot === 'VG' ? this._vg(pid) : p.rc[attackerSlot];
    if (!attacker) return this._err('No unit there');
    if (attackerSlot === 'VG' && p.restedFront.VG) return this._err('Already attacked');
    if (attackerSlot !== 'VG' && p.restedFront[attackerSlot]) return this._err('Already attacked');

    const oppId = this._opponent(pid);
    const opp = this._p(oppId);

    // Column rule: the Vanguard may attack any occupied front-row column; a front-row
    // rearguard may only attack straight across into the same column.
    const validTargets = attackerSlot === 'VG'
      ? ['VG', 'FL', 'FR'].filter((slot) => slot === 'VG' || !!opp.rc[slot])
      : (opp.rc[attackerSlot] ? [attackerSlot] : []);

    if (!targetSlot) targetSlot = validTargets[0];
    if (!validTargets.includes(targetSlot)) {
      return this._err(validTargets.length === 0
        ? `${attackerSlot} has no legal target (opponent's ${attackerSlot} column is empty)`
        : `Invalid target — ${attacker.name} can only attack: ${validTargets.join(', ')}`);
    }
    const target = targetSlot === 'VG' ? this._vg(oppId) : opp.rc[targetSlot];

    let boostPower = 0;
    let boosterCard = null;
    if (boosterSlot) {
      if (BOOST_MAP[boosterSlot] !== attackerSlot) return this._err('That booster cannot boost this attacker');
      boosterCard = p.rc[boosterSlot];
      if (!boosterCard) return this._err('No booster there');
      if (p.restedBack[boosterSlot]) return this._err('Booster already used');
      p.restedBack[boosterSlot] = true;
      boostPower = Math.floor(boosterCard.power * 1.0); // full power added (simplified, standard adds ~half; keep simple & transparent)
    }
    p.restedFront[attackerSlot] = true;

    // Twin Drive: a grade 3+ vanguard attacking gets two drive checks instead of one.
    const driveTotal = attackerSlot === 'VG' ? (attacker.grade >= 3 ? 2 : 1) : 0;

    this.state.battle = {
      attackerId: pid,
      attackerSlot,
      attacker,
      boosterSlot,
      boosterCard,
      boostPower,
      driveTriggerPower: 0,
      extraCritical: 0,
      targetId: oppId,
      targetSlot,
      target,
      guardCalled: [],
      guardShield: 0,
      driveTotal,
      driveDone: 0,
      driveChecked: driveTotal === 0, // only VG attacks get drive checks
      stage: 'guard', // guard -> drive -> resolve
    };
    this._addLog(`${p.name} attacks ${targetSlot} with ${attacker.name}${boosterCard ? ` (boosted by ${boosterCard.name})` : ''}!`);
    this._emit('attack_declared', {
      playerId: pid, playerName: p.name, attackerName: attacker.name, attackerSlot,
      targetName: target.name, targetSlot, isTwinDrive: driveTotal === 2,
    });
    this._runSkill(pid, attacker, 'attack');
    return this._ok();
  }

  guard(pid, handIndex) {
    const b = this.state.battle;
    if (!b || b.stage !== 'guard') return this._err('Not in guard step');
    if (pid !== b.targetId) return this._err('Not your guard step');
    const p = this._p(pid);
    const card = p.hand[handIndex];
    if (!card) return this._err('No such card');
    p.hand.splice(handIndex, 1);
    p.guardianCircle.push(card);
    b.guardCalled.push(card);
    b.guardShield += card.shield || 0;
    this._addLog(`${p.name} guards with ${card.name} (+${card.shield || 0} shield).`);
    this._emit('guard', { playerId: pid, playerName: p.name, card, shield: card.shield || 0, totalShield: b.guardShield });
    return this._ok();
  }

  // Intercept: a defending player's own front-row rearguard (FL/FR) that hasn't
  // already been used this turn can drop back to the guardian circle to block,
  // same as calling a guardian from hand, just paid for with board presence instead.
  intercept(pid, slot) {
    const b = this.state.battle;
    if (!b || b.stage !== 'guard') return this._err('Not in guard step');
    if (pid !== b.targetId) return this._err('Not your guard step');
    if (!['FL', 'FR'].includes(slot)) return this._err('Can only intercept with a front-row rearguard');
    const p = this._p(pid);
    const card = p.rc[slot];
    if (!card) return this._err('No unit there');
    if (p.restedFront[slot]) return this._err('That unit is rested and cannot intercept');
    p.rc[slot] = null;
    p.guardianCircle.push(card);
    b.guardCalled.push(card);
    b.guardShield += card.shield || 0;
    this._addLog(`${p.name} intercepts with ${card.name} (+${card.shield || 0} shield).`);
    this._emit('intercept', { playerId: pid, playerName: p.name, card, slot, shield: card.shield || 0, totalShield: b.guardShield });
    return this._ok();
  }

  finishGuardStep(pid) {
    const b = this.state.battle;
    if (!b || b.stage !== 'guard') return this._err('Not in guard step');
    if (pid !== b.targetId) return this._err('Not your guard step');
    b.stage = 'drive';
    this._addLog(`${this._p(pid).name} finishes guarding (total shield +${b.guardShield}).`);
    this._doDriveCheck();
    return this._ok();
  }

  _doDriveCheck() {
    const b = this.state.battle;
    if (b.driveDone >= b.driveTotal) {
      b.driveChecked = true;
      return this._resolveBattle();
    }
    const p = this._p(b.attackerId);
    if (p.deck.length === 0) {
      this.state.winner = this._opponent(b.attackerId);
      this._addLog(`${p.name} decked out on drive check!`);
      b.driveChecked = true;
      return this._resolveBattle();
    }
    const revealed = p.deck.shift();
    p.hand.push(revealed);
    b.driveDone += 1;
    const label = b.driveTotal === 2 ? ` (drive ${b.driveDone}/2)` : '';
    this._addLog(`${p.name} drive checks${label}: ${revealed.name}${revealed.trigger ? ` — ${revealed.trigger.type.toUpperCase()} TRIGGER!` : ''}`);
    this._emit('drive_check', {
      playerId: b.attackerId, playerName: p.name, card: revealed,
      driveIndex: b.driveDone, driveTotal: b.driveTotal,
    });
    if (revealed.trigger) {
      this._applyTrigger(b.attackerId, revealed.trigger, /*isDriveOrRide*/ true);
    }
    if (b.driveDone >= b.driveTotal) {
      b.driveChecked = true;
      this._resolveBattle();
    } else {
      this._doDriveCheck(); // twin drive: immediately check again
    }
    return this._ok();
  }

  _applyTrigger(pid, trigger, powerApplies) {
    const b = this.state.battle;
    if (powerApplies && b) {
      b.driveTriggerPower += trigger.power;
      this._addLog(`+${trigger.power} power to ${b.attacker.name} from trigger.`);
    }
    if (trigger.type === 'critical' && b) {
      b.extraCritical += 1;
    }
    if (trigger.type === 'draw') {
      this._draw(pid, 1);
      this._addLog(`${this._p(pid).name} draws a card from the trigger.`);
      this._emit('trigger_effect', { playerId: pid, playerName: this._p(pid).name, triggerType: 'draw', text: 'draws a card' });
    }
    if (trigger.type === 'heal') {
      const p = this._p(pid);
      const opp = this._p(this._opponent(pid));
      if (p.damage.length > opp.damage.length && p.damage.length > 0) {
        const healed = p.damage.shift();
        p.drop.push(healed);
        this._addLog(`${p.name} heals 1 damage from the trigger.`);
        this._emit('trigger_effect', { playerId: pid, playerName: p.name, triggerType: 'heal', text: 'heals 1 damage' });
      }
    }
    // 'front' trigger power is folded into driveTriggerPower above for simplicity
  }

  _resolveBattle() {
    const b = this.state.battle;
    const attackTotal = b.attacker.power + b.boostPower + b.driveTriggerPower;
    const defenseTotal = b.target.power + b.guardShield;
    this._addLog(`Attack ${attackTotal} vs Defense ${defenseTotal}.`);
    if (attackTotal > defenseTotal) {
      if (b.targetSlot === 'VG') {
        const critAmount = (b.attacker.critical || 1) + b.extraCritical;
        this._addLog(`Hit! ${critAmount} damage to ${this._p(b.targetId).name}.`);
        this._emit('battle_result', { hit: true, attackTotal, defenseTotal, attackerName: b.attacker.name, targetName: b.target.name, critAmount });
        for (let i = 0; i < critAmount; i++) this._dealDamage(b.targetId);
      } else {
        this._addLog(`Hit! ${b.target.name} was hit, but only Vanguard hits deal damage.`);
        this._emit('battle_result', { hit: true, attackTotal, defenseTotal, attackerName: b.attacker.name, targetName: b.target.name, critAmount: 0 });
        this._runSkill(b.attackerId, b.attacker, 'hit'); // hook for future "on hit" skills
      }
    } else {
      this._addLog(`Guarded / no damage.`);
      this._emit('battle_result', { hit: false, attackTotal, defenseTotal, attackerName: b.attacker.name, targetName: b.target.name });
    }
    // cleanup guardian circle to drop
    const target = this._p(b.targetId);
    target.drop.push(...target.guardianCircle);
    target.guardianCircle = [];
    this.state.battle = null;

    if (this._p(b.targetId).damage.length >= 6 && !this.state.winner) {
      this.state.winner = b.attackerId;
      this._addLog(`${this._p(b.attackerId).name} wins!`);
    }
  }

  _dealDamage(pid) {
    const p = this._p(pid);
    if (p.deck.length === 0) {
      this.state.winner = this._opponent(pid);
      this._addLog(`${p.name} decked out on damage check!`);
      return;
    }
    const revealed = p.deck.shift();
    this._addLog(`${p.name} damage checks: ${revealed.name}${revealed.trigger ? ` — ${revealed.trigger.type.toUpperCase()} TRIGGER!` : ''}`);
    this._emit('damage_check', { playerId: pid, playerName: p.name, card: revealed, damageCountAfter: p.damage.length + 1 });
    if (revealed.trigger) {
      // power bonus does not apply on damage check, but secondary effects do
      this._applyTrigger(pid, revealed.trigger, /*powerApplies*/ false);
    }
    p.damage.push(revealed);
  }

  endBattlePhase(pid) {
    if (this.state.phase !== 'battle') return this._err('Not in battle phase');
    if (pid !== this.state.turnPlayer) return this._err('Not your turn');
    if (this.state.battle) return this._err('Finish current attack first');
    this.state.phase = 'end';
    this._endTurn();
    return this._ok();
  }

  _endTurn() {
    const pid = this.state.turnPlayer;
    this._addLog(`${this._p(pid).name} ends their turn.`);
    if (this.state.winner) {
      this.state.phase = 'game_over';
      return;
    }
    this.state.firstTurn = false;
    const idx = this.state.order.indexOf(pid);
    this.state.turnPlayer = this.state.order[(idx + 1) % this.state.order.length];
    this.state.turnNumber += 1;
    this.state.phase = 'stand_draw';
    this._addLog(`${this._p(this.state.turnPlayer).name}'s turn ${this.state.turnNumber} begins.`);
    this._standAndDraw();
  }

  // Minimal scripted-effect hook system (proof of concept for future expansion)
  _runSkill(pid, card, trigger) {
    if (!card.skill || card.skill.on !== trigger) return;
    const p = this._p(pid);
    if (card.skill.effect === 'draw1') {
      this._draw(pid, 1);
      this._addLog(`${card.name}'s skill: ${p.name} draws a card.`);
      this._emit('skill', { playerId: pid, playerName: p.name, cardName: card.name, text: 'draws a card' });
    }
    if (card.skill.effect === 'powerUpSelf' && trigger === 'attack') {
      const b = this.state.battle;
      if (b && (card.skill.condition !== 'vanguardOnly' || b.attackerSlot === 'VG')) {
        b.driveTriggerPower += card.skill.amount;
        this._addLog(`${card.name}'s skill: +${card.skill.amount} power.`);
        this._emit('skill', { playerId: pid, playerName: p.name, cardName: card.name, text: `+${card.skill.amount} power` });
      }
    }
  }

  _ok() { return { ok: true }; }
  _err(msg) { return { ok: false, error: msg }; }

  // Redact hidden info (opponent hand/deck contents) for a given viewer
  serializeFor(viewerId) {
    const s = this.state;
    const players = {};
    for (const pid of s.order) {
      const p = s.players[pid];
      const isMe = pid === viewerId;
      players[pid] = {
        id: p.id,
        name: p.name,
        deckCount: p.deck.length,
        hand: isMe ? p.hand : p.hand.map(() => ({ hidden: true })),
        handCount: p.hand.length,
        drop: p.drop,
        damage: isMe ? p.damage : p.damage.map(() => ({ hidden: true })),
        damageCount: p.damage.length,
        bind: p.bind,
        vanguard: p.vanguardStack[p.vanguardStack.length - 1],
        rc: p.rc,
        guardianCircle: p.guardianCircle,
        mulliganDone: p.mulliganDone,
        restedFront: p.restedFront,
        restedBack: p.restedBack,
      };
    }
    return {
      id: s.id,
      players,
      order: s.order,
      turnPlayer: s.turnPlayer,
      turnNumber: s.turnNumber,
      phase: s.phase,
      battle: s.battle && {
        ...s.battle,
        // hide nothing here; battle info is public once declared
      },
      winner: s.winner,
      you: viewerId,
      log: this.log.slice(-40),
      events: this.events.slice(-30),
    };
  }
}

module.exports = { VanguardGame, RC_SLOTS, BOOST_MAP };
