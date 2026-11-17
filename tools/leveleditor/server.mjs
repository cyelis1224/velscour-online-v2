// Local Velscour Level & Scenario Studio server (modeled on tools/helmet_fit_server.py).
// Serves the repository root over 127.0.0.1 with Cache-Control: no-store so ES modules, Three.js,
// and Asset Manager manifests load cleanly, and provides origin-checked atomic save/load endpoints
// for assets/scenarios/*.velscen.json without needing to restart the live multiplayer server.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  SCENARIO_FORMAT,
  deserializeScenarioDoc,
  serializeScenarioDoc,
  validateScenarioDoc,
  slugifyId,
} from '../../src/world/scenariocodec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCENARIOS_DIR = path.join(ROOT, 'assets', 'scenarios');
const INDEX_FILE = path.join(SCENARIOS_DIR, 'index.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.md': 'text/markdown; charset=utf-8',
};

export function ensureScenarioDir() {
  fs.mkdirSync(SCENARIOS_DIR, { recursive: true });
}

export function rebuildScenarioIndex() {
  ensureScenarioDir();
  const files = fs.readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.velscen.json'))
    .sort();
  const scenarios = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf8'));
      if (raw && raw.format === SCENARIO_FORMAT && raw.meta) {
        scenarios.push({
          id: raw.meta.id || file.replace(/\.velscen\.json$/, ''),
          file: `assets/scenarios/${file}`,
          name: raw.meta.name || file,
          author: raw.meta.author || 'creator',
          blurb: raw.meta.blurb || '',
          category: raw.meta.category || 'dungeon',
          biomeId: raw.meta.biomeId || 'catacombs',
          mixBiomeId: raw.meta.mixBiomeId || null,
          variantId: raw.meta.variantId || 'default',
          size: [raw.grid?.w || 0, raw.grid?.h || 0],
          cutsceneCount: Array.isArray(raw.cutscenes) ? raw.cutscenes.length : 0,
          triggerCount: Array.isArray(raw.triggers) ? raw.triggers.length : 0,
          publish: {
            skullPortal: raw.meta.publish?.skullPortal !== false,
            campaignPool: !!raw.meta.publish?.campaignPool,
            pinnedDepth: typeof raw.meta.publish?.pinnedDepth === 'number' ? raw.meta.publish.pinnedDepth : null,
          },
          updatedAt: raw.meta.updatedAt || null,
        });
      }
    } catch (e) {
      console.warn('[Studio] Skipping unreadable scenario', file, e.message);
    }
  }
  const indexData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    scenarios,
  };
  const tmp = `${INDEX_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(indexData, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, INDEX_FILE);
  return indexData;
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj, null, 2) + '\n', 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, maxBytes = 24 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload exceeds 24 MB studio limit.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function checkLocalOrigin(req, port) {
  const host = String(req.headers.host || '');
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

export function createStudioServer() {
  ensureScenarioDir();
  if (!fs.existsSync(INDEX_FILE)) rebuildScenarioIndex();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = decodeURIComponent(url.pathname);
      const port = server.address()?.port || 8125;

      // Studio REST API
      if (pathname === '/api/studio/health') {
        return sendJson(res, 200, { ok: true, studio: true, root: ROOT });
      }

      if (pathname === '/api/studio/scenarios' && req.method === 'GET') {
        const index = rebuildScenarioIndex();
        return sendJson(res, 200, index);
      }

      if (pathname.startsWith('/api/studio/scenarios/')) {
        const rawId = pathname.slice('/api/studio/scenarios/'.length);
        const id = slugifyId(rawId);
        const filePath = path.join(SCENARIOS_DIR, `${id}.velscen.json`);

        if (req.method === 'GET') {
          if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: `Scenario "${id}" not found.` });
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return sendJson(res, 200, data);
        }

        if (!checkLocalOrigin(req, port)) {
          return sendJson(res, 403, { error: 'Forbidden: Studio writes must originate from local studio window.' });
        }

        if (req.method === 'POST' || req.method === 'PUT') {
          const text = await readBody(req);
          const payload = JSON.parse(text);
          const liveDoc = deserializeScenarioDoc(payload);
          liveDoc.meta.id = id;
          liveDoc.meta.updatedAt = new Date().toISOString();
          const issues = validateScenarioDoc(liveDoc);
          const serialized = serializeScenarioDoc(liveDoc);

          ensureScenarioDir();
          if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, `${filePath}.bak`);
          }
          const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(serialized, null, 2) + '\n', 'utf8');
          fs.renameSync(tmp, filePath);
          const index = rebuildScenarioIndex();
          return sendJson(res, 200, {
            saved: true,
            id,
            path: `assets/scenarios/${id}.velscen.json`,
            issues,
            scenarios: index.scenarios,
          });
        }

        if (req.method === 'DELETE') {
          if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, `${filePath}.bak`);
            fs.unlinkSync(filePath);
          }
          const index = rebuildScenarioIndex();
          return sendJson(res, 200, { deleted: true, id, scenarios: index.scenarios });
        }
      }

      // Static repository file serving
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      let rel = pathname.replace(/^\/+/, '');
      if (!rel || pathname.endsWith('/')) rel += 'index.html';
      const resolved = path.resolve(ROOT, rel);
      if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(resolved)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      let stat = fs.statSync(resolved);
      let fileToServe = resolved;
      if (stat.isDirectory()) {
        const idxHtml = path.join(resolved, 'index.html');
        if (!fs.existsSync(idxHtml)) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        fileToServe = idxHtml;
        stat = fs.statSync(fileToServe);
      }
      const ext = path.extname(fileToServe).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(fileToServe).pipe(res);
    } catch (err) {
      sendJson(res, 400, { error: err.message || String(err) });
    }
  });

  return server;
}

// CLI entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const noBrowser = args.includes('--no-browser');
  const portIdx = args.indexOf('--port');
  const requestedPort = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : (parseInt(process.env.STUDIO_PORT || '8125', 10));

  const server = createStudioServer();
  server.listen(requestedPort, '127.0.0.1', () => {
    const actualPort = server.address().port;
    const studioUrl = `http://127.0.0.1:${actualPort}/tools/leveleditor/`;
    console.log(`[Velscour Studio] Local Level & Scenario Editor ready at: ${studioUrl}`);
    console.log(`[Velscour Studio] Asset Manager available at:             http://127.0.0.1:${actualPort}/tools/assetmanager/`);
    if (!noBrowser) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const openArgs = process.platform === 'win32' ? ['/c', 'start', studioUrl] : [studioUrl];
      try { spawn(opener, openArgs, { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
    }
  });
}
