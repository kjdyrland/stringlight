import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CircleX, Code2, FileCheck2, FileJson2, Files, FolderOpen, Globe2, Languages, LayoutDashboard, LockKeyhole, Menu, MessageSquareText, Plus, Search, ShieldCheck, Sparkles, TriangleAlert, Upload, X } from 'lucide-react';
import { auditFiles, updateTranslation } from './audit.js';
import { editorContext } from './editor.js';
import { DEMO_FILES, DEMO_NAME } from './demo.js';

const STORAGE_KEY = 'stringlight.workspace.v1';
const MAX_BYTES = 12 * 1024 * 1024;
const freshDemo = () => ({ version: 1, name: DEMO_NAME, demo: true, files: DEMO_FILES, sourceLocale: 'en', targetLocales: [], edits: 0 });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
function languageName(code) { try { return languageNames.of(code) || code; } catch { return code; } }
function jsonLocale(name) {
  const match = name.match(/(?:^|\.)([a-z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*)\.json$/i);
  if (!match) return null;
  try { return Intl.getCanonicalLocales(match[1].replaceAll('_', '-'))[0]; } catch { return match[1]; }
}
function startWorkspace() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    const data = JSON.parse(raw);
    if (data?.version === 1 && typeof data.name === 'string' && Array.isArray(data.files) && data.files.length && data.files.length <= 30 && data.files.every(f => typeof f.name === 'string' && typeof f.text === 'string') && data.files.reduce((n, f) => n + f.text.length, 0) < MAX_BYTES) return { ...data, targetLocales: Array.isArray(data.targetLocales) ? data.targetLocales : [], edits: Number(data.edits) || 0 };
  } catch { /* A corrupt or unavailable local draft should not prevent first use. */ }
  return { ...freshDemo(), ...(raw ? { recoveryData: raw } : {}) };
}
function markdownText(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]!?])/g, '\\$1'); }
function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Logo({ small = false }) { return <span className={`logo ${small ? 'small' : ''}`} aria-hidden="true"><i /><i /><i /><b /></span>; }
function SeverityIcon({ severity, size = 17 }) {
  return severity === 'error' ? <CircleX size={size} /> : severity === 'warning' ? <TriangleAlert size={size} /> : <MessageSquareText size={size} />;
}
function Badge({ severity, children }) { return <span className={`badge ${severity || ''}`}>{children}</span>; }
function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(node => !node.disabled);
    (focusables()[0] || el).focus();
    function key(event) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const nodes = focusables();
        if (!nodes.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={ref} tabIndex={-1} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}</section></div>;
}

