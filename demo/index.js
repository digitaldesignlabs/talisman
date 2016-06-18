"use strict";

if (process.argv.includes("browser") === true) {
    require("./browser");
} else if (process.argv.includes("console") === true) {
    require("./console");
} else {
    console.error("Usage: npm run-script demo [type]\n\n   console: console-based demo\n   browser: browser-based demo\n");
}
