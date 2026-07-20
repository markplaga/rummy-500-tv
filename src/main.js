import './styles.css';

const app = document.querySelector('#app');
const route = location.pathname.toLowerCase();
const isTv = route.startsWith('/tv');
const isPlay = route.startsWith('/play');

const state = {
  room: null,
  token: null,
  selectedCards: new Set(),
  selectedDiscardIndex: null,
  selectedMeldId: null,
  handSort: 'suit',
  busy: false,
  error: '',
  pollTimer: null,
  qrDataUrl: ''
};

const SUIT_SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const SUIT_ORDER = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };
const RANK_ORDER = { A: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, J: 10, Q: 11, K: 12 };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function cardLabel(card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function cardHtml(card, { selectable = false, selected = false, compact = false, forced = false } = {}) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const tag = selectable ? 'button' : 'div';
  return `<${tag} class="card ${red ? 'red' : ''} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''} ${forced ? 'forced' : ''}"
    ${selectable ? `type="button" data-card-id="${escapeHtml(card.id)}"` : ''}
    aria-label="${escapeHtml(card.rank)} of ${escapeHtml(card.suit)}">
      <span class="card-corner"><b>${escapeHtml(card.rank)}</b><i>${SUIT_SYMBOL[card.suit]}</i></span>
      <span class="card-suit">${SUIT_SYMBOL[card.suit]}</span>
      <span class="card-corner bottom"><b>${escapeHtml(card.rank)}</b><i>${SUIT_SYMBOL[card.suit]}</i></span>
    </${tag}>`;
}

function cardBackHtml(compact = false) {
  return `<div class="card card-back ${compact ? 'compact' : ''}" aria-label="Face-down card"><div class="back-pattern"></div></div>`;
}

function playerName(id) {
  return state.room?.players.find((player) => player.id === id)?.name || 'Player';
}

function currentPlayer() {
  return state.room?.players.find((player) => player.id === state.room.currentPlayerId);
}

function viewer() {
  return state.room?.players.find((player) => player.id === state.room.viewerPlayerId);
}

function opponent() {
  return state.room?.players.find((player) => player.id !== state.room.viewerPlayerId);
}

function setError(message) {
  state.error = message;
  render();
  if (message) setTimeout(() => {
    if (state.error === message) {
      state.error = '';
      render();
    }
  }, 4200);
}

function roomTokenKey(code) {
  return `rummy500-player-${code}`;
}

async function initialize() {
  if (isTv) return initializeTv();
  if (isPlay) return initializePhone();
  renderLanding();
}

async function initializeTv() {
  app.className = 'tv-app';
  let code = new URLSearchParams(location.search).get('room')?.toUpperCase();
  try {
    if (!code) {
      const data = await api('/api/rooms', { method: 'POST', body: '{}' });
      code = data.room.code;
      history.replaceState({}, '', `/tv?room=${code}`);
    }
    await fetchRoom(code);
    const joinUrl = `${location.origin}/play?room=${code}`;
    const qr = globalThis.qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    state.qrDataUrl = qr.createDataURL(8, 4);
    render();
    startPolling(code);
  } catch (error) {
    renderFatal(error.message);
  }
}

async function initializePhone() {
  app.className = 'phone-app';
  const code = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  if (code) state.token = localStorage.getItem(roomTokenKey(code));
  if (code) {
    try {
      await fetchRoom(code);
      if (state.token && !state.room.viewerPlayerId) {
        localStorage.removeItem(roomTokenKey(code));
        state.token = null;
      }
      startPolling(code);
    } catch (error) {
      if (error.status !== 404) setError(error.message);
    }
  }
  render();
}

async function fetchRoom(code) {
  const tokenQuery = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
  const data = await api(`/api/rooms/${encodeURIComponent(code)}${tokenQuery}`);
  state.room = data.room;
  pruneSelections();
  render();
}

function startPolling(code) {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    if (state.busy || document.hidden) return;
    try {
      const previousRevision = state.room?.revision;
      const tokenQuery = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
      const data = await api(`/api/rooms/${encodeURIComponent(code)}${tokenQuery}`);
      state.room = data.room;
      pruneSelections();
      if (previousRevision !== data.room.revision) render();
    } catch (error) {
      if (error.status !== 404) console.warn(error);
    }
  }, 850);
}

