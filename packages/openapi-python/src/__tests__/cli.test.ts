import { runCli } from '../cli';
import { createClient } from '../index';

vi.mock('../index', () => ({ createClient: vi.fn().mockResolvedValue([]) }));

const spyExit = vi.spyOn(process, 'exit').mockImplementation(() => ({}) as never);

beforeEach(() => {
  vi.mocked(createClient).mockClear();
  spyExit.mockClear();
});

it.each([['--input'], ['--unknown-option'], ['--dry-run', 'true']])(
  'rejects invalid arguments %j without generating',
  async (...args) => {
    const originalArgv = process.argv;
    const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.argv = [...originalArgv.slice(0, 2), ...args];
      await runCli();
      expect(createClient).not.toHaveBeenCalled();
      expect(spyExit).toHaveBeenCalledExactlyOnceWith(1);
    } finally {
      process.argv = originalArgv;
      spyError.mockRestore();
    }
  },
);

it('accepts the dry-run flag without a positional value', async () => {
  const originalArgv = process.argv;
  try {
    process.argv = [...originalArgv.slice(0, 2), '--dry-run'];
    await runCli();
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ dryRun: true, logs: { file: true } });
    expect(spyExit).toHaveBeenCalledExactlyOnceWith(0);
  } finally {
    process.argv = originalArgv;
  }
});
