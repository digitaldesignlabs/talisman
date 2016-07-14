"use strict";

if (process.argv.indexOf("browser") >= 0) {
    require("./browser");
} else if (process.argv.indexOf("console") >= 0) {
    require("./console");
} else {
    console.error("Usage: npm run-script demo [type]\n\n   console: console-based demo\n   browser: browser-based demo\n");
}