function pruneSelections() {
  const handIds = new Set(viewer()?.hand?.map((card) => card.id) || []);
  state.selectedCards = new Set([...state.selectedCards].filter((id) => handIds.has(id)));
  if (!state.room?.melds.some((meld) => meld.id === state.selectedMeldId)) state.selectedMeldId = null;
  if (state.selectedDiscardIndex != null && state.selectedDiscardIndex >= (state.room?.discard.length || 0)) {
    state.selectedDiscardIndex = null;
  }
}

function render() {
  if (isTv) renderTv();
  else if (isPlay) renderPhone();
}

function renderLanding() {
  app.className = 'landing-app';
  app.innerHTML = `
    <main class="landing">
      <section class="brand-panel">
        <div class="mini-cards">${cardHtml({ id:'A-hearts', rank:'A', suit:'hearts' }, { compact:true })}${cardHtml({ id:'5-clubs', rank:'5', suit:'clubs' }, { compact:true })}${cardHtml({ id:'K-spades', rank:'K', suit:'spades' }, { compact:true })}</div>
        <p class="eyebrow">A shared television card table</p>
        <h1>Rummy 500</h1>
        <p>Open the table on the TV. Each player joins from a phone and keeps their hand private.</p>
        <div class="landing-actions">
          <a class="primary-button" href="/tv">Open the TV table</a>
          <a class="secondary-button" href="/play">Join from a phone</a>
        </div>
      </section>
    </main>`;
}

function renderFatal(message) {
  app.innerHTML = `<main class="fatal"><h1>Unable to open the table</h1><p>${escapeHtml(message)}</p><a href="/tv">Try again</a></main>`;
}

