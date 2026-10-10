import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual route guards and hooks with controlled Firebase/session state.
function load(path, modules = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, console, ...globals, require(name) {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  } }, { filename: path });
  return exports;
}

const paths = load('src/lib/signIn.ts');
const onboarding = load('src/lib/onboarding.ts', { './signIn': paths });
const questionPath = '/practice?subject=maths&level=higher&topic=algebra&question=2024_1';
const discoverPath = '/discover?resource=study-notes';
for (const path of [questionPath, discoverPath]) {
  const login = paths.signInPath('AI tutor', path);
  const details = paths.signInDetails(login.slice(login.indexOf('?')));
  assert.equal(details.returnTo, path);
  assert.equal(details.back.path, path);
  assert.equal(details.feature, 'AI tutor');
}
assert.equal(paths.signInDetails('?returnTo=https://outside.example').returnTo, '/practice');
assert.equal(paths.safeAppPath('//outside.example'), '/practice');
assert.equal(paths.safeAppPath('/\\outside.example'), '/practice');
assert.equal(paths.safeAppPath('/login?returnTo=/login'), '/practice');
assert.equal(paths.publicPage('/discover?share=1&resource=notes').path, '/discover?resource=notes');
assert.equal(paths.publicPage('/discoverModeration').path, '/practice');
assert.equal(paths.signInDetails('?returnTo=/whiteboards&backTo=/discover').back.label, 'Discover');
assert.equal(paths.signInDetails('').showBack, false);
assert.equal(paths.signInDetails('', { prevRoute: '/practice' }).showBack, false);
assert.equal(paths.signInDetails('?returnTo=/practice').showBack, false);
assert.equal(paths.signInDetails('?backTo=/practice').showBack, true);

