import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(manifest.version === '0.1.0', 'unexpected version');
assert(manifest.browser_specific_settings?.gecko?.id === 'instagram-scrubber@local.invalid', 'missing Firefox ID');
assert(manifest.browser_specific_settings?.gecko?.strict_min_version === '140.0', 'unexpected Firefox minimum');
assert(JSON.stringify(manifest.browser_specific_settings.gecko.data_collection_permissions?.required) === '["none"]', 'missing no-data declaration');
assert(!manifest.permissions && !manifest.host_permissions, 'unexpected extension permissions');
const expected = ['https://www.instagram.com/*', 'https://instagram.com/*'];
for (const script of manifest.content_scripts) assert(JSON.stringify(script.matches) === JSON.stringify(expected), 'host allowlist mismatch');
for (const file of ['media.js', 'controller.js', 'content.js', 'page-volume.js', 'icons/icon.svg']) {
  const full = path.join(root, 'extension', file);
  assert(fs.existsSync(full), `missing ${file}`);
  if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
    assert(result.status === 0, `${file} syntax error: ${result.stderr}`);
    // The SVG namespace is an identifier for createElementNS, not a fetched resource.
    const source = fs.readFileSync(full, 'utf8').replaceAll('http://www.w3.org/2000/svg', '');
    assert(!/https?:\/\//.test(source), `${file} includes remote URL`);
  }
}
console.log('Manifest, host allowlist, permissions, assets, and JavaScript syntax are valid.');
