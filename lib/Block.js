"use strict";

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
            return content.replace(cdataRegex, (ignore, content, offset) => {
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
                    this.vars[key]data[key];
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

// Export public API
module.exports.Block = Block;