// Opening a resource from a card must give sign-in/back links a durable URL.
const discoverSource = ts.createSourceFile('discover.tsx', readFileSync('src/pages/discover.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let openResourceSource;
function findOpenResource(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(discoverSource) === 'openResource') openResourceSource = node.getText(discoverSource);
  ts.forEachChild(node, findOpenResource);
}
findOpenResource(discoverSource);
assert.ok(openResourceSource, 'Discover must preserve its selected resource in the page URL');
let selectedResource;
let updatedSearch;
vm.runInNewContext(ts.transpileModule(`const ${openResourceSource}; openResource({ id: 'study-notes' });`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, {
  URLSearchParams, searchParams: new URLSearchParams('subject=maths'),
  setSelectedResource: (resource) => { selectedResource = resource; },
  setSearchParams: (params) => { updatedSearch = params; },
});
assert.equal(selectedResource.id, 'study-notes');
assert.equal(updatedSearch.get('resource'), 'study-notes');
assert.equal(updatedSearch.get('subject'), 'maths');
const selectedResourcePath = `/discover?${updatedSearch}`;
const resourceLogin = paths.signInDetails(paths.signInPath('Save resource', selectedResourcePath).split('?')[1]);
assert.equal(resourceLogin.returnTo, selectedResourcePath);
assert.equal(resourceLogin.back.path, selectedResourcePath);

assert.equal(onboarding.getPostAuthPath({ hasCompletedOnboarding: true }, questionPath), questionPath);
for (const invalid of ['/login/', '/LOGIN', '/onboarding?returnTo=/onboarding', '/verify-email', '//outside.example', '/\\outside.example']) {
  assert.equal(onboarding.getPostAuthPath({ hasCompletedOnboarding: true }, invalid), '/practice');
  assert.equal(onboarding.sanitizeReturnPath(invalid, '/practice'), '/practice');
}
assert.equal(new URLSearchParams(onboarding.getPostAuthPath({ hasCompletedOnboarding: false }, questionPath).split('?')[1]).get('returnTo'), questionPath);

let userContext = { user: {}, authReady: false };
let location = { pathname: '/login', search: paths.signInPath('AI tutor', questionPath).split('?')[1], state: null };
let navigations = [];
const auth = { currentUser: null, authStateReady: async () => {} };
let routeRef;
const react = { useContext: () => userContext, useCallback: (fn) => fn, useRef: (value) => (routeRef ??= { current: value }) };
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const router = { Navigate: 'Navigate', useLocation: () => location, useNavigate: () => (path) => navigations.push(path) };
const profile = load('src/hooks/useUserProfileReady.ts', {
  react, '../../firebase': { auth }, '../context/UserContext': {},
});
const loading = { default: 'Loading' };
const entry = load('src/components/AuthEntryRoute.tsx', {
  react, 'react/jsx-runtime': jsx, 'react-router-dom': router, '../../firebase': { auth },
  '../context/UserContext': {}, '../hooks/useUserProfileReady': profile,
  '../lib/onboarding': onboarding, '../lib/signIn': paths, './onboarding/ProfileLoadingScreen': loading,
}).default;
const protectedRoute = load('src/components/protectedRoute.tsx', {
  react, 'react/jsx-runtime': jsx, 'react-router-dom': router, '../../firebase': { auth },
  '../context/UserContext': {}, '../hooks/useUserProfileReady': profile,
  '../lib/onboarding': onboarding, '../lib/signIn': paths, './onboarding/ProfileLoadingScreen': loading,
}).ProtectedRoute;
const form = { type: 'SignInForm' };
assert.equal(entry({ children: form }).type, 'Loading');
assert.equal(protectedRoute({ children: form }).type, 'Loading');
userContext.authReady = true;
assert.equal(entry({ children: form }), form);
location = { pathname: '/whiteboards', search: '?folder=exam', state: { backTo: discoverPath } };
const redirect = protectedRoute({ children: form });
assert.equal(redirect.type, 'Navigate');
const redirectDetails = paths.signInDetails(redirect.props.to.split('?')[1]);
assert.equal(redirectDetails.feature, 'Whiteboards');
assert.equal(redirectDetails.returnTo, '/whiteboards?folder=exam');
assert.equal(redirectDetails.back.path, discoverPath);

auth.currentUser = { uid: 'returning-user', emailVerified: true, providerData: [{ providerId: 'password' }] };
assert.equal(entry({ children: form }).type, 'Loading');
userContext.user = { uid: 'returning-user', hasCompletedOnboarding: true };
location = { pathname: '/login', search: '?' + paths.signInPath('AI tutor', questionPath).split('?')[1] };
assert.equal(entry({ children: form }).props.to, questionPath);
assert.equal(protectedRoute({ children: form }), form);
auth.currentUser.emailVerified = false;
assert.ok(entry({ children: form }).props.to.startsWith('/verify-email?'));
auth.currentUser.emailVerified = true;
userContext.user.hasCompletedOnboarding = false;
assert.ok(entry({ children: form }).props.to.startsWith('/onboarding?'));
userContext.user.hasCompletedOnboarding = true;

// Firebase may rerender the guard before the logout handler navigates.
// Both paths must produce the same clean login URL, even with stale backTo.
location = { pathname: '/user/manage-account', search: '', state: { backTo: '/practice' } };
auth.currentUser = null;
const logoutRedirect = protectedRoute({ children: form });
assert.equal(logoutRedirect.props.to, '/login');
assert.equal(logoutRedirect.props.state, null);
location = { pathname: '/login', search: '', state: null };
assert.equal(entry({ children: form }), form);
assert.equal(paths.signInDetails(location.search, location.state).showBack, false);

const requireSignIn = load('src/hooks/useRequireSignIn.ts', {
  react, 'react-router-dom': router, '../../firebase': { auth }, '../lib/signIn': paths,
}).useRequireSignIn;
location = { pathname: '/practice', search: '?subject=maths&topic=algebra' };
let finishRestore;
auth.currentUser = null;
auth.authStateReady = () => new Promise((resolve) => { finishRestore = resolve; });
const pendingCheck = requireSignIn()('AI tutor');
assert.equal(navigations.length, 0);
auth.currentUser = { uid: 'returning-user' };
finishRestore();
assert.equal(await pendingCheck, true);
assert.equal(navigations.length, 0);
auth.currentUser = null;
auth.authStateReady = async () => {};
assert.equal(await requireSignIn()('AI tutor'), false);
assert.equal(navigations.length, 1);
assert.equal(paths.signInDetails(navigations[0].split('?')[1]).returnTo, '/practice?subject=maths&topic=algebra');
console.log('Authentication access checks passed: session restoration, guest redirects, feature copy, back links, and return paths.');

let listener;
let effect;
let profileWrites = [];
let storedProfile = { username: 'Student', email: 'student@example.com', picture: 'crown.png', hasCompletedOnboarding: true };
let resolvePicture;
let pictureStartedResolve;
const pictureStarted = new Promise((resolve) => { pictureStartedResolve = resolve; });
let waitForPicture = false;
userContext.setUser = (value) => { userContext.user = value; };
userContext.setAuthReady = (value) => { userContext.authReady = value; };
const authentication = load('src/hooks/useAuthentication.tsx', {
  react: { ...react, useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}], useEffect: (callback) => { effect = callback; } },
  'react-router-dom': router, '../context/UserContext': {}, '../../firebase': { auth, db: {} },
  'firebase/storage': { getStorage: () => ({}), ref: () => ({}), getDownloadURL: async () => waitForPicture ? new Promise((resolve) => { resolvePicture = resolve; pictureStartedResolve(); }) : 'profile.png' },
  'firebase/firestore': { doc: (...parts) => ({ id: parts.at(-1) }), getDoc: async (ref) => ({ id: ref.id, exists: () => true, data: () => storedProfile }), setDoc: async (ref, data) => { profileWrites.push(data); }, serverTimestamp: () => 0 },
  'firebase/auth': { onAuthStateChanged: (_auth, callback) => { listener = callback; return () => {}; }, signInWithEmailAndPassword: async () => { await listener(auth.currentUser); return { user: auth.currentUser }; } },
  '../constants/adminUids': { isAdminUid: () => false }, '../lib/nativeGoogleLogin': {}, '../lib/nativeAppleLogin': {},
  '../lib/payments': { setPaymentsUser: async () => {} }, '../lib/onboarding': onboarding,
  '../data/practiceHubSubjects': { setFavouriteSubjectIds: () => {} }, '../lib/legal': {},
}, { window: { location: { hash: '#/practice?subject=maths', pathname: '/' } }, localStorage: { getItem: () => null } }).default;
const restoredUser = { uid: 'returning-user', email: 'student@example.com', emailVerified: true, providerData: [{ providerId: 'password' }] };
auth.currentUser = restoredUser;
userContext.user = {};
userContext.authReady = false;
navigations = [];
authentication({ observeSession: true });
effect();
await listener(restoredUser);
assert.equal(userContext.user.uid, restoredUser.uid);
assert.equal(userContext.authReady, true);
assert.equal(navigations.length, 0, 'Restoring a session must leave public pages in place');
auth.currentUser = null;
await listener(null);
assert.equal(Object.keys(userContext.user).length, 0, 'Signing out clears the cached profile');

