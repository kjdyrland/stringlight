#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { auditFiles } from '../src/audit.js';

const help = `Stringlight — local localization preflight

Usage: stringlight <files...> [options]
From source: node scripts/audit.mjs <files...> [options]

  --source <locale>         Source locale for JSON files (defaults to en)
  --target <locale>         Require a target locale; repeat for more locales
  --format <json|markdown>  Report format (defaults to json)
  --fail-on <error|warning|info>
                            Fail at this severity or higher (defaults to error)
  --out <path>             Write the report to this path instead of stdout
  --version, -v            Show the installed package version
  --help, -h               Show this help
  --                       Treat remaining arguments as file paths

Examples:
  stringlight Localizable.xcstrings
  stringlight en.json fr.json --source en --target de
  stringlight en.json fr.json --fail-on warning --format markdown --out audit.md

Inputs are read only: provide .xcstrings catalogs or one JSON file per locale.
Reports go to stdout unless --out is given; --out cannot overwrite an input.

Exit status: 0 no findings at the threshold; 1 findings at the threshold or higher;
2 invalid inputs or usage. Input problems always return 2.
The default error threshold allows warnings and informational findings.
`;

const severities = { error: 3, warning: 2, info: 1 };

function parseArgs(args) {
  const options = { sourceLocale: 'en', targetLocales: [], format: 'json', failOn: 'error', out: null, paths: [] };
  const flags = new Map([['--source', 'sourceLocale'], ['--target', 'targetLocales'], ['--format', 'format'], ['--fail-on', 'failOn'], ['--out', 'out']]);
  let literal = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!literal && arg === '--') { literal = true; continue; }
    if (!literal && (arg === '--help' || arg === '-h')) { options.help = true; continue; }
    if (!literal && (arg === '--version' || arg === '-v')) { options.version = true; continue; }
    if (!literal && arg.startsWith('-')) {
      const key = flags.get(arg);
      if (!key) throw new Error(`Unknown option: ${arg}`);
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`Expected a value after ${arg}`);
      if (key === 'targetLocales') options.targetLocales.push(value);
      else options[key] = value;
    } else options.paths.push(arg);
  }
  if (options.help || options.version) return options;
  if (!options.paths.length) throw new Error('Provide at least one .xcstrings or locale JSON file.');
  if (!['json', 'markdown'].includes(options.format)) throw new Error('--format must be json or markdown.');
  if (!Object.hasOwn(severities, options.failOn)) throw new Error('--fail-on must be error, warning, or info.');
  for (const locale of [options.sourceLocale, ...options.targetLocales]) {
    try { Intl.getCanonicalLocales(locale.replaceAll('_', '-')); }
    catch { throw new Error(`Invalid locale: ${locale}`); }
  }
  if (options.out && options.paths.some((path) => resolve(path) === resolve(options.out))) throw new Error('--out must not overwrite an input file.');
  return options;
}

function markdown(report) {
  const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_[\]{}|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const { summary } = report;
  const lines = ['# Stringlight audit', '', `${summary.entries} strings · ${summary.locales} target locales · ${summary.coverage}% strings passing checks`, '', `${summary.errors} errors · ${summary.warnings} warnings · ${summary.issues} total findings`, ''];
  if (report.errors.length) lines.push('## Input problems', '', ...report.errors.map((error) => `- ${escape(error.fileName)}: ${escape(error.message)}`), '');
  lines.push('## Findings', '');
  if (!report.issues.length) lines.push('No findings.');
  for (const issue of report.issues) {
    lines.push(`### ${escape(issue.severity.toUpperCase())}: ${escape(issue.title)}`, '',
      `- File: ${escape(issue.fileName)}`, `- Key: ${escape(issue.key)}`, `- Locale: ${escape(issue.locale || 'all')}`,
      `- Finding ID: ${escape(issue.id)}`, '', escape(issue.message), '',
      `Source: ${escape(JSON.stringify(issue.source))}`, '', `Translation: ${escape(JSON.stringify(issue.value))}`, '');
  }
  lines.push('', 'Automated checks do not establish linguistic quality, runtime layout, or release approval.', '');
  return lines.join('\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) process.stdout.write(help);
  else if (options.version) {
    const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${version}\n`);
  }
  else {
    if (options.out) {
      const destination = await stat(options.out).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
      if (destination) {
        const inputs = await Promise.all(options.paths.map((path) => stat(path)));
        if (inputs.some((input) => input.dev === destination.dev && input.ino === destination.ino)) throw new Error('--out must not overwrite an input file.');
      }
    }
    const files = await Promise.all(options.paths.map(async (path) => ({ name: basename(path), text: await readFile(path, 'utf8') })));
    const result = auditFiles(files, options);
    const report = { tool: 'Stringlight', schemaVersion: 1, files: files.map((file) => file.name), sourceLocale: result.sourceLocale, summary: result.summary, locales: result.locales, errors: result.errors, issues: result.issues };
    const output = options.format === 'markdown' ? markdown(report) : JSON.stringify(report, null, 2) + '\n';
    if (options.out) await writeFile(options.out, output, 'utf8');
    else process.stdout.write(output);
    process.exitCode = result.errors.length ? 2 : result.issues.some((issue) => severities[issue.severity] >= severities[options.failOn]) ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(`Stringlight: ${error.message}\nRun with --help for usage.\n`);
  process.exitCode = 2;
}
