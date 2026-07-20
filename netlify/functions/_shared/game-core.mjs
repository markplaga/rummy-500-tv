const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STARTING_HAND_SIZE = 11;

export function createRoomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return code;
}

export function createRoom(code) {
  const now = new Date().toISOString();
  return {
    code,
    status: 'lobby',
    round: 0,
    targetScore: 500,
    startingHandSize: STARTING_HAND_SIZE,
    players: [],
    deck: [],
    discard: [],
    melds: [],
    currentPlayerId: null,
    turnStage: 'draw',
    mustMeldCardId: null,
    winnerId: null,
    roundWinnerId: null,
    roundPoints: 0,
    capturedCards: [],
    revision: 0,
    lastActionIds: {},
    log: [{ at: now, text: 'The table is ready. Waiting for two players.' }],
    createdAt: now,
    updatedAt: now
  };
}

export function createDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank, rankIndex) => ({
      id: `${rank}-${suit}`,
      rank,
      rankIndex,
      suit
    }))
  );
}

export function shuffle(cards, random = Math.random) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function cardPoints(card) {
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return Number(card.rank);
}

export function totalPoints(cards) {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}

export function isValidSet(cards) {
  if (cards.length < 3 || cards.length > 4) return false;
  const ranks = new Set(cards.map((card) => card.rank));
  const suits = new Set(cards.map((card) => card.suit));
  return ranks.size === 1 && suits.size === cards.length;
}

