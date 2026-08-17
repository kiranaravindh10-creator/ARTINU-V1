import type { Request, Response } from 'express';

type SSEClient = {
  res: Response;
  userId: string;
  lastEventId?: number;
};

const clients = new Map<string, Set<SSEClient>>();
let eventCounter = 0;

export function addSSEClient(channel: string, client: SSEClient) {
  if (!clients.has(channel)) {
    clients.set(channel, new Set());
  }
  clients.get(channel)!.add(client);
}

export function removeSSEClient(channel: string, client: SSEClient) {
  const channelClients = clients.get(channel);
  if (channelClients) {
    channelClients.delete(client);
    if (channelClients.size === 0) {
      clients.delete(channel);
    }
  }
}

export function broadcast(channel: string, event: string, data: unknown) {
  const channelClients = clients.get(channel);
  if (!channelClients) return;

  const eventId = ++eventCounter;
  const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of channelClients) {
    try {
      client.res.write(payload);
    } catch {
      removeSSEClient(channel, client);
    }
  }
}

export function broadcastContentUpdate(
  type: 'hero-slides' | 'featured-collections' | 'cafes' | 'collaboration-slides',
  action: 'create' | 'update' | 'delete' | 'reorder',
  data: { id?: string; ids?: string[] }
) {
  broadcast('content-updates', 'content-updated', {
    type,
    action,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export function handleSSEConnection(req: Request, res: Response, channel: string, userId: string) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client: SSEClient = { res, userId };
  addSSEClient(channel, client);

  res.write(`event: connected\ndata: ${JSON.stringify({ channel, timestamp: new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      removeSSEClient(channel, client);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSSEClient(channel, client);
  });
}