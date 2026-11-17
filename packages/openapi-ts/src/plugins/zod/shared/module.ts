import type { PluginInstance } from '@hey-api/shared';

import type { Config } from '../types';

export function getZodModule({
  plugin,
}: {
  plugin: {
    config: Pick<Config, 'importPath' | 'compatibilityVersion'>;
    package: PluginInstance['package'];
  };
}): string {
  if (plugin.config.importPath) return plugin.config.importPath;
  const version = plugin.package.getVersion('zod');

  if (version) {
    if (plugin.package.satisfies(version, '<4.0.0')) {
      switch (plugin.config.compatibilityVersion) {
        case 3:
        default:
          return 'zod';
        case 4:
          return 'zod/v4';
        case 'mini':
          return 'zod/v4-mini';
      }
    }
  }

  switch (plugin.config.compatibilityVersion) {
    case 3:
      return 'zod/v3';
    case 4:
    default:
      return 'zod';
    case 'mini':
      return 'zod/mini';
  }
}
