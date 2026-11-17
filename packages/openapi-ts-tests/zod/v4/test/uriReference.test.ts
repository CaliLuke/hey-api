import { generate } from './generatedValidators';

for (const version of [3, 4, 'mini'] as const) {
  it(`validates URI references with sibling constraints (Zod ${version})`, async () => {
    const { validators: v } = await generate(version, {
      Absolute: {
        format: 'uri-reference',
        maxLength: 80,
        pattern: '^([a-z]+:.*)?$',
        type: 'string',
      },
      Escaped: {
        format: 'uri-reference',
        pattern: String.raw`example\.com/a\+b\?id=\d+$`,
        type: 'string',
      },
      Reference: { format: 'uri-reference', type: 'string' },
      Search: { format: 'uri-reference', minLength: 8, pattern: 'example|mailto', type: 'string' },
    });
    for (const valid of [
      '',
      'mailto:a@example.com',
      'urn:example:a',
      'https://[::1]/',
      '../a?x#f',
      '//[::1]/a',
      '?q',
      '#f',
      'http://[v1.a:b]/',
    ]) {
      expect(v.zReference!.safeParse(valid).success, valid).toBe(true);
    }
    for (const invalid of [
      'https://[',
      'https://x/%zz',
      'https://x/\n',
      'http://[v1.%20]/',
      'http://[:::]/',
      'http://[::ffff:999.1.1.1]/',
      'a b',
    ]) {
      expect(v.zReference!.safeParse(invalid).success, invalid).toBe(false);
    }
    expect(v.zAbsolute!.safeParse('relative/path').success).toBe(false);
    expect(v.zAbsolute!.safeParse(`https://x/${'a'.repeat(80)}`).success).toBe(false);
    expect(v.zAbsolute!.parse('urn:example:a')).toBe('urn:example:a');
    expect(v.zSearch!.safeParse('mailto:').success).toBe(false);
    expect(v.zSearch!.safeParse('https://other.test').success).toBe(false);
    expect(v.zSearch!.parse('https://example.com')).toBe('https://example.com');
    expect(v.zEscaped!.parse('https://example.com/a+b?id=42')).toBe(
      'https://example.com/a+b?id=42',
    );
    expect(v.zEscaped!.safeParse('https://exampleXcom/a+b?id=42').success).toBe(false);
  });
}
