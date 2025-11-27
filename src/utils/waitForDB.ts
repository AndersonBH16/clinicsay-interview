import { Logger } from './logger';

interface WaitForDbOptions {
  host: string;
  port: number;
  maxAttempts?: number;
  delayMs?: number;
}

export class WaitForDb {
  static async wait(options: WaitForDbOptions): Promise<void> {
    const { host, port, maxAttempts = 30, delayMs = 2000 } = options;

    Logger.info(`Waiting for database at ${host}:${port}...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const net = require('net');

        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();

          const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error('Connection timeout'));
          }, 3000);

          socket.connect(port, host, () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          });

          socket.on('error', (err: Error) => {
            clearTimeout(timeout);
            socket.destroy();
            reject(err);
          });
        });

        Logger.success(`Database is ready at ${host}:${port}`);

        await this.sleep(3000);
        return;

      } catch (error) {
        Logger.warn(`Database not ready (attempt ${attempt}/${maxAttempts})`);

        if (attempt === maxAttempts) {
          throw new Error(`Database not available after ${maxAttempts} attempts`);
        }

        await this.sleep(delayMs);
      }
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}