"use strict";

const stream = require("stream");
const tools = require("./tools");
const identifyStream = tools.identifyStream;
const isKeyValuePair = tools.isKeyValuePair;

process.on("unhandledRejection", function (err) {
    console.log("Unhandled Rejection: " + err.stack || err);
});

class Renderer {
    constructor(block) {
        const self = this;
        this.block = block;
        this.output = new stream.PassThrough();

        this.queue = this.block.ready().then(templateText => {
            return self.parseForTags(templateText);
        });
    }
    /**
     * parseForTags()
     * This function parses a content string for tags with {single} or {{double}} curley braces.
     * @param {string} inputString - The string to be parsed
     * @param {array} arr - optional. concat the results of this parse onto an existing array
     * @return {array}. A correctly formatted template content array containing strings and objects that represent tags
     */
    parseForTags(inputString, arr) {
        const regex = /\{\{?([A-z]([A-z]|[0-9]|_|\||\.)+)+\}?\}/;

        // Match the regex against the input string
        const match = regex.exec(inputString);

        // If there is a match, then do stuff
        if (match) {
            // If a tag is found, then create an object containing useful information about it.
            const tag = {
                name: match[1], // store the text that was inside the tag
                original: match[0], // store the tag itself in case it has to be put back into the template
                escape: (match[0].charAt(1) !== "{") // single brace tags are escaped, double brace tags are unescaped
            };

            // the text inside the tag may contain pipes, thus indicating a mask function. Check for these
            if (tag.name.includes("|")) {
                tag.masks = tag.name.split("|"); // make an array of mask functions found
                tag.name = tag.masks.shift(); // first var should be a variable, all subsequent values should be masks
            }
            // the text inside the tag may contain dots which indicate deeplinks. Check for these
            if (tag.name.includes(".")) {
                tag.deeplinks = tag.name.split("."); // make an array of deeplink names
                tag.name = tag.deeplinks.shift(); // keep the first value as the name of the tag
            }

            // cut off everything before the match
            const preTagText = inputString.substring(0, match.index);
            // cut off everything after the match and then remove the tag from the text
            const afterTagText = match.input.substring(match.index, match.input.length).replace(match[0], "");
            // recursively search for more tags in all of the text after this match, and
            // concat the result to form
            // the return array.
            const matchArray = [preTagText, tag].concat(this.parseForTags(afterTagText, arr));
            return matchArray;
        }
        // If there is no tag or block, then just return a single string inside of an array.
        return [inputString];
    }

    /**
     * processElement()
     * This function takes any kind of value and resolves it into a string, and then wraps it in a new promise to return
     * @param {anything} element. Literally anything.
     * @return {promise} - A promise containing a string ready to be written to a stream
     */
    processElement(element) {
        const self = this;
        if (element instanceof Promise) {
            return element.then(resolvedElement => {
                // Keep recursing until we reach an actual value that isn't a promise.
                return this.processElement(resolvedElement);
            });
        }
        if (typeof element === "function") {
            // We have enocuntered a function, and it could return anything, including a promise. So execute it and then
            // run it through this function again.
            return self.processElement(element());
        }

        // Once we find something that isn't a promise we... wrap it in a promise and return it
        return new Promise(resolve => {
            let resolvedElement;

            if (isKeyValuePair(element)) {
                const elementVar = self.block.vars[element.name];
                resolvedElement = self.processElement(elementVar);

            }
            if (typeof element === "number") {
                resolvedElement = element.toString();
            }
            if (typeof element === "string") {
                resolvedElement = element;
            }
            resolve(resolvedElement);
        });
    }

    /**
     * arrayToStream()
     * This function takes an array, and returns a stream. Hence the name.
     * @param {array} inputArray. An array containing any kinds of values
     * @param {Stream} outputStream. An optional stream to be used as the output, this stream will also be returned.
     * @return {Stream} - A node.js stream which is both readable and writable.
     */
    arrayToStream(inputArray, outputStream) {

        // Make sure we have a stream to return.
        if (outputStream === undefined) {
            outputStream = new stream.PassThrough();
        }

        // The next() function will be called when we're finished processing the current element of the array.
        const self = this; // We need to ensure that the function knows what we mean arrayToStream's 'this'
        const next = function () {
            if (inputArray.length > 0) {
                // Call this function recursively, but pass in the outputStream so that we don't
                // create a new stream for every single element in an array. Because that might be expensive.
                self.arrayToStream(inputArray, outputStream);
            } else {
                // When we have finished processing this array, emit a
                // 'next' event to signal that the stream will end
                // We can't just end the stream, otherwise if it is being piped into another stream, it will end
                // that stream too. This may just be a feature of PassThrough streams because they are meant to be
                // completely transparent.
                outputStream.emit("next");

                // We have to end this stream asynchronosly, otherwise the next stream will recieve the end event
                // before it has had a chance to unpipe this stream.
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
        this.processElement(element).then(function (processedElement) {

            // If the element is a string or a stream, then we can output it.
            if (typeof processedElement === "string") {
                outputStream.write(processedElement);
                next();
            }

            if (identifyStream(processedElement)) {
                processedElement.pipe(outputStream);
                processedElement.on("next", function () {
                    // When the stream is about to end, unpipe the stream so that it doesn't end whatever stream it
                    // is connnected to.
                    processedElement.unpipe(outputStream);
                    // Then move on to the next element in this inputArray.
                    // The processedElement stream will end on its own.
                    next();
                });
            }
            next();
        });
        return outputStream;
    }

    /**
     * toStream()
     * Returns a stream of the block that was fed into the constructor of this class.
     * @return {Stream} - A node.js stream which is both readable and writable.
     */
    toStream() {
        this.queue.then(templateQueue => {
            this.arrayToStream(templateQueue, this.output);
        });
        return this.output;
    }

    /**
     * toArrayPromise()
     * Returns a promise for an array which is the result of the parseForTags() function.
     * @return {Promise} - resolves to an array.
     */
    toArrayPromise() {
        return this.queue;
    }

}

module.exports = Renderer;
