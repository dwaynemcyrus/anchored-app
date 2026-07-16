# Deployment Guide

Activate this guide for applications delivered to hosted environments.

## Delivery principles

- Builds must be reproducible from committed files and documented inputs.
- Keep local, CI, staging, and production behavior intentionally aligned.
- Store secrets in the platform secret manager, never in the repository.
- Pin runtime and package-manager versions where practical.
- Use preview or staging environments before production.
- Keep deployment configuration small and version controlled.
- Prefer reversible releases and document the rollback path.

## Continuous integration

CI should use the same commands documented in `PROJECT.md` and normally
run:

1. dependency installation from the lockfile
2. formatting check
3. lint
4. type-check
5. tests
6. production build

Do not add a duplicate CI tool when the hosting platform already provides
the required workflow.

## Environment configuration

- Document every variable by name, purpose, and environment.
- Provide example values only when they are safe and obviously fake.
- Validate required configuration at startup or build time.
- Never expose server-only secrets to client bundles.
- Rotate any credential that appears in source, logs, or output.

## Release readiness

Before requesting a production release, confirm:

- all configured quality gates pass
- migrations are compatible and have a recovery plan
- monitoring covers critical paths and failures
- health checks and required external services are working
- the release notes describe behavior and operational impact
- the previous stable version can be restored

Creating configuration and verifying preview builds are routine work.
Production deployment, promotion, rollback, DNS changes, and release tags
require explicit human instruction.

