
"use strict";

const stream = require("stream");

/**
* A function for determining whether a variable is a key:value pair "object", or some other kind of object.
*
* @param {any} input. A variable to be tested
* @return {boolean}. True if the variable is a key:value pair object
*/
function identifyStream(input) {
    if (input === undefined) {
        return false;
    }
    if (input.constructor === stream.Readable) {
        return "readable";
    }
    if (input.constructor === stream.Duplex) {
        return "duplex";
    }
    if (input.constructor === stream.Transform) {
        return "transform";
    }
    if (input.constructor === stream.PassThrough) {
        return "passthrough";
    }
    if (input.constructor === stream.Writable) {
        return "writable";
    }
    return false;
}

function isKeyValuePair(input) {
    if (input === undefined) {
        return false;
    }
    if (typeof input === "function") {
        return false;
    }
    if (Array.isArray(input)) {
        return false;
    }
    if (input.constructor === Promise) {
        return false;
    }
    if (identifyStream(input)) {
        return false;
    }
    if (typeof input === "object") {
        return true;
    }
    return false;
}

module.exports = {
    identifyStream,
    isKeyValuePair,
};
