[![Travis CI](https://travis-ci.org/digitaldesignlabs/talisman.svg)](https://travis-ci.org/digitaldesignlabs/talisman)
[![Coverage Status](https://coveralls.io/repos/github/digitaldesignlabs/talisman/badge.svg)](https://coveralls.io/github/digitaldesignlabs/talisman)

# Talisman #
Talisman is a logicless streaming templating system and language for Node.js, created by Digital Design Labs.

## Installing ##
```bash
npm install talismanjs --save
```

## Streams FTW ##
[Streams are awesome](https://jakearchibald.com/2016/streams-ftw/), and so Talisman is built to be used as a streaming template system. This means Talisman renders templates to a stream, which you can then pipe to a writable stream, like `process.stdout` or `http.ServerResponse`.

## Why Streaming? ##
Templating systems will often wait to compute last byte of a page before sending the first one. This manifests for users as a blank white screen, while they wait for our application to query the database and perform other required IO, before generating HTML for the page.

By contrast, Talisman sends as much data as it can as soon as it can; so the user gets *something* up on their screen quickly. This improves the perceived performance of your application, and also means their browser can start fetching external resources sooner. This reduces overall page load time, as JavaScript, CSS, and images can be downloaded on the client in parallel with the database work being done on the server.

## Syntax ##
Talisman uses a simple syntax, based around two concepts: **blocks** and **variables**.

#### Variables ####
Talisman allows you to define variable placeholders which will be later populated with data. They are enclosed by `{{double}} {{curly}} {{braces}}`. Variables can be strings, streams, Buffers, or Promises for any of these.

```js
// This will output:
// Hello World!
talisman.createFromString("Hello {{name}}!").then(view => {
    view.set({name: "World"})
        .toStream()
        .pipe(process.stdout);
});
```

Variables are automatically HTML escaped before they are displayed. You can request a variable be displayed raw by using a triple-brace instead of a double-brace, e.g. ```{{{varName}}}```.

```js
// This will output:
// Your name is <strong>World</strong>.
// The markup was &lt;strong>World&lt;/strong>.
talisman.createFromString("Your name is {{{name}}}.\nThe markup was {{name}}.").then(view => {
    view.set({name: "<strong>World</strong>"})
        .toStream()
        .pipe(process.stdout);
});
````

#### Blocks ####
A block defines a section of template text. Blocks can used as loops (by assigning iterators to them); as condtionals (by removing them when some condition is met) or simply as a way of defining a scope.  A block is inherently none of these; its behaviour depends on how you treat it. Like HTML, blocks may nest, but may not overlap.

```js
// This will output:
// <h1>Shopping List<h1>
// <ul>
// <li>Celery</li>
// <li>Apples</li>
// <li>Walnuts</li>
// <li>Grapes</li>
// </ul>
const template = "<h1>Shopping List</h1>\n<ul>\n"
    + "{#row}<li>{{item}}</li>\n{/row}"
    + "{#norows}<li>I'm afraid we're fresh out of waldorfs...</li>\n{/norows}"
    + "</ul>";

const data = [
    {item: "Celery"},
    {item: "Apples"},
    {item: "Walnuts"},
    {item: "Grapes"}
];

talisman.createFromString(template).then(view => {

    if (data.length > 0) {
        view.remove("norows").setIterator(data, "row");
    } else {
        view.remove("row");
    }

    view.toStream().pipe(process.stdout);
});
```

#### Other Markers ####
There are two other markers supported, though you are unlikely to need to use them.
- ```{/*   */}``` defines a comment. Anything placed between these markers will be removed by Talisman during rendering.
- ```{{CDATA[    ]}}``` defines a block of non-template text. Anything between the square brackets will be ignored by Talisman, and rendered as-is.

#### Masks ####
Variables can have masks applied to them. Masks are small synchronous functions which transform the content in some way during rendering.

```js
// This will output:
// <h1>Price List<h1>
// <ul>
// <li>Celery: $1.00</li>
// <li>Apples: $1.50</li>
// <li>Walnuts: $1.25</li>
// <li>Grapes: $0.75</li>
// </ul>
const template = "<h1>Price List</h1>\n<ul>\n"
    + "{#row}<li>{{item}}: {{price|format}}</li>\n{/row}"
    + "</ul>";

const data = [
    {item: "Celery", price: 1},
    {item: "Apples", price: 1.5},
    {item: "Walnuts", price: 1.25},
    {item: "Grapes", price: .75}
];

talisman.createFromString(template).then(view => {
    view.addMask("format", n => "$" + n.toFixed(2))
        .setIterator(data, "row")
        .toStream()
        .pipe(process.stdout);
});
```

Masks may also be chained, e.g. ```{{name|parseAsMarkdown|lowercase}}```

#### Loading templates from files ####
In the examples so far, we have used `createFromString()`, but usually you would load templates files from disk.

```js
talisman.create("template.html").then(view => {
   view.toStream().pipe(process.stdout);
});
```

You can also load templates into variables on another templates.

```html
<!doctype html>
<html>
<!-- main.html -->
<title>{{pageTitle}}</title>
{{content}}
</html>
```
```html
<!-- article.html -->
<h1>{{pageTitle}}</h1>
<h2>Posted: {{date|dateFormat}}</h2>
{{bodyContent|makeParagraphs}}
```
```js
talisman.create("main.html").then(view => {
    // Second argument tells talisman which variable this content replaces
    return view.load("article.html", "content");
}).then(view => {
    view.set({pageTitle: "Talisman is awesome!"})
        .set({date: article.date, bodyContent: article.body}, "content")
        .addMask("dateFormat", dt => new Date(dt).toISOString())
        .addMask("makeParagraphs", text => "<p>" + text.replace(/\n/g, "</p>\n<p>") + "</p>\n")
        .toStream()
        .pipe(process.stdout);
});
```
This would render:
```html
<!doctype html>
<html>
<!-- main.html -->
<title>Talisman is awesome!</title>
<!-- article.html -->
<h1>Talisman is awesome!</h1>
<h2>Posted: 2016-06-20T10:23:00.000Z</h2>
<p>My article body</p>
<p>Has multiple lines</p>


</html>
```

## Minification ##
Minification is awesome. You can minify content from Talisman by piping the content through a transform stream.

```js
const talisman = require("talismanjs");
const Minifier = require("minify-html-stream");

talisman.create("main.html").then(view => {
    view.toStream().pipe(new Minifier()).pipe(process.stdout);
});
```

The `minify-html-stream` project currently is basic and very cautious. [You can make it better](https://github.com/digitaldesignlabs/minify-html-stream).

## Simple Demos ##
```bash
git clone https://github.com/digitaldesignlabs/talisman.git
cd talisman
npm i
npm run-script demo console
```

There is also a browser-based demo

```bash
npm run-script demo browser
```

## License ##
Published under the [MIT License](http://opensource.org/licenses/MIT).
