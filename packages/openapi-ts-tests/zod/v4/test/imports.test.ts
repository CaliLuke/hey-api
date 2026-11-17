import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@hey-api/openapi-ts';

import { tmpDir } from './constants';

it('uses the configured named Zod import in validators and the SDK', async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const output = fs.mkdtempSync(path.join(tmpDir, 'imports-'));
  await createClient({
    input: {
      info: { title: 'Imports', version: '1' },
      openapi: '3.1.0',
      paths: {
        '/items': {
          get: {
            operationId: 'list',
            parameters: [{ in: 'query', name: 'limit', schema: { type: 'integer' } }],
            responses: {
              '200': {
                content: { 'application/json': { schema: { type: 'string' } } },
                description: 'Items',
              },
            },
          },
        },
      },
    },
    logs: { level: 'silent' },
    output,
    plugins: [
      '@hey-api/typescript',
      '@hey-api/client-fetch',
      { importKind: 'named', importPath: '#zod', name: 'zod', requests: true, responses: true },
      { name: '@hey-api/sdk', validator: { request: 'zod', response: 'zod' } },
    ],
  });
  for (const filename of ['zod.gen.ts', 'sdk.gen.ts']) {
    const source = fs.readFileSync(path.join(output, filename), 'utf8');
    expect(source).toContain("import { z } from '#zod'");
    expect(source).not.toMatch(/from ['"]zod/);
  }
});

afterEach(() => vi.unstubAllEnvs());
