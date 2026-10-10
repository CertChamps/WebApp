Run `npm run test:modal` on macOS with Xcode command line tools. This builds the real Add to page and Share resource components with mocked service responses, then runs them in a temporary native WebKit window. No account or network access is required. The window closes and its temporary files are removed when checks finish.

The checks enable the iOS scroll/focus code path and simulate visual viewport changes. They cover stable panel placement, focused-field visibility, backdrop touch prevention, inert background content, nested locks, cleanup, and short landscape layouts. These are browser regression checks, not a replacement for native keyboard/device testing.

`npm run test:modal -- --fixture-only` retains a standalone fixture in the printed temporary directory for debugging. Remove that directory when finished.
