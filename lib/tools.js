/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs Ltd
 * @license MIT
 */

"use strict";

/**
 * Tools Library
 *
 * A handful of useful utility functions we use in a couple of places
 *
 * @author Mike Hall
 */

/**
 * isStringOrBuffer()
 *
 * Looks if the passed element is a string or a Buffer
 *
 * @param {mixed} maybe
 * @return {bool} true if it looks like a string or Buffer
 */
function isStringOrBuffer(maybe) {
    const yes = maybe && (typeof maybe === "string" || Buffer.isBuffer(maybe));
    return !!yes;
}

/**
 * isNullOrUndefined()
 *
 * Looks if the passed value is null or undefined
 *
 * @param {mixed} maybe
 * @return {bool} true if the value is null or undefined
 */
function isNullOrUndefined(maybe) {
    return maybe === undefined || maybe === null;
}

/**
 * isFunction()
 *
 * Looks if the passed value is a function
 *
 * @param {mixed} f
 * @return {bool} true if the f is a function
 */
function isFunction(f) {
    return typeof f === "function";
}

// Export public API
module.exports = {
    isStringOrBuffer,
    isNullOrUndefined,
    isFunction
};
