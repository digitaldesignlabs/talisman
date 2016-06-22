/* eslint no-underscore-dangle: 0 */

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

test("streams", assert => {
    talisman.createFromString("Hello World").then(view => {
        assert.equal(view.toStream() instanceof ReadableStream, true);
        assert.end();
    });
});

test("simple variable replacement", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: "World"}).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
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
    talisman.createFromString("{#headerBlock}<h1>{name}'s Profile</h1>{/headerBlock}<p>Hello, {headerBlock.name}. {request.name} would like to be your friend.</p>").then(view => {
        return view
            .set({name: "Steve"}, "headerBlock")
            .set({request: {name: "John"}})
            .toString();

    }).then(content => {
        assert.equal(content, "<h1>Steve's Profile</h1><p>Hello, Steve. John would like to be your friend.</p>");
        assert.end();
    });
});

test("Deeplinked variable properties", assert => {
    talisman.createFromString("{#headerBlock}<h1>{name}'s Profile</h1>{/headerBlock}<p>Hello, {headerBlock.name}. You have {headerBlock.name.length} letters in your name</p>").then(view => {
        return view
            .set({name: "Steve"}, "headerBlock")
            .set({request: {name: "John"}})
            .toString();

    }).then(content => {
        assert.equal(content, "<h1>Steve's Profile</h1><p>Hello, Steve. You have 5 letters in your name</p>");
        assert.end();
    });
});

test("promised variables", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set(delay({name: "World"}, 500)).toString();
    }).then(content => {
        assert.equal(content, "Hello World!");
        assert.end();
    });
});

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

test("variable escaping", assert => {
    talisman.createFromString("Hello {name} {{name}}!").then(view => {
        return view.set({name: "<strong>World</strong>"}).toString();
    }).then(content => {
        assert.equal(content, "Hello &lt;strong>World&lt;/strong> <strong>World</strong>!");
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

test("toString as callback", assert => {
    talisman.createFromString("Hello {name}!").then(view => {
        return view.set({name: "World"}).toString((err, content) => {
            assert.equal(err, undefined);
            assert.equal(content, "Hello World!");
            assert.end();
        });
    });
});

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
