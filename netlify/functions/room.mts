import type { Config, Context } from '@netlify/functions';
import { addPlayer, GameError, publicRoom } from './_shared/game-core.mjs';
import { getRoom, saveRoom } from './_shared/storage.mjs';
import { bodyJson, json } from './_shared/http.mjs';

export default async (req: Request, context: Context) => {
  const code = String(context.params.code || '').toUpperCase();
  const deployContext = context.deploy?.context || 'dev';
  const room = await getRoom(code, deployContext);
  if (!room) return json({ error: 'Room not found.' }, 404);

  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token');
    return json({ room: publicRoom(room, token) });
  }

  if (req.method === 'POST') {
    try {
      const body = await bodyJson(req);
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();
      addPlayer(room, { name: body.name, id, token });
      await saveRoom(room, deployContext);
      return json({ token, room: publicRoom(room, token) }, 201);
    } catch (error) {
      const status = error instanceof GameError ? error.status : 500;
      return json({ error: error instanceof Error ? error.message : 'Unable to join room.' }, status);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
};

export const config: Config = { path: '/api/rooms/:code', method: ['GET', 'POST'] };
