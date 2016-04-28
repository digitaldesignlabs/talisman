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
        if (utils.isNullOrUndefined(match)) {
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
     * toArrayPromise()
     * Returns a promise for an array which is the result of the parseForTags() function.
     * @return {Promise<array>} The render queue
     */
    toArrayPromise() {
        return this.queue;
    }
}

// Export public API
module.exports.Renderer = Renderer;
