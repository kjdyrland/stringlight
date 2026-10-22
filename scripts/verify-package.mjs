import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmScript = process.env.npm_execpath;
if (!npmScript) throw new Error('Run this check with npm run verify:package.');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporary = await mkdtemp(join(tmpdir(), 'stringlight-package-'));

function run(executable, args, cwd, expectedStatus = 0) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', env: process.env });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedStatus, `${executable} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const npm = (args, cwd) => run(process.execPath, [npmScript, '--cache', join(temporary, 'npm-cache'), ...args], cwd);

try {
  const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], root))[0];
  const forbidden = packed.files.filter(file => /^(?:\.openai|\.git|artifacts|dist|node_modules)\//.test(file.path) || /\.(?:jsx|jpg)$/.test(file.path));
  assert.deepEqual(forbidden, [], 'The reusable package must exclude UI, hosting bindings, and local artifacts.');
  assert.ok(packed.files.some(file => file.path === 'LICENSE'));
  assert.ok(packed.files.some(file => file.path === 'src/index.d.ts'));

  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, packed.filename)], consumer);
  assert.equal(npm(['exec', '--offline', '--', 'stringlight', '--version'], consumer).trim(), manifest.version);

  const installed = join(consumer, 'node_modules', '@kjdyrland', 'stringlight');
  const installedManifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(Object.keys(installedManifest.dependencies || {}).length, 0, 'Core consumers should need no runtime dependencies.');
  const cli = join(installed, 'scripts', 'audit.mjs');
  const clean = JSON.parse(run(process.execPath, [cli, join(installed, 'examples/apple/Localizable.xcstrings'), '--target', 'nb', '--target', 'es', '--fail-on', 'warning'], consumer));
  assert.equal(clean.summary.errors, 0);
  const broken = JSON.parse(run(process.execPath, [cli, join(installed, 'examples/broken/Localizable.xcstrings'), '--target', 'nb'], consumer, 1));
  assert.ok(broken.issues.some(issue => issue.type === 'placeholder'));
  assert.ok(broken.issues.some(issue => issue.type === 'missing'));

  run(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { auditFiles, updateTranslation } from '@kjdyrland/stringlight';
    const files = [
      {name:'en.json',text:JSON.stringify({hello:'Hello {name}'})},
      {name:'nb.json',text:JSON.stringify({hello:'Hei'})}
    ];
    const report = auditFiles(files);
    assert.equal(report.summary.errors,1);
    const revised = updateTranslation(files,report.issues.find(i=>i.type==='placeholder'),'Hei {name}');
    assert.equal(auditFiles(revised).summary.errors,0);
    assert.equal(revised[0].text,files[0].text);
  `], consumer);

  await writeFile(join(consumer, 'consumer.mts'), `
    import { auditFiles, updateTranslation, placeholders, type AuditReport } from '@kjdyrland/stringlight';
    const files = [{ name: 'en.json', text: '{"hello":"Hello"}' }];
    const report: AuditReport = auditFiles(files, { sourceLocale: 'en', targetLocales: ['nb'] });
    const finding = report.issues.find(issue => issue.fixable);
    if (finding) updateTranslation(files, finding, 'Hei');
    const parsed: { tokens: string[]; unsupported: boolean } = placeholders('%@');
    console.log(parsed, report.summary.errors);
  `);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', join(consumer, 'consumer.mts')], consumer);
  console.log(`Verified ${manifest.name}@${manifest.version}: fresh offline install, executable CLI, clean/broken examples, ESM imports, safe repairs, and TypeScript declarations.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
