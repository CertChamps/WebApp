import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const file = ts.createSourceFile('matching.ts', readFileSync('src/hooks/useWhiteboardAIMatch.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['within', 'loadWithin', 'catalogueCandidates', 'matchWords', 'candidateDescriptor', 'rankCandidates', 'parseModelReply', 'requestCompletion'];
const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(file)).join('\n');
const context = vm.createContext({ groupImageQuestions: images => images.map(image => ({ key: image.name, displayName: image.displayName, images: [image], markingSchemePaths: image.markingSchemePaths })), setTimeout, clearTimeout, TextDecoder, AbortController,
  authenticatedAiFetch: async () => ({ ok: true, body: { getReader: () => {
    let sent = false;
    return { read: async () => { if (sent) return { done: true }; sent = true; return { done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"final JSON"}}]}') }; } };
  } } }), METERED_CHAT_API_URL: '',
});
vm.runInContext(ts.transpileModule(`const MAX_CANDIDATES = 120;\n${functions}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const image = (name, topic, level = 'higher') => ({ kind: 'image', grouped: { displayName: name, images: [{}, {}] }, topic: { name: topic, displayName: topic }, level });
const catalogue = [image('Q1', 'Algebra'), image('Q2', 'Poetry'), image('Q3', 'Differentiation'), image('Q4', 'Algebra', 'ordinary')];
assert.equal(context.rankCandidates(catalogue, 'give me 5 algebra questions', 'Maths').fallback.length, 2);
assert.equal(context.rankCandidates(catalogue, 'higher level algebra', 'Maths').fallback.length, 1);
assert.equal(context.rankCandidates(catalogue, 'derivatives', 'Maths').fallback.length, 1);
assert.equal(context.rankCandidates(catalogue, 'poems', 'English').fallback.length, 1);
assert.equal(context.rankCandidates(catalogue, 'buy pizza delivery', 'Maths').fallback.length, 0);
assert.equal(context.rankCandidates(catalogue, 'some practice questions', 'Maths').fallback.length, 4);
const large = [...Array.from({ length: 700 }, () => image('Q1', 'Algebra')), image('Q2', 'Probability', 'ordinary')];
assert.ok(context.rankCandidates(large, 'probability', 'Maths').candidates.some(item => item.topic.name === 'Probability'));
assert.equal(context.parseModelReply('bad response'), null);
assert.equal(context.parseModelReply('```json\n{"status":"ok","questionIds":["q1",null]}\n```').questionIds.length, 1);
assert.equal(await context.within(new Promise(() => {}), 5, 'fallback'), 'fallback');
assert.equal(await context.within(Promise.reject(new Error('storage offline')), 5, 'fallback'), 'fallback');
assert.equal(await context.requestCompletion('', '', 'maths', new AbortController().signal), 'final JSON');
console.log('Matching checks passed: topic relevance, explicit levels, subject vocabulary aliases, irrelevant rejection, generic requests, candidates beyond old cap, malformed replies, bounded storage waits, final SSE event without newline.');
const discoverFile = ts.createSourceFile('discover.tsx', readFileSync('src/pages/discover.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findChips(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(discoverFile) === 'subjectChips') return node.initializer.arguments[0].getText(discoverFile);
  let found;
  ts.forEachChild(node, child => { if (!found) found = findChips(child); });
  return found;
}
const chipContext = vm.createContext({ favouriteSubjects: [{ id: 'maths', label: 'Maths' }], selectedSubject: { id: 'english', label: 'English' } });
vm.runInContext(ts.transpileModule(`const chips = ${findChips(discoverFile)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, chipContext);
assert.equal(vm.runInContext('chips()[0].id', chipContext), 'english');
chipContext.selectedSubject = { id: 'maths', label: 'Maths' };
assert.equal(vm.runInContext('chips().length', chipContext), 1);
chipContext.selectedSubject = null;
assert.equal(vm.runInContext('chips().length', chipContext), 1);
console.log('Discover checks passed: non-favourite selection appears first, favourites are not duplicated, deselection removes the extra chip.');

const bishop = context.catalogueCandidates([
  { id: 'bishop1', questionName: 'Elizabeth Bishop 2024 Q1', topic: 'Poetry', fileName: 'bishop1.png', imagePath: 'English/higher/Poetry/bishop1.png', markingSchemePaths: ['ms/bishop1.png'] },
  { id: 'heaney1', questionName: 'Seamus Heaney 2023 Q2', topic: 'Poetry', fileName: 'heaney1.png', imagePath: 'English/higher/Poetry/heaney1.png' },
], 'English', 'higher');
const named = context.rankCandidates(bishop, 'Elizabeth Bishop Questions', 'English');
assert.equal(named.exact.length, 1);
assert.equal(named.exact[0].grouped.displayName, 'Elizabeth Bishop 2024 Q1');
assert.equal(named.exact[0].grouped.images[0].downloadUrl, '');
assert.equal(named.exact[0].grouped.images[0].storagePath, 'English/higher/Poetry/bishop1.png');
assert.equal(named.exact[0].grouped.markingSchemePaths[0], 'ms/bishop1.png');
await assert.rejects(context.loadWithin(new Promise(() => {}), 5), /timed out/);
await assert.rejects(context.loadWithin(Promise.reject(new Error('permission denied')), 5), /permission denied/);
console.log('Elizabeth Bishop checks passed: exact named question selected from Poetry metadata without Storage URL requests, marking scheme paths retained, catalogue failures surfaced rather than swallowed.');
function findGather(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'gatherCandidates') return node.initializer.arguments[0].getText(file);
  let found;
  ts.forEachChild(node, child => { if (!found) found = findGather(child); });
  return found;
}
let reads = 0;
let failHigher = true;
context.subject = 'english';
context.storageFolder = 'English';
context.candidateCacheRef = { current: new Map() };
context.papersLoadingRef = { current: false };
context.papersRef = { current: [] };
context.getPracticeSubjectId = value => value.toLowerCase();
context.listLevelsForSubject = async () => ['higher', 'ordinary'];
context.listCatalogueQuestions = async (_subject, level) => {
  reads++;
  if (level === 'higher' && failHigher) throw new Error('temporary failure');
  return [{ id: level, questionName: level === 'higher' ? 'Elizabeth Bishop' : 'Comprehension', topic: 'Poetry', fileName: `${level}.png`, imagePath: `English/${level}/question.png` }];
};
vm.runInContext(ts.transpileModule(`const gather = ${findGather(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
assert.equal((await vm.runInContext('gather()', context)).length, 1);
assert.equal(context.candidateCacheRef.current.size, 0);
failHigher = false;
const recovered = await vm.runInContext('gather()', context);
assert.equal(recovered.length, 2);
assert.equal(context.rankCandidates(recovered, 'Elizabeth Bishop Questions', 'English').exact.length, 1);
assert.equal(reads, 4);
await vm.runInContext('gather()', context);
assert.equal(reads, 4);
console.log('Catalogue fetch checks passed: one metadata query per level, failed levels retried, Bishop recovered, complete bank cached for subsequent requests.');