function renderTv() {
  if (!state.room) {
    app.innerHTML = `<main class="tv-loading"><div class="spinner"></div><p>Setting the table…</p></main>`;
    return;
  }
  const room = state.room;
  const topDiscard = room.discard.at(-1);
  const active = currentPlayer();
  const joinUrl = `${location.origin}/play?room=${room.code}`;

  app.innerHTML = `
    <main class="tv-table">
      <header class="tv-header">
        <div>
          <p class="eyebrow">Rummy 500 · Round ${room.round || '—'}</p>
          <h1>Room <span>${escapeHtml(room.code)}</span></h1>
        </div>
        <div class="target-pill">First to ${room.targetScore}</div>
      </header>

      <section class="scoreboard">
        ${[0,1].map((index) => tvPlayerPanel(room.players[index], room.currentPlayerId)).join('')}
      </section>

      <section class="table-center">
        <div class="pile-area">
          <div class="pile-block">
            <span class="pile-label">Draw pile · ${room.deckCount}</span>
            ${room.deckCount ? cardBackHtml() : '<div class="empty-pile">Empty</div>'}
          </div>
          <div class="pile-block">
            <span class="pile-label">Discard pile · ${room.discard.length}</span>
            ${topDiscard ? cardHtml(topDiscard) : '<div class="empty-pile">Empty</div>'}
          </div>
        </div>

        <div class="meld-board">
          <div class="section-title"><span>Cards on the table</span><small>${room.melds.length} meld${room.melds.length === 1 ? '' : 's'}</small></div>
          <div class="tv-melds">
            ${room.melds.length ? room.melds.map(tvMeldHtml).join('') : '<div class="empty-melds">Runs and sets will appear here.</div>'}
          </div>
        </div>
      </section>

      <footer class="tv-footer">
        <div class="turn-banner ${room.status}">
          ${tvStatusText(room, active)}
        </div>
        <div class="join-panel ${room.players.length === 2 ? 'joined' : ''}">
          ${room.players.length < 2 ? `
            <img src="${state.qrDataUrl}" alt="QR code to join room ${escapeHtml(room.code)}" />
            <div><b>Join on your phone</b><span>${escapeHtml(joinUrl.replace(/^https?:\/\//, ''))}</span></div>
          ` : `<div class="connected-icon">✓</div><div><b>Both players connected</b><span>The TV now runs by itself.</span></div>`}
        </div>
      </footer>

      ${room.status === 'round-over' || room.status === 'game-over' ? tvRoundOverlay(room) : ''}
    </main>`;
}

function tvPlayerPanel(player, activeId) {
  if (!player) {
    return `<article class="player-score waiting"><div class="avatar">?</div><div><span>Waiting for player</span><b>Scan the QR code</b></div></article>`;
  }
  return `<article class="player-score ${player.id === activeId ? 'active' : ''}">
    <div class="avatar">${escapeHtml(player.name.charAt(0).toUpperCase())}</div>
    <div class="player-score-main"><span>${escapeHtml(player.name)}</span><b>${player.score}<small> pts</small></b></div>
    <div class="hand-count"><strong>${player.handCount}</strong><span>cards</span></div>
  </article>`;
}

function tvMeldHtml(meld) {
  return `<article class="tv-meld">
    <div class="meld-owner"><span>${escapeHtml(playerName(meld.ownerId))}</span><small>${meld.type}</small></div>
    <div class="meld-cards">${meld.cards.map((card) => cardHtml(card, { compact: true })).join('')}</div>
  </article>`;
}

function tvStatusText(room, active) {
  if (room.status === 'lobby') return `<strong>Waiting for ${2 - room.players.length} player${room.players.length === 1 ? '' : 's'}</strong><span>Enter a name on each phone to begin.</span>`;
  if (room.status === 'playing') {
    const action = room.turnStage === 'draw' ? 'Draw a card' : 'Play cards, then discard';
    return `<strong>${escapeHtml(active?.name || 'Player')}’s turn</strong><span>${action}</span>`;
  }
  if (room.status === 'round-over') return `<strong>Round complete</strong><span>Start the next round from either phone.</span>`;
  return `<strong>Game complete</strong><span>${escapeHtml(playerName(room.winnerId))} reached ${room.targetScore}.</span>`;
}

function tvRoundOverlay(room) {
  const winner = playerName(room.roundWinnerId || room.winnerId);
  const cards = room.capturedCards || [];
  return `<div class="round-overlay"><section>
    <p class="eyebrow">${room.status === 'game-over' ? 'Game winner' : `Round ${room.round} complete`}</p>
    <h2>${escapeHtml(winner)} went out!</h2>
    <p>${escapeHtml(winner)} receives <strong>${room.roundPoints} points</strong> for the cards left in the other hand.</p>
    <div class="captured-cards">${cards.map((card) => cardHtml(card, { compact: true })).join('')}</div>
    ${room.status === 'round-over' ? '<span class="overlay-note">Continue from either phone</span>' : `<span class="overlay-note">Final score: ${room.players.find((p) => p.id === room.winnerId)?.score || 0}</span>`}
  </section></div>`;
}

function renderPhone() {
  const roomCode = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  if (!roomCode || !state.room || !state.room.viewerPlayerId) {
    renderJoin(roomCode);
    return;
  }
  renderGamePhone();
}

function renderJoin(prefilledCode) {
  const roomExists = Boolean(state.room);
  app.innerHTML = `
    <main class="phone-shell join-shell">
      <header class="phone-brand"><span class="brand-mark">R5</span><div><b>Rummy 500</b><small>Phone hand</small></div></header>
      <section class="join-card">
        <p class="eyebrow">Join the television table</p>
        <h1>${prefilledCode ? `Room ${escapeHtml(prefilledCode)}` : 'Enter your room'}</h1>
        <form id="join-form">
          <label>Room code
            <input name="room" autocomplete="off" autocapitalize="characters" maxlength="6" value="${escapeHtml(prefilledCode)}" ${prefilledCode ? 'readonly' : ''} placeholder="ABC123" required />
          </label>
          <label>Your name
            <input name="name" autocomplete="name" maxlength="24" placeholder="Player name" required autofocus />
          </label>
          <button class="primary-button full" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Joining…' : 'Join game'}</button>
        </form>
        ${roomExists && state.room.players.length >= 2 ? '<p class="form-note warning">This room already has two players.</p>' : '<p class="form-note">No account or password is needed.</p>'}
      </section>
      ${toastHtml()}
    </main>`;
  document.querySelector('#join-form')?.addEventListener('submit', joinRoom);
}

async function joinRoom(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = new FormData(event.currentTarget);
  const code = String(form.get('room') || '').trim().toUpperCase();
  const name = String(form.get('name') || '').trim();
  if (code.length !== 6) return setError('Enter the six-character room code.');
  state.busy = true;
  render();
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'POST', body: JSON.stringify({ name })
    });
    state.token = data.token;
    state.room = data.room;
    localStorage.setItem(roomTokenKey(code), state.token);
    history.replaceState({}, '', `/play?room=${code}`);
    startPolling(code);
    state.error = '';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = false;
    render();
  }
}

