# Security policy

Security fixes target the current `0.1.x` release line. Upgrade to the latest available patch in that line; development snapshots are not a separate supported release.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/kjdyrland/stringlight/security/advisories/new) to send a report to the repository maintainers. Include the affected version, impact, reproduction steps, and a minimal synthetic file when appropriate.

If private reporting is unavailable, open a [public issue](https://github.com/kjdyrland/stringlight/issues) requesting a private reporting channel **without including vulnerability details or sensitive data**. Do not post private translations, credentials, exploit payloads containing personal information, or private application files.

Please allow the maintainer time to investigate and coordinate a fix before public disclosure. This volunteer project does not promise a specific response time or operate a paid bug bounty.

## Data handling and scope

Browser auditing happens locally, and the CLI/library do not upload localization contents. A hosted copy may generate ordinary web-server request logs. One browser workspace is saved in local storage, which is not encrypted storage or a backup. Shared devices and browser extensions can affect the confidentiality of local data.

Downloaded localization files and audit reports may contain private text. Treat them as project data. The CLI reads explicit input paths and writes reports only through `--out`; the library returns file contents and leaves filesystem writes to its caller.

Useful security reports include imported text executing as code, unexpected network transmission, prototype pollution, unintended file modification, or malicious input escaping the documented local processing boundary. A false-positive finding or unsupported message format is normally a regular bug; disclose privately if it creates a security impact.

Stringlight performs static checks. A passing audit does not establish that an application is secure, correctly localized, or ready for release.
