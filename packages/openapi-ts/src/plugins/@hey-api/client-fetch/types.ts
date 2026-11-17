import type { DefinePlugin, Plugin } from '@hey-api/shared';

import type { Client } from '../client-core/types';

export type UserConfig = Plugin.Name<'@hey-api/client-fetch'> &
  Client.Config & {
    /**
     * Module exporting a synchronous `initializeClient(client)` function, called
     * once for every factory-created client, including the generated singleton.
     * Requires bundling. Keep SDK reads deferred until a request starts to avoid
     * circular initialization. Unlike runtimeConfigPath this covers custom clients.
     */
    runtimeInitializerPath?: string;
    /**
     * Throw an error instead of returning it in the response?
     *
     * @default false
     */
    throwOnError?: boolean;
  };

export type HeyApiClientFetchPlugin = DefinePlugin<UserConfig, UserConfig>;
