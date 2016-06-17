/* eslint no-console: 0 */

"use strict";

const talisman = require("./lib/talisman");

talisman.create("./template.html")
    .then(function (template) {

        template.set({
            title: new Promise(resolve => {
                setTimeout(resolve, 3000, "Hello World");
            }),
            pageTitle: "This is my page"
        });

        template.addMask("reverse", function (s) {
            return s.split("").reverse().join("");
        });

        template.addMask("caps", function (s) {
            return s.toUpperCase();
        }, "blockLevelOne");

        template.addMask("plusplus", function (i) {
            return i + 1;
        });

        const data = new Promise(resolve => {
            resolve([
                {
                    placeholder: "Hello"
                },
                {
                    placeholder: "there"
                },
                {
                    placeholder: "World!"
                }
            ]);
        });

        template.setIterator(data, "blockLevelOne:blockLevelTwo");

        // return template.toString();
        return template.toStream();
    })
    .then(output => output.pipe(process.stdout))
    // .then(output => console.log(output))
    .catch(e => console.error(e.stack));
