
"use strict";

/**
 *
 * Talisman
 * by Digital Design Labs
 *
 * The streaming, promise-aware, template library
 * "Your quest is to find the Talisman, though you may not hold it"
 */

// external modules
const promisify = require("es6-promisify");
const readFile = promisify(require("fs").readFile);

// internal modules
const Block = require("./Block");
const Renderer = require("./Renderer");

function template(templateFile) {

    const templatePromise = readFile(templateFile);
    const templateBlock = new Block(templatePromise);
    const templateRender = new Renderer(templateBlock);

    return templateRender;
}

module.exports = {
    template
};
