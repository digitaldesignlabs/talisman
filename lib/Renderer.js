/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs Ltd
 * @license MIT
 */

"use strict";

const htmlescape = require("html-escape");
const TransformStream = require("stream").Transform;
const ReadableStream = require("stream").Readable;
const RenderQueue = require("./RenderQueue").RenderQueue;

/**
 * Renderer
 *
 * Renders a block to a stream
 *
 * @exports {Renderer}
 * @author Mike Hall
 * @author David Hignett
 */
class Renderer extends TransformStream {

    /**
     * constructor()
     *
     * Set up the renderer
     *
     * @constructor
     * @param {Block} block - a Block object to render
     */
    constructor(block) {

        // Initialize in object mode
        super({objectMode: true});

        // Keep a handle on this block, so we can access it's visibility,
        // masks, and vars at a later time.
        this.block = block;

        // This function takes custom vars passed in from a data source
        // such as an array, or an object stream, and transforms it into
        // a render-able block.
        let counter = 0;
        function createRowBlock(vars) {

            // Clone the block
            const clone = Object.create(block);

            // Number the rows, starting at zero. You can mask these to make
            // them into something more interesting if you want.
            vars.talismanRowNum = counter;

            // Remove the datasource from our clone
            clone.dataSource = undefined;

            // Integrate the variables for this row
            clone.vars = Object.create(block.vars);
            clone.setVariables(vars);

            // Keep score.
            counter += 1;
            return clone;
        }

        // Test if this block has an iterator.
        Promise.resolve(block.dataSource).then(data => {
            if (data === undefined) {

                // No iterator -- we just handle the block as is by transforming it into a render queue
                // and piping it into this object to be transformed.
                block.ready().then(templateText => {
                    const renderQueue = new RenderQueue(templateText);
                    renderQueue.on("error", e => this.emit("error", e)).pipe(this);
                }).catch(() => {
                    // Some pre-condition for this block failed, so we render nothing
                    this.end();
                });

            } else if (Array.isArray(data) === true) {

                // This block has an array data source. This means we need to iterate this
                // block for as many elements as there are in the array, with custom
                // vars defined for each row. We do this by piping a little readable stream
                // to ourselves, where each call to _read() shifts the next element from the data array.
                const renderQueue = new ReadableStream({objectMode: true});
                renderQueue._read = function () {

                    // If we are all out of data, we are done
                    if (data.length === 0) {
                        return this.push(null);
                    }

                    // Get the next row of data, and render that to a stream
                    const row = data.shift();
                    const stream = new Renderer(createRowBlock(row));

                    // Push the stream object into this stream.
                    this.push(stream);
                };

                // Pipe this stream into ourselves
                renderQueue.pipe(this);

            } else if (data instanceof ReadableStream) {

                // We can only handle object mode streams here
                if (data._readableState.objectMode !== true) {
                    throw new Error("Iterator streams must be in object mode");
                }

                // Transform the readable stream into a stream of Renderer streams
                const processDataStream = new TransformStream({objectMode: true});
                processDataStream._transform = function (row, ignore, next) {
                    const stream = new Renderer(createRowBlock(row));
                    next(undefined, stream);
                };

                // Push the object stream through the transformer and then into the renderer
                data.pipe(processDataStream).pipe(this);

            } else {

                // Can't handle this data type
                this.emit("error", new Error("Unsupported data source; must be an array or object stream"));
                this.end();
            }

        }).catch(() => this.end());
    }

    /**
     * isStringOrBuffer()
     *
     * Looks if the passed element is a string or a Buffer
     *
     * @param {mixed} maybe
     * @return {bool} true if it looks like a string or Buffer
     */
    isStringOrBuffer(maybe) {
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
    isNullOrUndefined(maybe) {
        return maybe === undefined || maybe === null;
    }

    /**
     * getDeeplinkValue()
     * This function parses a content string for tags with {single} or {{double}} curly braces.
     * @param {Block|Object} inputObject - A thing to look inside of when looking for values
     * @return {array} - A renderable queue, containing strings and tag objects only
     */

    getDeeplinkValue(inputObject, deeplinks) {
        const thisLink = deeplinks.shift();
        let data = inputObject;
        if (inputObject.is === "block") {
            data = inputObject.vars;
        }
        const linkValue = data[thisLink];
        if (deeplinks.length > 0) {
            return this.getDeeplinkValue(linkValue, deeplinks);
        }
        return linkValue;
    }

    /**
     * processElement()
     * Resolves the content of given element, returning a Promise for either a string or a stream
     * @param {string|object} element - An element from the render queue
     * @return {Promise<string|stream>}
     */
    processElement(element) {
        return Promise.resolve(element).then(element => {

            // Strings and buffers we can return right away
            if (this.isStringOrBuffer(element) === true) {
                return element;
            }

            // If there is nothing there, just return empty string
            if (this.isNullOrUndefined(element) === true) {
                return "";
            }

            // Blocks we can return their stream
            if (element && element.is === "block") {
                return element.render();
            }

            // Streams we can just return
            if (element instanceof ReadableStream) {
                return element;
            }

            // Tags, we load their data from the block and recurse
            if (element && element.is === "tag") {
                let data = this.block.vars[element.name];

                if (element.deeplinks) {
                    // If we find a deeplink, then rather than handling it normally we want to check whatever data is to
                    // retrieve a value from inside of it.
                    data = this.getDeeplinkValue(data, element.deeplinks);
                }
                return this.processElement(data);
            }

            // Functions we execute and then recurse
            if (typeof element === "function") {
                return this.processElement(element());
            }

            // Anything else, just return as-is
            return element;
        });
    }

    /**
     * _transform()
     *
     * Transforms elements from the piped render queue into strings we can output
     *
     * @param {mixed} element - The next element from the queue
     * @param {ignore} ignore
     * @param {function} next - Callback to run when done
     * @return {undefined}
     */
    _transform(element, ignore, next) {

        // If this block is hidden, do nothing
        if (this.block.isVisible === false) {
            return this.push(null);
        }

        // Otherwise, process the element.
        this.processElement(element).then(data => {

            // Data should now be a stream, Buffer, string, or some other scalar

            // If we only have an empty value, then just move on
            if (this.isNullOrUndefined(data) === true || data === "") {
                return next();
            }

            // If it is a stream, push it down our output stream
            if (data instanceof ReadableStream) {
                return data.on("end", () => next())
                    .on("error", e => this.emit("error", e))
                    .on("data", chunk => this.push(chunk));
            }

            // If the data must be escaped, escape it
            if (element.escape === true && this.isStringOrBuffer(data) === true) {
                data = htmlescape(data);
            }

            // Push the data through any masks which are interested.
            // Masks come after escaping, so masks can return markup if they choose.
            if (element.masks) {
                element.masks.forEach(mask => {
                    if (typeof this.block.masks[mask] === "function") {
                        data = this.block.masks[mask](data);
                    }
                });
            }

            // If this element is still not a string, then toString() it
            if (this.isStringOrBuffer(data) === false) {
                data = data.toString();
            }

            // Push it down the pipe
            next(undefined, data);

        }).catch(e => this.emit("error", e));
    }
}

// Export public API
module.exports.Renderer = Renderer;
