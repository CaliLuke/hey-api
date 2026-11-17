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

This builds and packs the generator and shared package, pins their release asset
relationship, normalizes archive timestamps, and writes SHA-256 checksums and
source provenance to `release-manifest.json`. It does not publish. Only publish
when `sourceDirty` is false, the source commit matches the release tag, and tests,
typechecks and lint pass. Upload both tarballs and the manifest to the same release.