// A late image/profile response must not resurrect a signed-out user.
auth.currentUser = restoredUser;
waitForPicture = true;
const lateRestore = listener(restoredUser);
await pictureStarted;
auth.currentUser = null;
await listener(null);
resolvePicture('profile.png');
await lateRestore;
assert.equal(Object.keys(userContext.user).length, 0);
waitForPicture = false;

// The shared observer must not run duplicate profile setup during a manual login.
auth.currentUser = restoredUser;
profileWrites = [];
const manual = authentication({ prevRoute: questionPath });
await manual.signInWithEmail('student@example.com', 'test-only');
assert.equal(profileWrites.length, 1, 'Only the manual setup should log the sign-in');
assert.equal(userContext.user.uid, restoredUser.uid);
console.log('App-wide session checks passed: restored profile, no public-page redirect, logout race, and manual sign-in coordination.');

// Verification redirects must preserve the requested destination and stop
// when the page unmounts or the account signs out while a timer is pending.
let verificationEffects = [];
let verificationTimer;
const verification = load('src/pages/verifyEmail.tsx', {
  react: { ...react, useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}], useEffect: (fn) => verificationEffects.push(fn) },
  'react/jsx-runtime': jsx,
  'react-router-dom': { ...router, useSearchParams: () => [new URLSearchParams({ returnTo: questionPath })] },
  '../../firebase': { auth, db: {} },
  'firebase/auth': { sendEmailVerification: async () => {} },
  'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ data: () => ({ hasCompletedOnboarding: true }) }), updateDoc: async () => {} },
  '../context/UserContext': {}, '../lib/onboarding': onboarding, '../lib/signIn': paths,
  '../lib/authSession': { signOutSession: async () => { auth.currentUser = null; } },
  '../hooks/useUserProfileReady': profile,
  '../components/onboarding/ProfileLoadingScreen': loading,
  '../assets/logo.png': {}, 'react-icons/md': {},
}, {
  setInterval: () => 1, clearInterval: () => {},
  setTimeout: (fn) => { verificationTimer = fn; return 1; },
  clearTimeout: () => { verificationTimer = undefined; },
});
for (const scenario of ['verified', 'unmounted', 'signed-out']) {
  verificationEffects = [];
  verificationTimer = undefined;
  navigations = [];
  auth.currentUser = { ...restoredUser, reload: async () => {} };
  userContext.user = { uid: restoredUser.uid, hasCompletedOnboarding: true };
  userContext.setUser = () => {};
  verification.default();
  const cleanup = verificationEffects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof verificationTimer, 'function');
  if (scenario === 'unmounted') cleanup();
  if (scenario === 'signed-out') auth.currentUser = null;
  verificationTimer?.();
  assert.deepEqual(navigations, scenario === 'verified' ? [questionPath] : []);
  cleanup();
}
auth.currentUser = null;
assert.equal(verification.default().props.to, '/login');
console.log('Verification checks passed: return destination, guest entry, and cancelled redirects after unmount/sign-out.');
