#!/usr/bin/env node
/**
 * Start Vite on the LAN and point the Capacitor iOS shell at it.
 *
 * After one Xcode install with this running, reopen the iPad app on the
 * same Wi-Fi — no native rebuild needed unless this Mac's IP changes.
 *
 * Override the host with CAPACITOR_LIVE_HOST (IP or Bonjour name, no protocol).
 * Override the port with CAPACITOR_LIVE_PORT (default 5173).
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.CAPACITOR_LIVE_PORT || 5173);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = join(ROOT, 'capacitor-shell');
const LAST_URL_FILE = join(SHELL, '.live-reload-last');
const DIST = join(ROOT, 'dist');

function isPrivateIPv4(ip) {
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

function addressFromIface(name, nets) {
  for (const addr of nets[name] || []) {
    const ipv4 = addr.family === 'IPv4' || addr.family === 4;
    if (ipv4 && !addr.internal && isPrivateIPv4(addr.address)) {
      return addr.address;
    }
  }
  return null;
}

function ipconfigEn0() {
  try {
    const ip = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim();
    if (ip && isPrivateIPv4(ip)) return ip;
  } catch {
    // en0 may be Ethernet-only or down
  }
  try {
    const ip = execSync('ipconfig getifaddr en1', { encoding: 'utf8' }).trim();
    if (ip && isPrivateIPv4(ip)) return ip;
  } catch {
    // ignore
  }
  return null;
}

function lanHost() {
  const override = process.env.CAPACITOR_LIVE_HOST?.trim();
  if (override) {
    return override.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  }

  const fromIfconfig = ipconfigEn0();
  if (fromIfconfig) return fromIfconfig;

  let nets;
  try {
    nets = networkInterfaces();
  } catch {
    throw new Error(
      'Could not read network interfaces. Set CAPACITOR_LIVE_HOST to your Mac’s Wi-Fi IP (System Settings → Wi-Fi → Details).',
    );
  }
  for (const name of ['en0', 'en1', 'en2', 'wlan0', 'eth0']) {
    const ip = addressFromIface(name, nets);
    if (ip) return ip;
  }

  for (const name of Object.keys(nets)) {
    if (/^(lo|utun|awdl|llw|bridge|anpi|ap|vmenet|vmnet)/i.test(name)) continue;
    const ip = addressFromIface(name, nets);
    if (ip) return ip;
  }

  throw new Error(
    'Could not find a LAN IPv4 address. Connect this Mac to Wi-Fi, or set CAPACITOR_LIVE_HOST to your Mac’s IP (System Settings → Wi-Fi → Details).',
  );
}

function bonjourHost() {
  try {
    const name = execSync('scutil --get LocalHostName', { encoding: 'utf8' }).trim();
    if (name) return `${name}.local`;
  } catch {
    // non-macOS or scutil unavailable
  }
  return null;
}

function ensureDist() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
}

function copyIosConfig(liveUrl) {
  ensureDist();
  execSync('npx cap copy ios', {
    cwd: SHELL,
    stdio: 'inherit',
    env: {
      ...process.env,
      CAPACITOR_LIVE_URL: liveUrl,
    },
  });
}

function lastLiveUrl() {
  try {
    return readFileSync(LAST_URL_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function printBanner({ url, hostChanged, firstTime, mdns }) {
  const lines = [
    '',
    '  iPad live reload',
    `  Serving at  ${url}`,
    '',
    '  Keep this terminal running. iPad and Mac must be on the same Wi-Fi.',
  ];

  if (firstTime || hostChanged) {
    lines.push(
      '',
      firstTime
        ? '  First time: in Xcode, press Run to install CertChamps on the iPad'
        : '  This Mac’s IP changed: press Run in Xcode once so the iPad picks up the new address',
      '  (do that while this server is running). After that, just reopen the app.',
    );
  } else {
    lines.push('', '  Open the CertChamps app on your iPad — it will live-reload from this server.');
  }

  if (mdns) {
    lines.push(
      '',
      `  Tip: pin a stable hostname (survives DHCP) with`,
      `    CAPACITOR_LIVE_HOST=${mdns} npm run iPad`,
    );
  }

  lines.push('');
  console.log(lines.join('\n'));
}

const host = lanHost();
const url = `http://${host}:${PORT}`;
const previous = lastLiveUrl();
const firstTime = !previous;
const hostChanged = Boolean(previous && previous !== url);
const mdns = bonjourHost();

console.log(`\nPointing Capacitor iOS at ${url}…`);
copyIosConfig(url);
writeFileSync(LAST_URL_FILE, `${url}\n`);

printBanner({ url, hostChanged, firstTime, mdns });

const vite = spawn(
  process.execPath,
  [
    join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '--port',
    String(PORT),
    '--strictPort',
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CAPACITOR_LIVE: '1',
    },
  },
);

const shutdown = (code) => {
  if (vite.exitCode === null && vite.signalCode === null) {
    vite.kill('SIGTERM');
  }
  process.exit(code ?? 0);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
vite.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
vite.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
