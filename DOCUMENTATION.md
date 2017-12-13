# Talisman API Documentation #
The API for Talisman is quite small, and we hope the template language syntax is easy to pick up. This document defines the API for creating Talisman view objects from files and strings, and for working with Talisman view objects once created.

## Contents ##
1. [Template File Syntax](#template-syntax)
    - [Variables](#variables)
    - [Blocks](#blocks)
    - [Comments](#comments)
    - [Character Data](#character-data)
    - [Masks](#masks)
2. [View Creation API](#view-creation-api)
    - [create](#create)
    - [createFromString](#createfromstring)
    - [setTemplatePath](#settemplatepath)
3. [View API](#view-api)
    - [addMask](#addmask)
    - [load](#load)
    - [remove](#remove)
    - [removeMask](#removemask)
    - [restore](#restore)
    - [set](#set)
    - [setIterator](#setiterator)
    - [toStream](#tostream)
    - [toString](#tostring)
    - [waitUntil](#waituntil)

## Template Syntax ##
### Variables ###
Variables are enclosed in double braces, with the name of the variable between the braces. A variable name must be at least two characters long, and may only use the characters `a-z`, `A-Z`, `0-9`, `-`, and `_`. A variable name must begin with a letter, and end with a letter or a number.
#### Example ####
```html
<!-- Valid Variables -->
{{name}}
{{first-name}}
{{emailAddress}}
{{emailAddress_2}}

<!-- Invalid Variables -->
{{a}}
{{-a}}
{{a-}}
{{9a}}
```
#### Unescaped Variables####
Unescaped Variables are enclosed in triple braces, with the name of the variable between the braces. Unescaped variables follow the same naming rules as variables, but are not processed through an escape function before rendering. For example: `{{{name}}}`.

--------------------------------------------------------------

### Blocks ###
**Blocks** are sections of template text, which can be used to define scope, iterators, or conditionals. The start of a block is denoted an opening curly brace, followed by an octothorpe/hash/pound symbol, followed by the name of the block, followed by a closing brace. For example: `{#my-block}`. The end of a block is denoted by an opening curly brace, followed by a forward slash, followed by the name of the block, followed by a closing brace. For example: `{/my-block}`. Blocks follow the same naming rules as variables. Blocks may be nested, but they may not overlap.

#### Example ####
```html
<ol>
    {#contacts}
    <li>{{name}} (<a href="mailto:{{emailAddress}}">{{emailAddress}}</a></li>
    {/contacts}
</ol>

```
--------------------------------------------------------------

### Comments ###
Comments are notes included within the template text which should not be rendered. The syntax is based on the C-style comment syntax. A comment begins with an opening curly brace, followed by a forward slash, followed by an asterisk. A comment finishes with an asterisk, followed by a forward slash, followed by a closing curly brace. Any text between these delimiters is not rendered. Comments may not nest or overlap.

#### Example ####
```html
{/* this comment will not be included in the final render */}
{#contact-list}
    <ol>
        {#contact}
        <li>{{name}} (<a href="mailto:{{emailAddress}}">{{emailAddress}}</a></li>
        {/contact}
    </ol>
{/contact-list}
```
--------------------------------------------------------------

### Character Data ###
Character Data is a section of text which should not be interpreted by Talisman and should just be rendered as-is.  This is mostly useful when persuading Talisman to talk about itself. Character data is noted by enclosing the text CDATA delimiters. The opening delimiter consists of two opening curly braces, followed by the string "CDATA" in caps, followed by an opening square bracket. The closing delimiter consists of a closing square bracket, followed by two closing curly braces.

#### Example ####
```html
The variable named {{CDATA[{{pageTitle}}]}} has the value {{pageTitle}}.
```

--------------------------------------------------------------
### Masks ###
Masks are small functions which can be used to transform the value of a variable before it is rendered. The list of masks which should be applied is specified inline with the relevant variable. Masks are delimited from the variable itself by a pipe character. For example: `{{name|uppercase}}`. Masks may also be chained, where the output of one mask is fed into the next mask.

#### Example ####
```html
<ol>
    {#item}
    <li>{{name|toUpperCase}}: {{price|numberFormat|addCurrencySymbol}}</li>
    {/item}
</ol>
```

--------------------------------------------------------------
## View Creation API ##
### `create()` ###
#### Syntax ####
```js
await talisman.create(fileName);
```

#### Parameters ####
- `fileName` (string, required) - the name of a template file to load. If this is an absolute path it will be treated as such. Otherwise, it will be treated as a path relative to the default path set by `setTemplatePath()`.

#### Return Value ####
A `Promise` for the Talisman view `object`.

#### Example ####
```js
const view = await talisman.create("main.html");
return view.toStream();
```
--------------------------------------------------------------

### `createFromString()` ###
#### Syntax ####
```js
await talisman.createFromString(templateString);
```

#### Parameters ####
- `templateString` (string, required) - a string to be treated as template text.

#### Return Value ####
A `Promise` for the Talisman view `object`.

#### Example ####
```js
const view = await talisman.createFromString("Hello {{name}}!");
return view.set({name: "World"}).toStream();
```
--------------------------------------------------------------
### `setTemplatePath()` ###
#### Syntax ####
```js
talisman.setTemplatePath(pathName);
```

#### Parameters ####
- `pathName` (string, required) - the path to a directory where Talisman should look for template files.

#### Return Value ####
`undefined`

#### Example ####
```js
talisman.setTemplatePath("/home/www/templates");
```
--------------------------------------------------------------

## View API ##
### `addMask()` ###
#### Syntax ####
```js
view.addMask(name, func, blockName);
```

#### Parameters ####
- `name` (string, required) - The name for this mask. Follows the same naming rules as variables.
- `func` (function, required) - A function which defines this mask. This function will be called synchronously, and passed the value of the variable it is masking. It should transform that value in some way and return it.
- `blockName` (string, optional) - the name of the block where this mask should be defined. If this is the root block, this can be omitted. Otherwise, the name of the block should be specified. Blocks nested inside other blocks may be referenced by delimiting the block names with colons, for example `outer:inner`.

#### Return Value ####
The Talisman view `object`.

#### Scope ######
Talisman scoping rules allow child blocks to see masks from their parent blocks, but parent blocks may not see masks from their children.

#### Example ####
```js
const view = await talisman.create("main.html");
view.addMask("uppercase", s => s.toUpperCase());
return view.toStream();
```
--------------------------------------------------------------

### `load()` ###
#### Syntax ####
```js
await view.load(fileName, variableName, blockName);
```

#### Parameters ####
- `fileName` (string, required) - the name of a template file to load. If this is an absolute path it will be treated as such. Otherwise, it will be treated as a path relative to the default path set by `setTemplatePath()`.
- `variableName` (string, required) - the name of a variable within this view to replace with a new Block generated by this file.
- `blockName` (string, optional) - the name of the block which contains the variable we are replacing. If this is the root block, this can be omitted. Otherwise, the name of the block should be specified. Blocks nested inside other blocks may be referenced by delimiting the block names with colons, for example `outer:inner`.

#### Return Value ####
The Talisman view `object`.

#### Example ####
```js
const view = await talisman.create("main.html");
await view.load("child.html", "content");
return view.toStream();
```
--------------------------------------------------------------

### `remove()` ###
#### Syntax ####
```js
view.remove(blockName);
```

#### Parameters ####
- `blockName` (string, required) - the name of a block which should be removed, i.e. not rendered.

#### Return Value ####
The Talisman view `object`.

#### Example ####
```js
const view = await talisman.create("main.html");
return view.remove("childBlock").toStream();
```
--------------------------------------------------------------

### `removeMask()` ###
#### Syntax ####
```js
view.removeMask(name, blockName);
```

#### Parameters ####
- `name` (string, required) - the name of a mask to remove
- `blockName` (string, optional) - the name of the block where this mask is defined. If this is the root block, this can be omitted. Otherwise, the name of the block should be specified. Blocks nested inside other blocks may be referenced by delimiting the block names with colons, for example `outer:inner`.

#### Return Value ####
The Talisman view `object`.

#### Example ####
```js
const view = talisman.create("main.html");
view.addMask("uppercase", s => s.toUpperCase());
return view.removeMask("uppercase").toStream();
```
--------------------------------------------------------------

### `restore()` ###
#### Syntax ####
```js
view.restore(blockName);
```

#### Parameters ####
- `blockName` (string, required) - the name of a block which has previously been removed, but which should be restored, i.e. should be rendered.

#### Return Value ####
The Talisman view `object`.

#### Example ####
```js
const view = await talisman.create("main.html");
view.remove("childBlock");
if (shouldRestoreBlock);
    view.restore("childBlock");
}
return view.toStream();
```
--------------------------------------------------------------

### `set()` ###
#### Syntax ####
```js
view.set(keyValuePairs, blockName);
```

#### Parameters ####
- `keyValuePairs` (Map or object, required) - Key-value pairs denoting the variable values to set, where the key denotes the variable name and the value is the value for that variable. This function can currently accept ES2015 `Map` objects, or traditional JavaScript objects. Values can be a `function` (which will be invoked without parameters and the return value used as the value), a `Promise` (which will be resolved and the resolved value used), a node `Buffer` which will be converted to a string and used, a JavaScript `string` which will be used as-is, or a node `stream.Readable` object, which will be piped into the output stream at render time.
- `blockName` (string, optional) - the name of the block which contains the variables we are replacing. If this is the root block, this can be omitted. Otherwise, the name of the block should be specified. Blocks nested inside other blocks may be referenced by delimiting the block names with colons, for example `outer:inner`.

#### Return Value ####
The Talisman view `object`.

#### Scope ######
Talisman scoping rules allow child blocks to see variables from their parent blocks, but parent blocks may not see variables from their children.

#### Example ####
```js
const view = await talisman.create("main.html");
view.set({
    pageTitle: "Welcome to my Site",
    inlineCSS: fs.createReadStream("../public/inline.css")
});
return view.toStream();
```
--------------------------------------------------------------

### `setIterator()` ###
#### Syntax ####
```js
view.setIterator(iterable, blockName);
```

#### Parameters ####
- `iterable` (array or Stream, required) - An iterator producing key-value pairs on each iteration, suitable for use with `.set()` (see above). Current iterables supported are JavaScript `array` objects, and Node `stream.Readable` objects, set to `objectMode`.
- `blockName` (string, required) - the name of the block which should be iterated. Blocks nested inside other blocks may be referenced by delimiting the block names with colons, for example `outer:inner`;

#### Return Value ####
The Talisman view `object`.

#### Example ####
```js
const view = await talisman.create("main.html");
view.setIterator([
    {name: "Bill"},
    {name: "Ted"},
    {name: "Elizabeth"},
    {name: "Joanna"},
    {name: "Rufus"}
], "nonBogusPeople");
return view.toStream();
```
--------------------------------------------------------------

### `toStream()` ###
#### Syntax ####
```js
view.toStream();
```

#### Parameters ####
none

#### Return Value ####
A `stream.Readable` object.

#### Example ####
```js
const view = await talisman.create("main.html");
const stream = view.toStream();
stream.pipe(process.stdout);
```
--------------------------------------------------------------

### `toString()` ###
#### Syntax ####
```js
view.toString(callback);
```

#### Parameters ####
- `callback` (function, optional) - A callback function to be called when the template is rendered. The callback will receive any errors as the first argument, and a string containing the rendered text as the second argument. `.toString()` will also return a `Promise` which will resolve with the rendered template text, or reject with an error.

#### Return Value ####
A `Promise` object.

#### Example ####
```js
const view = await talisman.create("main.html");
const content = view.toString();
res.status(200).send(content);
```
--------------------------------------------------------------

### `waitUntil()` ###
#### Syntax ####
```js
view.waitUntil(promise, blockName);
```

#### Parameters ####
- `promise` (Promise, required) - A promise which must be resolved before we proceed with rendering this block
- `blockName` (string, optional) - the name of the block which should not be rendered until the promise is resolved. If this is the root block, this can be omitted (but that rather defeats the point?) Otherwise, the name of the block should be specified. Blocks nested inside other blocks may be referenced by delimiting the block names with colons, for example `outer:inner`.

#### Return Value ####
The Talisman view `object`.

#### Example ####
```js
const view = await talisman.create("main.html");
const data = loadDataPromise();

data.then(rows => {
    view.setIterator(rows, "list:row").remove("nolist");
}).catch(error => {
    view.remove("list").set({message: error.message}, "nolist");
});

view.waitUntil(data);
return view.toStream();
```
