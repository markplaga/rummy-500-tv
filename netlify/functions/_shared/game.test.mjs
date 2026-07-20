import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPlayer,
  applyAction,
  cardPoints,
  createRoom,
  isValidRun,
  isValidSet,
  publicRoom,
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

test('two players receive eleven cards and a discard', () => {
  const room = readyRoom();
  assert.equal(room.startingHandSize, 11);
  assert.equal(room.players[0].hand.length, 11);
  assert.equal(room.players[1].hand.length, 11);
  assert.equal(room.discard.length, 1);
  assert.equal(room.deck.length, 29);
});

test('a player cannot meld every card because a discard is mandatory', () => {
  const room = readyRoom();
  room.turnStage = 'play';
  room.players[0].hand = [card('A','hearts'), card('2','hearts'), card('3','hearts')];
  assert.throws(() => applyAction(room, 'p1', {
    type: 'meld', meldType: 'run', cardIds: room.players[0].hand.map((c) => c.id)
  }), /keep one card to discard/i);
});

test('laying down a new meld scores the cards for the player who played them', () => {
  const room = readyRoom();
  room.turnStage = 'play';
  room.players[0].hand = [card('A','hearts'), card('2','hearts'), card('3','hearts'), card('K','clubs')];
  applyAction(room, 'p1', {
    type: 'meld', meldType: 'run', cardIds: ['A-hearts', '2-hearts', '3-hearts']
  });
  assert.equal(room.players[0].score, 6);
  assert.equal(room.players[0].hand.length, 1);
});

test('one or more cards may be added to the other player’s meld and score for the contributor', () => {
  const room = readyRoom();
  room.turnStage = 'play';
  room.players[0].hand = [card('5','spades'), card('6','spades'), card('2','clubs')];
  room.melds = [{
    id: 'opponent-run',
    type: 'run',
    ownerId: 'p2',
    cards: [card('7','spades'), card('8','spades'), card('9','spades')]
  }];
  applyAction(room, 'p1', {
    type: 'add-to-meld', meldId: 'opponent-run', cardIds: ['5-spades', '6-spades']
  });
  assert.equal(room.players[0].score, 11);
  assert.deepEqual(room.melds[0].cards.map((c) => c.rank), ['5', '6', '7', '8', '9']);
  assert.equal(room.melds[0].ownerId, 'p2');
  assert.deepEqual(room.players[0].hand.map((c) => c.id), ['2-clubs']);
});

test('only the top discard is exposed to clients', () => {
  const room = readyRoom();
  room.discard = [card('5','hearts'), card('9','clubs'), card('K','spades')];
  const view = publicRoom(room, 't1');
  assert.equal(view.discardTop.id, 'K-spades');
  assert.equal(view.discardCount, 3);
  assert.deepEqual(view.discard.map((c) => c.id), ['K-spades']);
});

test('drawing from the discard pile takes only its top card', () => {
  const room = readyRoom();
  room.turnStage = 'draw';
  room.discard = [card('5','hearts'), card('9','clubs'), card('K','spades')];
  room.players[0].hand = [card('2','clubs')];
  applyAction(room, 'p1', { type: 'draw-discard' });
  assert.deepEqual(room.players[0].hand.map((c) => c.id), ['2-clubs', 'K-spades']);
  assert.deepEqual(room.discard.map((c) => c.id), ['5-hearts', '9-clubs']);
  assert.equal(room.mustMeldCardId, null);
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

test('card points use ace low and faces as ten', () => {
  assert.equal(cardPoints(card('A','clubs')), 1);
  assert.equal(cardPoints(card('Q','clubs')), 10);
  assert.equal(totalPoints([card('A','clubs'), card('9','clubs'), card('K','clubs')]), 20);
});
