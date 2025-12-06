import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';

export interface ServerTiming {
  name: string;
  duration?: number;
  description?: string;
}

export function serverTimingPlugin(): Plugin {
  return (client: any) => {
    client.afterResponse((req: ReckerRequest, res: ReckerResponse) => {
      const header = res.headers.get('server-timing');
      if (!header) return;

      const timings: ServerTiming[] = header.split(',').map(entry => {
        const parts = entry.split(';');
        const name = parts[0].trim();
        let duration: number | undefined;
        let description: string | undefined;

        for (let i = 1; i < parts.length; i++) {
          const [key, val] = parts[i].split('=').map(s => s.trim());
          if (key === 'dur') duration = parseFloat(val);
          if (key === 'desc') description = val?.replace(/"/g, '');
        }

        return { name, duration, description };
      });

      // Attach to response (requires extending interface or just property injection)
      (res as any).serverTimings = timings;
    });
  };
}
