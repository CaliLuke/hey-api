import { handlerMini } from './mini/plugin';
import type { ZodPlugin } from './types';
import { handlerV3 } from './v3/plugin';
import { handlerV4 } from './v4/plugin';

export const handler: ZodPlugin['Handler'] = (args) => {
  const { plugin } = args;
  // A transformer must not change the representation promised by number validators/types.
  if (
    plugin.config.integer64 === 'number' &&
    plugin.getPlugin('@hey-api/transformers')?.config.bigInt
  ) {
    throw new Error('Zod integer64: number requires transformers.bigInt: false');
  }
  switch (plugin.config.compatibilityVersion) {
    case 3:
      return handlerV3(args);
    case 'mini':
      return handlerMini(args);
    case 4:
    default:
      return handlerV4(args);
  }
};
