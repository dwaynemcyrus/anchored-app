# Frontend Guide

Activate this guide for projects with a user interface. Project-specific
design rules remain in `PROJECT.md`.

## Before changing UI

- Inspect existing components, tokens, layout patterns, and routes.
- Identify the complete user flow, not only the requested screen.
- Reuse established components when they fit without distortion.
- Confirm supported viewports and the accessibility target.

## Implementation rules

- Use semantic HTML and native behavior first.
- Keep source order aligned with reading and keyboard order.
- Every control needs a clear name, purpose, and visible focus state.
- Forms need persistent labels and understandable validation errors.
- Cover loading, empty, error, success, disabled, and permission states
  when they are possible.
- Do not communicate meaning through color, motion, or hover alone.
- Respect reduced-motion and user font/zoom settings.
- Keep touch targets and spacing usable on small screens.
- Avoid new UI libraries or custom abstractions for a single use.
- Prevent unnecessary client code, layout shift, and oversized assets.

## Responsive behavior

Build mobile-first unless `PROJECT.md` says otherwise. Test at the smallest
supported width, a common mobile width, tablet, desktop, 200% zoom, and
400% reflow when the accessibility target requires it.

Do not hide required actions or content merely to make a layout fit.

## Verification

For every affected flow:

- run configured format, lint, type-check, test, and build gates
- inspect mobile and desktop rendering
- complete the flow using only the keyboard
- verify focus order, headings, landmarks, labels, and errors
- check light/dark or forced-color modes when supported
- confirm the browser console has no new errors
- confirm no unrelated visual regression was introduced

Use automated accessibility checks as support, not as a replacement for
keyboard and visual inspection.

