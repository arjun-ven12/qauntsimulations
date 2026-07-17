export interface CapacityPermit {
  release(): void;
}

interface Waiter {
  resolve(permit: CapacityPermit): void;
  reject(error: unknown): void;
  signal?: AbortSignal | undefined;
  abort: () => void;
}

export class DaytonaFleetCapacityManager {
  private active = 0;
  private peak = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) throw new Error('DAYTONA_FLEET_HARD_LIMIT must be a positive integer');
  }

  async acquire(signal?: AbortSignal): Promise<CapacityPermit> {
    if (signal?.aborted) throw new Error('Cancelled while waiting for Daytona fleet capacity');
    if (this.active < this.maximum && this.waiters.length === 0) return this.grant();
    return new Promise<CapacityPermit>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        abort: () => {
          this.remove(waiter);
          reject(new Error('Cancelled while waiting for Daytona fleet capacity'));
        },
      };
      signal?.addEventListener('abort', waiter.abort, { once: true });
      this.waiters.push(waiter);
    });
  }

  snapshot() {
    return {
      active: this.active,
      waiting: this.waiters.length,
      maximum: this.maximum,
      peak: this.peak,
    };
  }

  private grant(): CapacityPermit {
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        this.drain();
      },
    };
  }

  private drain(): void {
    while (this.active < this.maximum && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.signal?.removeEventListener('abort', waiter.abort);
      if (waiter.signal?.aborted) {
        waiter.reject(new Error('Cancelled while waiting for Daytona fleet capacity'));
      } else {
        waiter.resolve(this.grant());
      }
    }
  }

  private remove(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) this.waiters.splice(index, 1);
    waiter.signal?.removeEventListener('abort', waiter.abort);
  }
}
