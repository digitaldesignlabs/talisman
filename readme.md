# Talisman #
Talisman is a logicless streaming templating system and language for Node.js, created by Digital Design Labs.

## Installing ##
```bash
npm install talismanjs --save
```

## Streams FTW! ##
[Streams are awesome](https://jakearchibald.com/2016/streams-ftw/), and so Talisman is built to be used as a streaming template system. This means you render Talisman templates to a stream, which you can then pipe to a writable stream, like `process.stdout` or `ServerResponse`.

If this can't work for your project, then you can call `.toString()` instead, which will returns a `Promise` for a string you can output the old-fashioned way.

## Usage ##
Talisman uses a very simple syntax, based around two key concepts: **blocks** and **variables**.

#### Variables ####
Talisman allows you to define variable placeholders which will be later populated with data. They are enclosed by curly braces. Variables can be strings, Buffers, streams, or Promises for any of these. If a function is set as a variable value, its return value will be used.

```js
// This will output:
// Hello World!
talisman.createFromString("Hello {name}!").then(view => {
    view.set({name: "World"})
        .toStream()
        .pipe(process.stdout);
});
```

Variables are automatically escaped before they are displayed. You can request Talisman does not do this by using a double-brace to define the variable placeholder, e.g. ```{{varName}}``` would not be escaped.

```js
// This will output:
// Your name is <strong>World</strong>.
// The markup was &lt;strong>World&lt;/strong>.
talisman.createFromString("Your name is {{name}}.\nThe markup was {name}.").then(view => {
    view.set({name: "<strong>World</strong>"})
        .toStream()
        .pipe(process.stdout);
});
````

#### Blocks ####
A block defines a chunk of text within the template. Blocks can used as loops (by assigning iterators to them); as ifs (by removing them when some condition is met) or simply as a way of defining a scope.  A block is inherently none of these; its behaviour depends entirely on how you treat it. Like HTML, blocks may nest, but may not overlap.

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
    + "{#row}<li>{item}</li>\n{/row}"
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
Variables can have masks applied to them. These are functions which transform the content in some way during rendering.

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
    + "{#row}<li>{item}: {price|format}</li>\n{/row}"
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

Masks may also be chained, e.g. ```{name|parseAsMarkdown|lowercase}```

#### Loading templates from files ####
Usually, you would not load templates from JavaScript strings, but from the filesystem.
```js
talisman.create("template.html").then(view => {
   view.toStream().pipe(process.stdout);
});
```
You can also load partial content from files.
```html
<!doctype html>
<html>
<!-- main.html -->
<title>{pageTitle}</title>
{content}
</html>
```
```html
<!-- article.html -->
<h1>{pageTitle}</h1>
<h2>Posted: {date|dateFormat}</h2>
{bodyContent|makeParagraphs}
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

The `minify-html-stream` project currently is really basic and cautious. [You can make it better](https://github.com/digitaldesignlabs/minify-html-stream).

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
