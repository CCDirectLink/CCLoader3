export async function loadServiceWorker(): Promise<ServiceWorker> {
  const currentRegistration = await window.navigator.serviceWorker.getRegistration();
  if (currentRegistration) {
    //Do not await update since the worker only performs a simple task. Even if there is a bugfix it should be enough to not crash.
    void currentRegistration.update();
  } else {
    const path = 'dist-ccmod-service-worker.js';
    await window.navigator.serviceWorker.register(path, {
      updateViaCache: 'none',
    });
  }

  const { controller } = window.navigator.serviceWorker;
  if (!controller || controller.state !== 'activated') {
    window.location.reload();
    window.location.href = window.location.toString();
    history.go(0);

    throw new Error('(╯°□°）╯︵ ┻━┻');
  }

  setMessageHandling();
  updateServiceWorkerValidPathPrefixes();

  return controller;
}

function sendServiceWorkerMessage(packet: unknown): void {
  const { controller } = window.navigator.serviceWorker;
  controller?.postMessage(packet);
}

export type FetchHandler = (path: string) => Promise<ArrayBufferLike | null>;
const fetchHandlers: FetchHandler[] = [];
const validPathPrefixes: string[] = [];

function updateServiceWorkerValidPathPrefixes(): void {
  sendServiceWorkerMessage(validPathPrefixes.map((path) => `/${path}`));
}

export function addFetchHandler(pathPrefixes: string[], handler: FetchHandler): void {
  fetchHandlers.unshift(handler);
  validPathPrefixes.push(...pathPrefixes);
  updateServiceWorkerValidPathPrefixes();
}

export interface ServiceWorkerPacket {
  path: string;
  data: ArrayBufferLike | null;
}

function setMessageHandling(): void {
  navigator.serviceWorker.onmessage = async (event) => {
    const path: string = event.data;

    let data: ArrayBufferLike | null = null;
    for (const handler of fetchHandlers) {
      try {
        data = await handler(path);
      } catch (e) {
        console.error(`error while handing fetch of ${path}:`, e);
      }
      if (data) break;
    }

    const packet: ServiceWorkerPacket = {
      path,
      data,
    };
    sendServiceWorkerMessage(packet);
  };
}
