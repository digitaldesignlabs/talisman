/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs Ltd
 * @license MIT
 */

"use strict";

// Load the renderer
const Renderer = require("./Renderer").Renderer;

/**
 * Block Object
 * A block represents a chunk of template, which may contain other blocks, or placeholders for variables.
 * @exports {Block}
 * @author Mike Hall
 * @author David Hignett
 */
class Block {

    /**
     * constructor()
     * Sets up this block
     * @constructor
     */
    constructor(content, options) {

        // I am a block
        this.is = "block";

        // Remember our name
        this.name = options.name;

        // Record our name in the blockmap
        options.blockmap.set(this.name, this);

        // Detects CDATA in the content - {{CDATA[ ]}}
        const cdataRegex = /{{CDATA\[([\s\S]*?)\]}}/gm;

        // Detects comments in the content = {/* */}
        const commentRegex = /{\/\*[\s\S]*?\*\/}\n?/gm;

        // Detects child blocks in the content {#blockName} {/blockName}
        const blockRegex = /{#([a-zA-Z][a-zA-Z0-9\_\-]+)}([\s\S]*){\/\1}\n?/gm;

        // These two variables keep track of all the promises upon which this block depends.
        // this.waitingFor keeps track of all of the assigned variables and iterators which must be resolved
        // before we can begin parsing. It is configured using this.waitUntil(). The developer can also pass in
        // their own promises to wait for and they will be added to this queue. You can find out if all the
        // promises in this.waitingFor are ready by calling this.ready()
        this.waitingFor = [];

        // this.processing keeps track of the parsing of this block and our child blocks. Child blocks will also add
        // their own children, and so on, so we should be confident that the block structure of the template is
        // complete when all the promises in this  list are resolved. You can check this by calling this.processed()
        this.processing = [];

        // Inherit our variables from our parent variables, so the prototype chain gives scoped variable resolution.
        this.vars = Object.create(options.vars || null);
        this.masks = Object.create(options.masks || null);

        // Set up an intial "escape" mask.
        // This user can override this by setting their own mask named "escape" but by default we will escape HTML.
        if (!this.masks.escape) {
            this.masks.escape = require("html-escape");
        }

        // The data source controls the iteration of this Block. An undefined data
        // source means this Block will just render as-is, without iteration.
        this.dataSource = undefined;

        // Store the visibility state of this block. Invisible blocks skip rendering. Default to visible.
        this.isVisible = true;

        // Save the content of this template
        this.content = Promise.resolve(content).then(content => {

            // Squirrel away CDATA escaped content, so we can substitute back in later
            return content.toString().replace(cdataRegex, (ignore, childContent, offset) => {
                const placeholder = `talisman_cdata_${offset}`;
                this.vars[placeholder] = childContent;
                return `{{{${placeholder}}}}`;
            });

        }).then(content => {

            // Strip out comments
            return content.replace(commentRegex, "");

        }).then(content => {

            // Parse out any blocks we find
            const children = [];
            content = content.replace(blockRegex, (original, blockName, blockContent) => {
                children.push(this.addChild(blockName, blockContent, options.blockmap));
                return `{{{${blockName}}}}`;
            });

            // When all the children have parsed, we're done
            return Promise.all(children).then(() => content);
        });

        // Wait for the content to be ready
        this.processing.push(this.content);
    }

    /**
     * setVariables()
     *
     * Sets up variables supplied as key-values pairs.
     *
     * @param {Promise?<Map|object>} vars - key-value pairs to store
     * @return {undefined}
     */
    setVariables(vars) {

        const saved = Promise.resolve(vars).then(vars => {
            if (vars instanceof Map) {
                vars.forEach((v, k) => {
                    this.vars[k] = v;
                });
            } else {
                Object.assign(this.vars, vars);
            }
        });

        this.waitUntil(saved);
    }

    /**
     * setDataSource()
     *
     * Add a data source for this block.
     * @todo add support for any es6 iterator
     *
     * @param {Promise?<Array|ReadableStream>} raw - An array, an object stream, or Promise for the same
     * @return {undefined}
     */
    setDataSource(raw) {
        this.dataSource = Promise.resolve(raw);
        this.waitUntil(this.dataSource);
    }

    /**
     * addChild()
     *
     * Add a child block to this parent block
     *
     * @param {string} name - The name of this block
     * @param {Promise?<string>} The block to add
     * @param {Map} A copy of the blockmap which tracks blocks by their name
     * @return {undefined}
     */
    addChild(name, content, blockmap) {

        const child = new Block(content, {
            name: [this.name, name].join(":"),
            vars: this.vars,
            masks: this.masks,
            blockmap: blockmap
        });

        const childIsReady = child.processed();
        this.processing.push(childIsReady);
        this.vars[name] = child;

        return childIsReady.then(() => this.vars[name]);
    }

    /**
     * addMask()
     *
     * Add a mask to this block
     *
     * @param {string} name - The name of the mask
     * @param {function} fn - The mask function
     * @return {undefined}
     */
    addMask(name, fn) {
        this.masks[name] = fn;
    }

    /**
     * removeMask()
     *
     * Remove a mask from this block
     *
     * @param {string} name - The name of the mask to remove
     * @return {undefined}
     */
    removeMask(name) {
        delete this.masks[name];
    }

    /**
     * setVisibility()
     *
     * Specify whether to show or hide this block. True = show.
     *
     * @param {bool} isVisible
     * @return {undefined}
     */
    setVisibility(isVisible) {
        this.isVisible = !!isVisible;
    }

    /**
     * waitUntil()
     *
     * Tells this block to wait until some Promise has resolved before starting to render
     *
     * @param {Promise} p
     * @return {undefined}
     */
    waitUntil(p) {
        this.waitingFor.push(p);
    }

    /**
     * ready()
     *
     * Returns a promise which resolves to our content when we are ready to render.
     *
     * @return {Promise<string>}
     */
    ready() {
        return Promise.all(
            this.waitingFor.concat(this.processed())
        ).then(() => this.content);
    }

    /**
     * processed()
     *
     * Returns a promise which resolves to ourselves when we have been fully parsed.
     *
     * @return {Promise<Block>}
     */
    processed() {
        return Promise.all(this.processing).then(() => this);
    }

    /**
     * render()
     *
     * Render this block to a stream
     *
     * @return {ReadableStream} This block
     */
    render() {
        return new Renderer(this);
    }
}

// Export public API
module.exports.Block = Block;
