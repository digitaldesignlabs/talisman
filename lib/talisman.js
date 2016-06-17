/**
 * Talisman - the streaming template library
 *
 * "Your quest is to find the Talisman, though you may not hold it"
 *
 * @copyright Digital Design Labs
 * @license MIT
 */

"use strict";

const isFunction = require("util").isFunction;
const promisify = require("es6-promisify");
const readFile = promisify(require("fs").readFile);

const Block = require("./Block").Block;

/**
 * Talisman API
 *
 * @author Mike Hall <mikehall314@gmail.com>
 * @author David Hignett <david@hignatious.co.uk>
 */

/**
 * getFullyQualifiedBlockName()
 *
 * Works out the full name of a block, including the root name which isn't exposed
 *
 * @access private
 * @param {string} root - The name of the root block
 * @param {string) blockName - The relative name of the block
 * @return {string} The full name of the block
 */
function getFullyQualifiedBlockName(root, blockName) {
    return [root].concat(blockName).filter(v => !!v).join(":");
}

/**
 * createTemplate()
 *
 * Create a talisman root block from a passed file
 *
 * @access public
 * @param {string} filename
 * @return {Promise|object} An object exposing the Talisman API
 */
function createTemplate(filename) {
    return readFile(filename, "utf8").then(content => {

        const root = "__talisman_root__";
        const block = new Block(content, root);

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
             * @return {object} Talisman API
             */
            load(filename, tagName, blockName) {

                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);

                if (target) {
                    target.addChild(tagName, readFile(filename, "utf8"));
                }

                return api;
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

                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);

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

                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);

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
                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);
                target.setVariables(data);
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
                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);
                target.setDataSource(data);
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

                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);

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

                const fullName = getFullyQualifiedBlockName(root, blockName);
                const target = block.seekByName(fullName);

                if (target) {
                    target.removeMask(name);
                }

                return api;
            },

            /**
             * toStream()
             *
             * Renders the block to a stream
             *
             * @access public
             * @param {string} blockName - Name of the block to render. Assumes root if omitted.
             * @return {ReadableStream}
             */
            toStream(blockName) {
                const fullName = getFullyQualifiedBlockName(root, blockName);
                return block.render(fullName);
            },

            /**
             * toString()
             *
             * Renders the block to a string. But you probably don't want to.
             *
             * @access public
             * @param {string} blockName - Name of the block to render. Assumes root if omitted.
             * @param {function} cb - Callback to run when finished
             * @return {Promise<string>}
             */
            toString(blockName, cb) {
                const fullName = getFullyQualifiedBlockName(root, blockName);
                return new Promise((resolve, reject) => {

                    let content = "";

                    block.render(fullName).on("data", chunk => {
                        content += chunk;
                    }).on("end", () => {

                        resolve(content);
                        if (isFunction(cb) === true) {
                            cb(undefined, content);
                        }

                    }).on("error", error => {

                        reject(error);
                        if (isFunction(cb) === true) {
                            cb(error);
                        }
                    });
                });
            }
        };

        // When the block is ready, return the API
        return block.ready().then(() => api);
    });
}

// Export the public API
module.exports.create = createTemplate;