function renderGamePhone() {
  const room = state.room;
  const me = viewer();
  const them = opponent();
  const myTurn = room.currentPlayerId === me.id;
  const canDraw = room.status === 'playing' && myTurn && room.turnStage === 'draw';
  const canPlay = room.status === 'playing' && myTurn && room.turnStage === 'play';
  const sortedHand = sortHand(me.hand || []);
  const selectedCount = state.selectedCards.size;

  app.innerHTML = `
    <main class="phone-shell game-shell">
      <header class="phone-game-header">
        <div><small>Room ${escapeHtml(room.code)} · Round ${room.round}</small><b>${escapeHtml(me.name)}</b></div>
        <div class="phone-scores"><span>You <b>${me.score}</b></span><span>${escapeHtml(them?.name || 'Opponent')} <b>${them?.score || 0}</b></span></div>
      </header>

      <section class="phone-status ${myTurn ? 'your-turn' : ''}">
        <div class="status-dot"></div>
        <div><b>${phoneStatusTitle(room, myTurn, them)}</b><span>${phoneStatusSubtitle(room, myTurn)}</span></div>
        <div class="opponent-count"><strong>${them?.handCount ?? '—'}</strong><small>their cards</small></div>
      </section>

      ${room.mustMeldCardId ? `<div class="must-meld-notice">Use <strong>${escapeHtml(cardLabel(me.hand.find((c) => c.id === room.mustMeldCardId) || {rank:'?', suit:'clubs'}))}</strong> in a run, set, or existing meld before discarding.</div>` : ''}

      <section class="phone-table">
        <div class="draw-controls">
          <button id="draw-deck" class="pile-button" ${!canDraw || state.busy || (room.deckCount === 0 && room.discard.length <= 1) ? 'disabled' : ''}>
            ${cardBackHtml(true)}<span><b>Draw pile</b><small>${room.deckCount} cards</small></span>
          </button>
          <div class="discard-picker">
            <div class="discard-heading"><span><b>Discard pile</b><small>Tap the card you want</small></span><strong>${room.discard.length}</strong></div>
            <div class="discard-strip">
              ${room.discard.map((card, index) => `<button class="discard-choice ${state.selectedDiscardIndex === index ? 'selected' : ''}" data-discard-index="${index}" ${!canDraw ? 'disabled' : ''}>${cardHtml(card, { compact: true })}<small>${index === room.discard.length - 1 ? 'Top' : `+${room.discard.length - index - 1}`}</small></button>`).join('')}
            </div>
            <button id="take-discard" class="secondary-button full" ${!canDraw || state.selectedDiscardIndex == null || state.busy ? 'disabled' : ''}>Take selected card and all above it</button>
          </div>
        </div>

        <div class="phone-meld-area">
          <div class="section-title"><span>Table melds</span><small>Tap one to add cards</small></div>
          <div class="phone-melds">
            ${room.melds.length ? room.melds.map(phoneMeldHtml).join('') : '<div class="empty-phone-melds">No cards have been laid down yet.</div>'}
          </div>
        </div>
      </section>

      <section class="hand-section">
        <div class="hand-heading">
          <div><span>Your hand</span><small>${me.handCount} cards · ${selectedCount} selected</small></div>
          <div class="sort-buttons">
            <button data-sort="suit" class="${state.handSort === 'suit' ? 'active' : ''}">Suit</button>
            <button data-sort="rank" class="${state.handSort === 'rank' ? 'active' : ''}">Rank</button>
          </div>
        </div>
        <div class="hand-cards">
          ${sortedHand.map((card) => cardHtml(card, {
            selectable: canPlay,
            selected: state.selectedCards.has(card.id),
            forced: room.mustMeldCardId === card.id
          })).join('')}
        </div>
      </section>

      <section class="action-dock">
        ${room.status === 'round-over' ? `<button id="next-round" class="primary-button full">Start round ${room.round + 1}</button>` : ''}
        ${room.status === 'game-over' ? `<div class="game-winner"><b>${escapeHtml(playerName(room.winnerId))} wins!</b><span>Final score ${room.players.find((p) => p.id === room.winnerId)?.score || 0}</span></div>` : ''}
        ${room.status === 'playing' ? `
          <button id="lay-run" ${!canPlay || selectedCount < 3 || state.busy ? 'disabled' : ''}>Lay run</button>
          <button id="lay-set" ${!canPlay || selectedCount < 3 || state.busy ? 'disabled' : ''}>Lay set</button>
          <button id="add-meld" ${!canPlay || selectedCount < 1 || !state.selectedMeldId || state.busy ? 'disabled' : ''}>Add to meld</button>
          <button id="discard-card" class="discard-action" ${!canPlay || selectedCount !== 1 || room.mustMeldCardId || state.busy ? 'disabled' : ''}>Discard</button>
        ` : ''}
      </section>
      ${toastHtml()}
    </main>`;
  bindPhoneActions();
}

