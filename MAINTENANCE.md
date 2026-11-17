# Maintenance build

The maintained Fetch generator supports application policy without rewriting its output:

```ts
plugins: [
  {
    name: '@hey-api/client-fetch',
    runtimeInitializerPath: './src/client-initializer.ts',
  },
  {
    name: 'zod',
    integer64: 'number',
    importPath: '#zod',
    importKind: 'named',
  },
];
```

`integer64: 'number'` keeps int64/uint64 validators on safe JSON integers, rejects
unsafe literals, and validates defaults. It requires `transformers.bigInt: false`
when that plugin is enabled. String-typed schemas remain strings. URI-reference
validation follows RFC 3986 and retains sibling patterns and length constraints.

The initializer module exports `initializeClient(client): void`. It runs once
for every factory-created client, including the singleton. Avoid eager SDK
value imports in application initialization: load SDK-dependent policy when a
request begins so transformed module loaders do not enter a construction cycle.

Fetch config accepts `requestContext()` and `requestLifecycle(options)`. The
former binds preparation callbacks; the latter observes unary phases and terminal
outcomes and binds interceptors, Fetch and response validators/transformers.
Callbacks must preserve receivers and must not throw. Stream handoff is
`stream_open`; stream consumption and reconnect policy remain caller-owned.

## Package a release

From a verified checkout with frozen dependencies installed:

```sh
python3 scripts/package-maintenance-release.py TAG /absolute/empty/output-directory
```

This builds and packs the generator and its production workspace dependencies, pins their release asset
relationship, normalizes archive timestamps, and writes SHA-256 checksums and
source provenance to `release-manifest.json`. It does not publish. Only publish
when `sourceDirty` is false, the source commit matches the release tag, and tests,
typechecks and lint pass. Upload every tarball and the manifest to the same release.

Runtime dependencies and generator test libraries are pinned to current compatible
releases. TypeScript stays on its 6.x compiler API: TypeScript 7.0 has no compatible
programmatic API ([release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
The package peer range rejects TypeScript 7. The Zod 3/4, MSW 2 and TanStack Query 5
fixtures retain the major versions they test; prerelease dependency upgrades are
excluded except the already-required native TypeScript preview checker.

The repository still has legacy example/lint peer warnings. The website's
`astro check` requests the missing `@astrojs/check` package and does not perform
a check; do not count that task as generator validation. These development-only
limitations are separate from the packed generator's production dependency audit.
