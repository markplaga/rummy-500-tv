import type { Config, Context } from '@netlify/functions';
import { applyAction, authenticate, GameError, publicRoom } from './_shared/game-core.mjs';
import { getRoom, saveRoom } from './_shared/storage.mjs';
import { bodyJson, json } from './_shared/http.mjs';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const code = String(context.params.code || '').toUpperCase();
  const deployContext = context.deploy?.context || 'dev';
  const room = await getRoom(code, deployContext);
  if (!room) return json({ error: 'Room not found.' }, 404);
  const body = await bodyJson(req);
  const player = authenticate(room, body.token);
  if (!player) return json({ error: 'Your player session could not be verified.' }, 401);

  if (Number(body.revision) !== room.revision) {
    return json({ error: 'The table changed. Your screen has been refreshed.', room: publicRoom(room, body.token) }, 409);
  }

  try {
    applyAction(room, player.id, body.action || {});
    await saveRoom(room, deployContext);
    return json({ room: publicRoom(room, body.token) });
  } catch (error) {
    const status = error instanceof GameError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : 'Unable to complete that move.', room: publicRoom(room, body.token) }, status);
  }
};

export const config: Config = { path: '/api/rooms/:code/action', method: ['POST'] };
