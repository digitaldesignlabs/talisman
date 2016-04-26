/*jslint node, es6, maxlen: 120 */

"use strict";

/**
 *
 * Talisman
 * by Digital Design Labs
 *
 * The streaming, promise-aware, template library
 * "Your quest is to find the Talisman, though you may not hold it"
 */

// const promisify = require("es6-promisify");
// const readFile = promisify(require("fs").readFile);
// const escapeHtml = require("escape-html");
// const path = require("path");
const stream = require("stream");
const tools = require("./tools");
const identifyStream = tools.identifyStream;
//const isKeyValuePair = tools.isKeyValuePair;



function processElement(element) {
    if (element.constructor === Promise) {
        return element.then(function (resolvedElement) {
            // Keep recursing until we reach an actual value that isn't a promise.
            return processElement(resolvedElement);
        });
    }
    if (typeof element === 'function') {
        // We have enocuntered a function, and it could return anything, including a promise. So execute it and then
        // run it through this function again.
        return processElement(element());
    }
    // Once we find something that isn't a promise we... wrap it in a promise and return it
    return new Promise(function (resolve) {
        if (typeof element === "number") {
            element = element.toString();
        }
        resolve(element);
    });
}

function arrayToStream(inputArray, outputStream) {

    // Make sure we have a stream to return.
    if (outputStream === undefined) {
        outputStream = new stream.PassThrough();
    }

    // This function will be called when we're finished processing the current element of the array.
    const next = function () {
        if (inputArray.length > 0) {
            // Call this function recursively, but pass in the outputStream that we created above so that we don't
            // create a new stream for every single element in an array.
            arrayToStream(inputArray, outputStream);
        } else {
            // When we have finished processing this array, emit a 'next' event to signal that the stream will end now
            outputStream.emit("next");
            // We can't just end the stream, otherwise if it is being piped into another stream, it will end that stream
            // too. So we emit a 'next' event, and then end this stream.
            setTimeout(function () {
                outputStream.end();
            }, 0);
        }
    };

    // Begin processing the array
    let element = inputArray.shift();

    if (element === undefined || element === null) {
        // Just don't even bother doing anything else and move on to the next element in the array.
        next();
        return outputStream;
    }
    // This function will always return a promise, so we can do stuff when it resolves.
    processElement(element).then(function (processedElement) {
        if (Array.isArray(processedElement)) {
            // Recursively call this function, but create a new stream.
            processedElement = arrayToStream(element);
        }

        // If the element is a string or a stream, then we can output it.
        if (typeof processedElement === "string") {
            outputStream.write(processedElement);
            next();
        }

        if (identifyStream(processedElement)) {
            processedElement.pipe(outputStream);
            processedElement.on('next', function () {
                // When the stream is about to end, unpipe the stream so that it doesn't end whatever stream it
                // is connnected to.
                processedElement.unpipe(outputStream);
                // Then move on to the next element in this inputArray. The processedElement stream will end on its own.
                next();
            });
        }
    });
    return outputStream;
}

/**
 * Exposes plumbing methods for the purposes of unit testing
 * @return {object} Augmented API
 */

function getTestFunctions() {
    // Set testMode to true so that the template context object returns its internal template values for use in tests.
    //testMode = true;
    return Object.assign({
        testFunctions: {
            processElement,
            arrayToStream
        }
    }, module.exports);
}


module.exports.testMode = getTestFunctions;
