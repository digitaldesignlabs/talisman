/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs
 * @license MIT
 */

"use strict";

const ReadableStream = require("stream").Readable;

/**
 * RenderQueue
 *
 * Creates a renderable object stream from a template string
 *
 * @exports {RenderQueue}
 * @author Mike Hall
 */
class RenderQueue extends ReadableStream {

    /**
     * constructor()
     *
     * Initialize this object
     *
     * @constructor
     * @param {string} templateText - The string content of the template
     */
    constructor(templateText) {
        super({objectMode: true});
        this.templateText = templateText;
    }

    /**
     * _read()
     *
     * Called when something reading us wants data. So we give it to them.
     *
     * @return {undefined}
     */
    _read() {

        // Have we consumed all of our text?
        if (this.templateText.length === 0) {
            return this.push(null);
        }

        // Match the regex against the input string
        const tagRegex = /{{?([a-zA-Z][a-zA-Z0-9_\-\.\|]*[a-zA-Z0-9])}}?/;
        const match = this.templateText.match(tagRegex);

        // If there are no more matches, we have consumed the entire text, except
        // for the this final chunk of text.
        if (match === null) {
            this.push(this.templateText);
            this.templateText = "";
            return;
        }

        // Dereference the array
        let [original, tagName] = match;
        let escape = true;

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
        const textBeforeTag = this.templateText.substr(0, match.index);
        this.push(textBeforeTag);

        // Push the tag itself
        this.push(tag);

        // Look for any more tags in the content after this tag
        this.templateText = this.templateText.substr(match.index + original.length);
    }
}

// Expose the public API
module.exports.RenderQueue = RenderQueue;
