/*
 * patch-steps-lib - Library for the Patch Steps spec.
 *
 * Written starting in 2019.
 *
 * To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty.
 * You should have received a copy of the CC0 Public Domain Dedication along with this software. If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
 */

/**
 * A generic merge function.
 * NOTE: This should match Patch Steps specification, specifically how IMPORT merging works.
 * @param a The value to merge into.
 * @param b The value to merge from.
 * @returns a
 */
export function photomerge<A, B>(a: A, b: B): A & B {
   if (Array.isArray(b)) {
		for (let i = 0; i < b.length; i++)
          (a as any[]).push(photocopy(b[i]));
   } else if (b instanceof Object) {
        for (let k in b)
         (a as Record<string, any>)[photocopy(k)] = photocopy((b as Record<string, any>)[k]);
   } else {
		throw new Error("We can't do that! ...Who'd clean up the mess?");
	}
	return a as A & B;
}

/**
 * A generic copy function.
 * @param o The value to copy.
 * @returns copied value
 */
export function photocopy<O>(o: O): O {
	if (o) {
		if (o.constructor === Array)
			return photomerge([], o);
		if (o.constructor === Object)
			return photomerge({}, o);
	}
	return o;
}

