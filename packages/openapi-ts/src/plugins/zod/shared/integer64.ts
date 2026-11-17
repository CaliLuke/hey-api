import { $ } from '../../../ts-dsl';
import { maybeBigInt, shouldCoerceToBigInt } from '../../shared/utils/coerce';
import { getIntegerLimit } from '../../shared/utils/formats';
import type { NumberResolverContext } from '../resolvers';
import type { Config } from '../types';

type Policy = Config['integer64'];

/** Reject constants/defaults that cannot be represented by the selected JSON number policy. */
export function assertInteger64Value(value: unknown, format: string | undefined, policy: Policy) {
  if (policy !== 'number' || !shouldCoerceToBigInt(format) || typeof value !== 'number') return;
  if (!Number.isSafeInteger(value) || (format === 'uint64' && value < 0)) {
    throw new Error(`Cannot represent ${format} value ${value} as a safe JSON integer`);
  }
}

/** Keep defaults, literals and bounds on the same representation as the base validator. */
export function integer64Utils(policy: Policy): NumberResolverContext['utils'] {
  return {
    getIntegerLimit: (format: string | undefined) => {
      if (policy !== 'number' || !shouldCoerceToBigInt(format)) return getIntegerLimit(format);
      const minValue = format === 'uint64' ? 0 : Number.MIN_SAFE_INTEGER;
      const maxValue = Number.MAX_SAFE_INTEGER;
      return {
        maxError: `Invalid value: Expected ${format} to be <= ${maxValue}`,
        maxValue,
        minError: `Invalid value: Expected ${format} to be >= ${minValue}`,
        minValue,
      };
    },
    maybeBigInt: (value: unknown, format: string | undefined) =>
      policy === 'number' && shouldCoerceToBigInt(format)
        ? $.fromValue(value)
        : maybeBigInt(value, format),
    shouldCoerceToBigInt: (format: string | undefined) =>
      policy !== 'number' && shouldCoerceToBigInt(format),
  };
}
