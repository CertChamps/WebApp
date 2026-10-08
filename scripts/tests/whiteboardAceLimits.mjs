import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = ts.createSourceFile('useWhiteboards.ts', readFileSync('src/hooks/useWhiteboards.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function find(node, name) {
  if (ts.isVariableDeclaration(node) && node.name.getText(root) === name) return node.initializer.arguments[0].getText(root);
  let result;
  ts.forEachChild(node, child => { if (!result) result = find(child, name); });
  return result;
}
function setup(hasAce, existing = []) {
  const records = new Map(existing.map(page => [page.id, page]));
  const gates = [];
  let nextId = 0;
  let transactionQueue = Promise.resolve();
  const context = vm.createContext({
    uid: 'user', hasAce, db: {}, PAGES_COLLECTION: 'whiteboards-pages', UNSET_ORDER: 999,
    pages: existing, subject: 'maths',
    newDocId: () => `page_${++nextId}`,
    setAceGate: reason => gates.push(reason),
    collection: () => 'pages',
    where: (_field, _operator, subject) => ({ subject }),
    limit: () => ({}),
    query: (_collection, filter) => filter,
    getDocs: async filter => ({ empty: ![...records.values()].some(page => page.subject === filter.subject) }),
    doc: (_db, _collection, _uid, _pages, id) => id,
    setDoc: async (id, data) => records.set(id, data),
    runTransaction: async (_db, callback) => {
      const current = transactionQueue.then(() => callback({
        get: async id => ({ exists: () => records.has(id) }),
        set: (id, data) => records.set(id, data),
      }));
      transactionQueue = current.catch(() => {});
      return current;
    },
  });
  const code = `const create = ${find(root, 'createPage')}; const request = ${find(root, 'requestCreatePage')};`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { create: input => { context.input = input; return vm.runInContext('create(input)', context); }, request: () => vm.runInContext('request()', context), records, gates };
}
const free = setup(false);
assert.ok(await free.create({ name: 'First', subject: 'maths' }));
assert.equal(await free.create({ name: 'Second', subject: 'maths' }), null);
assert.equal(await free.create({ name: 'Document bypass', subject: 'maths', pageType: 'document', folderId: 'other' }), null);
assert.ok(await free.create({ name: 'English', subject: 'english', pageType: 'document' }));
assert.equal(free.records.size, 2);
assert.deepEqual(free.gates, ['page', 'page']);

const existing = setup(false, [{ id: 'legacy', subject: 'maths' }]);
assert.equal(existing.request(), false);
assert.equal(await existing.create({ name: 'Another', subject: 'maths' }), null);
assert.equal(existing.records.size, 1);

const ace = setup(true);
assert.ok(await ace.create({ name: 'First', subject: 'maths' }));
assert.ok(await ace.create({ name: 'Second', subject: 'maths', pageType: 'document' }));
assert.equal(ace.records.size, 2);
assert.deepEqual(ace.gates, []);

const concurrent = setup(false);
const results = await Promise.all([
  concurrent.create({ name: 'Tab A', subject: 'maths' }),
  concurrent.create({ name: 'Tab B', subject: 'maths' }),
]);
assert.equal(results.filter(Boolean).length, 1);
assert.equal(concurrent.records.size, 1);
assert.deepEqual(concurrent.gates, ['page']);
console.log('ACE whiteboard limits passed: first page free, additional pages gated across types/folders, legacy pages count, different subjects allowed, ACE unrestricted, concurrent creation protected.');

const landing = ts.createSourceFile('whiteboards.tsx', readFileSync('src/pages/whiteboards.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findSubmit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(landing) === 'handleAISubmit') return node.initializer.arguments[0].getText(landing);
  let result;
  ts.forEachChild(node, child => { if (!result) result = findSubmit(child); });
  return result;
}
let searches = 0;
let creations = 0;
let pageExists = false;
let popups = 0;
const submitContext = vm.createContext({
  subject: 'maths', aiBusy: false, aiPrompt: 'Give me algebra questions', aiPageType: 'whiteboard',
  requestCreatePage: () => { if (pageExists) { popups++; return false; } return true; },
  setAiTypeMenuOpen: () => {}, setAiPrompt: () => {},
  aiSearch: async () => { searches++; return { pageName: 'Algebra', attachments: [] }; },
  createPageFromProposal: async () => { creations++; pageExists = true; },
});
vm.runInContext(ts.transpileModule(`const submit = ${findSubmit(landing)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, submitContext);
await vm.runInContext('submit()', submitContext);
assert.equal(searches, 1);
assert.equal(creations, 1);
assert.equal(popups, 0);
await vm.runInContext('submit()', submitContext);
assert.equal(searches, 1);
assert.equal(creations, 1);
assert.equal(popups, 1);
console.log('Landing AI checks passed: first matching search creates a page, the next attempt shows the ACE gate without searching or creating another.');
