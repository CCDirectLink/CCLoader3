/*
 * patch-steps-lib - Library for the Patch Steps spec.
 *
 * Written starting in 2019.
 *
 * Credits:
 *  Main code by 20kdc
 *  URL-style file paths, FOR_IN, COPY, PASTE, error tracking, bughunting by ac2pic
 *  Even more bughunting by ac2pic
 *
 * To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty.
 * You should have received a copy of the CC0 Public Domain Dedication along with this software. If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
 */

import {photocopy, photomerge} from "./patchsteps-utils.js";
import {
    AnyPatchStep,
    Applier,
    Appliers,
    ApplierState,
    FileInfo,
    Index,
    Loader,
    ParsedPath,
    PatchFile, PatchStep, StackEntry,
    StackEntryStep, unsafeAssert
} from './types.js'

// Error handling for appliers.
// You are expected to subclass this class if you want additional functionality.
export class DebugState {
		fileStack: FileInfo[];
		currentFile: FileInfo | null;

	// The constructor. The default state of a DebugState is invalid; a file must be added (even if null) to make it valid.
	constructor() {
		this.fileStack = [];
		this.currentFile = null;
	}

	/**
	 * Translates a ParsedPath into a string.
	 * Overridable.
	 */
	translateParsedPath(parsedPath: ParsedPath | null): string {
		if (parsedPath === null)
			return "(unknown file)";
		// By default, we know nothing.
		// see: parsePath, loader's definition
		let protocol = parsedPath[0].toString();
		if (parsedPath[0] === true) {
			protocol = "game";
		} else if (parsedPath[0] === false) {
			protocol = "mod";
		}
		return protocol + ":" + parsedPath[1];
	}

	/**
	 * Enters a file by parsedPath. Do not override.
	 * @final
	 */
	addFile(parsedPath: ParsedPath): void {
		const path = this.translateParsedPath(parsedPath);
		const fileInfo = {
			path,
			stack: []
		};
		this.currentFile = fileInfo;
		this.fileStack.push(fileInfo);
	}

	/**
	 * Removes a pushed file.
	 * @final
	 */
	removeLastFile(): FileInfo {
		const lastFile = this.fileStack.pop();
		this.currentFile = this.fileStack[this.fileStack.length - 1];
		return lastFile!;
	}

	/**
	 * Enters a step. Note that calls to this *surround* applyStep as the index is not available to it.
	 * @final
	 */
	addStep(index: Index, name = ""): void {
		this.currentFile!.stack.push({
			type: "Step",
			index,
			name
		});
	}

	/**
	 * Leaves a step.
	 * @final
	 */
	removeLastStep(): StackEntryStep {
		const stack = this.currentFile!.stack;
		let currentStep: StackEntryStep | null = null;
		for(let index = stack.length - 1; index >= 0; index--) {
			const entry = stack[index];
			if (entry.type === "Step") {
				currentStep = entry;
				stack.splice(index,1);
				index = -1;
			}
		}
		return currentStep!;
	}

	/**
	 * Gets the last (i.e. current) step.
	 * @final
	 */
	getLastStep(): StackEntryStep {
		const stack = this.currentFile!.stack;
		let currentStep: StackEntryStep | null = null;
		for(let index = stack.length - 1; index >= 0; index--) {
			const entry = stack[index];
			if (entry.type === "Step") {
				currentStep = entry;
				index = -1;
			}
		}
		return currentStep!;
	}

	/**
	 * Throws this instance as an error.
	 * @final
	 */
	throwError(type: string, message: string): void {
		this.currentFile!.stack.push({
			type: "Error",
			errorType: type,
			errorMessage: message
		});
		throw this;
	}

	/**
	 * Prints information about a specific file on the stack.
	 * Overridable.
	 */
	printFileInfo(file: FileInfo): void {
		console.log(`File %c${file.path}`, 'red');
		let message = '';
		const stack = file.stack;
		for(let i = stack.length - 1; i >= 0; i--) {
			const step = stack[i];
			switch (step.type) {
				case 'Error':
					message += `${step.errorType}: ${step.errorMessage}\n`;
					break;
				case 'Step':
					message += '\t\t\tat ';
					if (step.name) {
						message += `${step.name} `;
					}
					message += `(step: ${step.index})\n`;
					break;
				default:
					break;
			}
		}
		console.log(message);
	}

