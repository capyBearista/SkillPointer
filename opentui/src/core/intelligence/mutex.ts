export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          const next = this.queue.shift();
          if (next) next();
        });
      });
      if (!this.locked) {
        const next = this.queue.shift();
        if (next) next();
      }
    });
  }
}
