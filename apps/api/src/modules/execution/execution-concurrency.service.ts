export interface ConcurrentExecutionResult<TItem, TResult> {
  item: TItem;
  result?: TResult;
  error?: unknown;
}

export class ExecutionConcurrencyService {
  constructor(private readonly hardMaximum = 2) {}

  async run<TItem, TResult>(
    items: readonly TItem[],
    requestedMaximum: number,
    execute: (item: TItem) => Promise<TResult>,
    isCancelled: () => Promise<boolean> = async () => false,
  ): Promise<Array<ConcurrentExecutionResult<TItem, TResult>>> {
    const maximum = Math.max(1, Math.min(this.hardMaximum, requestedMaximum, items.length || 1));
    const results: Array<ConcurrentExecutionResult<TItem, TResult> | undefined> = Array.from({ length: items.length });
    let nextIndex = 0;

    const consume = async (): Promise<void> => {
      while (true) {
        if (await isCancelled()) return;
        const index = nextIndex++;
        if (index >= items.length) return;
        const item = items[index]!;
        try {
          results[index] = { item, result: await execute(item) };
        } catch (error) {
          results[index] = { item, error };
        }
      }
    };

    await Promise.all(Array.from({ length: maximum }, consume));
    return results.filter((result): result is ConcurrentExecutionResult<TItem, TResult> => Boolean(result));
  }
}
