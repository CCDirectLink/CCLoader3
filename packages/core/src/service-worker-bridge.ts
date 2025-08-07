export namespace ServiceWorker {
  // Messages send to the service worker
  export namespace Outgoing {
    export interface ValidPathPrefixesPacket {
      type: 'ValidPathPrefixes';
      validPathPrefixes: string[];
    }

    export interface DataPacket {
      type: 'Data';
      path: string;
      data: BodyInit | null;
    }

    export type Packet = ValidPathPrefixesPacket | DataPacket;
  }
  // Messages coming from the service worker
  export namespace Incoming {
    export interface PathPacket {
      type: 'Path';
      path: string;
    }
    export interface ValidPathPrefixesRequestPacket {
      type: 'ValidPathPrefixesRequest';
    }

    export type Packet = PathPacket | ValidPathPrefixesRequestPacket;
  }
}

export type FetchHandler = (path: string) => Promise<ArrayBufferLike | null>;

let fetchHandler: FetchHandler | undefined;
let validPathPrefixes: string[] = [];

function sendServiceWorkerMessage(packet: ServiceWorker.Outgoing.Packet): void {
  const { controller } = window.navigator.serviceWorker;
  controller?.postMessage(packet);
}

export function setFetchHandler(pathPrefixes: string[], handler: FetchHandler): void {
  fetchHandler = handler;
  validPathPrefixes = pathPrefixes.map((path) => `/${path}/`);
  sendServiceWorkerMessage({ type: 'ValidPathPrefixes', validPathPrefixes });
}

function setMessageHandling(): void {
  navigator.serviceWorker.onmessage = async (event) => {
    const packet: ServiceWorker.Incoming.Packet = event.data;
    let responsePacket: ServiceWorker.Outgoing.Packet;

    if (packet.type === 'Path') {
      const { path } = packet;
      responsePacket = {
        type: 'Data',
        path,
        data:
          (await fetchHandler?.(path).catch((e) => {
            console.error(`error while handing fetch of ${path}:`, e);
          })) ?? null,
      };
    } else {
      responsePacket = { type: 'ValidPathPrefixes', validPathPrefixes };
    }

    sendServiceWorkerMessage(responsePacket);
  };
}

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
  sendServiceWorkerMessage({ type: 'ValidPathPrefixes', validPathPrefixes });

  return controller;
}
