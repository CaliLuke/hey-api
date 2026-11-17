import type { PluginInstance } from '@hey-api/shared';

import { getZodModule } from '../plugins/zod/shared/module';
import type { Config } from '../plugins/zod/types';

export function ZOD(plugin: PluginInstance) {
  // Zod owns this symbol; SDK validators reuse the same registered import.
  const config = plugin.config as Config;
  const external = getZodModule({ plugin: { config, package: plugin.package } });
  return {
    z: plugin.symbol('z', {
      external,
      importKind:
        config.importKind === 'named'
          ? undefined
          : (config.importKind ?? (config.compatibilityVersion !== 3 ? 'namespace' : undefined)),
      meta: {
        resource: 'zod.z',
      },
    }),
  };
}
