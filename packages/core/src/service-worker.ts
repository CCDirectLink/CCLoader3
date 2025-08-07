import type { ServiceWorker } from './service-worker-bridge';

self.addEventListener('activate', () => {
  void self.clients.claim();
});

self.addEventListener('install', () => {
  void self.skipWaiting();
});

const CONTENT_TYPES: Record<string, string> = {
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  html: 'text/html',
  htm: 'text/html',
};

function contentType(url: string): string {
  return CONTENT_TYPES[url.substring(url.lastIndexOf('.') + 1)] || 'text/plain';
}

const cacheName = 'ccmod-service-worker-cache';

function getCacheKey(key: string): string {
  return `https://${key}`;
}

async function storeInCache<T extends object>(key: string, value: T): Promise<void> {
  const cache = await caches.open(cacheName);
  const response = new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
  await cache.put(getCacheKey(key), response);
}

async function getFromCache<T extends object>(key: string): Promise<T | null> {
  const cache = await caches.open(cacheName);
  const response = await cache.match(getCacheKey(key));
  if (!response) return null;
  return await response.json();
}

const validPathPrefixesCacheKey = 'validPathPrefixes';

async function post(data: ServiceWorker.Incoming.Packet): Promise<void> {
  const clients = await self.clients.matchAll();
  const client = clients[0];
  client.postMessage(data);
}

const waitingFor = new Map<string, (packet: ServiceWorker.Outgoing.DataPacket) => void>();

async function requestAndAwaitAck(
  packet: ServiceWorker.Incoming.PathPacket,
): Promise<ServiceWorker.Outgoing.DataPacket> {
  return new Promise<ServiceWorker.Outgoing.DataPacket>((resolve) => {
    waitingFor.set(packet.path, resolve);
    void post(packet);
  });
}

let validPathPrefixes: string[] | null;

self.addEventListener('message', (event) => {
  const packet: ServiceWorker.Outgoing.Packet = event.data;

  if (packet.type === 'ValidPathPrefixes') {
    validPathPrefixes = packet.validPathPrefixes;

    void storeInCache(validPathPrefixesCacheKey, validPathPrefixes);
  } else {
    waitingFor.get(packet.path)?.(packet);
    waitingFor.delete(packet.path);
  }
});

async function requestContents(path: string): Promise<Response> {
  const { data } = await requestAndAwaitAck({ type: 'Path', path });

  if (!data) {
    return new Response(null, { status: 404 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': contentType(path),
    },
    status: 200,
    statusText: 'ok',
  });
}

async function respond(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const path = decodeURI(new URL(request.url).pathname);

  validPathPrefixes ??= await getFromCache<string[]>(validPathPrefixesCacheKey);

  if (validPathPrefixes?.some((pathPrefix) => path.startsWith(pathPrefix))) {
    return requestContents(path);
  } else {
    return fetch(request);
  }
}

self.addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(respond(event));
});