export default function App() {
  const [workspace, setWorkspace] = useState(startWorkspace);
  const [view, setView] = useState('findings');
  const [locale, setLocale] = useState('all');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [staged, setStaged] = useState([]);
  const [importError, setImportError] = useState('');
  const [importSource, setImportSource] = useState('en');
  const [reading, setReading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [targetCode, setTargetCode] = useState('');
  const input = useRef(null);
  const searchInput = useRef(null);
  const toastTimer = useRef(null);
  const report = useMemo(() => auditFiles(workspace.files, { sourceLocale: workspace.sourceLocale, targetLocales: workspace.targetLocales }), [workspace.files, workspace.sourceLocale, workspace.targetLocales]);
  const locales = report.locales || [];
  const issues = [...(report.issues || [])].sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]));
  const entries = report.entries || [];
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const suggestions = issues.filter(i => i.severity === 'info').length;
  const coverage = report.summary.coverage || 0;
  const filteredIssues = issues.filter(i => (locale === 'all' || i.locale === locale) && (severity === 'all' || i.severity === severity) && `${i.key} ${i.source} ${i.value} ${i.title} ${i.fileName} ${markdownText(i.locale)}`.toLowerCase().includes(search.toLowerCase()));
  const filteredEntries = entries.filter(e => !e.excluded && `${e.key} ${e.source} ${e.fileName}`.toLowerCase().includes(search.toLowerCase()));
  const issue = view === 'findings' ? filteredIssues.find(i => i.id === selectedId) || filteredIssues[0] : null;
  const entry = issue ? entries.find(e => e.id === issue.entryId) : view === 'strings' ? filteredEntries.find(e => e.id === selectedEntryId) || filteredEntries[0] : null;

  function notify(message) { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(''), 4200); }
  useEffect(() => {
    if (workspace.recoveryData) { setStorageError(true); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [workspace]);
  useEffect(() => {
    function key(e) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !modal) { e.preventDefault(); searchInput.current?.focus(); }
      if (e.key === 'Escape') setMobileNav(false);
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); clearTimeout(toastTimer.current); };
  }, [modal]);
  function navigate(next, nextLocale = 'all') { setView(next); setLocale(nextLocale); setSearch(''); setSeverity('all'); setMobileNav(false); }
  function openImport() { setStaged([]); setImportError(''); setImportSource('en'); setModal('import'); }
  function inspect(id, kind) {
    if (kind === 'string') setSelectedEntryId(id); else setSelectedId(id);
    if (window.matchMedia('(max-width: 860px)').matches) requestAnimationFrame(() => {
      const detail = document.querySelector('.inspector');
      detail?.focus({ preventScroll: true });
      detail?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
  }
  async function stageFiles(fileList) {
    const files = [...fileList]; setImportError('');
    if (!files.length) return;
    if (files.length > 30) { setImportError('Choose up to 30 files at a time.'); return; }
    if (files.some(f => !/\.(xcstrings|json)$/i.test(f.name))) { setImportError('Choose Apple .xcstrings catalogs or locale .json files.'); return; }
    if (new Set(files.map(f => f.name)).size !== files.length) { setImportError('Each file needs a unique name. Rename duplicate files before importing.'); return; }
    if (files.some(f => f.size > 6 * 1024 * 1024) || files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) { setImportError('Keep each file under 6 MB and the workspace under 12 MB.'); return; }
    setReading(true);
    try {
      const values = await Promise.all(files.map(async f => ({ name: f.name, text: await f.text() })));
      const jsonLocales = values.filter(f => /\.json$/i.test(f.name)).map(f => jsonLocale(f.name)).filter(Boolean);
      const source = jsonLocales.includes('en') || !jsonLocales.length ? 'en' : jsonLocales[0];
      setImportSource(source); setStaged(values);
    } catch { setImportError('This file could not be read. Choose a local copy and try again.'); }
    finally { setReading(false); }
  }
  function finishImport() {
    try {
      const result = auditFiles(staged, { sourceLocale: importSource });
      if (result.errors?.length) { setImportError(result.errors.map(e => `${e.fileName}: ${e.message}`).join('\n')); return; }
      if (!result.entries?.length) { setImportError('No string entries were found. Use a string catalog or locale JSON with text values.'); return; }
      setWorkspace({ version: 1, name: staged.length === 1 ? staged[0].name.replace(/\.(xcstrings|json)$/i, '') : 'My translations', demo: false, files: staged, sourceLocale: importSource, targetLocales: [], edits: 0 });
      navigate('findings'); setSelectedId(null); setModal(null); notify(`${staged.length} ${staged.length === 1 ? 'file' : 'files'} imported. Your review is ready.`);
    } catch (error) { setImportError(error.message || 'Unable to inspect this catalog. Check its JSON structure.'); }
  }
  function saveTranslation(target, value) {
    try {
      const files = updateTranslation(workspace.files, target, value);
      const check = auditFiles(files, { sourceLocale: workspace.sourceLocale, targetLocales: workspace.targetLocales });
      if (check.errors?.length) throw new Error(check.errors[0].message);
      setWorkspace(w => ({ ...w, files, edits: w.edits + 1 }));
      notify('Translation saved. Checks updated.');
    } catch (error) { notify(`Could not save: ${error.message}`); }
  }
  function exportReport(format) {
    const date = new Date().toISOString();
    if (format === 'json') download('stringlight-report.json', JSON.stringify({ product: 'Stringlight', generatedAt: date, workspace: workspace.name, demo: workspace.demo, summary: report.summary, locales, issues, limitations: 'Static checks do not establish linguistic quality, runtime layout, or release readiness.' }, null, 2));
    else {
      const text = [`# ${markdownText(workspace.name)} — localization review`, '', `Generated by Stringlight on ${date}. ${workspace.demo ? 'Sample workspace.' : ''}`, '', `${entries.filter(e => !e.excluded).length} strings · ${locales.length} target locales · ${coverage}% strings passing checks`, `${errors} errors · ${warnings} warnings · ${suggestions} suggestions`, '', '## Findings', '', ...issues.flatMap(i => [`### ${i.severity.toUpperCase()}: ${i.title}`, `- File: ${markdownText(i.fileName)}`, `- Key: ${markdownText(JSON.stringify(i.key))}`, `- Locale: ${markdownText(i.locale)}`, `- Path: ${markdownText(JSON.stringify(i.path))}`, `- Source: ${markdownText(JSON.stringify(i.source))}`, `- Translation: ${markdownText(JSON.stringify(i.value))}`, `- Detail: ${markdownText(i.message)}`, `- ID: ${i.id}`, '']), '## Scope', '', 'Static checks cannot establish linguistic quality, runtime layout, or release readiness. Review plural/device variants and supported placeholder conventions in Xcode before shipping.'].join('\n');
      download('stringlight-report.md', text, 'text/markdown');
    }
    notify('Report exported with all findings.');
  }
  function addLocale(e) {
    e.preventDefault();
    let code;
    try { code = Intl.getCanonicalLocales(targetCode.trim())[0]; if (!code) throw new Error(); }
    catch { notify('Enter a language code such as de, pt-BR, or zh-Hans.'); return; }
    if (locales.some(l => l.code.toLowerCase() === code.toLowerCase()) || code === report.sourceLocale) { notify('That language is already in the workspace.'); return; }
    setWorkspace(w => ({ ...w, targetLocales: [...w.targetLocales, code] })); setTargetCode(''); setModal(null); notify(`${languageName(code)} added to your checks.`);
  }

  return <div className="app-shell">
    {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('findings'); }}><Logo /><span>stringlight<span className="brand-dot">.</span></span></a>
      <button className="workspace-switch" onClick={() => setModal('workspace')}><span className="workspace-avatar">{(workspace.name || 'W').slice(0, 1).toUpperCase()}</span><span><strong>{workspace.name}</strong><small>{workspace.demo ? 'Sample workspace' : 'Local workspace'}</small></span><ChevronDown size={15} /></button>
      <div className="nav-label">Workspace</div>
      <nav className="primary-nav" aria-label="Workspace">
        <button className={view === 'findings' && locale === 'all' ? 'active' : ''} onClick={() => navigate('findings')}><LayoutDashboard size={18} />Overview<span className="nav-count">{issues.length}</span></button>
        <button className={view === 'strings' ? 'active' : ''} onClick={() => navigate('strings')}><Languages size={19} />All strings</button>
        <button className={view === 'files' ? 'active' : ''} onClick={() => navigate('files')}><Files size={18} />Project files<span className="quiet-count">{workspace.files.length}</span></button>
      </nav>
      <div className="nav-label languages-label"><span>Languages</span><button className="mini-button" title="Add a language to check" aria-label="Add a language to check" onClick={() => setModal('locale')}><Plus size={16} /></button></div>
      <nav className="locale-nav" aria-label="Languages">
        <div className="source-locale"><span className="locale-symbol source">{(report.sourceLocale || 'en').slice(0, 2)}</span><span>{languageName(report.sourceLocale || 'en')}<small>Source language</small></span><Check size={14} /></div>
        {locales.map(l => <button key={l.code} className={locale === l.code ? 'selected' : ''} onClick={() => navigate('findings', l.code)}><span className={`locale-symbol ${l.coverage === 100 ? 'complete' : ''}`}>{l.code.slice(0, 2)}</span><span className="locale-name">{languageName(l.code)}<span className="tiny-progress"><i style={{ width: `${l.coverage}%` }} /></span></span><span className="locale-percent">{l.coverage}%</span></button>)}
      </nav>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={19} /><div><strong>Private by design</strong><span>Your strings stay in this browser.</span></div></div><button className="help-link" onClick={() => setModal('help')}><CircleHelp size={17} />A little guidance<ArrowUpRight size={14} /></button><div className="version-line"><Logo small /><span>Made for the finishing touches</span></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21} /></button><FolderOpen size={16} /><span>{workspace.name}</span><ChevronRight size={14} /><strong>{view === 'files' ? 'Project files' : view === 'strings' ? 'All strings' : locale !== 'all' ? languageName(locale) : 'Overview'}</strong></div><div className="topbar-actions"><span className="local-pill"><span />{storageError ? 'Not saved' : 'Saved locally'}</span><button className="icon-button" onClick={() => setModal('help')} aria-label="Help and privacy"><CircleHelp size={19} /></button></div></header>
      {storageError && <div className="storage-warning" role="alert"><TriangleAlert size={17} />{workspace.recoveryData ? 'A saved draft could not be restored. It has been preserved. Open Your workspace to download a recovery copy.' : 'Browser storage is unavailable or full. Export your files before closing this page.'}</div>}
      <div className="main-inner">
        {workspace.demo && <div className="demo-banner"><span><Sparkles size={15} /><strong>You’re exploring a sample.</strong><span>Try a fix, or bring your own strings.</span></span><button onClick={openImport}>Import your files<ArrowRight size={15} /></button></div>}
        <section className="page-heading"><div><div className="heading-kicker"><span className="blue-line" />Your localization workbench</div><h1>{view === 'files' ? 'Good things, in your files.' : view === 'strings' ? 'Every string has a story.' : locale !== 'all' ? `A closer look at ${languageName(locale)}.` : <>Give every language<br />the same care.</>}</h1><p>{view === 'files' ? 'Inspect, back up, and take your work with you.' : view === 'strings' ? 'Find a key. Read the context. Make it feel right.' : 'Catch the small things before they become someone’s first impression.'}</p></div><div className="heading-actions"><button className="button secondary" onClick={() => setModal('export')}><ArrowDownToLine size={16} />Export</button><button className="button primary" onClick={openImport}><Plus size={17} />Import files</button></div></section>

        {view !== 'files' && <section className="summary-strip" aria-label="Review summary"><div className="coverage-summary"><div className="coverage-ring" style={{ '--coverage': `${coverage * 3.6}deg` }}><span>{coverage}<small>%</small></span></div><div><strong>Strings passing checks</strong><p>{entries.filter(e => !e.excluded).length} strings across {locales.length} target {locales.length === 1 ? 'language' : 'languages'}</p><span className="coverage-footnote">Includes state and placeholder checks</span></div></div><div className="summary-stat error"><span><CircleX size={16} />Errors</span><strong>{errors}<small>need a fix</small></strong></div><div className="summary-stat warning"><span><TriangleAlert size={16} />Warnings</span><strong>{warnings}<small>need a look</small></strong></div><div className="summary-stat info"><span><MessageSquareText size={16} />Suggestions</span><strong>{suggestions}<small>worth a review</small></strong></div></section>}

        {view !== 'files' && <div className="language-strip"><button className={locale === 'all' ? 'active' : ''} onClick={() => setLocale('all')}><Globe2 size={15} />All languages</button>{locales.map(l => <button key={l.code} className={locale === l.code ? 'active' : ''} onClick={() => setLocale(l.code)}>{languageName(l.code)}<span className={l.issues ? 'language-dot' : 'language-dot done'} />{l.issues > 0 && <small>{l.issues}</small>}</button>)}<button className="add-language" onClick={() => setModal('locale')} aria-label="Add target language"><Plus size={16} /></button></div>}

        {view === 'files' ? <section className="files-panel"><div className="panel-heading"><div><h2>Your project files</h2><p>{workspace.edits || 0} saved {workspace.edits === 1 ? 'edit' : 'edits'} in this workspace. Downloads include your changes.</p></div><span className="badge neutral">{workspace.files.length} files</span></div>{workspace.files.map(file => <div className="file-row" key={file.name}><div className="file-icon"><FileJson2 size={24} /></div><div><strong>{file.name}</strong><span>{file.name.endsWith('.xcstrings') ? 'Apple string catalog' : 'JSON translations'} · {(new TextEncoder().encode(file.text).length / 1024).toFixed(1)} KB</span></div><button className="button secondary" onClick={() => { download(file.name, file.text); notify(`${file.name} downloaded.`); }}><ArrowDownToLine size={16} />Download</button></div>)}<div className="file-tip"><LockKeyhole size={18} /><p>These are local copies. Your original files are unchanged until you replace them with a download. Clearing browser data removes this workspace.</p></div></section> : <section className="review-panel">
          <div className="review-toolbar"><div className="view-tabs" role="group" aria-label="Review view"><button className={view === 'findings' ? 'active' : ''} onClick={() => setView('findings')}>Findings<span>{issues.filter(i => locale === 'all' || i.locale === locale).length}</span></button><button className={view === 'strings' ? 'active' : ''} onClick={() => setView('strings')}>All strings<span>{entries.filter(e => !e.excluded).length}</span></button></div><div className="review-filters"><label className="search-field"><Search size={16} /><input ref={searchInput} aria-label="Search strings and findings" placeholder="Find a string…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>/</kbd></label>{view === 'findings' && <label className="severity-select"><span className="sr-only">Filter priority</span><select value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">All priorities</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Suggestions</option></select><ChevronDown size={14} /></label>}</div></div>
          <div className="review-grid"><div className="findings-list"><div className="list-heading"><span>{view === 'findings' ? 'String / finding' : 'String / source text'}</span><span>{view === 'findings' ? 'Language' : 'Translations'}</span></div>
            {view === 'findings' ? filteredIssues.length ? filteredIssues.map(i => <button key={i.id} className={`issue-row ${issue?.id === i.id ? 'selected' : ''}`} onClick={() => inspect(i.id, 'finding')}><span className={`issue-symbol ${i.severity}`}><SeverityIcon severity={i.severity} /></span><span className="issue-text"><strong>{i.title}</strong><code title={i.key}>{i.key || '(empty key)'}</code><span>{i.source}</span></span><span className="locale-tag" title={i.locale ? languageName(i.locale) : 'Catalog-wide finding'}>{i.locale || 'Catalog'}</span><ChevronRight size={15} className="row-chevron" /></button>) : <EmptyState filtered={!!search || severity !== 'all'} onClear={() => { setSearch(''); setSeverity('all'); }} /> : filteredEntries.length ? filteredEntries.map(e => <button className={`issue-row string-row ${entry?.id === e.id ? 'selected' : ''}`} key={e.id} onClick={() => inspect(e.id, 'string')}><span className="issue-symbol string"><Code2 size={17} /></span><span className="issue-text"><strong>{e.key || '(empty key)'}</strong><span>{e.source}</span><code>{e.fileName}</code></span><span className="string-count">{Object.keys(e.translations).filter(c => c !== e.sourceLocale && e.translations[c].length > 0).length}<Languages size={14} /></span><ChevronRight size={15} className="row-chevron" /></button>) : <EmptyState filtered onClear={() => setSearch('')} />}
            <div className="list-footer"><span>{view === 'findings' ? `${filteredIssues.length} of ${issues.length} findings` : `${filteredEntries.length} strings`}</span><span><ShieldCheck size={13} />Checked on your device</span></div></div>
            <Inspector key={`${issue?.id || entry?.id || 'empty'}-${locale}`} issue={issue} entry={entry} locales={locales} activeLocale={locale} onSave={saveTranslation} />
          </div>
        </section>}
        <footer className="page-footer"><span><LockKeyhole size={13} />No uploads. No accounts. Just your words.</span><button onClick={() => setModal('help')}>What these checks cover<ArrowUpRight size={13} /></button></footer>
      </div>
    </main>
    {toast && <div className="toast" role="status"><CheckCheck size={18} />{toast}</div>}

    {modal === 'import' && <Modal title="Bring your own strings" onClose={() => setModal(null)} wide><p className="modal-intro">Open your translation files for a private, instant review. Importing starts a new workspace; download any current edits first.</p><input ref={input} type="file" className="sr-only" multiple accept=".xcstrings,.json" onChange={e => stageFiles(e.target.files)} /><button className="dropzone" disabled={reading} onClick={() => input.current.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); stageFiles(e.dataTransfer.files); }}><span className="upload-icon"><Upload size={27} /></span><strong>{reading ? 'Reading your files…' : 'Drop your files here, or browse'}</strong><span>.xcstrings or .json · up to 30 files · 6 MB each</span></button>{staged.length > 0 && <div className="staged-files">{staged.map(f => <div key={f.name}><FileJson2 size={17} /><span>{f.name}</span><Check size={16} /></div>)}</div>}{staged.some(f => /\.json$/i.test(f.name)) && <label className="form-label">JSON source language<select value={importSource} onChange={e => setImportSource(e.target.value)}>{staged.filter(f => /\.json$/i.test(f.name)).map(f => <option key={f.name} value={jsonLocale(f.name) || f.name}>{jsonLocale(f.name) || f.name}</option>)}</select></label>}{importError && <div className="form-error" role="alert"><TriangleAlert size={17} /><span>{importError}</span></div>}<div className="format-guidance"><div><span className="format-icon"><Code2 size={18} /></span><div><strong>Apple string catalogs</strong><p>One .xcstrings file includes its languages and source text.</p></div></div><div><span className="format-icon"><FileJson2 size={18} /></span><div><strong>JSON translations</strong><p>One file per language, named en.json, fr.json, and so on. Nested objects are welcome.</p></div></div></div><div className="modal-footer"><span><LockKeyhole size={14} />Files never leave your browser</span><button className="button primary" onClick={finishImport} disabled={!staged.length || reading}>Open workspace<ArrowRight size={16} /></button></div></Modal>}
    {modal === 'export' && <Modal title="Take your work with you" onClose={() => setModal(null)}><p className="modal-intro">Download corrected files to use in your project, or share a report with your team. Reports include every finding, regardless of filters.</p><div className="export-section"><h3>Translation files</h3>{workspace.files.map(f => <button className="export-row" key={f.name} onClick={() => { download(f.name, f.text); notify(`${f.name} downloaded.`); }}><FileJson2 size={21} /><span><strong>{f.name}</strong><small>Original structure, with your saved edits</small></span><ArrowDownToLine size={18} /></button>)}</div><div className="export-section"><h3>Full review report</h3><button className="export-row" onClick={() => exportReport('markdown')}><FileCheck2 size={21} /><span><strong>Readable report</strong><small>Markdown · source, translations, and exact findings</small></span><ArrowDownToLine size={18} /></button><button className="export-row" onClick={() => exportReport('json')}><Code2 size={21} /><span><strong>Structured report</strong><small>JSON · deterministic issue IDs and paths</small></span><ArrowDownToLine size={18} /></button></div><div className="file-tip"><ShieldCheck size={18} /><p>Keep a downloaded copy. Browser storage is local to this browser and can be cleared.</p></div></Modal>}
    {modal === 'help' && <Modal title="A little guidance" onClose={() => setModal(null)} wide><div className="help-content"><p className="modal-intro">Stringlight is a second pair of eyes for your translation files. It checks structure and consistency, so you can spend more time on the words.</p><div className="help-step"><span>1</span><div><h3>Bring your strings</h3><p>Import an Apple .xcstrings catalog, or select source and target JSON files named with language codes, such as en.json and nb.json. Each string table stays separate.</p></div></div><div className="help-step"><span>2</span><div><h3>Follow the findings</h3><p>Errors highlight missing or empty text and incompatible placeholders. Warnings flag translation states and unsupported structures. Suggestions invite a human review. Matching source text can be perfectly valid.</p></div></div><div className="help-step"><span>3</span><div><h3>Fix, then export</h3><p>Save an edit in the inspector, then download your corrected file. Existing metadata is preserved. Check the result in your app before replacing project files.</p></div></div><div className="help-callout"><ShieldCheck size={22} /><div><h3>Your strings stay with you</h3><p>Parsing, checks, edits, and downloads happen in your browser. This app has no upload endpoint, analytics, remote fonts, or AI service. Your current workspace is saved in local browser storage. Hosting may retain ordinary page-request logs.</p></div></div><h3>What a green check cannot tell you</h3><p>Coverage measures translation presence and state. Static checks cannot judge language quality, text truncation, cultural fit, or whether an app is ready for review. Complex ICU messages and unsupported catalog structures are flagged for manual review. Plural categories depend on language; this is not an Xcode compiler.</p><p className="help-source">Built around <a href="https://developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog" target="_blank" rel="noreferrer">Apple’s string catalog guidance<ArrowUpRight size={12} /></a>.</p></div></Modal>}
    {modal === 'workspace' && <Modal title="Your workspace" onClose={() => setModal(null)}><p className="modal-intro">One workspace is saved in this browser. Export your files before starting another.</p><label className="form-label">Workspace name<input maxLength={60} value={workspace.name} onChange={e => setWorkspace(w => ({ ...w, name: e.target.value }))} /></label><div className="workspace-options">{workspace.recoveryData && <button className="button secondary" onClick={() => download('stringlight-recovered-draft.json', workspace.recoveryData)}>Download recovery copy</button>}<button className="button primary" onClick={openImport}><Plus size={16} />Import a new workspace</button><button className="button secondary" onClick={() => setModal('reset')}><Sparkles size={16} />Reset to sample</button></div></Modal>}
    {modal === 'reset' && <Modal title="Start fresh with the sample?" onClose={() => setModal(null)}><p className="modal-intro">This replaces the saved workspace in this browser. Download your current files from Export if you want to keep them.</p><div className="workspace-options"><button className="button secondary" onClick={() => setModal('export')}>Export current files</button><button className="button primary" onClick={() => { setWorkspace(freshDemo()); navigate('findings'); setModal(null); notify('Sample workspace restored.'); }}>Reset to sample</button></div></Modal>}
    {modal === 'locale' && <Modal title="Check another language" onClose={() => setModal(null)}><p className="modal-intro">Add a target language to find strings that still need a translation. It will appear in downloaded files once you save a translation for it.</p><form onSubmit={addLocale}><label className="form-label">Language code<input autoCapitalize="none" autoComplete="off" maxLength={30} placeholder="For example, de or pt-BR" value={targetCode} onChange={e => setTargetCode(e.target.value)} required /></label><div className="modal-footer"><span>Use a standard BCP 47 language code.</span><button className="button primary" type="submit"><Plus size={16} />Add language</button></div></form></Modal>}
  </div>;
}

