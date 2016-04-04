/*jslint node, es6, maxlen: 120 */

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
const escapeHtml = require("escape-html");
const stream = require("stream");
const path = require("path");

/**
 * Sets the debugging flag, to display additional debug information
 * @param {mixed} bool - truthy to enable debugging
 * @return {undefined}
 */
let debug = process.env.NODE_ENV === "development";
function setDebug(bool) {
    debug = !!bool;
}


/**
* Interface function for setting a flag that will allow unrecognized tags to be rendered or not
*
* @param {boolean||string||number} bool. Sets the variable to true or false.
*/
let showTagsDefault = false;
function setShowTagsDefault(bool) {
    showTagsDefault = !!bool;
}

let testMode = false;

/**
* A function for finding the values of deeplinks within the template variables. Used in contentStream();
*
* @param {array} linkArray. A series of variable names
* @param {object} vars. key:value pairs of variables that should be searched
* @return Anything that it finds
*/
function findDeeplinkValue(linkArray, vars) {
    const currentLink = linkArray.shift();
    const checkVars = vars[currentLink];
    if (typeof checkVars === "object" && linkArray.length >= 1) {
        // If we found an object and there are more links to follow, then go deeper
        return findDeeplinkValue(linkArray, checkVars);

    } else {
        // May return undefined
        return checkVars;
    }
}
/**
* A function for determining whether a variable is a key:value pair 'object', or some other kind of object.
*
* @param {any} input. A variable to be tested
* @return {boolean}. True if the variable is a key:value pair object
*/
function identifyStream(input) {
    if (input.constructor === stream.Readable) {
        return 'readable';
    }
    if (input.constructor === stream.Duplex) {
        return 'duplex';
    }
    if (input.constructor === stream.Transform) {
        return 'transform';
    }
    if (input.constructor === stream.Writable) {
        return 'writable';
    }
    return false;
}

function isKeyValuePair(input) {
    if (input === undefined) {
        return false;
    }
    if (typeof input === 'function') {
        return false;
    }
    if (Array.isArray(input)) {
        return false;
    }
    if (input.constructor === Promise) {
        return false;
    }
    if (identifyStream(input)) {
        return false;
    }
    if (typeof input === "object") {
        return true;
    }
    return false;
}

/**
* A function that takes a string of a template object and parses it for blocks
*
* @param {string} inputString. A template string in need of parsing
* @param {RegExp} regex. A RegExp object for finding blocks
* @param {array} arr. An array that you want to add to. can be an empty array
* @return {array}. Array representing the blocks in the template
*/

