
"use strict";

/**
 *
 * Talisman
 * by Digital Design Labs
 *
 * The streaming, promise-aware, template library
 * "Your quest is to find the Talisman, though you may not hold it"
 */

const promisify = require("es6-promisify");
const readFile = promisify(require("fs").readFile);
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
    if (typeof element === "function") {
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
            processedElement.on("next", function () {
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


class Block {

    /**
     * constructor()
     * Sets up this block
     * @param {string|Promise} content - A string, or a Promise for a string
     * @param {object} parentVars - The vars object of our parent (if we have one)
     */
    constructor(content, parentVars) {

        // Detects CDATA in the content - {{CDATA[ ]}}
        const cdataRegex = /\{\{CDATA\[([\s\S]*)\]\}\}/gm;

        // Detects comments in the content = {/* */}
        const commentRegex = /\{\/\*[\s\S]*\*\/\}/gm;

        // Detects child blocks in the content {#blockName} {/blockName}
        const blockRegex = /\{#([a-zA-Z][a-zA-Z0-9_\-]+)\}([\s\S]*)\{\/\1\}/gm;

        // Keep track of all the Promises upon which this block depends
        this.blockIsReady = [];

        // Inherit our variables from our parent variables, so the prototype chain gives
        // us scoped variable resolution, which is really cool.
        this.vars = Object.create(parentVars || null);

        // The data source controls the iteration of this Block. An undefined data
        // source means this Block will just render as-is, without iteration.
        this.dataSource = undefined;

        // Store the visibility state of this block. Invisible blocks skip rendering.
        this.isVisible = false;

        // Save the content of this template
        this.content = Promise.resolve(content).then(content => {

            // Squirrel away CDATA escaped content, so we can substitute back in later
            return content.toString().replace(cdataRegex, (ignore, content, offset) => {
                const placeholder = `__talisman_cdata_${offset}__`;
                this.vars[placeholder] = content;
                return `{{${placeholder}}}`;
            });

        }).then(content => {

            // Strip out comments
            return content.replace(commentRegex, "");

        }).then(content => {

            // Parse out any blocks we find
            return content.replace(blockRegex, (original, blockName, blockContent) => {
                this.addChild(blockName, blockContent);
                return `{{${blockName}}}`;
            });
        });

        // Remember to wait for this before rendering
        this.blockIsReady.push(this.content);
    }

    /**
     * setVariables()
     * Sets up variables supplied as key-values pairs.
     * @param {object|Map|Promise} data to store
     */
    setVariables(data) {

        const saved = Promise.resolve(data).then(data => {
            if (data instanceof Map) {
                data.forEach((value, key) => {
                    this.vars[key] = value;
                });
            } else {
                Object.keys(data).forEach(key => {
                    this.vars[key] = data[key];
                });
            }
        });

        // Remember to wait for this before rendering
        this.blockIsReady.push(saved);
    }

    /**
     * addChild()
     * Add a child block to this parent block
     * @param {string} name - The name of this block
     * @param {string|Promise} The block to add
     */
    addChild(name, content) {
        this.content.then(_ => {

            // If there are colons in the name, that indicates the user wants to assign this data to one of
            // our children (or one of their children) rather than to us. Detect this case, and then pass it on
            // to the relevant child. The child will handle the case from there.

            const delimiterIndex = name.indexOf(":");
            if (delimiterIndex < 0) {
                this.vars[name] = new Block(content, this.vars);
                return;
            }

            const child = name.substr(0, delimiterIndex);
            if (this.vars[child] instanceof Block) {
                this.vars[child].addChild(name.substr(1 + delimiterIndex), content);
            }
        });
    }

    /**
     * setDataSource()
     * Add a data source for this block.
     * @param {Stream|Array|Promise} iterable - An object stream or array, or Promise for the same
     */
    setDataSource(iterable) {

        const saved = Promise.resolve(iterable).then(iterable => {

        });

        // Remember to wait for this before rendering
        this.blockIsReady.push(saved);
    }

    /**
     * Sets the visibility of this block. Invisible blocks do not render.
     * @param {bool} isVisible - True for visible, false for hidden
     */
    setVisibility(isVisible) {
        this.isVisible = !!isVisible;
    }

    /**
     * render()
     * Render this block to a stream
     * @return {ReadableStream}
     */
    render() {
        Promise.all(this.blockIsReady).then(_ => {
            console.log(this);
        });
    }
}

function template(templateFile) {
    const templatePromise = readFile(templateFile);
    const templateBlock = new Block(templatePromise);
    return templateBlock;

}

module.exports = {
    processElement,
    arrayToStream,
    Block,
    template
};
