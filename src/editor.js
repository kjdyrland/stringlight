import { placeholders } from './audit.js';

function samePath(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function jsonDestination(entry, locale) {
  if (entry.targetFiles?.[locale]) return entry.targetFiles[locale];
  const token = entry.sourceFileToken || entry.sourceLocale;
  if (!token) return undefined;
  const suffix = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.json$`, 'i');
  return suffix.test(entry.fileName) ? entry.fileName.replace(suffix, `${locale}.json`) : undefined;
}

function variantSource(entry, unit) {
  if (!unit?.relative) return entry.source;
  if (unit.kind === 'string-set') {
    const prefix = JSON.stringify(unit.relative.slice(0, -3));
    const alternatives = entry.sourceVariants?.filter(source => source.kind === 'string-set' && JSON.stringify(source.relative.slice(0, -3)) === prefix) || [];
    const signature = JSON.stringify(placeholders(unit.value).tokens);
    const matching = alternatives.filter(source => JSON.stringify(placeholders(source.value).tokens) === signature);
    return matching.find(source => source.value === unit.value)?.value ?? matching[0]?.value ?? alternatives[0]?.value ?? entry.source;
  }
  const exact = entry.sourceVariants?.find(source => samePath(source.relative, unit.relative));
  if (exact) return exact.value;
  const plural = unit.relative.indexOf('plural');
  if (plural >= 0) {
    const relative = [...unit.relative];
    relative[plural + 1] = 'other';
    const fallback = entry.sourceVariants?.find(source => samePath(source.relative, relative));
    if (fallback) return fallback.value;
  }
  return entry.source;
}

export function editorContext(entry, locale, unit, issue) {
  if (!entry) return { target: null, fixable: false, source: '' };
  const exactIssue = issue && issue.entryId === entry.id && issue.locale === locale && (!unit || samePath(issue.path, unit.path));
  const target = exactIssue ? issue : {
    entryId: entry.id, fileName: entry.format === 'json' ? jsonDestination(entry, locale) : entry.fileName,
    key: entry.key, locale, format: entry.format,
    path: unit?.path ?? (entry.format === 'json' ? entry.jsonPath : null),
  };
  const basicSource = entry.format === 'json' || !entry.sourceVariants?.some(source => source.relative.length > 2);
  const understood = !entry.structures?.[locale]?.unknown && !entry.structures?.[entry.sourceLocale]?.unknown;
  const editable = exactIssue ? issue.fixable !== false : unit ? !unit.invalidState : basicSource && understood;
  return {
    target,
    fixable: Boolean(locale && locale !== entry.sourceLocale && !entry.excluded && target.fileName && editable),
    source: exactIssue && typeof issue.source === 'string' ? issue.source : variantSource(entry, unit),
  };
}