// regex blocks for finding things.
const tagRegex = /\{\{?([A-z]([A-z]|[0-9]|_|\||\.)+)+\}?\}/;
const blockRegex = /\{#([A-z]([A-z]|[0-9]|_)+)\}(.|\n)*?\{\/\1\}/m; // JSLint doesn't like the \1 backreference
const commentRegex = /\{\/\*(.|\n)*?\*\/\}/gm;

function parseForTags(inputString, regex, arr) {
    // Match the regex against the input string
    const match = regex.exec(inputString);

    // If there is a match, then do stuff
    if (match) {
        // If a tag or a block is found, then this element of the array will be an object containing useful information
        const tag = {
            name: match[1],
            text: match[0]
        };
        if (match[0].charAt(1) === '#') {
            // If the tag is a block literal, then remove the tags and parse the content.
            tag.text = match[0]
                .replace("{#" + match[1] + "}", "")
                .replace("{/" + match[1] + "}", "");
            // Parse into an array
            tag.content = parseForTags(tag.text, blockRegex)
                .map(function (element) {
                    return parseForTags(element, tagRegex);
                });
        } else {
            // Its not a block tag, so it may contain a deeplink or a mask function.
            if (tag.name.indexOf('|') !== -1) {
                tag.masks = tag.name.split('|');
                tag.name = tag.masks.shift();
                // filter out the functions that are undefined (this may need to be done later)
            }
            if (tag.name.indexOf('.') !== -1) {
                tag.deeplinks = tag.name.split('.');
                tag.name = tag.deeplinks.shift();
            }
        }
        const preTagText = inputString.substring(0, match.index);
        const afterTagText = match.input.substring(match.index, match.input.length).replace(match[0], '');
        const matchArray = [preTagText, tag].concat(parseForTags(afterTagText, regex, arr));
        return matchArray;
    }
    // If there is no tag or block, then just return a single string inside of an array.
    return [inputString];
}

/**
* A function that takes a nested template array and flattens it while also inserting blocks that were loaded from
* external sources.
*
* @param {array} array. Nested template array generated by parseForTags()
* @param {object} blocks. Object containing block objects, generated by createTemplate()
* @return {array} returnArray. A flattened array of strings and objects ready to be streamed
*/
function prepareTemplate(array, blocks) {
    let returnArray = [];
    if (!blocks) {
        blocks = {};
    }
    array.forEach(function (element) {
        if (Array.isArray(element)) {
            returnArray = returnArray.concat(prepareTemplate(element));
        } else {
            if (typeof element === 'object') {

                if (element.content) {
                    element.content = prepareTemplate(element.content);
                }
            }

            returnArray.push(element);
        }
    });
    return returnArray;
}

/**
* A function that takes a template object and parses it into a stream ready to be rendered or sent to another template.
*
* @param {object} processObject. An object containing various pieces of information, packaged into an object to make
*        recursion easier. This object is initially created using input from the user via the createTemplate() function.
* @param {number} index. A number representing the current index of processObject.content that is being processed by
*        this iteration of the function
* @param {function} done. A callback function dictating what happens when this function reaches the end of its
*        processObject.content array.
* @return {array}. Array representing the blocks in the template
*/

function contentStream(processObject, index, done) {

    // Get all the useful things out of the processObject;
    const content = processObject.content;
    const vars = processObject.vars;
    const blocks = processObject.blocks;
    const masks = processObject.masks;
    const errors = processObject.errors;
    const hide = processObject.hide;
    const showTagBlocks = processObject.showTagBlocks;
    let showTagState = processObject.showTagState;
    const output = processObject.output;

    // As of writing, ES6 default parameters don't work in node 5.6.0 without a harmony flag
    if (index === undefined) {
        index = 0;
    }

    // This function is called when we are ready for the next piece of content to be processed.
    // Promises and streams will wait until their content has finished resolving or streaming before calling this.
    const loop = function () {
        if (content[index + 1] === undefined) {
            if (typeof done === 'function') {
                done();
            }
        } else {
            contentStream(processObject, index + 1, done);
        }
    };

    // This function streams a given variable and moves on to the next iteration.
    const streamVariable = function (element) {
        let outputVariable = "";

        if (typeof element === 'string') {
            // If it comes in as a string, it is the parts of the template in between the templating engine's own tags.
            outputVariable = element;
        } else if (typeof element === 'object') {
            // If it's an object then its a tag, and the value needs to be retrieved from its vars
            if (typeof element.vars === 'number') {
                element.vars = element.vars.toString();
            }
            if (element.vars === undefined) {
                if (showTagState) {
                    element.vars = element.text;
                } else {
                    element.vars = "";
                }
            }
            if (typeof element.vars === 'object') {
                // If an element has arrived here and its variable is an object, then render as JSON.
                // It can't be a stream or a promise because they are dealt with elsewhere.
                element.vars = JSON.stringify(element.vars);
            }
            if (element.text.charAt(1) !== '{') {
                outputVariable = escapeHtml(element.vars);
            } else {
                outputVariable = element.vars;
            }

        } else {
            console.log('Failed to render: ', element);
        }
        output.push(outputVariable);
        loop();
    };

    // This function streams a block by calling this function recursively, and constructing a new processObject
    // or it hides the block if there is a hide flag associated with it.
    const streamBlock = function (block, blockVariable) {

        if (hide[block.name]) {
            loop();
            return;
        }
        const blockObject = {
            content: block.content,
            vars: Object.assign({}, vars, block.vars, blockVariable),
            hide,
            blocks,
            masks,
            errors,
            showTagBlocks,
            showTagState,
            output
        };
        if (Array.isArray(blockVariable)) {
            // If the block variable is an array, then it is an iterable block.
            const iteratedContent = [];
            // duplicate the block content based on the number of iterations.
            blockVariable.forEach(function (ignore, index) {
                iteratedContent.push({
                    name: index,
                    text: block.text,
                    content: block.content
                });
            });
            // replace the blockObject's content with the iterated versions of the blocks
            blockObject.content = iteratedContent;
            // Now we can run them.
            contentStream(blockObject, 0, function () {
                // when this block has finished, continue iterating
                loop();
            });
            return;
        }
        contentStream(blockObject, 0, function () {
            // when this block has finished, continue iterating
            loop();
        });
    };

    const streamElement = function (element) {

        if (element.content) {
            // The readFile function returns a promise, so any block inserted from an external file will be
            // returned as a promise.
            if (element.content.constructor === Promise) {
                element.content.then(function (content) {
                    element.content = content;
                    streamBlock(element);
                }).catch(function () {
                    // If this promise fails to resolve, then most likely the template file for this block could not
                    // be found. So push an error and move on.
                    output.push("Error: A block failed to render");
                    loop();
                });
                return;
            }
            // If there is content, but it is not a promise, then render it straight away
            streamBlock(element, element.vars);
            return;
        }
        // If there is no content then it must be a variable.
        streamVariable(element);

    };
    // Here we read the content array to see what is to be sent to the browser
    const element = content[index];

    if (typeof element === 'object') {
        // if it's an object then it represents a tag of some kind, either a block or a variable.
        // load the variables into the element itself to make it easier to pass into functions.
        element.vars = vars[element.name];
        // A flag can be set on a per-block basis as to whether or not to render tags that have no variable
        // associated with them
        if (showTagBlocks[element.name]) {
            showTagState = showTagBlocks[element.name];
        }

    }

    // If there is a variable associated with this element, then we do stuff with it.
    if (element.vars && typeof element.vars === 'function') {
        // If the variable is a function, then execute it and use the return value.
        element.vars = element.vars();
        // need to put some error handling in here
    }

    if (element.vars && element.deeplinks) {
        // retrieve a deeplink value before contiuing
        element.vars = findDeeplinkValue(element.deeplinks, element.vars);
    }

    if (element.vars && element.masks) {
        // apply mask functions to the value
        const filteredMasks = element.masks
            .filter(function (mask) {
                // make sure that the mask functions exist before trying to apply them
                return (masks[mask] !== undefined);

            });
        if (element.masks.length === filteredMasks.length) {
            // if the functions are all present then apply them
            element.vars = element.masks
                .map(function (mask) {
                    return masks[mask];
                })
                .reduce(function (prev, mask) {
                    try {
                        return mask(prev);
                    } catch (e) {
                        // If the function is bad then don't apply it and hopefully it won't break anything
                        console.error(e);
                        return prev;
                    }
                }, element.vars);
        } else {
            // If one or more of the functions in a mask chain is not defined
            //then instead of returning an incorrect result, return nothing
            element.vars = undefined;
        }
        streamElement(element);
        return;
    }

    if (element.vars === undefined) {
        // There is no variable associated with this tag, send it to the browser as it is
        streamElement(element);
        return;
    }

    if (element.vars.constructor === Promise) {

        // If the variable is a promise, then we need to pause the stream and wait for it to resolve
        output.pause();

        element.vars
            .then(function (resolvedVariable) {
                // Wait for the promise to resolve or fail, once it resolves resume streaming
                output.resume();
                element.vars = resolvedVariable;
                streamElement(element);

            }).catch(function (err) {
                console.error(err);
                // if the promise rejects then we should render some kind of error instead.
                const errorTemplate = errors[element.name];
                output.resume();
                if (errorTemplate) {
                    streamElement(errorTemplate);
                } else if (err) {
                    output.push(err);
                    loop();

                } else {
                    output.push('Error: Failed to retrieve data');
                    loop();

                }
            });
        return;
    }
    if (identifyStream(element.vars)) {
        // If its a stream then pipe it out directly.
        output.pause();
        element.vars
            .on('readable', function () {
                output.resume();
            })
            .on('data', function (data) {
                output.push(data);
            })
            .on('end', function () {
                loop();
            })
            .on('error', function (err) {
                output.resume();
                output.push(err);
                loop();
            });
        return;
    }
    if (typeof element.vars === 'object' && Object.keys(element.vars).length === 0) {
        const insertBlock = blocks[element.name];
        if (insertBlock) {
            element.content = insertBlock.content;
        }
    }
    streamElement(element);

}

function findDeepBlock(searchArray, deeplinks) {
    const currentLink = deeplinks.shift();
    const result = searchArray.filter(function (element) {
        if (element.name) {
            return (element.name === currentLink);
        } else {
            return false;
        }
    });
    if (result[0].content && deeplinks.length > 0) {
        return findDeepBlock(result[0].content, deeplinks);
    } else {
        return result;
    }
}

/**
* Memoizer function for locating and processing templates.
*
* @param {string} path - local or absolute path to the templates
* @return {Promise} - A promise for the string contents of a file
*/
const getTemplate = (function() {
    const templateCache = {};
    return function (templatePath) {
        if (templateCache[templatePath] === undefined) {
            templateCache[templatePath] = readFile(templatePath, "utf8")
                .then(function (templateString) {
                    // show comments out of the template.
                    templateString = templateString.replace(commentRegex, '');

                    return parseForTags(templateString, blockRegex)
                        .map(function (element) {
                            return parseForTags(element, tagRegex);
                        });
                }).then(function (templateArray) {
                    return prepareTemplate(templateArray);
                }).catch(function (err) {
                    return Promise.reject(err);
                });
        } else {
            if (debug) {
                console.log(`Template: '${templatePath}' already saved in memoizer`)
            }
        }
        return templateCache[templatePath];
    };
}());

function createTemplate(templateFile) {
    // Private template object to contain the state of the template object, without exposing it to the user
    const template = {
        file: getTemplate(templateFile),
        vars: {},
        masks: {},
        blocks: {},
        errors: {},
        hide: {},
        showTags: {}
    };
    // Context object for exposing interface methods to the user seperately, so that they can't mess with
    // template values directly This object is returned by every method so that methods can be chained such
    // as example.load(args).set(args).render();
    const ctx = {};

    /**
    * Load the contents of another template file into a block object, and insert it into the current template
    *
    * @param {string} filename. A string representing the path to a template file.
    * @param {string} blockName. An optional string specifying the name of the block or tag that will be used to render
    * this content. If this is omitted then the name of the file (without the extention) is taken as the blockname
    *
    * Relevant Unit Tests:
    *       testTemplateLoad1 - Tests for valid input types if using 1 parameter
    *       testTemplateLoad2 - Tests for valid input types if using 2 parameters
    */

    const load = function (filename, blockName) {
        if (typeof filename !== 'string') {
            throw new Error('load() requires a string containing the path to a template file');
        }
        if (blockName === undefined) {
            // If there is no blockname specified, use the name of the file.
            blockName = path.parse(filename).name;
        }
        if (typeof blockName !== 'string') {
            throw new Error('load() requires the second argument to be a string');
        }

        template.blocks[blockName] = {content: getTemplate(filename)};
        template.vars[blockName] = {};

        return ctx;
    };

    const error = function (filename, blockName) {
        if (!blockName || !filename) {
            throw new Error('error() requires two parameters, filename of the template, and the name of a promise');
        }
        template.errors[blockName] = {content: getTemplate(filename)};
        return ctx;
    };

    /**
    * Set a variable within the template that corresponds to a template tag
    *
    * @param {any} inputObject. A variable value to be entered into the template
    *        or an object literal containing key:value pairs.
    * @param {string} blockName. An optional string specifying the name of the block or tag that will be used to render
    * this content. If this is omitted then the inputObject must be an object literal
    *
    * Relevant Unit Tests:
    *       testTemplateSet1 - Tests for valid input types if using 1 parameter
    *       testTemplateSet2 - Tests for valid input types if using 2 parameters
    */
    const set = function (inputObject, blockName) {
        if (blockName === undefined) {
            if (isKeyValuePair(inputObject)) {
                // If no block is specified, assign the inputObject to the global scope
                Object.assign(template.vars, inputObject);
                return ctx;
            } else {
                throw new Error("If there is no block name specified, you must supply an object with key:value pairs");
            }
        }
        if (typeof blockName === 'string') {
            template.vars[blockName] = inputObject;
            return ctx;
        }
        throw new Error('set() requires the second argument to be a string');

    };
    // This function sets
    const setShowUndefinedBlocks = function (blockName, bool) {
        if (bool === undefined) {
            bool = true;
        }
        if (typeof blockName !== 'string') {
            throw new Error("showUndefinedBlock requires the name of a block as a string");
        } else {
            template.showTags[blockName] = !!bool;
            return ctx;
        }
    };

    const remove = function (blockName) {
        if (typeof blockName !== 'string') {
            throw new Error("remove() requires the name of a block as a string");
        }
        template.hide[blockName] = true;
        return ctx;
    };

    const restore = function (blockName) {
        if (typeof blockName !== 'string') {
            throw new Error("restore() requires the name of a block as a string");
        }
        template.hide[blockName] = false;
        return ctx;
    };

    const addMask = function (name, callable) {
        if (name === undefined || callable === undefined) {
            throw new Error("addTransform() must have two parameters.");
        }
        if (typeof name !== "string") {
            throw new Error("addTransform takes a string as its first parameter");
        }
        if (typeof callable !== "function") {
            throw new Error("addTransform takes a function as its second parameter");
        }
        template.masks[name] = callable;
        return ctx;
    };

    let outputStream = new stream.Duplex();
    // _read doesn't pass JSLint, but there's not much we can do about it.
    outputStream._read = function () {
        // It is necessary to define a _read function for the stream, however in our implementation we are pushing
        // items onto the stream directly so this function is not needed. If this function is not defined then you
        // will be spammed with 'not implemented' errors.
        return undefined;
    };

    const render = function (blockNames) {
        // The templateFile should be a promise that reads a file, and then processes it into an array ready to
        // be streamed.
        template.file
            .then(function (templateArray) {
                // If there is a blockNames argument in the render function, then extract the specified block
                // for rendering
                if (blockNames !== undefined && typeof blockNames === 'string' && blockNames !== '') {
                    // Allow the use of deeplinks in the renderfunction.
                    if (blockNames.indexOf('.') !== -1) {
                        blockNames = blockNames.split('.');
                    } else {
                        blockNames = [blockNames];
                    }
                    return findDeepBlock(templateArray, blockNames);
                } else {
                    // If there is no argument then render the entire template
                    return templateArray;
                }

            }).then(function (templateContent) {
                // contentstream is a recursive function that takes each element of the array, processes it if it
                // is a tag, and then streams it.
                contentStream({
                    // content is a flat array consisting of strings and objects.
                    // Objects contain information about tags that have been found
                    // Strings are just the text in between the tags.
                    content: templateContent,
                    // blpuocks are files that have been loaded from external files via the load() method
                    blocks: template.blocks,
                    // similar to blocks, errors may be displayed if a promise rejects
                    errors: template.errors,
                    // variables contain the values associated with different template elements
                    vars: template.vars,
                    // functions that can be applied to variables in the template
                    masks: template.masks,
                    // containing the name of blocks that should be hidden.
                    hide: template.hide,
                    // contains the names of blocks and whether or not tags should be rendered
                    showTagBlocks: template.showTags,
                    // Sets the current block to render or strip tags that have no variable associated with them.
                    showTagState: showTagsDefault,
                    // This passes the output stream to the function for rendering
                    output: outputStream
                    // The index that the function should start at, and the action to be run when this function finishes
                }, 0, function () {
                    // pushing null to the output stream ends the stream.
                    outputStream.push(null);
                });
            }).catch(function (err) {
                outputStream.push(err.stack);
                if (debug) {
                    console.error(err.stack);
                }
                outputStream.push(null);
            });
        // Once the render function is called you can chain stream methods.
        return outputStream;
    };

    // Expose template context api
    ctx.load = load;
    ctx.error = error;
    ctx.set = set; // tests written for success and failure
    ctx.showUndefinedBlock = setShowUndefinedBlocks; // tests written for success and failure
    ctx.remove = remove; // tests written for success and failure
    ctx.restore = restore; // tests written for success and failure
    ctx.addMask = addMask;
    ctx.render = render;

    // If testMode is set to true by getTestFunctions(), then return the internal template values.
    if (testMode) {
        ctx.test = template;
    }

    return ctx;
}

/**
 * Exposes plumbing methods for the purposes of unit testing
 * @return {object} Augmented API
 */

function getTestFunctions() {
    // Set testMode to true so that the template context object returns its internal template values for use in tests.
    testMode = true;
    return Object.assign({
        testFunctions: {
            blockRegex,
            tagRegex,
            parseForTags,
            prepareTemplate
        }
    }, module.exports);
}

// Export the public API
module.exports.create = createTemplate; // tests written for success and some failure
module.exports.debug = setDebug;
module.exports.showUndefined = setShowTagsDefault;
module.exports.testMode = getTestFunctions;