	/**
	 * Prints information about the whole stack.
	 * @final
	 */
	print(): void {
		for(let fileIndex = 0; fileIndex < this.fileStack.length; fileIndex++) {
			this.printFileInfo(this.fileStack[fileIndex]);
		}
	}

	/**
	 * Run at the start of applyStep; after the step has been entered formally, but before executing it.
	 * Overridable.
	 */
	async beforeStep(): Promise<void> {

	}

	/**
	 * Run at the end of applyStep; after executing the step, but before leaving it formally.
	 * Overridable.
	 */
	async afterStep(): Promise<void> {

	}
}

// Custom extensions are registered here.
// Their 'this' is the Step, they are passed the state, and they are expected to return a Promise.
// In practice this is done with async old-style functions.
export const appliers = {} as Appliers;

/*
 * @param a The object to modify
 * @param steps The patch, fresh from the JSON. Can be in legacy or Patch Steps format.
 * @param loader The loading function.
 *  NOTE! IF CHANGING THIS, KEEP IN MIND DEBUGSTATE translatePath GETS ARGUMENTS ARRAY OF THIS.
 *  ALSO KEEP IN MIND THE parsePath FUNCTION!
 *  For fromGame: false this gets a file straight from the mod, such as "package.json".
 *  For fromGame: true this gets a file from the game, which is patched by the host if relevant.
 *  If the PatchSteps file passes a protocol that is not understood, then, and only then, will a string be passed (without the ":" at the end)
 *  In this case, fromGame is set to that string, instead.
 * @param debugState The DebugState stack tracer.
 *  If not given, will be created. You need to pass your own instance of this to have proper filename tracking.
 * @return A Promise
 */
export async function patch(a: unknown, steps: PatchFile, loader: Loader, debugState?: DebugState) {
	if (!debugState) {
		debugState = new DebugState();
		debugState.addFile(null);
	}
	if (steps.constructor === Object) {
		unsafeAssert<Record<string, Object & Record<string, unknown>>>(steps);
		unsafeAssert<Record<string, unknown>>(a);

		// Standardized Mods specification
		for (let k in steps) {
			// Switched back to a literal translation in 1.0.2 to make it make sense with spec, it's more awkward but simpler.
			// ac2pic thought up the "check for truthy" regarding steps[k].constructor
			if (a[k] === void 0) {
				a[k] = steps[k]; // 1.
			} else if (steps[k] && (steps[k].constructor === Object)) {
				// steps[k] is Object, so this won't escape the Standardized Mods version of patching
				await patch(a[k], steps[k], loader, debugState); // 2.
			} else {
				a[k] = steps[k]; // 3.
			}
		}
		return;
	}
	unsafeAssert<AnyPatchStep[]>(steps);
	const state = {
		currentValue: a,
		stack: [],
		cloneMap: new Map(),
		loader: loader,
		debugState: debugState,
		debug: false
	};
	for (let index = 0; index < steps.length; index++) {
		try {
			debugState.addStep(index);
			await applyStep(steps[index], state);
			debugState.removeLastStep();
		} catch(e) {
			debugState.print();
			if (e !== debugState) {
				console.error(e);
			}
			return;
		}
	}
}

async function applyStep(step: AnyPatchStep, state: ApplierState) {
	await state.debugState.beforeStep();
	state.debugState.getLastStep().name = step["type"];
	if (!appliers[step["type"]]) {
		state.debugState.getLastStep().name = '';
		state.debugState.throwError('TypeError',`${step['type']} is not a valid type.`);
	}
	await (appliers[step["type"]] as Applier<any>).call(step, state);
	await state.debugState.afterStep();
}

function replaceObjectProperty<O extends Object>(object: O, key: keyof O, keyword: string | Record<string, string>, value: string | {[replacementId: string]: string | number}) {
	let oldValue = object[key] as string;
	// It's more complex than we thought.
	if (!Array.isArray(keyword) && typeof keyword === "object") {
		// go through each and check if it matches anywhere.
		for(const property in keyword) {
			if (keyword[property]) {
				object[key] = oldValue.replace(new RegExp(keyword[property], "g"), (value as {[replacementId: string]: string | number})[property] as string || "") as O[keyof O];
				oldValue = object[key] as string;
			}
		}
	} else {
		object[key] = oldValue.replace(new RegExp(keyword as string, "g"), value as string) as O[keyof O];
	}
}

