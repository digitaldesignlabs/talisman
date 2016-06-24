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
    constructor(content, name, vars, masks, family) {

        // I am a block
        this.is = "block";

        // Remember our name
        this.name = name;

        // Keep a copy of the blockmap, so we can lookup blocks by name.
        // Only the root block really does this, but the child blocks receive a copy so they can add themselves.
        this.family = family || new Map();
        this.family.set(this.name, this);

        // Detects CDATA in the content - {{CDATA[ ]}}
        const cdataRegex = /{{CDATA\[([\s\S]*?)\]}}/gm;

        // Detects comments in the content = {/* */}
        const commentRegex = /{\/\*[\s\S]*?\*\/}\n?/gm;

        // Detects child blocks in the content {#blockName} {/blockName}
        const blockRegex = /{#([a-zA-Z][a-zA-Z0-9\_\-]+)}([\s\S]*){\/\1}\n?/gm;

        // Keep track of all the Promises upon which this block depends
        this.waitingFor = [];

        // Inherit our variables from our parent variables, so the prototype chain gives scoped variable resolution.
        this.vars = Object.create(vars || null);
        this.masks = Object.create(masks || null);

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
                return `{{${placeholder}}}`;
            });

        }).then(content => {

            // Strip out comments
            return content.replace(commentRegex, "");

        }).then(content => {

            // Parse out any blocks we find
            return content.replace(blockRegex, (original, blockName, blockContent) => {
                const child = this.addChild(blockName, blockContent);
                this.waitUntil(child);
                return `{{${blockName}}}`;
            });
        });

        // Remember to wait for this before rendering
        this.waitUntil(this.content);
    }

    /**
     * seekByName()
     *
     * Look up a block by its name
     *
     * @param {string} blockName
     * @return {Block}
     */
    seekByName(blockName) {
        const fullName = [this.name].concat(blockName).filter(n => !!n).join(":");
        return this.family.get(fullName);
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
     * @param {string|Promise<string>} The block to add
     * @return {undefined}
     */
    addChild(name, content) {
        return this.content.then(() => {
            const fullName = [this.name, name].join(":");
            this.vars[name] = new Block(content, fullName, this.vars, this.masks, this.family);
            return this.vars[name];
        });
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
     * Returns a promise which resolves to our content when we are ready.
     *
     * @return {Promise<string>}
     */
    ready() {
        return Promise.all(this.waitingFor).then(() => this.content);
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
