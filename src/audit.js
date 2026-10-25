const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const localeName = (locale) => String(locale).replaceAll('_', '-').split('-').map((part, index) => index === 0 ? part.toLowerCase() : part.length === 2 ? part.toUpperCase() : part.length === 4 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part).join('-');

function stableId(...parts) {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function localeFromFile(name) {
  const basename = name.split(/[\\/]/).pop();
  const match = basename.match(/(?:^|\.)([a-z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*)\.json$/i);
  return match ? { code: localeName(match[1]), token: match[1] } : null;
}

function flattenJson(value, path = [], result = [], unsupported = []) {
  if (typeof value === 'string') result.push({ path, label: path.join(' · ') || 'Value', state: 'translated', value });
  else if (object(value)) Object.entries(value).forEach(([key, child]) => flattenJson(child, [...path, key], result, unsupported));
  else unsupported.push(path);
  return { leaves: result, unsupported };
}

function stringUnits(value, path = [], relative = [], result = []) {
  if (!object(value)) return result;
  if (object(value.stringUnit) && typeof value.stringUnit.value === 'string') {
    result.push({
      path: [...path, 'stringUnit', 'value'], relative: [...relative, 'stringUnit', 'value'],
      label: relative.filter((part) => !['variations', 'substitutions'].includes(part)).join(' · ') || 'Translation',
      state: typeof value.stringUnit.state === 'string' ? value.stringUnit.state : own(value.stringUnit, 'state') ? 'unknown' : 'new',
      invalidState: own(value.stringUnit, 'state') && typeof value.stringUnit.state !== 'string', value: value.stringUnit.value,
    });
  }
  if (object(value.stringSet) && Array.isArray(value.stringSet.values) && value.stringSet.values.every((phrase) => typeof phrase === 'string')) {
    const set = value.stringSet;
    set.values.forEach((phrase, index) => result.push({
      path: [...path, 'stringSet', 'values', String(index)], relative: [...relative, 'stringSet', 'values', String(index)],
      label: [...relative.filter((part) => !['variations', 'substitutions'].includes(part)), `Phrase ${index + 1}`].join(' · '),
      state: typeof set.state === 'string' ? set.state : own(set, 'state') ? 'unknown' : 'new',
      invalidState: own(set, 'state') && typeof set.state !== 'string', value: phrase, kind: 'string-set',
    }));
  }
  for (const [key, child] of Object.entries(value)) {
    if (!['stringUnit', 'stringSet'].includes(key) && object(child)) stringUnits(child, [...path, key], [...relative, key], result);
  }
  return result;
}

function printfTokens(value) {
  const tokens = [];
  let cursor = 0;
  let nextArgument = 1;
  const pattern = /^%(?:(\d+)\$)?[-+#0']*(?:(\*(?:(\d+)\$)?)|\d+)?(?:\.(?:(\*(?:(\d+)\$)?)|\d+))?(hh|ll|[hljztLq])?([@diuoxXfFeEgGaAcCsSpnDUO])/;
  while (cursor < value.length) {
    if (value[cursor] !== '%') { cursor += 1; continue; }
    if (value[cursor + 1] === '%') { cursor += 2; continue; }
    const match = value.slice(cursor).match(pattern);
    if (!match) { cursor += 1; continue; }
    const [, position, width, widthPosition, precision, precisionPosition, length = '', conversion] = match;
    if (width) tokens.push(`${widthPosition || nextArgument++}:d`);
    if (precision) tokens.push(`${precisionPosition || nextArgument++}:d`);
    let type = conversion;
    if (conversion === 'i') type = 'd';
    if ('xXo'.includes(conversion)) type = 'u';
    if ('fFeEgGaA'.includes(conversion)) type = 'f';
    tokens.push(`${position || nextArgument++}:${length}${type}`);
    cursor += match[0].length;
  }
  return tokens;
}

export function placeholders(value) {
  const text = String(value ?? '');
  const unsupported = /\{[^{}]*,\s*(?:plural|select|selectordinal|number|date|time)\b/i.test(text) || /\{\{[^{}]*,[^{}]*\}\}/.test(text) || /%#@[^@]+@/.test(text);
  const tokens = printfTokens(text);
  if (!unsupported) {
    const consumed = text.replace(/\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g, (_, name) => { tokens.push(`mustache:${name}`); return ''; })
      .replace(/\$\{\s*([A-Za-z_][\w.-]*)\s*\}/g, (_, name) => { tokens.push(`dollar:${name}`); return ''; });
    for (const match of consumed.matchAll(/(?<!\{)\{\s*([A-Za-z_][\w.-]*)\s*\}(?!\})/g)) tokens.push(`named:${match[1]}`);
  }
  return { tokens: [...new Set(tokens)].sort(), unsupported };
}

function sourceForLeaf(entry, leaf) {
  const variants = entry.sourceVariants || [];
  if (leaf.kind === 'string-set') {
    const prefix = JSON.stringify(leaf.relative.slice(0, -3));
    const alternatives = variants.filter((source) => source.kind === 'string-set' && JSON.stringify(source.relative.slice(0, -3)) === prefix);
    const signature = JSON.stringify(placeholders(leaf.value).tokens);
    const matching = alternatives.filter((source) => JSON.stringify(placeholders(source.value).tokens) === signature);
    return matching.find((source) => source.value === leaf.value)?.value ?? matching[0]?.value ?? alternatives[0]?.value ?? entry.source;
  }
  const exact = variants.find((source) => JSON.stringify(source.relative) === JSON.stringify(leaf.relative));
  if (exact) return exact.value;
  if (leaf.relative?.includes('plural')) {
    const fallback = [...leaf.relative];
    fallback[fallback.indexOf('plural') + 1] = 'other';
    const other = variants.find((source) => JSON.stringify(source.relative) === JSON.stringify(fallback));
    if (other) return other.value;
  }
  return entry.source;
}

function hasStringStructure(value) {
  return object(value) && (['stringUnit', 'stringSet', 'variations', 'substitutions'].some((key) => own(value, key)) || Object.values(value).some(hasStringStructure));
}

function inspectStructure(value, result = { substitutions: false, nested: false, devices: false, unknown: false, missingOther: [] }, path = [], depth = 0) {
  if (!object(value)) return result;
  if (own(value, 'substitutions')) result.substitutions = true;
  if (own(value, 'stringSet') && (!object(value.stringSet) || !Array.isArray(value.stringSet.values) || !value.stringSet.values.length || value.stringSet.values.some((phrase) => typeof phrase !== 'string'))) result.unknown = true;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'variations' && object(child)) {
      if (depth > 0) result.nested = true;
      for (const [axis, branches] of Object.entries(child)) {
        if (!['plural', 'device'].includes(axis)) result.unknown = true;
        if (axis === 'device') result.devices = true;
        if (axis === 'plural' && object(branches) && !own(branches, 'other')) result.missingOther.push([...path, key, axis]);
        inspectStructure(branches, result, [...path, key, axis], depth + 1);
      }
    } else if (object(child)) {
      if (!['stringUnit', 'stringSet', 'substitutions', 'zero', 'one', 'two', 'few', 'many', 'other', 'iphone', 'ipad', 'ipod', 'mac', 'watch', 'appletv', 'applevision', 'vision'].includes(key) && hasStringStructure(child)) result.unknown = true;
      inspectStructure(child, result, [...path, key], depth);
    }
  }
  return result;
}

function chooseSource(units, fallback) {
  return units.find((unit) => unit.relative.length === 2)?.value ?? units.find((unit) => unit.relative.includes('other'))?.value ?? units[0]?.value ?? fallback;
}

export function auditFiles(inputFiles, options = {}) {
  const requestedSource = localeName(options.sourceLocale || 'en');
  const files = inputFiles.map((file) => ({ ...file, name: String(file.name), text: String(file.text ?? '') }));
  const errors = [];
  const entries = [];
  const issues = [];
  const discovered = new Set((options.targetLocales || []).filter(Boolean).map(localeName));
  const catalogs = [];
  const jsonFiles = [];
  const sourceLocales = new Set();
  const fileNames = new Set();

  function addIssue(entry, locale, type, severity, title, message, leaf = null, extra = {}) {
    const issue = {
      id: `issue-${stableId(entry.id, locale, type, leaf?.path ?? extra.path ?? null)}`,
      entryId: entry.id, fileName: entry.fileName, key: entry.key, locale, severity, type, title, message,
      source: leaf ? sourceForLeaf(entry, leaf) : entry.source, value: leaf?.value ?? '', path: leaf?.path ?? null,
      format: entry.format, fixable: Boolean(leaf) && !leaf.invalidState, ...extra,
    };
    issues.push(issue);
    return issue;
  }

  for (const file of files) {
    if (fileNames.has(file.name)) { errors.push({ fileName: file.name, message: 'Duplicate file name. Rename files so an exported repair has an unambiguous destination.' }); continue; }
    fileNames.add(file.name);
    let data;
    try { data = JSON.parse(file.text.replace(/^\uFEFF/, '')); }
    catch (error) { errors.push({ fileName: file.name, message: `Invalid JSON: ${error.message}` }); continue; }
    if (!object(data)) { errors.push({ fileName: file.name, message: 'Expected a JSON object containing strings.' }); continue; }
    if (/\.xcstrings$/i.test(file.name) || (object(data.strings) && typeof data.sourceLanguage === 'string')) {
      if (!object(data.strings)) { errors.push({ fileName: file.name, message: 'This String Catalog has no strings object.' }); continue; }
      const sourceLocale = localeName(data.sourceLanguage || requestedSource);
      sourceLocales.add(sourceLocale);
      file.format = 'xcstrings';
      file.sourceLocale = sourceLocale;
      catalogs.push({ name: file.name, format: 'xcstrings', sourceLocale });
      for (const [key, record] of Object.entries(data.strings)) {
        if (!object(record)) { errors.push({ fileName: file.name, message: `The entry “${key}” must be an object.` }); continue; }
        const translations = Object.create(null);
        const structures = Object.create(null);
        if (record.localizations != null && !object(record.localizations)) {
          errors.push({ fileName: file.name, message: `The entry “${key}” has an invalid localizations object.` });
          continue;
        }
        for (const [rawLocale, localization] of Object.entries(record.localizations || {})) {
          const code = localeName(rawLocale);
          discovered.add(code);
          translations[code] = stringUnits(localization, ['strings', key, 'localizations', rawLocale]);
          structures[code] = inspectStructure(localization);
          if (!translations[code].length && (!object(localization) || Object.keys(localization).length)) structures[code].unknown = true;
        }
        const sourceVariants = translations[sourceLocale] || [];
        entries.push({
          id: `entry-${stableId(file.name, key)}`, fileName: file.name, key, comment: typeof record.comment === 'string' ? record.comment : '',
          sourceLocale, source: chooseSource(sourceVariants, key), translations, excluded: record.shouldTranslate === false,
          sourceVariants, format: 'xcstrings', structures, stale: record.extractionState === 'stale',
        });
      }
    } else {
      const inferred = localeFromFile(file.name);
      if (!inferred) { errors.push({ fileName: file.name, message: 'Name locale JSON files with their language, such as en.json or nb-NO.json. Locale-map JSON is not supported.' }); continue; }
      if (jsonFiles.some((existing) => existing.locale === inferred.code)) { errors.push({ fileName: file.name, message: `More than one JSON file uses ${inferred.code}. Audit one namespace at a time.` }); continue; }
      const flattened = flattenJson(data);
      file.format = 'json';
      file.locale = inferred.code;
      discovered.add(inferred.code);
      jsonFiles.push({ file, data, locale: inferred.code, token: inferred.token, ...flattened });
    }
  }

  if (jsonFiles.length) {
    const sourceFile = jsonFiles.find((file) => file.locale === requestedSource) || jsonFiles.find((file) => file.locale === 'en') || jsonFiles[0];
    const sourceLocale = sourceFile.locale;
    if (options.sourceLocale && sourceLocale !== requestedSource) errors.push({ fileName: sourceFile.file.name, message: `No ${requestedSource} source file was found. The audit uses ${sourceLocale}; add the requested source file to change it.` });
    sourceLocales.add(sourceLocale);
    catalogs.push({ name: sourceFile.file.name, format: 'json', sourceLocale });
    const byPath = new Map(sourceFile.leaves.map((leaf) => [JSON.stringify(leaf.path), leaf]));
    const extraEntries = new Map();
    for (const sourceLeaf of sourceFile.leaves) {
      const translations = Object.create(null);
      const targetFiles = Object.create(null);
      for (const localizedFile of jsonFiles) {
        const found = localizedFile.leaves.find((leaf) => JSON.stringify(leaf.path) === JSON.stringify(sourceLeaf.path));
        translations[localizedFile.locale] = found ? [found] : [];
        targetFiles[localizedFile.locale] = localizedFile.file.name;
      }
      entries.push({
        id: `entry-${stableId(sourceFile.file.name, sourceLeaf.path)}`, fileName: sourceFile.file.name, key: sourceLeaf.path.join('.'), comment: '',
        sourceLocale, source: sourceLeaf.value, translations, excluded: false, format: 'json', jsonPath: sourceLeaf.path,
        targetFiles, sourceFileToken: sourceFile.token,
      });
    }
    for (const localizedFile of jsonFiles) {
      for (const leaf of localizedFile.leaves) {
        if (localizedFile === sourceFile || byPath.has(JSON.stringify(leaf.path))) continue;
        let entry = extraEntries.get(JSON.stringify(leaf.path));
        if (!entry) {
          entry = {
            id: `entry-${stableId(sourceFile.file.name, leaf.path)}`, fileName: localizedFile.file.name, key: leaf.path.join('.'), comment: '',
            sourceLocale, source: '', translations: {}, excluded: true, sourceMissing: true, format: 'json', jsonPath: leaf.path,
          };
          extraEntries.set(JSON.stringify(leaf.path), entry);
          entries.push(entry);
        }
        entry.translations[localizedFile.locale] = [leaf];
        addIssue(entry, localizedFile.locale, 'extra-key', 'info', 'Key is absent from the source', 'This target key has no matching source string. Confirm whether it is still needed.', leaf, { fileName: localizedFile.file.name, fixable: false });
      }
      if (localizedFile.unsupported.length) errors.push({ fileName: localizedFile.file.name, message: `${localizedFile.unsupported.length} non-string value${localizedFile.unsupported.length === 1 ? '' : 's'} left unchanged. Only nested object string values are audited; arrays, numbers, booleans and null are not translations.` });
    }
  }

  const allLocales = [...discovered].sort();
  const localeStats = new Map(allLocales.map((code) => [code, { code, total: 0, translated: 0, issues: 0, coverage: 0 }]));
  for (const entry of entries) {
    if (entry.excluded) continue;
    if (entry.stale) addIssue(entry, null, 'stale', 'info', 'String marked stale', 'Xcode marked this source string stale. Confirm that it is still used before translating it.', null, { fixable: false });
    for (const code of allLocales) {
      if (code === entry.sourceLocale) continue;
      const stats = localeStats.get(code);
      stats.total += 1;
      const leaves = entry.translations[code] || [];
      const start = issues.length;
      const targetFileName = entry.format === 'json'
        ? entry.targetFiles[code] || entry.fileName.replace(new RegExp(`${entry.sourceFileToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.json$`, 'i'), `${code}.json`)
        : entry.fileName;
      const issueDestination = { fileName: targetFileName };
      if (!leaves.length) {
        const path = entry.format === 'json' ? entry.jsonPath : ['strings', entry.key, 'localizations', code, 'stringUnit', 'value'];
        const basic = !entry.sourceVariants?.some((variant) => variant.relative.length > 2) && !entry.structures?.[code]?.unknown && !entry.structures?.[entry.sourceLocale]?.unknown;
        addIssue(entry, code, 'missing', 'error', 'Missing translation', `Add a ${code} translation for this string.${basic ? '' : ' This entry has variants or unrecognized data; edit the target structure in Xcode.'}`, null, { ...issueDestination, path: basic ? path : null, fixable: basic });
      } else {
        const structure = entry.structures?.[code];
        const sourceStructure = entry.structures?.[entry.sourceLocale];
        if (structure?.substitutions || structure?.nested || structure?.devices || structure?.unknown || sourceStructure?.substitutions || sourceStructure?.nested || sourceStructure?.devices || sourceStructure?.unknown) {
          addIssue(entry, code, 'unsupported', 'warning', 'Complex variants need a manual check', 'Unrecognized structures, device variants, nested variation axes and substitutions are extracted where possible, but this audit cannot prove complete variant or substitution coverage. Review this entry in Xcode.', null, { ...issueDestination, fixable: false });
        }
        for (const path of structure?.missingOther || []) addIssue(entry, code, 'missing-variant', 'error', 'Plural has no “other” form', 'An Apple plural variation needs an “other” fallback. Add it in Xcode before exporting.', null, { ...issueDestination, path: ['strings', entry.key, 'localizations', code, ...path], fixable: false });
        for (const leaf of leaves) {
          const source = sourceForLeaf(entry, leaf);
          if (!leaf.value.trim()) addIssue(entry, code, 'empty', 'error', 'Empty translation', 'This translation is empty or contains only whitespace.', leaf, issueDestination);
          if (entry.format === 'xcstrings' && leaf.state !== 'translated') {
            const label = leaf.state === 'machine_translated' ? 'Machine translation needs review' : leaf.state === 'needs_review' ? 'Translation needs review' : 'Translation is not marked complete';
            addIssue(entry, code, 'review', 'warning', label, leaf.invalidState ? 'The translation state is not text. Repair this metadata in Xcode.' : `Xcode state: ${String(leaf.state).replaceAll('_', ' ')}. Review the text and mark this ${leaf.kind === 'string-set' ? 'phrase set' : 'string'} translated.`, leaf, { ...issueDestination, fixable: !leaf.invalidState });
          }
          const sourcePlaceholders = placeholders(source);
          const targetPlaceholders = placeholders(leaf.value);
          if (sourcePlaceholders.unsupported || targetPlaceholders.unsupported) {
            addIssue(entry, code, 'unsupported-format', 'warning', 'Message format needs a manual check', 'ICU messages and named Apple substitution formats need a format-aware review. Placeholder equivalence has not been verified.', leaf, { ...issueDestination, fixable: false });
          } else if (leaf.value.trim() && JSON.stringify(sourcePlaceholders.tokens) !== JSON.stringify(targetPlaceholders.tokens)) {
            const removed = [...sourcePlaceholders.tokens];
            const added = [];
            for (const token of targetPlaceholders.tokens) {
              const index = removed.indexOf(token);
              if (index < 0) added.push(token);
              else removed.splice(index, 1);
            }
            const pluralIndex = leaf.relative?.indexOf('plural') ?? -1;
            const fixedPlural = pluralIndex >= 0 && ['zero', 'one', 'two'].includes(leaf.relative[pluralIndex + 1]);
            const numeric = /^\d+:(?:hh|ll|[hljztq])?[duf]$/;
            const countOmitted = fixedPlural && !added.length && removed.length === 1 && numeric.test(removed[0]);
            const countRestored = fixedPlural && !removed.length && added.length === 1 && numeric.test(added[0]) && placeholders(entry.source).tokens.includes(added[0]);
            if (countOmitted || countRestored) addIssue(entry, code, 'plural-count', 'info', 'Plural count is written out in one language', 'These fixed plural forms differ by one numeric argument. Apple permits spelled-out counts; confirm that this wording is appropriate for the locale.', leaf, { ...issueDestination, fixable: false });
            else addIssue(entry, code, 'placeholder', 'error', 'Placeholders do not match', `Keep the same arguments as the source. Source: ${sourcePlaceholders.tokens.join(', ') || 'none'}. Translation: ${targetPlaceholders.tokens.join(', ') || 'none'}. Positional argument reordering is supported.`, leaf, issueDestination);
          }
          if (leaf.value.trim() && (/^\s*/.exec(source)[0] !== /^\s*/.exec(leaf.value)[0] || /\s*$/.exec(source)[0] !== /\s*$/.exec(leaf.value)[0])) {
            addIssue(entry, code, 'whitespace', 'warning', 'Boundary whitespace differs', 'Leading or trailing whitespace differs from the source. Confirm that this is intentional.', leaf, issueDestination);
          }
          if (leaf.value === source && /\p{L}/u.test(source)) addIssue(entry, code, 'same-source', 'info', 'Translation matches the source', 'The text is identical to the source. This may be intentional for names and shared words.', leaf, issueDestination);
        }
      }
      const current = issues.slice(start);
      if (leaves.length && !current.some((issue) => issue.severity === 'error' || ['review', 'unsupported', 'unsupported-format'].includes(issue.type))) stats.translated += 1;
    }
  }
  const locales = [...localeStats.values()].filter((stats) => stats.total > 0);
  for (const stats of locales) {
    stats.issues = issues.filter((issue) => issue.locale === stats.code).length;
    stats.coverage = stats.total ? Math.round(stats.translated / stats.total * 100) : 100;
  }
  const total = locales.reduce((sum, stats) => sum + stats.total, 0);
  const translated = locales.reduce((sum, stats) => sum + stats.translated, 0);
  return {
    entries, locales, issues, sourceLocale: [...sourceLocales][0] || requestedSource, sourceLocales: [...sourceLocales], errors, files, catalogs,
    summary: {
      entries: entries.filter((entry) => !entry.excluded).length, locales: locales.length, issues: issues.length,
      errors: issues.filter((issue) => issue.severity === 'error').length, warnings: issues.filter((issue) => issue.severity === 'warning').length,
      coverage: total ? Math.round(translated / total * 100) : 0,
    },
  };
}

function setPath(root, path, value) {
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (!own(cursor, key)) Object.defineProperty(cursor, key, { value: {}, enumerable: true, writable: true, configurable: true });
    if (!object(cursor[key])) throw new Error('The target path conflicts with an existing non-object value. Edit the catalog manually.');
    cursor = cursor[key];
  }
  if (own(cursor, path.at(-1)) && typeof cursor[path.at(-1)] !== 'string') {
    throw new Error('The target path contains a non-string value. This repair would overwrite existing data; edit the file manually.');
  }
  Object.defineProperty(cursor, path.at(-1), { value, enumerable: true, writable: true, configurable: true });
}

export function updateTranslation(inputFiles, target, value) {
  if (typeof value !== 'string') throw new TypeError('A translation must be a string.');
  if (!target || typeof target.fileName !== 'string') throw new Error('Choose a translation with a file destination.');
  if (target.fixable === false) throw new Error('This finding requires a manual edit; automatic repair is not supported.');
  const files = inputFiles.map((file) => ({ ...file }));
  let file = files.find((candidate) => candidate.name === target.fileName);
  const isCatalog = target.format === 'xcstrings' || /\.xcstrings$/i.test(target.fileName);
  if (!file) {
    if (isCatalog) throw new Error('The target String Catalog was not found.');
    file = { name: target.fileName, text: '{}\n' };
    files.push(file);
  }
  const data = JSON.parse(file.text.replace(/^\uFEFF/, ''));
  const path = target.path || (isCatalog && target.key && target.locale ? ['strings', target.key, 'localizations', target.locale, 'stringUnit', 'value'] : null);
  if (!Array.isArray(path) || !path.length || path.some((part) => typeof part !== 'string')) throw new Error('This finding needs a manual edit; it has no editable string path.');
  if (!object(data)) throw new Error('The target file must contain a JSON object.');
  if (isCatalog && path.at(-3) === 'stringSet' && path.at(-2) === 'values' && /^(?:0|[1-9]\d*)$/.test(path.at(-1))) {
    let set = data;
    for (const key of path.slice(0, -2)) {
      if (!object(set) || !own(set, key)) throw new Error('The phrase set was not found. Re-audit the catalog before editing.');
      set = set[key];
    }
    const index = Number(path.at(-1));
    if (!object(set) || !Array.isArray(set.values) || !set.values.every((phrase) => typeof phrase === 'string') || !Number.isSafeInteger(index) || index >= set.values.length) throw new Error('The phrase path does not identify an existing string. Edit this phrase set manually.');
    if (own(set, 'state') && typeof set.state !== 'string') throw new Error('The phrase-set state needs a manual metadata edit.');
    set.values[index] = value;
    if (set.values.length === 1) set.state = 'translated';
  } else if (isCatalog) {
    if (path.at(-1) !== 'value' || path.at(-2) !== 'stringUnit') throw new Error('Only String Catalog string units and existing phrase-set values can be repaired here.');
    setPath(data, path, value);
    setPath(data, [...path.slice(0, -1), 'state'], 'translated');
  } else setPath(data, path, value);
  const indent = /\n([\t ]+)"/.exec(file.text)?.[1] || '  ';
  file.text = JSON.stringify(data, null, indent) + '\n';
  return files;
}
