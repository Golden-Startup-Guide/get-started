# Security policy

## Supported versions

Only the latest release, the version served from the live site, receives
security fixes. The installed app updates itself, offering to reload when a new
version is ready.

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue, through
GitHub's private vulnerability reporting:
<https://github.com/Golden-Startup-Guide/get-started/security/advisories/new>.

Include what you found, how to reproduce it, and what it could let someone do.
You should get a reply within 7 days. Once a fix is released, the advisory is
published, with credit to you unless you prefer otherwise.

## Scope

The Personal Knowledge Library runs entirely in the browser and stores data only on the user's
device, so the most important risks are:

- running script inside the app (for example through Markdown, HTML, SVG,
  maths, or diagram content in a note, or through an imported file);
- reading or changing notes from another site or a malicious file;
- weaknesses in backups, imports, or the service worker;
- bypassing the Content Security Policy.

Out of scope: problems that need a compromised device or browser, or that
affect only the person who deliberately pasted untrusted content into their own
browser's developer tools.

## How the app protects itself

- A strict Content Security Policy: script only from the app itself, and no
  inline script, `eval`, or plugins.
- Markdown is rendered without raw HTML, and links with unsafe protocols (such
  as `javascript:`) are blanked. Maths refuses untrusted commands (KaTeX's
  `trust: false`), and diagrams use Mermaid's strict security level.
- HTML and SVG attachments can only be downloaded, never opened in the app's
  origin.
- Backups and imports are validated before anything is written.
- Dependencies are checked by `npm audit` in CI and kept up to date
  automatically.
