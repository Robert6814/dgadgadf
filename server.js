'use strict';
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { VanguardGame } = require('./engine/gameEngine');
const { buildDeckA, buildDeckB, startCardA, startCardB } = require('./data/cards');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Vanguard duel server running: http://localhost:${process.env.PORT || 3000}`);
});

const wss = new WebSocketServer({ server });

let waiting = null; // a socket waiting for an opponent
const games = new Map(); // gameId -> { game: VanguardGame, sockets: {playerId: ws} }
let nextPlayerId = 1;
let nextGameId = 1;

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(entry) {
  const { game, sockets } = entry;
  for (const pid of game.state.order) {
    const ws = sockets[pid];
    if (ws) send(ws, { type: 'state', state: game.serializeFor(pid) });
  }
}

function startGame(wsA, wsB) {
  const p1 = { id: `p${nextPlayerId++}`, name: 'Player 1' };
  const p2 = { id: `p${nextPlayerId++}`, name: 'Player 2' };
  const gameId = `g${nextGameId++}`;
  const game = new VanguardGame(gameId, p1, p2, [buildDeckA(), buildDeckB(), startCardA, startCardB]);
  const entry = { game, sockets: { [p1.id]: wsA, [p2.id]: wsB } };
  games.set(gameId, entry);
  wsA.gameId = gameId; wsA.playerId = p1.id;
  wsB.gameId = gameId; wsB.playerId = p2.id;
  send(wsA, { type: 'assigned', playerId: p1.id, gameId });
  send(wsB, { type: 'assigned', playerId: p2.id, gameId });
  broadcast(entry);
}

wss.on('connection', (ws) => {
  if (waiting) {
    const opponent = waiting;
    waiting = null;
    startGame(opponent, ws);
  } else {
    waiting = ws;
    send(ws, { type: 'waiting' });
  }

  ws.on('close', () => {
    if (waiting === ws) waiting = null;
    const entry = games.get(ws.gameId);
    if (entry) {
      for (const pid of entry.game.state.order) {
        const other = entry.sockets[pid];
        if (other && other !== ws) send(other, { type: 'opponent_disconnected' });
      }
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const entry = games.get(ws.gameId);
    if (!entry) return;
    const { game } = entry;
    const pid = ws.playerId;
    let result;
    try {
      switch (msg.type) {
        case 'mulligan': result = game.mulligan(pid, msg.indices || []); break;
        case 'ride': result = game.ride(pid, msg.handIndex); break;
        case 'skipRide': result = game.skipRide(pid); break;
        case 'proceedToMain': result = game.proceedToMain(pid); break;
        case 'call': result = game.call(pid, msg.handIndex, msg.slot); break;
        case 'proceedToBattle': result = game.proceedToBattle(pid); break;
        case 'declareAttack': result = game.declareAttack(pid, msg.attackerSlot, msg.boosterSlot || null, msg.targetSlot || null); break;
        case 'guard': result = game.guard(pid, msg.handIndex); break;
        case 'intercept': result = game.intercept(pid, msg.slot); break;
        case 'finishGuardStep': result = game.finishGuardStep(pid); break;
        case 'endBattlePhase': result = game.endBattlePhase(pid); break;
        default: result = { ok: false, error: 'Unknown action' };
      }
    } catch (e) {
      console.error(e);
      result = { ok: false, error: 'Server error: ' + e.message };
    }
    if (result && !result.ok) {
      send(ws, { type: 'error', error: result.error });
    }
    broadcast(entry);
  });
});
