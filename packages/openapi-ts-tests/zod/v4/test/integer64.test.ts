import { generate } from './generatedValidators';

for (const version of [3, 4, 'mini'] as const) {
  describe(`int64 number policy (Zod ${version})`, () => {
    it('preserves numbers, safe bounds, unsigned constraints and nested defaults/literals', async () => {
      const { types, validators: v } = await generate(version, {
        Bounded: { format: 'int64', maximum: 5, minimum: 1, type: 'integer' },
        Nested: {
          properties: {
            choice: { enum: [1, 2], format: 'int64', type: 'integer' },
            literal: { const: 3, format: 'int64', type: 'integer' },
            value: { default: 2, format: 'int64', type: 'integer' },
          },
          type: 'object',
        },
        Signed: { format: 'int64', type: 'integer' },
        Text: { format: 'int64', type: 'string' },
        Unsigned: { format: 'uint64', minimum: -1, type: 'integer' },
        Wide: { format: 'int64', maximum: 1e20, minimum: -1e20, type: 'integer' },
      });
      expect(types).toContain('export type Signed = number');
      expect(types).not.toContain('bigint');
      for (const value of [0, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
        expect(v.zSigned!.parse(value)).toBe(value);
        expect(v.zWide!.parse(value)).toBe(value);
      }
      for (const value of [
        Number.MAX_SAFE_INTEGER + 1,
        Number.MIN_SAFE_INTEGER - 1,
        1.5,
        '1',
        1n,
      ]) {
        expect(v.zSigned!.safeParse(value).success).toBe(false);
        expect(v.zWide!.safeParse(value).success).toBe(false);
      }
      expect(v.zUnsigned!.safeParse(-1).success).toBe(false);
      expect(v.zUnsigned!.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
      expect(v.zBounded!.parse(5)).toBe(5);
      expect(v.zBounded!.safeParse(6).success).toBe(false);
      expect(v.zText!.parse('9007199254740993')).toBe('9007199254740993');
      expect(v.zNested!.parse({ choice: 2, literal: 3 })).toEqual({
        choice: 2,
        literal: 3,
        value: 2,
      });
      expect(v.zNested!.safeParse({ literal: 3n }).success).toBe(false);
    });

    it('validates nested object, array and referenced defaults instead of bypassing their schemas', async () => {
      const { validators: v } = await generate(version, {
        ArrayDefault: {
          default: [Number.MAX_SAFE_INTEGER + 1],
          items: { $ref: '#/components/schemas/Signed' },
          type: 'array',
        },
        ObjectDefault: {
          default: { id: Number.MAX_SAFE_INTEGER + 1 },
          properties: { id: { $ref: '#/components/schemas/Signed' } },
          type: 'object',
        },
        Signed: { format: 'int64', type: 'integer' },
        UnsignedDefault: {
          default: { id: -1 },
          properties: { id: { format: 'uint64', type: 'integer' } },
          type: 'object',
        },
        ValidDefault: {
          default: { id: 1 },
          properties: { id: { $ref: '#/components/schemas/Signed' } },
          type: 'object',
        },
      });
      for (const name of ['zObjectDefault', 'zArrayDefault', 'zUnsignedDefault'])
        expect(v[name]!.safeParse(undefined).success).toBe(false);
      expect(v.zValidDefault!.parse(undefined)).toEqual({ id: 1 });
    });

    it.each(['const', 'default', 'enum'])(
      'rejects unsafe %s values during generation',
      async (keyword) => {
        await expect(
          generate(version, {
            Unsafe: {
              format: 'int64',
              [keyword]:
                keyword === 'enum' ? [Number.MAX_SAFE_INTEGER + 1, 1] : Number.MAX_SAFE_INTEGER + 1,
              type: 'integer',
            },
          }),
        ).rejects.toMatchObject({
          originalError: {
            error: expect.objectContaining({
              message: expect.stringContaining('safe JSON integer'),
            }),
          },
        });
      },
    );
  });
}
