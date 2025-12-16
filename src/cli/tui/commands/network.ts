import colors from '../../../utils/colors.js';
import { ShellContext } from './context.js';
import { rdap } from '../../../utils/rdap.js';

export async function runRDAP(ctx: ShellContext, domain?: string) {
    if (!domain) {
      domain = ctx.getRootDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: rdap <domain>'));
        console.log(colors.gray('  Examples: rdap google.com | rdap 8.8.8.8'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    }

    console.log(colors.gray(`RDAP lookup for ${domain}...`));
    const startTime = performance.now();

    try {
      const result = await rdap(ctx.client, domain);
      const duration = Math.round(performance.now() - startTime);

      console.log(colors.green(`✔ RDAP lookup completed`) + colors.gray(` (${duration}ms)
`));

      // Status
      if (result.status?.length) {
        console.log(colors.bold('  Status:'));
        result.status.forEach((s: string) => console.log(`    ${colors.cyan('→')} ${s}`));
      }

      // Events
      if (result.events?.length) {
        console.log(colors.bold('  Events:'));
        result.events.forEach((e: any) => {
          const date = new Date(e.eventDate).toISOString().split('T')[0];
          console.log(`    ${colors.cyan(e.eventAction.padEnd(15))} ${date}`);
        });
      }

      // Entities
      if (result.entities?.length) {
        console.log(colors.bold('  Entities:'));
        result.entities.forEach((e: any) => {
          const roles = e.roles?.join(', ') || 'unknown';
          console.log(`    ${colors.cyan(roles.padEnd(15))} ${e.handle || 'N/A'}`);
        });
      }

      ctx.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`RDAP lookup failed: ${error.message}`));
      console.log(colors.gray('  Tip: RDAP may not be available for all TLDs. Try "whois" instead.'));
    }
    console.log('');
}

export async function runPing(ctx: ShellContext, host?: string) {
    if (!host) {
      host = ctx.getBaseDomain() || '';
      if (!host) {
        console.log(colors.yellow('Usage: ping <host>'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else {
      host = host.replace(/^https?:\/\//, '').split('/')[0];
    }

    console.log(colors.gray(`Pinging ${host}...`));

    try {
      const { connect } = await import('node:net');
      const port = 443;
      const startTime = performance.now();

      await new Promise<void>((resolve, reject) => {
        const socket = connect(port, host!, () => { // ! because we checked above
          const duration = Math.round(performance.now() - startTime);
          console.log(colors.green(`✔ ${host}:${port} is reachable`) + colors.gray(` (${duration}ms)`));
          socket.end();
          resolve();
        });
        socket.on('error', reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('Connection timed out'));
        });
      });
    } catch (error: any) {
      console.error(colors.red(`✖ ${host} is unreachable: ${error.message}`));
    }
    console.log('');
}
