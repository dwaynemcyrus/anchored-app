# Shell Overlay Layer Build Spec (PWA / iOS Safari Safe)
version: v1.0
status: ready
scope: Shell header + FAB live on an overlay layer above scrollable content. Body is locked. Single internal scroller. Keyboard-safe via dvh + VisualViewport “truth source”.

---

## 0) Goals
- Fixed “shell” that never page-scrolls.
- Exactly one scroll container for content (single-column).
- Header + FAB are rendered in an overlay layer above content (not inside the scroller).
- On iOS Safari, keyboard open/close must not break layout; focused inputs must remain reachable.
- No Tailwind. Use descriptive CSS Modules. (Radix primitives only if needed.)

Non-goals (for this spec):
- Supabase/data syncing.
- Rich editor details (handled in editor spec).
- Complex animations beyond basic transitions.

---

## 1) Layout Contract (DOM)
Root structure (conceptual):

<AppShell>
  <div class="shell" data-shell-root>
    <div class="contentViewport" data-content-viewport>
      <main class="contentScroller" data-content-scroller>
        {page content}
      </main>
    </div>

    <!-- Overlay layer sits ABOVE content -->
    <div class="overlayLayer" data-overlay-layer aria-hidden="false">
      <header class="shellHeader" data-shell-header>
        {back button} {context indicator} {actions}
      </header>

      <button class="fab" data-fab>
        {tap = quick capture, hold = mode switch}
      </button>
    </div>
  </div>
</AppShell>

Rules:
- `contentScroller` is the ONLY scrollable element.
- `overlayLayer` does not scroll and must not intercept scroll gestures except where interactive.
- Header and FAB are above content visually (z-index), but content must have padding so text never hides under header/FAB.

---

## 2) CSS Contract (Core)
### 2.1 Lock the page
- Prevent Safari “page scroll” / rubber-banding on `body`.

Requirements:
- `html, body` set to full height and overflow hidden.
- On iOS, avoid `position: fixed` on `body` unless needed; prefer overflow lock + internal scroller.

### 2.2 Shell sizing (use dvh)
- Shell uses dynamic viewport height to react to browser UI + keyboard.

Requirements:
- shell height uses `100dvh` with fallback to `100vh`.
- No `100vh`-only layouts.

### 2.3 Internal scroller
- `contentScroller` uses `overflow: auto` and iOS momentum scrolling.

Requirements:
- `-webkit-overflow-scrolling: touch`
- `overscroll-behavior: contain`
- scroll container uses `scrollbar-gutter: stable` if supported (optional).

### 2.4 Overlay layer
- `overlayLayer` is positioned above content using `position: absolute` or `fixed` within shell.
- Overlay must allow pointer events for header/FAB, but should not block scrolling elsewhere.

Requirements:
- overlay uses `pointer-events: none`
- header + fab re-enable pointer events with `pointer-events: auto`
- z-index ordering: overlay > content.

### 2.5 Safe padding
- Content must be padded so that:
  - top content never hides behind header
  - bottom content never hides behind FAB
  - bottom padding adapts for keyboard when needed (JS section)

---

## 3) CSS Modules (Reference Implementation)
Create: `AppShell.module.css`

Required class behaviors:

- `.shell`
  - `height: 100dvh; height: 100vh;`
  - `display: block; position: relative; overflow: hidden;`

- `.contentViewport`
  - `height: 100%; position: relative;`

- `.contentScroller`
  - `height: 100%; overflow: auto;`
  - `-webkit-overflow-scrolling: touch;`
  - `overscroll-behavior: contain;`
  - `padding-top: var(--shell-header-h);`
  - `padding-bottom: calc(var(--shell-fab-safe) + var(--shell-keyboard-inset));`

- `.overlayLayer`
  - `position: absolute; inset: 0;`
  - `z-index: 20;`
  - `pointer-events: none;`

- `.shellHeader`
  - `position: absolute; top: 0; left: 0; right: 0;`
  - `height: var(--shell-header-h);`
  - `pointer-events: auto;`
  - (visual styling handled elsewhere)

- `.fab`
  - `position: absolute; right: var(--shell-fab-x); bottom: var(--shell-fab-y);`
  - `pointer-events: auto;`
  - `touch-action: manipulation;`

Global lock (add to global CSS):
- `html, body { height: 100%; overflow: hidden; }`

