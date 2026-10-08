import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual attachment/capture functions without mounting the app or
// calling the paid AI service. DOM rendering and storage are stubbed at the edges.
function source(path) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(root, predicate) {
  if (predicate(root)) return root;
  let result;
  ts.forEachChild(root, node => { if (!result) result = find(node, predicate); });
  return result;
}
function evaluate(code, globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context;
}
function declaration(root, name) {
  const node = find(root, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `Missing function ${name}`);
  return node.getText(root).replace(/^export /, '');
}
const hook = source('src/components/ai/useAI.ts');
const frontend = evaluate(declaration(hook, 'prepareAttachments'));
const largeImage = `data:image/png;base64,${'A'.repeat(3_000_000)}`;
const pages = Array.from({ length: 25 }, (_, i) => `https://example.com/page-${i}.png`);
const attachments = frontend.prepareAttachments({ questionImageUrls: pages, markingSchemeImageUrls: pages, drawingDataUrl: [largeImage, ...pages], paperDataUrl: largeImage });
assert.equal(attachments.length, 77);
assert.equal(attachments[0].url, largeImage);
assert.equal(attachments[26].url, pages[0]);
assert.equal(attachments[76].url, largeImage);

const serverSource = source('functions/src/index.ts');
const backend = evaluate(`const MAX_CHAT_MESSAGES = 40; const MAX_CHAT_CHARACTERS = 6_000_000;\n${declaration(serverSource, 'sanitizeChatMessages')}`);
const sent = attachments.map(({ url }) => ({ type: 'image_url', image_url: { url } }));
const sanitized = backend.sanitizeChatMessages([{ role: 'user', content: [{ type: 'text', text: 'Read all my work' }, ...sent] }]);
assert.equal(sanitized[0].content.length, 78);
assert.equal(sanitized[0].content[1].image_url.url, largeImage);
assert.equal(sanitized[0].content[77].image_url.url, largeImage);

const documentSource = source('src/components/whiteboards/DocumentEditor.tsx');
const registerCall = find(documentSource, node => ts.isCallExpression(node) && node.expression.getText(documentSource) === 'registerGetChatImages');
assert.ok(registerCall);
const regions = [];
const inkBounds = [];
const documentCapture = evaluate(`const capture = ${registerCall.arguments[0].getText(documentSource)};`, {
  documentPageRef: { current: { offsetWidth: 800, scrollHeight: 15_200, getBoundingClientRect: () => ({ left: 10, top: 30 }) } },
  documentColumnRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
  captureElementToPng: async (_element, region) => { regions.push(region); return { dataUrl: 'html' }; },
  canvasExportRef: { current: async ({ worldBounds }) => { inkBounds.push(worldBounds); return { dataUrl: 'ink' }; } },
  compositeImages: async (html, ink) => { assert.equal(html.dataUrl, 'html'); assert.equal(ink, 'ink'); return { dataUrl: 'combined' }; },
});
const documentImages = await vm.runInContext('capture()', documentCapture);
assert.equal(documentImages.length, 16);
assert.equal(regions.at(-1).y + regions.at(-1).height, 15_200);
assert.equal(inkBounds.at(-1).y, 15_030);

const boardSource = source('src/pages/whiteboardPage.tsx');
const boardGetter = find(boardSource, node => ts.isVariableDeclaration(node) && node.name.getText(boardSource) === 'getDrawingSnapshot');
const boardRegions = [];
const whiteboardCapture = evaluate(`const capture = ${boardGetter.initializer.arguments[0].getText(boardSource)};`, {
  page: { pageType: 'whiteboard' },
  getExportImageRef: { current: async (options) => {
    if (options) boardRegions.push(options.worldBounds);
    return { dataUrl: 'work', worldBounds: { x: -1000, y: -500, width: 6000, height: 6000 } };
  } },
});
const boardImages = await vm.runInContext('capture()', whiteboardCapture);
assert.equal(boardImages.length, 36);
assert.equal(boardRegions[0].x, -1000);
assert.equal(boardRegions[0].y, -500);
assert.equal(boardRegions.at(-1).x + boardRegions.at(-1).width, 5000);
assert.equal(boardRegions.at(-1).y + boardRegions.at(-1).height, 5500);
console.log('AI workspace checks passed: 77 attachments retained, oversized images retained by server, 16 document tiles with ink, 36 whiteboard tiles including offscreen work.');

const pdfSource = source('src/utils/pdfPagesToImages.ts');
const renderedPages = [];
const pdfContext = evaluate(`const DEFAULT_RENDER_SCALE = 2;\n${declaration(pdfSource, 'canvasToDataUrl')}\n${declaration(pdfSource, 'renderPdfPages')}\n${declaration(pdfSource, 'renderPdfRegions')}`, {
  getDocumentCached: async () => ({ numPages: 25, getPage: async number => {
    renderedPages.push(number);
    return { getViewport: () => ({ width: 595, height: 842 }), render: () => ({ promise: Promise.resolve() }) };
  } }),
  document: { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/png;base64,AA==' }) },
});
assert.equal((await pdfContext.renderPdfPages({})).length, 25);
assert.equal(renderedPages.at(-1), 25);
assert.equal((await pdfContext.renderPdfPages({}, [13, 25])).length, 13);
assert.equal((await pdfContext.renderPdfRegions({}, Array.from({ length: 25 }, (_, i) => ({ page: i + 1 })))).length, 25);
console.log('PDF checks passed: all 25 pages and regions retained, including ranges after page 12.');
