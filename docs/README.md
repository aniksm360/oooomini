# OmniBrowser Pro (v0.1 core)

## Get the Windows installer (.exe)
A) No tools needed: push this folder to a GitHub repo (keep `.github`), open Actions > "Build Windows installer" > Run workflow, download artifact `OmniBrowserPro-installer` (NSIS .exe).
B) On Windows with Node 20+: `npm install` then `npm run dist` -> `dist\OmniBrowser Pro Setup 0.1.0.exe`.
Dev run: `npm start`.
Unsigned installers trigger Windows SmartScreen; code signing is required for public distribution.

## Daily use
Install, launch from Start Menu or Desktop. Data lives in `%APPDATA%\OmniBrowserPro` (uninstall keeps it; delete the folder or use Settings > Reset).
Web dashboard: same UI at `http://127.0.0.1:17870` (this PC only); enter the admin or viewer token.

## Isolation
Each session = its own Chromium partition `persist:omni-NNN` (cookies, localStorage, sessionStorage, cache, history). No import of Chrome/Edge/Firefox/Windows accounts.
Sessions share this PC's network unless you give a session its own authorized proxy.

## Hardware
10 sessions: 4 cores/8 GB. 25: 8/16. 50: 16/32. 100: 32/64 or multiple machines. Defaults cap active sessions to half your cores (max 10).

## Acceptance checklist (run on Windows 10/11)
1 installs; 2 launches; 3 Start #1-#3, log in to a test site in #1, confirm #2 has no cookie; 4 Network tab shows IP and matches your IP lookup; 5 apply iPhone profile, page renders mobile; 6 Navigate/Reload/Stop on selection; 7 grid thumbnails update; 8 screenshot file appears in %APPDATA%\OmniBrowserPro\screenshots; 9 close and reopen, sessions config persists; 10 uninstall via Settings > Apps.

## Not yet built
React/TypeScript UI, Next.js dashboard, Playwright workflow builder (a basic QA check exists), PDF/CSV/Excel reports, screen recording, screenshot diff, MSI, auto-update (needs signed releases + host), per-user accounts (token roles admin/viewer only), tests.
