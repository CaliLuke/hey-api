import type { output } from 'zod';
import type { output as Output3 } from 'zod/v3';

import type { zDefaulted as Defaulted3 } from '../__snapshots__/integer64/3/zod.gen';
import type { zDefaulted as Defaulted4 } from '../__snapshots__/integer64/4/zod.gen';
import type { zDefaulted as DefaultedMini } from '../__snapshots__/integer64/mini/zod.gen';

it('does not expose undefined after a generated default is applied', () => {
  expectTypeOf<Output3<typeof Defaulted3>>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<output<typeof Defaulted4>>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<output<typeof DefaultedMini>>().toEqualTypeOf<{ id: number }>();
});
