'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const entry = path.resolve(__dirname, '../build/templater.js');
const source = fs.readFileSync(entry, 'utf8').replace('doTemplating(process.argv[2], process.argv[3]);', '');
const sandbox = { require: createRequire(entry), __dirname: path.dirname(entry), process: { on() {} }, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const hb = require('handlebars').create();
sandbox.registerHelpers(hb);
for (const value of [undefined, null, false, true, 42, {}, [], '   ', '']) {
    assert.equal(String(hb.helpers.pictureCdn(value, {hash:{}})), '', `pictureCdn invalid: ${JSON.stringify(value)}`);
    assert.equal(String(hb.helpers.cdnUrl(value)), '', `cdnUrl invalid: ${JSON.stringify(value)}`);
}
const valid = String(hb.helpers.pictureCdn('/assets/projects/latent-merger/geometry.png', {hash:{alt:'Geometry'}}));
assert(valid.includes('<img') && valid.includes('alt="Geometry"'));
assert(hb.compile('{{{pictureCdn image alt="Absent"}}}')({}).length === 0);
console.log('Image helpers: invalid values, missing template property, and valid path passed.');
