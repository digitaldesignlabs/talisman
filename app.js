/*jslint node, maxlen: 150, es6: true*/
'use strict';
const express = require("express");
const template = require("./talisman");
const fetch = require("node-fetch");
const path = require("path");
const app = express();

// Routes
app.get("/", function (ignore, res) {

    function weatherPromise() {
        //return fetch("http://api.openweathermap.org/data/2.5/weather?q=Liverpool,uk&appid=invalid")
        return fetch("http://api.openweathermap.org/data/2.5/weather?q=Liverpool,uk&appid=c158b434ac089717f567f1c79f387fba")
            .then(function (response) {
                return response.text();
            }).then(function (weather) {
                const obj = JSON.parse(weather, null, 2);
                if (obj.cod !== 200) {
                    console.log(weather);
                    return Promise.reject(weather);
                } else {
                    const temp = parseFloat(obj.main.temp) - 273.15;
                    const windSpeed = parseFloat(obj.wind.speed) * 2.23694;
                    // const windDirection = obj.wind.deg.toFixed(0) - 90;
                    const weatherObject = {
                        name: obj.name,
                        weather: obj.weather[0].description,
                        temp: temp.toFixed(2),
                        windSpeed: windSpeed.toFixed(2),
                        //windDirection,
                        icon: 'http://openweathermap.org/img/w/' + obj.weather[0].icon + '.png'
                    };
                    return weatherObject;
                }

            }).catch(function (err) {
                console.error("Openweathermap API error:", err);
                return Promise.reject(err);
            });
    }
    const rawhtml = `<div style="background-color:black; color: yellow; padding:5px; text-align:center">
                    <img src="http://i.imgur.com/1JcF0X7.gif" style="width:50px; height:50px">
                    &nbsp;Here's some raw HTML&nbsp;
                    <img src="http://i.imgur.com/1JcF0X7.gif" style="width:50px; height:50px; transform: scaleX(-1)">
                    </div>`;

    const insertFile = path.join(__dirname, "/views/insert.html");
    const indexFile = path.join(__dirname, "/views/index.html");
    const insertStream = template.load(insertFile)
        .set({heading: "Streamed from another source"})
        .set({
            blurb: `This text was streamed from another Talisman template. It is the same
            partial that was inserted for the 'Example Page' heading for this page, except
            that the one at the top of this page had access to this page's variables, wheras
            this streamed text only had access to its own variable scope`
        })
        .render();

    template.load(indexFile)
        .load(insertFile, 'intro')
        .set({
            title: "Talisman",
            heading: "Example Page",
            blurb: `This is an example page for the Talisman templating engine`
        })

        .set({globalVariable: new Promise(function (resolve) {
            setTimeout(resolve, 1000, "This is a global variable, visible to all.");
        })})

        .set({
            panelContent: "This panel is being displayed, but the other one is not.",
            panelClass: "primary", // tags can be used to construct classes.
            textTag: "h4" // tags can be used to construct HTML elements.
        }, "panelBlock")

        .remove("removableBlock")

        .set([
            {iterableValue: "first"},
            {iterableValue: 2},
            {iterableValue: 3},
            {iterableValue: 'four'},
            {iterableValue: "fifth"}
        ], "iterableBlock")

        .set([
            {heading: "First", body: "Lorem ipsum dolor sit amet.", panelClass: "danger"},
            {heading: "Second", body: "Consectetur adipiscing elit.", panelClass: "warning"},
            {heading: "Third", body: "Nulla blandit vestibulum neque eget varius.", panelClass: "success"},
            {heading: "Fourth", body: "Cum sociis natoque penatibus et magnis dis parturient montes.", panelClass: "info"}
        ], "anotherIterable")

        .remove("anotherIterable")
        .restore("anotherIterable")

        .set({
            heading: "This panel should have an iterating list inside of it",
            panelVariable: "Panel Variable 1234"
        }, "nestedBlock")
        .set({
            unescapedTag: rawhtml,
            escapedTag: rawhtml
        })
        .escapeTags('escapeTagBlock')
        .set([
            {item: "One"},
            {item: "Two"},
            {item: "Three"}
        ], "nestedIterator")

        .set({
            funcVar: function () {
                return 64;
            }
        })
        .addMask("sqrt", Math.sqrt)
        .addMask("log", Math.log)
        .addMask("upperCase", function (str) {
            return str.toUpperCase();
        })

        .set({
            variable1: "Deeplinks should also work with objects within the controller that have not been parsed as template blocks."
        }, "unwrittenBlock")

        .set(weatherPromise(), "weather")
        .error("promiseReject.html", "weather")

        .set(insertStream, "insert")

        .render()
        .pipe(res);
        //res.send('test')

});

app.get("/test", function (ignore, res) {
    require('./test/index').testPage()
        .render()
        .pipe(res);

});

// Server
app.listen(3000);

console.log("Server running");