export function isValidRun(cards) {
  if (cards.length < 3) return false;
  if (new Set(cards.map((card) => card.suit)).size !== 1) return false;
  const values = cards.map((card) => card.rankIndex).sort((a, b) => a - b);
  if (new Set(values).size !== values.length) return false;
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

export function classifyMeld(cards) {
  if (isValidSet(cards)) return 'set';
  if (isValidRun(cards)) return 'run';
  return null;
}

export function sortMeld(cards, type) {
  if (type === 'run') return [...cards].sort((a, b) => a.rankIndex - b.rankIndex);
  return [...cards].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

function log(room, text) {
  room.log = [...room.log.slice(-11), { at: new Date().toISOString(), text }];
}

function playerById(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function opponentOf(room, playerId) {
  return room.players.find((player) => player.id !== playerId);
}

function requirePlayingTurn(room, playerId) {
  if (room.status !== 'playing') throw new GameError('The round is not currently in play.');
  if (room.currentPlayerId !== playerId) throw new GameError('It is not your turn.');
}

function selectedCards(player, cardIds) {
  const ids = new Set(cardIds || []);
  if (ids.size !== (cardIds || []).length) throw new GameError('A card was selected more than once.');
  const cards = player.hand.filter((card) => ids.has(card.id));
  if (cards.length !== ids.size) throw new GameError('One or more selected cards are not in your hand.');
  return cards;
}

function removeCards(hand, cardIds) {
  const ids = new Set(cardIds);
  return hand.filter((card) => !ids.has(card.id));
}

export function addPlayer(room, { name, id, token }) {
  const cleanName = String(name || '').trim().slice(0, 24);
  if (!cleanName) throw new GameError('Enter a player name.');
  if (room.status !== 'lobby') throw new GameError('This game has already started.');
  if (room.players.length >= 2) throw new GameError('This room already has two players.');
  if (room.players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new GameError('Choose a different player name.');
  }
  room.players.push({ id, token, name: cleanName, score: 0, hand: [], joinedAt: new Date().toISOString() });
  log(room, `${cleanName} joined the table.`);
  if (room.players.length === 2) startRound(room);
  touch(room);
  return room;
}

export function startRound(room) {
  if (room.players.length !== 2) throw new GameError('Two players are required.');
  room.startingHandSize = STARTING_HAND_SIZE;
  const deck = shuffle(createDeck());
  room.round += 1;
  room.status = 'playing';
  room.winnerId = null;
  room.roundWinnerId = null;
  room.roundPoints = 0;
  room.capturedCards = [];
  room.melds = [];
  room.mustMeldCardId = null;
  room.turnStage = 'draw';
  room.players.forEach((player) => { player.hand = []; });
  for (let i = 0; i < room.startingHandSize; i += 1) {
    room.players.forEach((player) => player.hand.push(deck.pop()));
  }
  room.discard = [deck.pop()];
  room.deck = deck;
  const startingIndex = (room.round - 1) % 2;
  room.currentPlayerId = room.players[startingIndex].id;
  log(room, `Round ${room.round} began. ${room.players[startingIndex].name} plays first.`);
  touch(room);
  return room;
}

function replenishDeck(room) {
  if (room.deck.length > 0 || room.discard.length <= 1) return;
  const top = room.discard.at(-1);
  room.deck = shuffle(room.discard.slice(0, -1));
  room.discard = [top];
  log(room, 'The discard pile was reshuffled into the draw pile.');
}

function drawDeck(room, player) {
  replenishDeck(room);
  if (room.deck.length === 0) throw new GameError('There are no cards available to draw.');
  player.hand.push(room.deck.pop());
  room.turnStage = 'play';
  room.mustMeldCardId = null;
  log(room, `${player.name} drew from the deck.`);
}

function drawDiscard(room, player) {
  const top = room.discard.pop();
  if (!top) throw new GameError('The discard pile is empty.');
  player.hand.push(top);
  room.turnStage = 'play';
  room.mustMeldCardId = null;
  log(room, `${player.name} picked up the top discard.`);
}

function layMeld(room, player, cardIds, requestedType) {
  const cards = selectedCards(player, cardIds);
  if (cards.length < 3) throw new GameError('A meld needs at least three cards.');
  if (player.hand.length - cards.length < 1) {
    throw new GameError('You must keep one card to discard.');
  }
  const actualType = classifyMeld(cards);
  if (!actualType || (requestedType && requestedType !== actualType)) {
    throw new GameError(requestedType === 'set' ? 'Those cards do not form a valid set.' : 'Those cards do not form a valid run.');
  }
  player.hand = removeCards(player.hand, cardIds);
  room.melds.push({
    id: crypto.randomUUID(),
    type: actualType,
    ownerId: player.id,
    cards: sortMeld(cards, actualType)
  });
  const points = totalPoints(cards);
  player.score += points;
  log(room, `${player.name} laid down a ${actualType} and scored ${points} points.`);
}

function addToMeld(room, player, cardIds, meldId) {
  const cards = selectedCards(player, cardIds);
  if (cards.length < 1) throw new GameError('Select at least one card to add.');
  if (player.hand.length - cards.length < 1) throw new GameError('You must keep one card to discard.');
  const meld = room.melds.find((candidate) => candidate.id === meldId);
  if (!meld) throw new GameError('That meld is no longer available.');
  const combined = [...meld.cards, ...cards];
  const valid = meld.type === 'set' ? isValidSet(combined) : isValidRun(combined);
  if (!valid) throw new GameError('Those cards cannot be added to the selected meld.');
  player.hand = removeCards(player.hand, cardIds);
  meld.cards = sortMeld(combined, meld.type);
  const points = totalPoints(cards);
  player.score += points;
  const owner = playerById(room, meld.ownerId);
  const ownership = owner && owner.id !== player.id ? ` ${owner.name}'s` : ' their';
  log(room, `${player.name} added ${cards.length} card${cards.length === 1 ? '' : 's'} to${ownership} meld and scored ${points} points.`);
}

function discardCard(room, player, cardId) {
  const [card] = selectedCards(player, [cardId]);
  player.hand = removeCards(player.hand, [cardId]);
  room.discard.push(card);
  log(room, `${player.name} discarded to the pile.`);
  if (player.hand.length === 0) {
    finishRound(room, player);
    return;
  }
  const opponent = opponentOf(room, player.id);
  room.currentPlayerId = opponent.id;
  room.turnStage = 'draw';
  room.mustMeldCardId = null;
}

function finishRound(room, winner) {
  const opponent = opponentOf(room, winner.id);
  const points = totalPoints(opponent.hand);
  winner.score += points;
  room.roundWinnerId = winner.id;
  room.roundPoints = points;
  room.capturedCards = [...opponent.hand];
  room.currentPlayerId = null;
  room.turnStage = 'round-over';
  room.mustMeldCardId = null;
  if (winner.score >= room.targetScore) {
    room.status = 'game-over';
    room.winnerId = winner.id;
    log(room, `${winner.name} went out by discarding and won the game with ${winner.score} points.`);
  } else {
    room.status = 'round-over';
    log(room, `${winner.name} went out by discarding and scored ${points} points.`);
  }
}

export function applyAction(room, playerId, action) {
  const player = playerById(room, playerId);
  if (!player) throw new GameError('Player not found.');
  const actionId = String(action.actionId || '');
  if (actionId && room.lastActionIds[playerId] === actionId) return room;

  if (action.type === 'next-round') {
    if (room.status !== 'round-over') throw new GameError('The next round cannot start yet.');
    startRound(room);
  } else {
    requirePlayingTurn(room, playerId);
    switch (action.type) {
      case 'draw-deck':
        if (room.turnStage !== 'draw') throw new GameError('You have already drawn this turn.');
        drawDeck(room, player);
        break;
      case 'draw-discard':
        if (room.turnStage !== 'draw') throw new GameError('You have already drawn this turn.');
        drawDiscard(room, player);
        break;
      case 'meld':
        if (room.turnStage !== 'play') throw new GameError('Draw a card before laying down cards.');
        layMeld(room, player, action.cardIds, action.meldType);
        break;
      case 'add-to-meld':
        if (room.turnStage !== 'play') throw new GameError('Draw a card before laying down cards.');
        addToMeld(room, player, action.cardIds, action.meldId);
        break;
      case 'discard':
        if (room.turnStage !== 'play') throw new GameError('Draw a card before discarding.');
        discardCard(room, player, action.cardId);
        break;
      default:
        throw new GameError('Unknown game action.');
    }
  }
  if (actionId) room.lastActionIds[playerId] = actionId;
  touch(room);
  return room;
}

/** @param {any} room @param {string | null} [token] */
export function publicRoom(room, token = null) {
  const viewer = token ? room.players.find((player) => player.token === token) : null;
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    targetScore: room.targetScore,
    startingHandSize: room.startingHandSize,
    revision: room.revision,
    currentPlayerId: room.currentPlayerId,
    turnStage: room.turnStage,
    winnerId: room.winnerId,
    roundWinnerId: room.roundWinnerId,
    roundPoints: room.roundPoints,
    capturedCards: room.status === 'playing' ? [] : room.capturedCards,
    deckCount: room.deck.length,
    discardTop: room.discard.at(-1) || null,
    discardCount: room.discard.length,
    melds: room.melds,
    log: room.log,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      handCount: player.hand.length,
      hand: viewer?.id === player.id ? player.hand : undefined
    })),
    viewerPlayerId: viewer?.id || null,
    updatedAt: room.updatedAt
  };
}

/** @param {any} room @param {string} token */
export function authenticate(room, token) {
  return room.players.find((player) => player.token === token) || null;
}

function touch(room) {
  room.revision += 1;
  room.updatedAt = new Date().toISOString();
}

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'GameError';
    this.status = status;
  }
}
