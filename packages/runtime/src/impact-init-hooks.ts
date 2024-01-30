import { ImpactInitHook } from 'ultimate-crosscode-typedefs/modloader-stdlib/impact-init-hooks';

export const callbacks: ImpactInitHook[] = [];

export function add(callback: ImpactInitHook): void {
  callbacks.push(callback);
}

export const namespace: typeof ccmod.impactInitHooks = { callbacks, add };
