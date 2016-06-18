/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs Ltd
 * @license MIT
 */

"use strict";

const stream = require("stream");
const utils = require("util");
const htmlescape = require("html-escape");

/**
 * Renderer
 * Renders a block to a stream
 * @exports {Renderer}
 * @author Mike Hall <mikehall314@gmail.com>
 * @author David Hignett <david@hignatious.co.uk>
 */
class Renderer {

    /**
     * constructor()
     * Set up the renderer
     * @constructor
     * @param {Block} block - a Block object to render
     */
    constructor(block) {

        // Initialize the output stream
        this.output = new stream.PassThrough();

        // Save this block
        this.block = block;

        // If this block's data source is not set, then we can just render the block
        if (block.dataSource === undefined) {

            // When the block is ready to be processed, start to process it
            this.queue = this.block.ready().then(templateText => {
                return this.parseForTags(templateText);
            });

        } else {

            // Otherwise, run a renderer for each row in the data source
            this.queue = block.dataSource.then(data => {
                return data.map((vars, rowNum) => {

                    // Clone the block
                    const clone = Object.create(block);

                    // Create some custom vars to help the developer with things like numbering rows
                    vars.talismanRowNum = rowNum;
                    vars.talismanRowIsEven = rowNum % 2 === 0;

                    // Remove the datasource from our clone
                    clone.dataSource = undefined;

                    // Integrate the variables for this row
                    clone.vars = Object.create(block.vars);
                    clone.setVariables(vars);

                    return clone;
                });
            });
        }
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
        return Promise.resolve().then(() => {

            // Is the element a tag?
            if (element && element.is === "tag") {

                const data = this.block.vars[element.name];
                if (typeof data === "function") {
                    return data();
                }

                return data;
            }

            return element;

        }).then(data => {

            // If there is nothing there, just return empty string
            if (utils.isNullOrUndefined(data) === true) {
                return "";
            }

            // If the data is a block, return its stream
            if (data.is === "block") {
                return data.render();
            }

            // If the data is a stream, just return the stream
            if (this.looksLikeAStream(data)) {
                return data;
            }

            // Data is a string or buffer.

            // Push the data through any masks which are interested
            if (element.masks) {
                element.masks.forEach(mask => {
                    if (typeof this.block.masks[mask] === "function") {
                        data = this.block.masks[mask](data);
                    }
                });
            }

            // If the data should be escaped, escape it
            if (element.escape === true) {
                return htmlescape(data);
            }

            return data;
        });
    }

    /**
     * processQueue()
     * This function takes a render queue, and pushes its content down our output stream
     * @param {array} queue - An array containing strings or tag objects
     */
    processQueue(queue) {

        // If the queue is empty, we are finished
        if (queue.length === 0 || this.block.isVisible === false) {
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

            // If the element is a block, transform it to a stream
            if (element.is === "block") {
                element = new Renderer(element).toStream();
            }

            // If the element looks like a stream, and quacks like a stream, then pipe it to the output and move on
            if (this.looksLikeAStream(element)) {
                element.on("end", () => this.processQueue(queue)).pipe(this.output, {end: false});
                return;
            }

            // Otherwise, the element is a string or a buffer. Push it down the stream and move on.
            this.output.write(element);
            return this.processQueue(queue);

        }).catch(e => console.error(e));
    }

    /**
     * looksLikeAStream()
     *
     * Duck-types a stream
     *
     * @param {mixed} maybe
     * @return {bool} true if it looks streamy
     */
    looksLikeAStream(maybe) {
        return maybe && typeof maybe.pipe === "function" && typeof maybe.on === "function";
    }

    /**
     * toStream()
     * Render the queue as a Readable stream
     * @return {ReadableStream}
     */
    toStream() {

        // Start to render the queue.
        this.queue.then(renderQueue => {
            this.processQueue(renderQueue);
        }).catch(e => console.error(e));

        // Return a reference to the output stream
        return this.output;
    }
}

// Export public API
module.exports.Renderer = Renderer;
