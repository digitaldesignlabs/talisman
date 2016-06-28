"use strict";

const test = require("tape");
const talisman = require("../lib/talisman.js");

const ReadableStream = require("stream").Readable;
const path = require("path");

function delay(content, ms) {
    return new Promise(resolve => setTimeout(resolve, ms, content));
}

function stream(content) {
    const s = new ReadableStream();
    s._read = function noop() {};
    s.push(content);
    s.push(null);
    return s;
}

function errorStream() {
    const s = new ReadableStream();
    s._read = function oops() {
        this.emit("error", new Error("Oops!"));
    };
    return s;
}

function objectStream() {

    const dataStream = new ReadableStream({objectMode: true});

    const queue = [
        {name: "Bill"},
        {name: "Ted"},
        {name: "Elizabeth"},
        {name: "Joanna"},
        {name: "Rufus"}
    ];

    dataStream._read = function () {
        if (queue.length === 0) {
            this.push(null);
        } else {
            this.push(queue.shift());
        }
    };

    return dataStream;
}

// Basic Output Functionality

test("Outputting data to a stream", assert => {
    talisman.createFromString("Hello World!").then(view => {
        return view.toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("toString as callback", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: "World"}).toString((err, content) => {
            assert.equal(err, undefined);
            assert.equal(content, "Hello World!");
            assert.end();
        });
    });
});

test("Outputting data to a stream", assert => {
    talisman.createFromString("Hello World!").then(view => {
        const outputStream = view.toStream();
        let content = "Stream Output: ";
        assert.equal(outputStream instanceof ReadableStream, true);

        outputStream.on("data", data => {
            content += data;
        }).on("end", () => {
            assert.equal(content, "Stream Output: Hello World!");
            assert.end();
        });
    });
});

// Variable Assignment

test("simple variable replacement", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: "World"}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("Number variables", assert => {
    talisman.createFromString("<ul><li>Count: {count}</li><li>Amount: {sum}</li></ul>").then(view => {
        return view.set({count: 23, sum: 44255.12}).toString();
    }).then(content => {
        assert.equal(content, "<ul><li>Count: 23</li><li>Amount: 44255.12</li></ul>");
        assert.end();
    });
});

