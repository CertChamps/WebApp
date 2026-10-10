// macOS WebKit regression checks using Xcode, without downloading a browser.
import { build } from 'vite';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('These checks require macOS and the Xcode command line tools.');
const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureOnly = process.argv.includes('--fixture-only');
const output = await mkdtemp(join(tmpdir(), 'modal-webkit-'));
const mockShareImports = {
  '../../../firebase': 'export const db = {}; export const storage = {};',
  'firebase/firestore': 'export const addDoc = async () => ({}), collection = () => ({}), serverTimestamp = () => 0;',
  'firebase/storage': 'export const deleteObject = async () => {}, getDownloadURL = async () => "", ref = () => ({}), uploadBytes = async () => ({});',
  '../../constants/adminUids': 'export const isAdminUid = () => true;',
  '../../lib/discoverAuthor': 'export const lookupDiscoverAuthor = async () => null;',
  '../practiceHub': 'export const SubjectDropdown = () => null;',
  '../../data/practiceHubSubjects': 'const empty = []; export const PRACTICE_HUB_SUBJECTS = empty, ALL_SUBJECTS_OPTION = {id:"all",label:"All"}, FAVOURITES_CHANGED_EVENT = "favourites", getFavouriteSubjectIds = () => empty, useSyncedFavouriteSubjectIds = () => empty;',
  '../../lib/discoverMedia': 'export const extractYoutubeId = () => null, getDiscoverVideoPoster = () => null, isDiscoverVideoUrl = () => false;',
  '../../lib/discoverPreview': 'export const renderPdfFirstPageJpeg = async () => null;',
  '../../lib/discoverCapture': 'export const captureWebsiteThumbnailBlob = async () => null;',
  '../../lib/nativeShareIntake': 'export const incomingShareDisplayName = () => "", incomingShareFile = () => null;',
  '../../lib/discoverLinks': 'export const linkedQuestionsPayload = () => [];',
};
const mockPages = `
  const pages = Array.from({length:30}, (_, i) => ({id:String(i), name:'Page '+i, pageType:'whiteboard', attachedQuestions:[], createdAt:i, updatedAt:i, lastOpenedAt:i}));
  export function useWhiteboards() { return {pages, loading:false, requestCreatePage:()=>true, createPage:async()=>{throw new Error('test failure')}, updatePage:async()=>{}, aceGateModal:null}; }
`;
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {stdio:'inherit', cwd:root});
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
});
try {
  await build({
    root, configFile: resolve(root, 'vite.config.ts'), logLevel:'warn', publicDir:false,
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    plugins:[{
      name:'modal-fixture-data', enforce:'pre',
      resolveId(id, importer) {
        if (id.endsWith('/hooks/useWhiteboards')) return '\0modal-pages';
        if (importer?.endsWith('/DiscoverShareModal.tsx') && id in mockShareImports) return '\0modal-share:'+id;
      },
      load(id) {
        if (id === '\0modal-pages') return mockPages;
        if (id.startsWith('\0modal-share:')) return mockShareImports[id.slice('\0modal-share:'.length)];
      },
    }],
    build:{outDir:output, emptyOutDir:false, minify:false,
      lib:{entry:resolve(root,'tests/modal/fixture.tsx'),name:'ModalFixture',formats:['iife'],fileName:()=> 'fixture.js'},
      rollupOptions:{output:{inlineDynamicImports:true}},
    },
  });
  const css = (await readdir(output)).find(name => name.endsWith('.css'));
  if (!css) throw new Error('Fixture stylesheet missing');
  await writeFile(join(output,css),(await readFile(join(output,css),'utf8')).replace(/@import[^;]+;/g,''));
  await writeFile(join(output,'checks.js'),await readFile(resolve(root,'tests/modal/checks.js')));
  await writeFile(join(output,'index.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"></head><body><div id="themed-root" data-theme="light"><div id="root"></div></div><script>
    Object.defineProperty(navigator, 'maxTouchPoints', {value: 5});
    Object.defineProperty(navigator, 'platform', {value: 'MacIntel'});
    const viewport = new EventTarget();
    Object.assign(viewport, {width:1024,height:768,offsetTop:0,offsetLeft:0,scale:1});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
    window.addEventListener('error',e=>window.webkit.messageHandlers.results.postMessage('FAIL: '+e.message));
  </script><script src="fixture.js"></script><script src="checks.js"></script></body></html>`);
  if (fixtureOnly) console.log(`Fixture: ${output}`);
  else {
    await run('xcrun',['swiftc',resolve(root,'tests/modal/WebKitRunner.swift'),'-o',join(output,'runner'),'-module-cache-path',join(output,'module-cache')]);
    await run(join(output,'runner'),[join(output,'index.html')]);
  }
} finally {
  if (!fixtureOnly) await rm(output,{recursive:true,force:true});
}
