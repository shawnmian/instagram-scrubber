import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'dist');
const archive = path.join(outputDir, 'instagram-scrubber-0.1.0.zip');
const validation = spawnSync(process.execPath, [path.join(root, 'scripts/validate.mjs')], { encoding: 'utf8' });
if (validation.status !== 0) { process.stderr.write(validation.stderr || validation.stdout); process.exit(validation.status || 1); }
fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(archive, { force: true });
const zipped = spawnSync('zip', ['-X', '-r', archive, '.'], { cwd: path.join(root, 'extension'), encoding: 'utf8' });
if (zipped.status !== 0) { process.stderr.write(zipped.stderr || zipped.stdout); process.exit(zipped.status || 1); }
const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
if (listing.status !== 0 || !listing.stdout.split(/\r?\n/).includes('manifest.json')) throw new Error('Archive does not contain manifest.json at its root.');
console.log(`Created ${path.relative(root, archive)} with extension-only contents.`);
console.log(listing.stdout.trim());