/**
 * @param obj The object to search and replace the values of
 * @param keyword The expression to match against
 * @param value The value the replace the match
 * */
function valueInsertion(obj: unknown, keyword: string | Record<string, string>, value: string | {[replacementId: string]: string | number}) {
	if (Array.isArray(obj)) {
		for (let index = 0; index < obj.length; index++) {
			const child = obj[index];
			if (typeof child === "string") {
				replaceObjectProperty(obj, index, keyword, value);
			} else if (typeof child === "object") {
				valueInsertion(child, keyword, value);
			}
		}
	} else if (typeof obj === "object") {
		unsafeAssert<Record<string, unknown>>(obj);
		for(let key in obj) {
			if (!obj[key])
				continue;
			if (typeof obj[key] === "string") {
				replaceObjectProperty(obj as Record<string, string>, key, keyword, value);
			} else {
				valueInsertion(obj[key], keyword, value);
			}
		}
	}
}

// -- Step Execution --

appliers["FOR_IN"] = async function (state) {
	const body = this["body"];
	const values = this["values"];
	const keyword = this["keyword"];

	if (!Array.isArray(body)) {
		state.debugState.throwError('ValueError', 'body must be an array.');
	}

	if (!values) {
		state.debugState.throwError('ValueError', 'values must be set.');
	}

	if (!keyword) {
		state.debugState.throwError('ValueError', 'keyword must be set.');
	}

	for(let i = 0; i < values.length; i++) {
		const cloneBody = photocopy(body);
		const value = values[i];
		valueInsertion(cloneBody, keyword, value as { [replacementId: string]: string | number; });
		state.debugState.addStep(i, 'VALUE_INDEX');
		for (let index = 0; index < cloneBody.length; index++) {
			const statement = cloneBody[index];
			const type = statement["type"];
			state.debugState.addStep(index, type);
			await applyStep(statement, state);
			state.debugState.removeLastStep();
		}
		state.debugState.removeLastStep();
	}
};

// copy the value with name
appliers["COPY"] = async function(state) {
	if (!("alias" in this)) {
		state.debugState.throwError('ValueError', 'alias must be set.');
	}
	const value = photocopy(state.currentValue);
	state.cloneMap.set(this["alias"], value);
};

// paste
appliers["PASTE"] = async function(state) {
	if (!("alias" in this)) {
		state.debugState.throwError('ValueError', 'alias must be set.');
	}
	// Add into spec later?
	//if (!state.cloneMap.has(this["alias"])) {
	//	state.debugState.throwError('ValueError', 'the alias is not available');
	//}
	const value = photocopy(state.cloneMap.get(this["alias"]));
	if (Array.isArray(state.currentValue)) {
		const obj = {
			type: "ADD_ARRAY_ELEMENT",
			content: value,
			...(typeof this["index"] === 'number' && !isNaN(this["index"]) ? {index: this["index"]} : {})
		};
		await applyStep(obj as PatchStep.ADD_ARRAY_ELEMENT, state);
	} else if (typeof state.currentValue === "object") {
		await applyStep({
			type: "SET_KEY",
			index: this["index"]!,
			content: value
		}, state);
	} else {
		state.debugState.throwError('TypeError', `Type ${typeof state.currentValue} is not supported.`);
	}
};


appliers["COMMENT"] = async function(state) {
	if (state.debug) {
		console.log(this["value"]);
	}
};

appliers["ENTER"] = async function (state) {
	if (!("index" in this)) {
		state.debugState.throwError('Error', 'index must be set.');
	}

	const path = Array.isArray(this["index"]) ? this["index"] : [this["index"]];
	for (let i = 0; i < path.length;i++) {
		const idx = path[i];
		unsafeAssert<StackEntry>(state.currentValue);
		state.stack.push(state.currentValue);
		if (state.currentValue[idx as keyof StackEntry] === undefined) {
			const subArr = path.slice(0, i + 1);
			state.debugState.throwError('Error', `index sequence ${subArr.join(",")} leads to an undefined state.`);
		}

		state.currentValue = state.currentValue[idx as keyof StackEntry];
	}
};

