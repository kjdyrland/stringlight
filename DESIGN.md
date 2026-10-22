# Stringlight design

A translation review desk for independent app makers. The main job is moving from an exact finding to a safe file correction.

Palette: porcelain #f5f7fb, paper #ffffff, ink #1c2941, workbench blue #2457e6, verified teal #158577, review amber #aa6a17, error red #cf4a54. The blue belongs to navigation and actions; diagnostic colors carry severity only.

Typography: the native system sans for navigation and reading, with native monospace only for keys and literal string values. A large compact heading gives the working surface a clear entry point. Labels use sentence case.

Layout: a quiet left navigation rail holds locales, a wide working surface holds summary and findings, and a contextual inspector holds the actual text. Align text left. A small multicolor translation motif is the identity; the data remains calm.

    rail       workspace / sample             import
    locales    Give every language the same care
               coverage across languages
               findings + filters        inspector
               exact strings             source / target

Review against the brief: retain a dense, useful working surface rather than a marketing page or repeated SaaS cards. Use the language coverage strip and paired source/target editor as the memorable subject-specific elements. Mobile navigation collapses; the inspector remains accessible below the selected finding. No external fonts or decorative network assets are needed.
