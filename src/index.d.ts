/** Supported input encodings. Each JSON input represents one locale. */
export type CatalogFormat = 'xcstrings' | 'json';
export type Severity = 'error' | 'warning' | 'info';
export type JsonPath = string[];
export type IssueType =
  | 'missing' | 'empty' | 'placeholder' | 'review' | 'whitespace'
  | 'same-source' | 'extra-key' | 'stale' | 'missing-variant'
  | 'unsupported' | 'unsupported-format' | 'plural-count';

export interface LocalizationFile {
  name: string;
  text: string;
  /** Extra caller metadata is preserved when files are copied. */
  [metadata: string]: unknown;
}

export interface AnalyzedFile extends LocalizationFile {
  format?: CatalogFormat;
  locale?: string;
  sourceLocale?: string;
}

export interface AuditOptions {
  /** JSON source selection; an XCStrings catalog declares its own source. Defaults to en. */
  sourceLocale?: string;
  /** Additional required targets, unioned with languages discovered in the inputs. */
  targetLocales?: readonly string[];
}

export interface TranslationUnit {
  /** Exact path from the JSON root to the translation string. */
  path: JsonPath;
  label: string;
  /** Xcode state, such as translated, new, needs_review, machine_translated, or unknown. */
  state: string;
  value: string;
  /** XCStrings path within a locale, used to pair corresponding variants. */
  relative?: JsonPath;
  invalidState?: boolean;
  /** A localized App Shortcut phrase alternative; its index is not a source/target pairing. */
  kind?: 'string-set';
}

export interface VariantStructure {
  substitutions: boolean;
  nested: boolean;
  devices: boolean;
  unknown: boolean;
  missingOther: JsonPath[];
}

export interface XcstringsUnit extends TranslationUnit {
  relative: JsonPath;
  invalidState: boolean;
}

export interface BaseEntry {
  id: string;
  fileName: string;
  key: string;
  comment: string;
  sourceLocale: string;
  source: string;
  translations: Record<string, TranslationUnit[]>;
  excluded: boolean;
}

export interface XcstringsEntry extends BaseEntry {
  format: 'xcstrings';
  sourceVariants: XcstringsUnit[];
  structures: Record<string, VariantStructure>;
  stale: boolean;
}

export interface JsonEntry extends BaseEntry {
  format: 'json';
  jsonPath: JsonPath;
  /** Present for source-backed entries; maps locales to their actual input filenames. */
  targetFiles?: Record<string, string>;
  /** Original source filename locale token, retained for missing-file destinations. */
  sourceFileToken?: string;
  /** Target-only keys are excluded from coverage and flagged for human inspection. */
  sourceMissing?: boolean;
}

export type AuditEntry = XcstringsEntry | JsonEntry;

export interface TranslationTarget {
  fileName: string;
  path?: readonly string[] | null;
  format?: CatalogFormat;
  key?: string;
  locale?: string | null;
  entryId?: string;
  /** False means the finding requires a manual edit, not a value-only repair. */
  fixable?: boolean;
}

export interface AuditIssue extends TranslationTarget {
  id: string;
  entryId: string;
  key: string;
  /** Null denotes a catalog-wide advisory such as a stale source string. */
  locale: string | null;
  severity: Severity;
  type: IssueType;
  title: string;
  message: string;
  source: string;
  value: string;
  path: JsonPath | null;
  format: CatalogFormat;
  fixable: boolean;
}

export interface LocaleStats {
  code: string;
  total: number;
  /** Entries with completed, nonempty translations that pass supported blocking checks. */
  translated: number;
  issues: number;
  /** Integer percentage from 0 through 100; not a measure of linguistic quality. */
  coverage: number;
}

export interface AuditSummary {
  entries: number;
  locales: number;
  issues: number;
  errors: number;
  warnings: number;
  /** Strings passing supported checks; zero when there are no target languages. */
  coverage: number;
}

export interface InputProblem {
  fileName: string;
  message: string;
}

export interface CatalogInfo {
  name: string;
  format: CatalogFormat;
  sourceLocale: string;
}

export interface AuditReport {
  entries: AuditEntry[];
  locales: LocaleStats[];
  issues: AuditIssue[];
  summary: AuditSummary;
  sourceLocale: string;
  sourceLocales: string[];
  /** Parsing and unsupported-input problems, separate from translation findings. */
  errors: InputProblem[];
  files: AnalyzedFile[];
  catalogs: CatalogInfo[];
}

export interface PlaceholderAnalysis {
  /** Sorted, unique argument identities; implicit printf arguments retain their positions. */
  tokens: string[];
  /** True for formats requiring manual review, including ICU and Apple substitutions. */
  unsupported: boolean;
}

/** Analyze in-memory files synchronously without modifying the inputs or accessing a network. */
export function auditFiles(files: readonly LocalizationFile[], options?: AuditOptions): AuditReport;

/**
 * Return copied files with one string value updated, preserving unrelated JSON properties.
 * Missing simple JSON locale files can be created. XCStrings string units and single-phrase sets
 * are marked translated. Editing one alternative in a multi-phrase set preserves its shared state.
 * Manual-only findings (fixable: false), invalid paths and conflicting non-string data throw.
 * Output is reserialized JSON; review the source-control diff before replacing original files.
 */
export function updateTranslation(files: readonly LocalizationFile[], target: TranslationTarget, value: string): LocalizationFile[];

/** Inspect common printf/Foundation and simple named placeholders; unsupported is advisory. */
export function placeholders(value?: unknown): PlaceholderAnalysis;