function EmptyState({ filtered, onClear }) { return <div className="empty-state"><span className="empty-icon">{filtered ? <Search size={28} /> : <Check size={29} />}</span><h3>{filtered ? 'Nothing matches just yet.' : 'A little more peace of mind.'}</h3><p>{filtered ? 'Try a different string or clear your filters.' : 'No findings in this view. A human review and a check in your app are still good ideas.'}</p>{filtered && <button className="button secondary" onClick={onClear}>Clear filters</button>}</div>; }

function Inspector({ issue, entry, locales, activeLocale, onSave }) {
  const [targetLocale, setTargetLocale] = useState(issue?.locale || (activeLocale !== 'all' ? activeLocale : locales[0]?.code) || '');
  const units = entry?.translations?.[targetLocale] || [];
  const [unitIndex, setUnitIndex] = useState(() => Math.max(0, units.findIndex(u => JSON.stringify(u.path) === JSON.stringify(issue?.path))));
  const unit = units[unitIndex];
  const original = unit?.value ?? (issue?.locale === targetLocale ? issue.value : '') ?? '';
  const [value, setValue] = useState(original);
  useEffect(() => { setValue(unit?.value ?? ''); }, [targetLocale, unitIndex, entry]);
  if (!entry) return <aside className="inspector empty-inspector"><div className="inspector-top"><span className="inspector-icon"><Languages size={21} /></span><strong>The details matter.</strong></div><p>Select a finding or a string to compare its source and translation here.</p><div className="quiet-illustration" aria-hidden="true"><span>Hello</span><span>Bonjour</span><span>こんにちは</span></div></aside>;
  const { target, fixable, source: shownSource } = editorContext(entry, targetLocale, unit, issue);
  const changed = value !== original;
  return <aside className="inspector" tabIndex={-1} aria-label="Selected string detail"><button className="back-to-findings" onClick={() => document.querySelector('.review-panel')?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})}><ArrowLeft size={14} />Back to review</button><div className="inspector-top"><span className="inspector-icon"><Languages size={20} /></span><strong>String detail</strong><span className="inspector-shortcut">Aa</span></div>{issue && <div className={`finding-callout ${issue.severity}`}><div><SeverityIcon severity={issue.severity} size={16} /><strong>{issue.title}</strong></div><p>{issue.message}</p></div>}<div className="detail-key"><span className="field-caption">String key</span><code>{entry.key || '(empty key)'}</code><span className="detail-file"><FileJson2 size={12} />{entry.fileName}</span></div>{entry.comment && <p className="translator-comment"><MessageSquareText size={14} />{entry.comment}</p>}<div className="source-block"><div className="text-label"><span>Source</span><span>{languageName(entry.sourceLocale)}</span></div><p dir="auto">{shownSource}</p></div><div className="target-block"><div className="text-label"><label htmlFor="target-language">Translation</label><select id="target-language" value={targetLocale} onChange={e => { setTargetLocale(e.target.value); setUnitIndex(0); }}>{locales.map(l => <option key={l.code} value={l.code}>{languageName(l.code)}</option>)}</select></div>{units.length > 1 && <label className="variant-select"><span>Variant</span><select aria-label="Translation variant" value={unitIndex} onChange={e => setUnitIndex(Number(e.target.value))}>{units.map((u, i) => <option key={i} value={i}>{u.label || `Variant ${i + 1}`}</option>)}</select></label>}<textarea aria-label="Translation text" dir="auto" value={value} placeholder="Add the translation…" onChange={e => setValue(e.target.value)} readOnly={!fixable} rows={4} /><div className="editor-meta"><span>{unit?.state ? String(unit.state).replace(/_/g, ' ') : value ? 'Imported text' : 'Missing translation'}</span><span>{[...value].length} characters</span></div><button className="button primary save-button" disabled={!fixable || !value.trim() || (!changed && !(entry.format === 'xcstrings' && unit?.state && unit.state !== 'translated'))} onClick={() => onSave(target, value)}><Check size={16} />Save translation</button><p className="edit-note">{!fixable ? 'Review this structure in your project’s editor.' : 'Saved to your browser. Export to update your project.'}</p></div><div className="inspector-tip"><span className="tip-icon"><CircleHelp size={16} /></span><p>Keep placeholders such as <code>%@</code> and <code>{'{name}'}</code> intact. They become real values in your app.</p></div></aside>;
}
