import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createClient } from '@hey-api/openapi-ts';
import ts from 'typescript';

import { tmpDir } from './constants';

const require = createRequire(import.meta.url);
type Schema = {
  parse: (value: unknown) => unknown;
  safeParse: (value: unknown) => { success: boolean };
};

/** Execute the emitted validators, so tests cover parser, generator and Zod together. */
export async function generate(
  compatibilityVersion: 3 | 4 | 'mini',
  schemas: Record<string, unknown>,
) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const output = fs.mkdtempSync(path.join(tmpDir, 'int64-'));
  const input = {
    components: { schemas },
    info: { title: 'Integers', version: '1' },
    openapi: '3.1.0',
    paths: {},
  };
  const original = JSON.stringify(input);
  await createClient({
    input,
    logs: { level: 'silent' },
    output,
    plugins: ['@hey-api/typescript', { compatibilityVersion, integer64: 'number', name: 'zod' }],
  });
  expect(JSON.stringify(input)).toBe(original);
  const source = fs.readFileSync(path.join(output, 'zod.gen.ts'), 'utf8');
  const exports: Record<string, Schema> = {};
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'exports', js)(require, exports);
  return {
    source,
    types: fs.readFileSync(path.join(output, 'types.gen.ts'), 'utf8'),
    validators: exports,
  };
}