function phoneStatusTitle(room, myTurn, them) {
  if (room.status === 'round-over') return `${playerName(room.roundWinnerId)} won the round`;
  if (room.status === 'game-over') return `${playerName(room.winnerId)} won the game`;
  if (!myTurn) return `${them?.name || 'Opponent'} is playing`;
  return room.turnStage === 'draw' ? 'Your turn: draw' : 'Your turn: play, then discard';
}

function phoneStatusSubtitle(room, myTurn) {
  if (room.status === 'round-over') return `${room.roundPoints} points awarded`;
  if (room.status === 'game-over') return `First to ${room.targetScore}`;
  if (!myTurn) return 'Your hand is private while you wait.';
  if (room.turnStage === 'draw') return 'Choose the deck or a card from the discard pile.';
  return 'You must finish your turn with a discard.';
}

function phoneMeldHtml(meld) {
  const selected = meld.id === state.selectedMeldId;
  return `<button class="phone-meld ${selected ? 'selected' : ''}" data-meld-id="${escapeHtml(meld.id)}">
    <span class="meld-caption">${escapeHtml(playerName(meld.ownerId))} · ${meld.type}</span>
    <span class="mini-card-row">${meld.cards.map((card) => `<i class="mini-card ${(card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : ''}">${escapeHtml(card.rank)}${SUIT_SYMBOL[card.suit]}</i>`).join('')}</span>
  </button>`;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    if (state.handSort === 'rank') return RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });
}

function bindPhoneActions() {
  document.querySelectorAll('[data-card-id]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.cardId;
    if (state.selectedCards.has(id)) state.selectedCards.delete(id);
    else state.selectedCards.add(id);
    render();
  }));
  document.querySelectorAll('[data-discard-index]').forEach((button) => button.addEventListener('click', () => {
    state.selectedDiscardIndex = Number(button.dataset.discardIndex);
    render();
  }));
  document.querySelectorAll('[data-meld-id]').forEach((button) => button.addEventListener('click', () => {
    state.selectedMeldId = state.selectedMeldId === button.dataset.meldId ? null : button.dataset.meldId;
    render();
  }));
  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
    state.handSort = button.dataset.sort;
    render();
  }));
  document.querySelector('#draw-deck')?.addEventListener('click', () => sendAction({ type: 'draw-deck' }));
  document.querySelector('#take-discard')?.addEventListener('click', () => sendAction({ type: 'draw-discard', discardIndex: state.selectedDiscardIndex }));
  document.querySelector('#lay-run')?.addEventListener('click', () => sendAction({ type: 'meld', meldType: 'run', cardIds: [...state.selectedCards] }));
  document.querySelector('#lay-set')?.addEventListener('click', () => sendAction({ type: 'meld', meldType: 'set', cardIds: [...state.selectedCards] }));
  document.querySelector('#add-meld')?.addEventListener('click', () => sendAction({ type: 'add-to-meld', meldId: state.selectedMeldId, cardIds: [...state.selectedCards] }));
  document.querySelector('#discard-card')?.addEventListener('click', () => sendAction({ type: 'discard', cardId: [...state.selectedCards][0] }));
  document.querySelector('#next-round')?.addEventListener('click', () => sendAction({ type: 'next-round' }));
}

async function sendAction(action) {
  if (state.busy || !state.room || !state.token) return;
  state.busy = true;
  render();
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.room.code)}/action`, {
      method: 'POST',
      body: JSON.stringify({
        token: state.token,
        revision: state.room.revision,
        action: { ...action, actionId: crypto.randomUUID() }
      })
    });
    state.room = data.room;
    state.selectedCards.clear();
    state.selectedDiscardIndex = null;
    if (['meld', 'add-to-meld'].includes(action.type)) state.selectedMeldId = null;
    state.error = '';
  } catch (error) {
    if (error.data?.room) state.room = error.data.room;
    state.error = error.message;
  } finally {
    state.busy = false;
    pruneSelections();
    render();
  }
}

function toastHtml() {
  return state.error ? `<div class="toast" role="alert">${escapeHtml(state.error)}</div>` : '';
}

initialize();
