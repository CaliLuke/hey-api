// Module loading belongs to test collection; the test checks the public export contract.
import * as internal from '../internal';

describe('internal entry index', () => {
  it('should be exported', () => {
    expect(internal.getSpec).toBeDefined();
    expect(internal.initConfigs).toBeDefined();
    expect(internal.parseOpenApiSpec).toBeDefined();
  });
});