Required CSS variables (defaults):
- `--shell-header-h: 56px;` (tune per design)
- `--shell-fab-safe: 96px;` (space to avoid hiding last lines)
- `--shell-fab-x: 16px;`
- `--shell-fab-y: 16px;`
- `--shell-keyboard-inset: 0px;` (JS will update)

---

## 4) JavaScript “Truth Source” (VisualViewport)
### 4.1 Why
On iOS Safari:
- CSS `100vh` can lie.
- Keyboard shrinks the *visual viewport* but not always the *layout viewport*.
- We treat `window.visualViewport.height` as the source of truth when CSS isn’t enough.

### 4.2 Responsibilities
JS must:
1) Track visible viewport height changes.
2) Compute “keyboard inset” = how much vertical space is lost when keyboard is open.
3) Apply that inset to `--shell-keyboard-inset` so content padding + FAB positioning remain usable.
4) Ensure focused inputs stay visible inside `contentScroller`.

### 4.3 Events to listen to
- `visualViewport.resize`
- `visualViewport.scroll`
Fallback:
- `window.resize` (for non-supporting browsers)

---

## 5) JS Implementation Spec
Create: `useVisualViewportInsets.ts` (or similar hook)

Inputs:
- `shellRootEl` (or documentElement)
- `contentScrollerEl`

Outputs (effects):
- Updates CSS variables on `:root` or shell root:
  - `--vvh` (visual viewport height, px)
  - `--shell-keyboard-inset` (px)
- Optional: adjusts FAB bottom offset when keyboard open.

### 5.1 Compute keyboard inset
Definitions:
- `layoutH = window.innerHeight` (best available layout metric)
- `visualH = window.visualViewport?.height ?? window.innerHeight`
- `keyboardInset = max(0, layoutH - visualH)`

Apply:
- `shellRoot.style.setProperty('--shell-keyboard-inset', keyboardInset + 'px')`

Notes:
- On some iOS versions, `innerHeight` also shifts. Still compute inset using visual viewport when available.
- Clamp to sane bounds (0..500px) to avoid glitches.

### 5.2 Keep focused inputs visible
When `focusin` occurs inside `contentScroller`:
- Wait a frame (`requestAnimationFrame`) then:
  - get bounding rect of focused element
  - compare to visible area (visual viewport bottom relative to scroller)
  - if obscured, call `element.scrollIntoView({ block: 'center', behavior: 'smooth' })`
  - or compute minimal `contentScroller.scrollTop` delta for a precise scroll.

### 5.3 Don’t break text selection
- Avoid aggressive scrolling on every `resize`.
- Only auto-scroll on:
  - `focusin`
  - keyboard inset increases significantly (e.g., > 40px)

### 5.4 Pointer events
- Overlay layer must not block scroll:
  - `.overlayLayer { pointer-events: none }`
  - `.shellHeader, .fab { pointer-events: auto }`

---

## 6) Accessibility
- Header must be a semantic `<header>`.
- FAB must have:
  - `aria-label="Quick Capture"`
  - visible focus state
- Overlay should not trap focus.
- Ensure `contentScroller` remains keyboard navigable.

---

## 7) QA Checklist (iOS Safari Focus)
Test devices: iPhone 11 / iPhone 16 (your hardware)
Browsers: Safari + installed PWA (Add to Home Screen)

### Must pass
- Page never scrolls (only `contentScroller` scrolls).
- Header stays visually fixed while content scrolls.
- FAB stays above content and doesn’t jitter on scroll.
- Keyboard open:
  - content area shrinks appropriately (no hidden last lines)
  - focused input in content is not covered
  - FAB doesn’t end up behind keyboard (either moves up or content padding protects)
- Keyboard close:
  - layout restores (no stuck padding / white gaps)

### Edge cases
- Rotation (portrait <-> landscape)
- iOS “URL bar collapse/expand”
- Long documents (very tall content)
- Rapid focus changes between inputs
- Overscroll bounce does not drag the whole page

---

## 8) Implementation Order
1) Global body lock + shell layout + single scroller.
2) Overlay layer with header + FAB.
3) Content padding variables (`--shell-header-h`, `--shell-fab-safe`).
4) VisualViewport hook to update `--shell-keyboard-inset`.
5) Focus visibility helper (`focusin` + scrollIntoView logic).
6) QA pass on iPhone Safari + PWA install.

---

## 9) Done Definition
- All QA checklist items pass on iPhone Safari and installed PWA.
- No reliance on `100vh` alone.
- VisualViewport shim is in place and does not cause scroll thrash.
- Header + FAB overlay are usable and do not break scrolling.