appliers["EXIT"] = async function (state) {
	let count = 1;
	if (this["count"] !== undefined)
		count = this["count"];
	for (let i = 0; i < count; i++) {
		if (state.stack.length === 0) {
			state.debugState.throwError('Error', `EXIT #${count + 1} leads to an undefined state.`);
		}
		state.currentValue = state.stack.pop();
	}
};

appliers["SET_KEY"] = async function (state) {
	if (!("index" in this)) {
		state.debugState.throwError('Error', 'index must be set.');
	}

	unsafeAssert<Record<number | string, unknown>>(state.currentValue);

	if ("content" in this) {
		state.currentValue[this["index"]] = photocopy(this["content"]);
	} else {
		delete state.currentValue[this["index"]];
	}
};

appliers["REMOVE_ARRAY_ELEMENT"] = async function (state) {
	unsafeAssert<unknown[]>(state.currentValue);
	state.currentValue.splice(this["index"], 1);
};

appliers["ADD_ARRAY_ELEMENT"] = async function (state) {
	unsafeAssert<unknown[]>(state.currentValue);

	if (this["index"] !== undefined) {
		state.currentValue.splice(this["index"], 0, photocopy(this["content"]));
	} else {
		state.currentValue.push(photocopy(this["content"]));
	}
};

// Reintroduced but simplified version of Emileyah's resolveUrl
function parsePath(url: string, fromGame: boolean): [(boolean | string), string] {
	try {
		const decomposedUrl = new URL(url);
		const protocol = decomposedUrl.protocol;

		const subUrl = decomposedUrl.pathname;

		let urlFromGame;
		if (protocol === 'mod:') {
			urlFromGame = false;
		} else if (protocol === 'game:') {
			urlFromGame = true;
		} else {
			urlFromGame = protocol.substring(0, protocol.length - 1);
		}
		return [
			urlFromGame,
			subUrl
		];
	} catch (e) {
		return [
			fromGame,
			url
		];
	}
}

appliers["IMPORT"] = async function (state) {
	if (!("src" in this)) {
		state.debugState.throwError('ValueError', 'src must be set.');
	}

	const srcPath = parsePath(this["src"], true);
	let obj = await state.loader.apply(state, srcPath);

	if (this["path"] !== undefined) {
		if (!Array.isArray(this["path"])) {
			state.debugState.throwError('ValueError', 'path must be an array.');
		}
		for (let i = 0; i < this["path"].length; i++)
			obj = (obj as Record<string | number, unknown>)[this["path"][i]];
	}

	if (this["index"] !== undefined) {
		unsafeAssert<Record<string | number, unknown>>(state.currentValue);
		state.currentValue![this["index"]] = photocopy(obj);
	} else {
		photomerge(state.currentValue, obj);
	}
};

appliers["INCLUDE"] = async function (state) {
	if (!("src" in this)) {
		state.debugState.throwError('ValueError', 'src must be set.');
	}

	const srcPath = parsePath(this["src"], false);
	const data = await state.loader.apply(state, srcPath);

	state.debugState.addFile(srcPath);
	await patch(state.currentValue, data as PatchFile, state.loader, state.debugState);
	state.debugState.removeLastFile();
};

appliers["INIT_KEY"] = async function (state) {
	if (!("index" in this)) {
		state.debugState.throwError('ValueError', 'index must be set.');
	}

	unsafeAssert<Record<string | number, unknown>>(state.currentValue);

	if (!(this["index"] in (state.currentValue)))
		state.currentValue[this["index"]] = photocopy(this["content"]);
};

appliers["DEBUG"] = async function (state) {
	state.debug = !!this["value"];
};

// combine the values of an object/array with another object/array. similar to non-patchstep patching.
appliers["MERGE_CONTENT"] = async function (state) {
	if (!("content" in this)) {
		state.debugState.throwError("ValueError", 'content must be set');
	}

	photomerge(state.currentValue, this["content"]);
};
