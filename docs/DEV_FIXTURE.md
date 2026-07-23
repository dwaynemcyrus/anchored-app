# Development fixture vault

Anchored opens a disposable 48-file fixture vault automatically in development
builds. It is designed for browser and desktop UI testing and is never used by
production builds.

The fixture covers Inbox, Scratchpad, Workbench, Archive, nested folders,
projects, reading notes, aliases, tags, timestamps, wikilinks, backlinks,
unresolved links, tasks, tables, callouts, Mermaid, math, code, and assets.

Run the native development app with:

```bash
npm run dev:tauri
```

For browser-only testing, run the Vite development server:

```bash
npm run dev -- --host 127.0.0.1
```

The native app copies the checked-in files into an isolated application cache
directory. The browser uses an in-memory copy. Both reset to the checked-in
fixture whenever the development app starts or the browser page reloads, so
experiments never modify the repository fixture or a real vault.
