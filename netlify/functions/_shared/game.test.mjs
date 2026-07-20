import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPlayer,
  applyAction,
  cardPoints,
  createRoom,
  isValidRun,
  isValidSet,
  totalPoints
} from './game-core.mjs';

function card(rank, suit) {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  return { id: `${rank}-${suit}`, rank, rankIndex: ranks.indexOf(rank), suit };
}

function readyRoom() {
  const room = createRoom('ABC123');
  addPlayer(room, { name: 'Player One', id: 'p1', token: 't1' });
  addPlayer(room, { name: 'Player Two', id: 'p2', token: 't2' });
  room.currentPlayerId = 'p1';
  return room;
}

test('ace is low but not high', () => {
  assert.equal(isValidRun([card('A','hearts'), card('2','hearts'), card('3','hearts')]), true);
  assert.equal(isValidRun([card('Q','hearts'), card('K','hearts'), card('A','hearts')]), false);
});

test('sets require three or four unique suits', () => {
  assert.equal(isValidSet([card('8','clubs'), card('8','diamonds'), card('8','spades')]), true);
  assert.equal(isValidSet([card('8','clubs'), card('8','diamonds')]), false);
});

test('two players receive seven cards and a discard', () => {
  const room = readyRoom();
  assert.equal(room.startingHandSize, 7);
  assert.equal(room.players[0].hand.length, 7);
  assert.equal(room.players[1].hand.length, 7);
  assert.equal(room.discard.length, 1);
  assert.equal(room.deck.length, 37);
});

test('a player cannot meld every card because a discard is mandatory', () => {
  const room = readyRoom();
  room.turnStage = 'play';
  room.players[0].hand = [card('A','hearts'), card('2','hearts'), card('3','hearts')];
  assert.throws(() => applyAction(room, 'p1', {
    type: 'meld', meldType: 'run', cardIds: room.players[0].hand.map((c) => c.id)
  }), /keep one card to discard/i);
});

test('going out occurs only by discarding the final card and scores opponent hand', () => {
  const room = readyRoom();
  room.turnStage = 'play';
  room.players[0].hand = [card('K','clubs')];
  room.players[1].hand = [card('A','clubs'), card('7','diamonds'), card('J','hearts')];
  applyAction(room, 'p1', { type: 'discard', cardId: 'K-clubs' });
  assert.equal(room.status, 'round-over');
  assert.equal(room.roundWinnerId, 'p1');
  assert.equal(room.roundPoints, 18);
  assert.equal(room.players[0].score, 18);
});

test('buried discard must be included in a meld before discarding', () => {
  const room = readyRoom();
  room.turnStage = 'draw';
  room.discard = [card('5','hearts'), card('9','clubs'), card('K','spades')];
  room.players[0].hand = [card('6','hearts'), card('7','hearts'), card('2','clubs')];
  applyAction(room, 'p1', { type: 'draw-discard', discardIndex: 0 });
  assert.equal(room.mustMeldCardId, '5-hearts');
  assert.throws(() => applyAction(room, 'p1', { type: 'discard', cardId: '2-clubs' }), /must meld/i);
});

test('card points use ace low and faces as ten', () => {
  assert.equal(cardPoints(card('A','clubs')), 1);
  assert.equal(cardPoints(card('Q','clubs')), 10);
  assert.equal(totalPoints([card('A','clubs'), card('9','clubs'), card('K','clubs')]), 20);
});
