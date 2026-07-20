import { getDeployStore, getStore } from '@netlify/blobs';

function roomStore(deployContext = 'dev') {
  const options = { name: 'rummy-500-rooms', consistency: 'strong' };
  return deployContext === 'production' ? getStore(options) : getDeployStore(options);
}

export async function getRoom(code, deployContext) {
  const store = roomStore(deployContext);
  return store.get(`room/${code}`, { type: 'json' });
}

export async function saveRoom(room, deployContext) {
  const store = roomStore(deployContext);
  await store.setJSON(`room/${room.code}`, room);
}
