import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@hey-api/openapi-ts';
import ts from 'typescript';

import { tmpDir } from './constants';

afterEach(() => vi.unstubAllEnvs());

/** Exercise real ESM evaluation, including a policy module that imports the SDK. */
it.each(['client/client.gen.js', 'sdk.gen.js', 'client.js'])(
  'initializes every factory through circular entry %s',
  async (entry) => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const output = fs.mkdtempSync(path.join(tmpDir, 'initialization-'));
    await createClient({
      input: {
        info: { title: 'Factory', version: '1' },
        openapi: '3.1.0',
        paths: {
          '/items': {
            get: { operationId: 'list', responses: { '200': { description: 'Items' } } },
          },
        },
      },
      logs: { level: 'silent' },
      output: { module: { extension: '.js' }, path: output },
      plugins: [
        '@hey-api/typescript',
        '@hey-api/sdk',
        { name: '@hey-api/client-fetch', runtimeInitializerPath: path.join(output, 'client.js') },
      ],
    });
    const files = fs
      .readdirSync(output, { recursive: true })
      .filter((file): file is string => typeof file === 'string' && file.endsWith('.ts'));
    for (const file of files) {
      const source = fs.readFileSync(path.join(output, file), 'utf8');
      fs.writeFileSync(
        path.join(output, file.replace(/\.ts$/, '.js')),
        ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
        }).outputText,
      );
    }
    fs.writeFileSync(
      path.join(output, 'bootstrap.js'),
      `
    const clients = new WeakSet();
    export let count = 0;
    export function initialize(client, sdk) {
      if (clients.has(client)) throw new Error('Duplicate initialization');
      clients.add(client); count++;
      client.setConfig({baseUrl: 'https://example.test', fetch: async () => new Response('ok')});
      client.interceptors.request.use(request => { if (typeof sdk() !== 'function') throw new Error('Missing SDK'); return request; });
    }
  `,
    );
    fs.writeFileSync(
      path.join(output, 'client.js'),
      `
    import { initialize } from './bootstrap.js';
    import { list } from './sdk.gen.js';
    export function initializeClient(client) { initialize(client, () => list); }
  `,
    );
    fs.writeFileSync(
      path.join(output, 'verify.mjs'),
      `
    import './${entry}';
    import assert from 'node:assert/strict';
    import { client } from './client.gen.js';
    import { createClient } from './client/client.gen.js';
    import { count } from './bootstrap.js';
    assert.equal(count, 1);
    const custom = createClient();
    assert.equal(count, 2);
    for (const instance of [client, custom]) assert.equal((await instance.get({url: '/items', parseAs: 'text'})).data, 'ok');
  `,
    );
    execFileSync(process.execPath, [path.join(output, 'verify.mjs')]);
  },
);
