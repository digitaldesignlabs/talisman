/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs
 * @license MIT
 */

"use strict";

const path = require("path");
const readFile = require("fs").readFile;
const Block = require("./Block").Block;

/**
 * Talisman API
 *
 * @author Mike Hall
 * @author David Hignett
 */

// This variable stores the path we'll load templates relative to
let templateRoot;

/**
 * loadFile()
 *
 * Function for loading template files from the disk.
 * The content of these files is memoized, so we don't hit the disk as often.
 *
 * @param {string} filename
 * @return {Promise<string>} file content
 */
const loadFile = (function () {

    const memo = new Map();
    return function (filename) {

        return new Promise((resolve, reject) => {

            // Do we have this already?
            const fullpath = path.resolve(templateRoot || "", filename);
            if (memo.has(fullpath) === true) {
                return resolve(memo.get(fullpath));
            }

            // Load the file from the disk and save in the memo
            readFile(fullpath, "utf8", (err, content) => {

                if (err) {
                    return reject(err);
                }

                memo.set(fullpath, content);
                resolve(content);
            });
        });
    };
}());

/**
 * setTemplatePath()
 *
 * Sets the default location to look for template files
 *
 * @param {...string} args - Path fragments; same behaves like path.join()
 * @return {undefined}
 */
function setTemplatePath() {
    // Used to use ...spread operator here, but no more :(
    templateRoot = path.join.apply(undefined, Array.prototype.slice.call(arguments));
}

/**
 * createTemplate()
 *
 * Create a talisman root block from a passed file
 *
 * @access private
 * @param {Promise<string>|string} templateString - A string describing this template, or a Promise for the same
 * @return {Promise<object>} An object exposing the Talisman API
 */
function createTemplate(templateString) {
    return Promise.resolve(templateString).then(content => {

        const root = "__talisman_root__";
        const blockmap = new Map();
        const block = new Block(content, {
            name: root,
            blockmap: blockmap
        });

        /**
         * seekBlockByName()
         *
         * Finds a block on the blockmap with the specified name
         *
         * @access private
         * @param {string} name
         * @return {Block} the block, or undefined if no block is found
         */
        function seekBlockByName(name) {
            const fullname = [root, name].filter(n => !!n).join(":");
            return blockmap.get(fullname);
        }

        // Define the public API
        const api = {

            /**
             * load()
             *
             * Load a child template into a tag in the specified block
             *
             * @access public
             * @param {string} filename
             * @param {string} tagName - The name of the placeholder tag to replace with this template
             * @param {string} blockName - The name of the block containing this placeholder. If omitted, assume root.
             * @return {Promise<object>} Talisman API
             */
            load(filename, tagName, blockName) {
                return loadFile(filename).then(content => {

                    const target = seekBlockByName(blockName);
                    if (target) {
                        return target.addChild(tagName, content, blockmap).then(() => api);
                    }

                    return api;
                });
            },

            /**
             * remove()
             *
             * Hides a child block by setting its visibility flag to false
             *
             * @access public
             * @param {string} blockName - The name of the block to hide. If omitted, assume root.
             * @return {object} Talisman API
             */
            remove(blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.setVisibility(false);
                }

                return api;
            },

            /**
             * restore()
             *
             * Reveal a previously hidden child block by setting its visibility flag to true
             *
             * @access public
             * @param {string} blockName - The name of the block to reveal. If omitted, assume root.
             * @return {object} Talisman API
             */
            restore(blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.setVisibility(true);
                }

                return api;
            },

            /**
             * set()
             *
             * Sets data for the block, from key-value pairs. Values may be promises or streams.
             *
             * @access public
             * @param {object} data
             * @param {string} blockName - The block to scope the data to. Assumes root if omitted.
             * @return {object} Talisman API
             */
            set(data, blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.setVariables(data);
                }

                return api;
            },

            /**
             * setIterator()
             *
             * Sets iterable data for the block. The block will be repeated iterator.length number of times.
             *
             * @access public
             * @param {object} data
             * @param {string} blockName - The block to scope the iterator to.
             * @return {object} Talisman API
             */
            setIterator(data, blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.setDataSource(data);
                }

                return api;
            },

            /**
             * addMask()
             *
             * Add a masking function of the specified name. Masking functions transform variable output at run-time
             * e.g. you may want to say {varName|uppercase} and then say:
             *   <code>
             *      block.addMask("uppercase", s => s.toUpperCase());
             *   </code>
             * Which will transform {varName} to uppercase. Masks may also be chained. e.g. {varName|uppercase|reverse}
             *
             * @access public
             * @param {string} name - The name of the mask to create.
             * @param {function} fn - The transform function. Will be synchronous, so don't dilly-dally.
             * @param {string} blockName - Name of the block to scope the mask to. Masks are only visible to children.
             * @return {object} Talisman API
             */
            addMask(name, fn, blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.addMask(name, fn);
                }

                return api;
            },

            /**
             * removeMask()
             *
             * Remove a previously added mask
             *
             * @access public
             * @param {string} name - The name of the mask to remove.
             * @param {string} blockName - Name of the block the mask is scoped to.
             * @return {object} Talisman API
             */
            removeMask(name, blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.removeMask(name);
                }

                return api;
            },

            /**
             * waitUntil()
             *
             * Tells this block to wait for some promise to resolve before starting to render
             * You usually want to use this on the deepest block you can.
             *
             * @access public
             * @param {Promise} promise - Some promise to wait for
             * @param {string} blockName - Name of the block which should wait
             * @return {object} Talisman API
             */
            waitUntil(promise, blockName) {

                const target = seekBlockByName(blockName);
                if (target) {
                    target.waitUntil(promise);
                }

                return api;
            },

            /**
             * toStream()
             *
             * Renders the block to a stream
             *
             * @access public
             * @return {ReadableStream}
             */
            toStream() {
                return block.render();
            },

            /**
             * toString()
             *
             * Renders the block to a string. But you probably don't want to.
             *
             * @access public
             * @param {function} cb - Callback to run when finished, if undefined returns a Promise
             * @return {Promise<string>|undefined}
             */
            toString(cb) {

                const p = new Promise((resolve, reject) => {

                    let content = "";

                    block.render()
                        .on("data", chunk => {
                            content += chunk;
                        })
                        .on("end", () => resolve(content))
                        .on("error", error => reject(error));
                });

                const isFunction = require("./tools").isFunction;
                if (isFunction(cb) === false) {
                    return p;
                }

                p.then(content => cb(undefined, content));
                p.catch(error => cb(error));
            }
        };

        // When the block is ready, return the API
        return block.processed().then(() => api);
    });
}

/**
 * createTemplateFromFile()
 *
 * Create a Talisman root block from reading a file and expose the API.
 *
 * @access public
 * @param {string} filename
 * @return {Promise<object>} An object exposing the Talisman API
 */
function createTemplateFromFile(filename) {
    return loadFile(filename).then(content => createTemplate(content));
}

// Export the public API
module.exports = {
    setTemplatePath,
    create: createTemplateFromFile,
    createFromString: createTemplate
};
