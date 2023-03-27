export type Index = string | number;

export interface BasePatchStep {
    comment?: string;
}

export namespace PatchStep {
    export interface ENTER extends BasePatchStep {
        type: 'ENTER';
        index: Index | Index[];
    }

    export interface EXIT extends BasePatchStep {
        type: 'EXIT';
        count?: number;
    }

    export interface SET_KEY extends BasePatchStep {
        type: 'SET_KEY';
        index: Index;
        content?: unknown;
    }

    export interface INIT_KEY extends BasePatchStep {
        type: 'INIT_KEY';
        index: Index;
        content: unknown;
    }

    export interface REMOVE_ARRAY_ELEMENT extends BasePatchStep {
        type: 'REMOVE_ARRAY_ELEMENT';
        index: number;
    }

    export interface ADD_ARRAY_ELEMENT extends BasePatchStep {
        type: 'ADD_ARRAY_ELEMENT';
        index?: number;
        content: unknown;
    }

    export interface IMPORT extends BasePatchStep {
        type: 'IMPORT';
        src: string;
        path?: Index[];
        index?: Index;
    }

    export interface INCLUDE extends BasePatchStep {
        type: 'INCLUDE';
        src: string;
    }

    export interface FOR_IN extends BasePatchStep {
        type: 'FOR_IN';
        values: unknown[] | Array<Record<string, unknown>>;
        keyword: string | Record<string, string>;
        body: AnyPatchStep[];
    }

    export interface COPY extends BasePatchStep {
        type: 'COPY';
        alias: string;
    }

    export interface PASTE extends BasePatchStep {
        type: 'PASTE';
        alias: string;
        index?: Index;
    }

    export interface COMMENT extends BasePatchStep {
        type: 'COMMENT';
        value: unknown;
    }

    export interface DEBUG extends BasePatchStep {
        type: 'DEBUG';
        value: boolean;
    }

    export interface MERGE_CONTENT extends BasePatchStep {
        type: 'MERGE_CONTENT';
        content: unknown;
    }

    export interface CALL extends BasePatchStep {
        type: 'CALL';
        id: string;
        args: unknown;
    }
}

export interface PatchStepsRegistry {
    ENTER: PatchStep.ENTER;
    EXIT: PatchStep.EXIT;
    SET_KEY: PatchStep.SET_KEY;
    INIT_KEY: PatchStep.INIT_KEY;
    REMOVE_ARRAY_ELEMENT: PatchStep.REMOVE_ARRAY_ELEMENT;
    ADD_ARRAY_ELEMENT: PatchStep.ADD_ARRAY_ELEMENT;
    IMPORT: PatchStep.IMPORT;
    INCLUDE: PatchStep.INCLUDE;
    FOR_IN: PatchStep.FOR_IN;
    COPY: PatchStep.COPY;
    PASTE: PatchStep.PASTE;
    COMMENT: PatchStep.COMMENT;
    DEBUG: PatchStep.DEBUG;
}

export type AnyPatchStep = Extract<PatchStepsRegistry[keyof PatchStepsRegistry], BasePatchStep>;
export type PatchFile = AnyPatchStep[] | Record<string, unknown>;

export type ParsedPath = null | [fromGame: true | false | string, url: string];
export interface StackEntryError {
    type: "Error";
    errorType: string;
    errorMessage: string;
}
export interface StackEntryStep {
    type: "Step",
    index: Index;
    name: string;
}
export type StackEntry = StackEntryStep | StackEntryError;
export interface FileInfo {
    path: string;
    stack: StackEntry[];
}

type Loader = (fromGame: boolean | string, path: string) => Promise<unknown>;

export interface ApplierState {
    currentValue: unknown;
    stack: StackEntry[];
    cloneMap: Map<string, unknown>;
    loader: Loader;
    debugState: DebugState;
    debug: boolean;
}

export type Applier<T extends BasePatchStep> = (this: StackEntryStep & T, state: ApplierState) => Promise<void>;
export type Appliers = {
    [K in keyof PatchStepsRegistry]: Applier<PatchStepsRegistry[K]>
}

export type DiffCore = (a: unknown, b: unknown, settings: DiffSettings) => AnyPatchStep[] | null;

export interface DiffSettings {
    arrayTrulyDifferentThreshold: number;
    trulyDifferentThreshold: number;
    arrayLookahead: number;
    diffAddNewKey: number;
    diffAddDelKey: number;
    diffMulSameKey: number;

    diffCore: DiffCore;
    comment?: string;
    commentValue?: string;
    path: Index[];
    optimize: boolean;
}

export function unsafeAssert<T>(val: any): asserts val is T {
    return true;
}