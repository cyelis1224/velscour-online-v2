const fs = require('fs');
const path = require('path');
const { RUNTIME_ITEMS, shouldIncludeRuntimePath, buildUpdateManifest } = require('./manifest');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');

if (fs.existsSync(out)) {
  fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });

function copyRecursive(src, dest, relPath) {
  if (!shouldIncludeRuntimePath(relPath)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child), `${relPath}/${child}`);
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

for (const item of RUNTIME_ITEMS) {
  const src = path.join(root, item);
  const dest = path.join(out, item);
  if (fs.existsSync(src)) {
    console.log(`Copying ${item} -> www/${item}`);
    copyRecursive(src, dest, item);
  }
}

let pkgVersion = '0.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version) pkgVersion = pkg.version;
} catch (e) {}

console.log('Generating differential update-manifest.json...');
const manifest = buildUpdateManifest(root, { version: pkgVersion });
const manifestJson = JSON.stringify(manifest);
fs.writeFileSync(path.join(out, 'update-manifest.json'), manifestJson, 'utf8');
fs.writeFileSync(path.join(root, 'update-manifest.json'), manifestJson, 'utf8');

console.log(`Mobile web assets prepared in www/ (${manifest.totalFiles} files, ${(manifest.totalSize / (1024 * 1024)).toFixed(1)} MB, hash: ${manifest.manifestHash})`);
