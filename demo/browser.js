"use strict";

const http = require("http");
const path = require("path");
const talisman = require("../lib/talisman");

const server = http.createServer((request, response) => {

    const templateFile = path.join(__dirname, "/browser.html");

    const fakeTableData1 = [
        {
            "id": "1",
            "name": "Cheese & Onion Crisps",
            "price": "$0.80"
        },
        {
            "id": "2",
            "name": "Chicken Sandwich",
            "price": "$2.49"
        },
        {
            "id": "3",
            "name": "Braeburn Apple",
            "price": "$0.49"
        }
    ];

    const fakeTablePromise1 = new Promise(function (resolve) {
        setTimeout(resolve, 3000, fakeTableData1);
    });

    const fakeSlowContent = [
        "Here is some more content slowly turning up",
        "as the promises gradually resolve over time.",
        "Normally we would have to wait for all of this stuff to be ready",
        "before we could even begin to render anything.",
        "But with Talisman you can see what we've got as it becomes available",
        "which results in a better user experience."
    ];

    let contentIndex = 0;
    const fakeSlowFunction = function () {
        const i = contentIndex;
        contentIndex += 1;
        return new Promise(function (resolve) {
            setTimeout(resolve, 500, fakeSlowContent[i]);
        });
    };

    const randomColor = function () {
        const colors = [
            "rgba(255,0,0,0.33)", "rgba(0,255,0,0.33)", "rgba(0,0,255,0.33)", "rgba(0,0,0,0.33)"
        ];
        const rand = Math.floor(Math.random() * colors.length);
        return colors[rand];
    };

    talisman.create(templateFile).then(view => {
        return view.set({title: "Talisman"})
            .set({templateColor: randomColor()})
            .set({heaing: "Slow Templating Demo"})
            .setIterator(fakeTablePromise1, "fakeTablePromise1")
            .set({
                fakeSlowContent1: fakeSlowFunction,
                fakeSlowContent2: fakeSlowFunction,
                fakeSlowContent3: fakeSlowFunction,
                fakeSlowContent4: fakeSlowFunction,
                fakeSlowContent5: fakeSlowFunction,
                fakeSlowContent6: fakeSlowFunction
            })
            .toStream()
            .pipe(response);
    });
});

server.listen(3000, () => {
    console.log("Point your browser at localhost:3000");
});
