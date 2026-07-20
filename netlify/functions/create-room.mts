import type { Config, Context } from '@netlify/functions';
import { createRoom, createRoomCode } from './_shared/game-core.mjs';
import { getRoom, saveRoom } from './_shared/storage.mjs';
import { json } from './_shared/http.mjs';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const deployContext = context.deploy?.context || 'dev';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createRoomCode();
    if (!(await getRoom(code, deployContext))) {
      const room = createRoom(code);
      await saveRoom(room, deployContext);
      return json({ room: { code, revision: room.revision } }, 201);
    }
  }
  return json({ error: 'Could not create a room. Please try again.' }, 503);
};

export const config: Config = { path: '/api/rooms', method: ['POST'] };
