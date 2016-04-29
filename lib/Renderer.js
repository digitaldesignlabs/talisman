/**
 * Talisman
 * The streaming, promise-aware, template library
 * "Your quest is to find the Talisman, though you may not hold it"
 * @copyright Digital Design Labs
 * @license MIT
 */

"use strict";

const stream = require("stream");
const utils = require("util");
const Block = require("./Block").Block;

/**
 * Renderer
 * Renders a block to a stream
 * @exports {Renderer}
 * @author David Hignett
 */
class Renderer {

    /**
     * constructor()
     * Set up the renderer
     * @constructor
     * @param {Block} block - a Block object to render
     */
    constructor(block) {

        if (!(block instanceof Block)) {
            throw new Error("You must only provide valid Block objects to the Renderer");
        }

        // Save this block
        this.block = block;

        // Initialize the output stream
        this.output = new stream.PassThrough();

        // When the block is ready to be processed, start to process it
        this.queue = this.block.ready().then(templateText => {
            return this.parseForTags(templateText);
        });
    }

    /**
     * parseForTags()
     * This function parses a content string for tags with {single} or {{double}} curly braces.
     * @param {string} inputString - The string to be parsed
     * @return {array} - A renderable queue, containing strings and tag objects only
     */
    parseForTags(inputString) {

        // Match the regex against the input string
        const tagRegex = /{{?([a-zA-Z][a-zA-Z0-9_\-\.\|]*[a-zA-Z0-9])}}?/;
        const match = inputString.match(tagRegex);

        // No matches; just return the string as it is
        if (utils.isNull(match)) {
            return [inputString];
        }

        // Dereference the array
        let [original, tagName] = match;

        // There was a match \o/
        // Let's validate that is has the correct number of braces.
        // 1. Let's assume at first that all tags must be escaped before rendering, and set that as the default.
        // 2. If the tag starts with {{ and also ends with }}, then the developer has indicated it should not be
        //    escaped and the content should be rendered raw. This is fine, just mark it as non-escaped.
        // 3. If the tag starts with {{ but ends with } only, then we have parsed the tag wrong. In fact, we should
        //    parse that as ['foo{', {tag}, 'bar'] where the first curly brace is actually text, not a tag indicator.
        //    Correct for that.
        // 4. If the tag does not start with {{ but does end with }}, then we have also parsed the tag incorrectly.
        //    In fact we should parse that as ['foo', {tag}, '}bar'] where the last curly brace is actually text, not
        //    a tag indicator. We also correct for that here. Otherwise, everything looks fantastic.
        let escape = true;
        if (original.startsWith("{{")) {
            if (original.endsWith("}}")) {
                escape = false;
            } else {
                original = original.substr(1);
                match.index += 1;
            }
        } else if (original.endsWith("}}")) {
            original = original.substr(0, original.length - 1);
        }

        // Construct a little tag object based on what we have learned so far
        const tag = {
            is: "tag",
            original,
            escape,
            name: tagName
        };

        // If the tag name includes a pipe, that indicates it should be processed with a masking function
        // before it is rendered. Check for this.
        if (tag.name.includes("|")) {
            tag.masks = tag.name.split("|"); // make an array of mask functions found
            tag.name = tag.masks.shift(); // first element is the name, all subsequent values are masks
        }

        // If the tag name includes dots, this indicates it is a deep link to some structure inside the
        // data source. Start to parse this out so we can handle it properly later.
        if (tag.name.includes(".")) {
            tag.deeplinks = tag.name.split("."); // make an array of deeplink names
            tag.name = tag.deeplinks.shift(); // keep the first value as the name of the tag
        }

        // Calculate the text content which exists before this tag
        const textBeforeTag = inputString.substr(0, match.index);

        // Look for any more tags in the content after this tag
        const remainder = this.parseForTags(inputString.substr(match.index + original.length));

        // Return the whole log as a render queue
        return [textBeforeTag, tag].concat(remainder);
    }

    /**
     * processElement()
     * Resolves the content of given element, returning a Promise for either a string or a stream
     * @param {string|object} element - An element from the render queue
     * @return {Promise<string|stream>}
     */
    processElement(element) {

        // Simulate a stream
        if (element && element.is === "tag") {
            const fetch = require("node-fetch");
            return fetch("http://www.bbc.co.uk/news").then(response => response.body);
        }

        // Just resolve anything else
        return Promise.resolve(element);
    }

    /**
     * processQueue()
     * This function takes a render queue, and pushes its content down our output stream
     * @param {array} queue - An array containing strings or tag objects
     */
    processQueue(queue) {

        // If the queue is empty, we are finished
        if (queue.length === 0) {
            return this.output.end();
        }

        // Begin processing the element
        const element = queue.shift();

        // Otherwise, process the element. This always returns a Promise, so we can do stuff when it resolves
        this.processElement(element).then(element => {

            // If the element is now undefined, then do nothing
            if (utils.isNullOrUndefined(element) || element === "") {
                return this.processQueue(queue);
            }

            // If the element looks like a stream, and quacks like a stream, then pipe it to the output and move on
            if (typeof element.pipe === "function" && typeof element.on === "function") {
                element.on("end", () => {
                    this.processQueue(queue);
                }).pipe(this.output, {end: false});
                return;
            }

            // Otherwise, the element is a string or a buffer. Push it down the stream and move on.
            this.output.write(element);
            return this.processQueue(queue);
        });
    }

    /**
     * toStream()
     * Render the queue as a Readable stream
     * @return {Stream} A readable stream
     */
    toStream() {

        // Start to render the queue.
        this.queue.then(renderQueue => {
            this.processQueue(renderQueue);
        });

        // Return a reference to the output stream
        return this.output;
    }

    /**
     * toString()
     * Render the queue as a string. You almost certainly don't want to do this
     * @param {function} cb (optional) - Callback to run when we are done
     * @return {Promise<string>}
     */
    toString(cb) {
        let content = "";
        return new Promise((resolve, reject) => {
            this.toStream().on("data", chunk => {
                content += chunk;
            }).on("end", () => {
                resolve(content);
                if (utils.isFunction(cb)) {
                    cb(undefined, content);
                }
            }).on("error", error => {
                reject(error);
                if (utils.isFunction(cb)) {
                    cb(error);
                }
            });
        });
    }

    /**
     * toArrayPromise()
     * Debug function. Returns a promise for an array which is the result of the parseForTags() function.
     * @return {Promise<array>} The render queue
     */
    toArrayPromise() {
        return this.queue;
    }
}

// Export public API
module.exports.Renderer = Renderer;
