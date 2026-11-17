import { createClient } from './client';
import { createClientConfigType } from './create-client-config';
import type { PluginHandler } from './types';

export function clientPluginHandler({ plugin }: Parameters<PluginHandler>[0]): void {
  if (
    'runtimeInitializerPath' in plugin.config &&
    plugin.config.runtimeInitializerPath &&
    !plugin.config.bundle
  ) {
    throw new Error('runtimeInitializerPath requires a bundled Fetch client');
  }
  createClientConfigType({ plugin });
  createClient({ plugin });
}
