const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Transpile the current source, so tests never accidentally run stale lib files.
module.exports = function loadSource(file, mocks = {}) {
    const filename = path.resolve(__dirname, '../..', file);
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    });
    const module = { exports: {} };
    const localRequire = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
    const run = vm.runInThisContext(`(function(require,module,exports){${result.outputText}\n})`, { filename });
    run(localRequire, module, module.exports);
    return module.exports;
};
