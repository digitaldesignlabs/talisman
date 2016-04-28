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
            // TODO: The above function assumes that there are no tags which attempt to use deeplinks and then pipe them
            // into mask functions. This needs to be replaced with something more rhobust

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

    processElement(element) {
        const self = this;
        if (element instanceof Promise) {
            return element.then(function (resolvedElement) {
                // Keep recursing until we reach an actual value that isn't a promise.
                return self.processElement(resolvedElement);
            });
        }
        if (typeof element === "function") {
            // We have enocuntered a function, and it could return anything, including a promise. So execute it and then
            // run it through this function again.
            return self.processElement(element());
        }

        // Once we find something that isn't a promise we... wrap it in a promise and return it
        return new Promise(function (resolve) {
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

    arrayToStream(inputArray, outputStream) {
        const self = this;

        // Make sure we have a stream to return.
        if (outputStream === undefined) {
            outputStream = new stream.PassThrough();
        }

        // This function will be called when we're finished processing the current element of the array.
        const next = function () {
            if (inputArray.length > 0) {
                // Call this function recursively, but pass in the outputStream that we created above so that we don't
                // create a new stream for every single element in an array.
                self.arrayToStream(inputArray, outputStream);
            } else {
                // When we have finished processing this array, emit a
                // 'next' event to signal that the stream will end now
                outputStream.emit("next");
                // We can't just end the stream, otherwise if it is being
                // piped into another stream, it will end that stream
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
        this.processElement(element).then(function (processedElement) {

            if (Array.isArray(processedElement)) {
                // Recursively call this function, but create a new stream.
                processedElement = this.arrayToStream(element);
            }

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

    toStream() {
        const self = this;
        self.output.emit("readable");
        this.queue.then(templateQueue => {
            self.arrayToStream(templateQueue, self.output);
        });
        return self.output;
    }

}

module.exports = Renderer;