test("maps as variables", assert => {
    talisman.createFromString("Hello {name}!").then(view => {

        const map = new Map();
        map.set("name", "World");
        return view.set(map).toString();

    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("promises as variables", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: delay("World", 500)}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("streams as variables", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: stream("World")}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("promised streams as variables", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({
            name: delay(stream("World"), 500)
        }).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("functions as variables", assert => {

    const world = () => "World";

    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: world}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("functions returning promises as variables", assert => {

    const world = () => Promise.resolve("World");

    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: world}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("functions returning promised streams as variables", assert => {

    const world = () => Promise.resolve(stream("World"));

    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: world}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("functions returning promises returning functions returning streams", assert => {

    const world = function () {
        return Promise.resolve(() => stream("World"));
    };

    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: world}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("Wait until a certain promise has resolved before continuing", assert => {

    talisman.createFromString("{test1}, Wait for it... {#delayBlock}{test2}, {test3}{/delayBlock}").then(view => {
        let prePromiseContent = "";
        let fullContent = "";
        let promiseResolved = false;
        const delayPromise = delay("Ok", 500).then(() => {
            promiseResolved = true;
        });

        view.set({test1: "Test 1 Done"})
            .set({test2: "Test 2 Done", test3: "All Tests Done"}, "delayBlock")
            .waitUntil(delayPromise, "delayBlock")
            .toStream()
            .on("data", data => {
                if (!promiseResolved) {
                    prePromiseContent += data;
                }
                fullContent += data;
            })
            .on("end", () => {
                assert.equal(prePromiseContent, "Test 1 Done, Wait for it... ");
                assert.equal(fullContent, "Test 1 Done, Wait for it... Test 2 Done, All Tests Done");
                assert.end();
            });
    });
});

// Blocks

test("Remove a block", assert => {

    talisman.createFromString("Hello {#censored}***The Royal Family are actually Lizards***{/censored} World!").then(view => {
        return view.remove("censored").toString();
    }).then(content => {
        assert.equal(content, "Hello  World!");
        assert.end();
    });
});

test("Restore a previously removed block", assert => {

    talisman.createFromString("Hello {#censored}***No really, The Royal Family really are actually Lizards***{/censored} World!").then(view => {
        return view.remove("censored").restore("censored").toString();
    }).then(content => {
        assert.equal(content, "Hello ***No really, The Royal Family really are actually Lizards*** World!");
        assert.end();
    });
});

// Scope and inheritance

test("scoped variables", assert => {
    talisman.createFromString("{greet} {name}{bang}\n{#excellent}{greet} {name}{bang}{/excellent}").then(view => {

        return view.set({greet: "Hello", name: "Bill"})
            .set({name: "Ted", bang: "!"}, "excellent")
            .toString();

    }).then(content => {
        assert.equal(content, "Hello Bill\nHello Ted!");
        assert.end();
    });
});
test("Deeplinked variables", assert => {
    talisman.createFromString("{#profile}<h1>{name}'s Profile</h1>{/profile}<p>Hello, {profile.name}. {request.name} would like to be your friend.</p>").then(view => {
        return view
            .set({name: "Steve"}, "profile")
            .set({request: {name: "John"}})
            .toString();

    }).then(content => {
        assert.equal(content, "<h1>Steve's Profile</h1><p>Hello, Steve. John would like to be your friend.</p>");
        assert.end();
    });
});

test("Deeplinked variable properties", assert => {
    talisman.createFromString("{#profile}<h1>{name}'s Profile</h1>{/profile}<p>Hello, {profile.name}. You have {profile.name.length} letters in your name.</p>").then(view => {
        return view
            .set({name: "Steve"}, "profile")
            .set({request: {name: "John"}})
            .toString();

    }).then(content => {
        assert.equal(content, "<h1>Steve's Profile</h1><p>Hello, Steve. You have 5 letters in your name.</p>");
        assert.end();
    });
});

test("Deeplinked promised variables", assert => {
    talisman.createFromString("{#profile}<h1>{name}'s Profile</h1>{/profile}<p>Hello, {profile.name}. {request.name} would like to be your friend.</p>").then(view => {
        return view.set(delay({name: "Sarah"}, 500), "profile")
        .set(delay({request: {name: "Steve"}}, 500))
        .toString();
    }).then(content => {
        assert.equal(content, "<h1>Sarah's Profile</h1><p>Hello, Sarah. Steve would like to be your friend.</p>");
        assert.end();
    });
});

// Iteration

test("iteration", assert => {
    talisman.createFromString("before{#block}{label}{/block}after").then(view => {
        const iterator = [{label: 1}, {label: 2}, {label: 3}];
        return view.setIterator(iterator, "block").toString();
    }).then(content => {
        assert.equal(content, "before123after");
        assert.end();
    });
});

test("iterator row counters", assert => {
    talisman.createFromString("before{#block}{talismanRowNum}.{label}{/block}after").then(view => {
        const iterator = [{label: "a"}, {label: "b"}, {label: "c"}];
        return view.setIterator(iterator, "block").toString();
    }).then(content => {
        assert.equal(content, "before0.a1.b2.cafter");
        assert.end();
    });
});

test("iteration from object streams", assert => {
    talisman.createFromString("before{#block}{name}{/block}after").then(view => {
        return view.setIterator(objectStream(), "block").toString();
    }).then(content => {
        assert.equal(content, "beforeBillTedElizabethJoannaRufusafter");
        assert.end();
    });
});

// Masks

test("masks", assert => {
    talisman.createFromString("Hello {name|reverse}!").then(view => {
        return view.set({name: "dlroW"})
            .addMask("reverse", s => s.split("").reverse().join(""))
            .toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("chained masks", assert => {
    talisman.createFromString("Hello {name|reverse|upper}!").then(view => {
        return view.set({name: "dlroW"})
            .addMask("reverse", s => s.split("").reverse().join(""))
            .addMask("upper", s => s.toUpperCase())
            .toString();
    }).then(content => {
        assert.equal(content, "Hello WORLD!");
        assert.end();
    });
});

test("deeplinked variables with masks", assert => {
    talisman.createFromString("Hello {profile.name|reverse}!").then(view => {
        return view.set({profile: {name: "dlroW"}})
            .addMask("reverse", s => s.split("").reverse().join(""))
            .toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("removing masks", assert => {
    talisman.createFromString("Hello {name|reverse|upper}!").then(view => {
        return view.set({name: "dlroW"})
            .addMask("reverse", s => s.split("").reverse().join(""))
            .addMask("upper", s => s.toUpperCase())
            .removeMask("upper")
            .toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

// Escaping html and commenting

test("tag escaping", assert => {
    talisman.createFromString("Hello {name} {{name}}!").then(view => {
        return view.set({name: "<strong>World</strong>"}).toString();
    }).then(content => {
        assert.equal(content, "Hello &lt;strong>World&lt;/strong> <strong>World</strong>!");
        assert.end();
    });
});

test("template comments", assert => {
    talisman.createFromString("Hello {/* This is a comment, and should have been stripped */}{name}!").then(view => {
        return view.set({name: "World"}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

test("preserving template tags with a CDATA tag", assert => {
    talisman.createFromString("Hello {{CDATA[{name}]}}!").then(view => {
        return view.set({name: "World"}).toString();
    }).then(content => {
        assert.equal(content, "Hello {name}!");
        assert.end();
    });
});

// Composition of template files

test("templates from the filesystem", assert => {
    talisman.create(path.join(__dirname, "/sample-1.html")).then(view => {
        return view.set({name: "World"}).toString();
    }).then(content => {
        assert.equal(content, "Hello World from the filesystem!\n");
        assert.end();
    });
});

test("composing blocks from the filesystem", assert => {
    talisman.create(path.join(__dirname, "sample-2.html")).then(view => {
        return view.load(path.join(__dirname, "sample-3.html"), "content");
    }).then(view => {
        return view.toString();
    }).then(content => {
        assert.equal(content, "Before\nThis is content from another file.\n\n\nInside\n\nAfter\n");
        assert.end();
    });
});

test("composing deep blocks from the filesystem", assert => {
    talisman.create(path.join(__dirname, "sample-2.html")).then(view => {
        return view.load(path.join(__dirname, "sample-3.html"), "deepContent", "innerBlock");
    }).then(view => {
        return view.toString();
    }).then(content => {
        assert.equal(content, "Before\n\n\nInside\nThis is content from another file.\n\nAfter\n");
        assert.end();
    });
});

// Errors

test("Handle malformed tags", assert => {

    talisman.createFromString("Hello {name}}, Hello {{name}!").then(view => {
        return view.set({name: "World"}).toString();
    }).then(content => {
        assert.equal(content, "Hello World}, Hello {World!");
        assert.end();
    });
});

test("Handle invalid iterators", assert => {
    talisman.createFromString("before{#block}{label}{/block}after").then(view => {
        const iterator = 13;
        return view.setIterator(iterator, "block").toString();
    }).then(content => {
        assert.equal(content, "beforeafter");
    }).catch(error => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message, "Unsupported data source; must be an array or object stream");
    }).then(() => {
        assert.end();
    });
});

test("Handle invalid non-object mode stream as iterator", assert => {
    talisman.createFromString("before{#block}{label}{/block}after").then(view => {
        const nonObjectStream = new ReadableStream();
        return view.setIterator(nonObjectStream, "block").toString();
    }).then(content => {
        assert.equal(content, "beforeafter");
    }).catch(error => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message, "Iterator streams must be in object mode");
    }).then(() => {
        assert.end();
    });
});

test("Handle error event in stream variable while rendering as a string", assert => {
    talisman.createFromString("Testing {test}").then(view => {
        let streamFunctionThrow = false;
        assert.equal(streamFunctionThrow, false);
        return view.set({test: errorStream()}).toString();
    }).catch(error => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message, "Oops!");
    }).then(() => {
        assert.end();
    });
});

test("Handle error event in stream variable while rendering as a string with a callback", assert => {
    talisman.createFromString("Testing {test}").then(view => {
        return view.set({test: errorStream()}).toString((error, content) => {
            assert.equal(content, undefined);
            assert.equal(error instanceof Error, true);
            assert.equal(error.message, "Oops!");
            assert.end();
        });
    });
});


test("Handle attempting to load a template into a non-existent block", assert => {
    talisman.createFromString("Loading external resource: {#external}{content}{/external}").then(view => {
        const invalidBlock = view.load(path.join(__dirname, "sample-3.html"), "content", "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to set a variable into a non-existent block", assert => {
    talisman.createFromString("{#validBlock}{content}{/validBlock}").then(view => {
        const invalidBlock = view.set({content: "test"}, "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to set an iterator on a non-existent block", assert => {
    talisman.createFromString("{#validBlock}{label}{/validBlock}").then(view => {
        const iterator = [{label: 1}, {label: 2}, {label: 3}];
        const invalidBlock = view.setIterator(iterator, "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to set a variable into a non-existent block", assert => {
    talisman.createFromString("{#validBlock}{content}{/validBlock}").then(view => {
        const invalidBlock = view.set({content: "test"}, "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to remove a non-existent block", assert => {
    talisman.createFromString("{#validBlock}Bleh{/validBlock}").then(view => {
        const invalidBlock = view.remove("invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to restore a non-existent block", assert => {
    talisman.createFromString("{#validBlock}Bleh{/validBlock}").then(view => {
        const invalidBlock = view.restore("invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to addMask on a non-existent block", assert => {
    talisman.createFromString("{#validBlock}{bleh|reverse}{/validBlock}").then(view => {
        view.set({bleh: "bleh"});
        const invalidBlock = view.addMask("reverse", s => s.split("").reverse().join(""), "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to removeMask on a non-existent block", assert => {
    talisman.createFromString("{#validBlock}{bleh|reverse}{/validBlock}").then(view => {
        view.set({bleh: "bleh"})
        .addMask("reverse", s => s.split("").reverse().join(""), "validBlock"); // invalid block is invalid
        const invalidBlock = view.removeMask("reverse", "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});

test("Handle attempting to waitUntil on a non-existent block", assert => {
    talisman.createFromString("{test1}, Wait for it... {#delayBlock}{test2}, {test3}{/delayBlock}").then(view => {
        const delayPromise = delay("Ok", 500);
        view.set({test1: "Test 1 Done"}).set({test2: "Test 2 Done", test3: "All Tests Done"}, "invalid");
        const invalidBlock = view.waitUntil(delayPromise, "invalid"); // invalid block is invalid
        return Promise.all([invalidBlock, view]);
    }).then(responses => {
        const returnedApi = responses[0];
        const correctApi = responses[1];
        assert.deepEqual(returnedApi, correctApi);
        assert.end();
    });
});
