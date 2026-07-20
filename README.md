# Rummy 500 TV

A two-player, browser-based Rummy 500 game designed for a shared television and two private phone hands.

## Game rules in this version

- Two players and one standard 52-card deck
- Eleven cards per player
- Ace is low only
- No jokers or wild cards
- Runs and sets may be laid down after drawing
- One or more cards may be added to any valid meld, including the other player’s meld
- Every card laid down or added to a meld scores for the player who played it
- Only the top discard is visible and may be drawn
- A player must retain one card to discard and can go out only by discarding the final card
- The player who goes out scores the value of every card remaining in the opponent's hand
- First player to 500 points wins

## Screens

- `/tv` creates and displays a room, QR code, scores, the top discard, card counts, and shared melds
- `/play?room=ABC123` lets a player join by name and privately manage their hand

## Development

```bash
npm install
npm test
npm run build
netlify dev
```

## Deployment

The site is configured for Netlify with static assets in `dist` and serverless game endpoints in `netlify/functions`. Room state is stored in Netlify Blobs.
