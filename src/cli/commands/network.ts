import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';

const ipSchema: CommandSchema = {
  name: 'ip',
  description: 'Look up geolocation and ISP info for an IP address.\nUses local MaxMind GeoLite2 database (downloaded automatically).',
  examples: [
    { cmd: 'rek ip 8.8.8.8', desc: 'Google DNS' },
    { cmd: 'rek ip 1.1.1.1', desc: 'Cloudflare DNS' }
  ]
};

const tlsSchema: CommandSchema = {
  name: 'tls',
  description: 'Inspect TLS/SSL certificate of a host.\nShows issuer, validity, fingerprints, and subject alternative names.',
  examples: [
    { cmd: 'rek tls google.com', desc: 'Inspect Google cert' },
    { cmd: 'rek tls example.com 8443', desc: 'Custom port' },
    { cmd: 'rek tls 192.168.1.1', desc: 'Check IP directly' }
  ]
};

const whoisSchema: CommandSchema = {
  name: 'whois',
  description: 'Look up domain registration and ownership info.\nQueries WHOIS servers for registrar, dates, and nameservers.',
  flags: {
    raw: { description: 'Show raw WHOIS response', default: false }
  },
  examples: [
    { cmd: 'rek whois github.com', desc: 'Domain info' },
    { cmd: 'rek whois google.com --raw', desc: 'Raw response' }
  ]
};

const rdapSchema: CommandSchema = {
  name: 'rdap',
  description: 'RDAP lookup (modern WHOIS with JSON).\nStandardized replacement for WHOIS with structured data.',
  examples: [
    { cmd: 'rek rdap github.com', desc: 'Domain info' }
  ]
};

const pingSchema: CommandSchema = {
  name: 'ping',
  description: 'Test TCP connectivity to host:port.\nMeasures connection latency (not ICMP).',
  params: {
    count: { type: 'number', default: 4, description: 'Number of pings' }
  },
  examples: [
    { cmd: 'rek ping google.com', desc: 'Test HTTPS (443)' },
    { cmd: 'rek ping google.com 80', desc: 'Test HTTP (80)' },
    { cmd: 'rek ping redis.local 6379 count=10', desc: '10 pings to Redis' }
  ]
};

export function registerNetworkCommands(program: Command) {
  // IP
  program.command('ip').alias('geo').alias('geoip')
    .description('Look up geolocation and ISP info for an IP address')
    .argument('<address>', 'IP address to lookup')
    .addHelpText('after', generateHelp(ipSchema))
    .action(async (address) => {
        const { getIpInfo, isGeoIPAvailable } = await import('../../mcp/ip-intel.js');

        if (!isGeoIPAvailable()) {
            console.log(colors.gray(`Downloading GeoLite2 database...`));
        }

        try {
            const info = await getIpInfo(address);

            if (info.bogon) {
                console.log(colors.yellow(`\n⚠  ${address} is a Bogon/Private IP.`));
                console.log(colors.gray(`   Type: ${info.bogonType}`));
                return;
            }

            console.log(`
${colors.bold(colors.cyan('🌍 IP Intelligence Report'))}

${colors.bold('Location:')}
  ${colors.gray('City:')}      ${info.city || 'N/A'}
  ${colors.gray('Region:')}    ${info.region || 'N/A'}
  ${colors.gray('Country:')}   ${info.country || 'N/A'} ${info.countryCode ? `(${info.countryCode})` : ''}
  ${colors.gray('Continent:')} ${info.continent || 'N/A'}
  ${colors.gray('Timezone:')}  ${info.timezone || 'N/A'}
  ${colors.gray('Coords:')}    ${info.loc ? colors.cyan(info.loc) : 'N/A'}
  ${colors.gray('Accuracy:')}  ${info.accuracy ? `~${info.accuracy} km` : 'N/A'}

${colors.bold('Network:')}
  ${colors.gray('IP:')}        ${info.ip}
  ${colors.gray('Type:')}      ${info.isIPv6 ? 'IPv6' : 'IPv4'}
  ${colors.gray('Postal:')}    ${info.postal || 'N/A'}
`);
        } catch (err: any) {
            console.error(colors.red(`IP Lookup Failed: ${err.message}`));
            process.exit(1);
        }
    });

  // TLS
  program.command('tls').alias('ssl').alias('cert')
    .description('Inspect TLS/SSL certificate of a host')
    .argument('<host>', 'Hostname or IP address')
    .argument('[port]', 'Port number (default: 443)', '443')
    .addHelpText('after', generateHelp(tlsSchema))
    .action(async (host, port) => {
      const { inspectTLS } = await import('../../utils/tls-inspector.js');

      console.log(colors.gray(`Inspecting TLS certificate for ${host}:${port}...`));

      try {
        const info = await inspectTLS(host, parseInt(port));

        let daysColor = colors.green;
        if (info.daysRemaining < 30) daysColor = colors.red;
        else if (info.daysRemaining < 90) daysColor = colors.yellow;

        const validIcon = info.valid ? colors.green('✔ Valid') : colors.red('✖ Expired');
        const authIcon = info.authorized ? colors.green('✔ Trusted') : colors.yellow('⚠ Self-signed/Untrusted');

        console.log(`
${colors.bold(colors.cyan('🔒 TLS Certificate Report'))}

${colors.bold('Status:')}
  ${validIcon}
  ${authIcon}
  ${colors.gray('Days Remaining:')} ${daysColor(info.daysRemaining.toString())}

${colors.bold('Certificate:')}
  ${colors.gray('Subject:')}       ${info.subject?.CN || info.subject?.O || 'N/A'}
  ${colors.gray('Issuer:')}        ${info.issuer?.CN || info.issuer?.O || 'N/A'}
  ${colors.gray('Valid From:')}    ${info.validFrom.toISOString().split('T')[0]}
  ${colors.gray('Valid To:')}      ${info.validTo.toISOString().split('T')[0]}
  ${colors.gray('Serial:')}        ${info.serialNumber}

${colors.bold('Security:')}
  ${colors.gray('Protocol:')}      ${info.protocol || 'N/A'}
  ${colors.gray('Cipher:')}        ${info.cipher?.name || 'N/A'}
  ${colors.gray('Key:')}           ${info.pubkey ? `${info.pubkey.algo.toUpperCase()} ${info.pubkey.size}-bit` : 'N/A'}

${colors.bold('Fingerprints:')}
  ${colors.gray('SHA-1:')}   ${info.fingerprint}
  ${colors.gray('SHA-256:')} ${info.fingerprint256?.slice(0, 40)}...
`);

        if (info.altNames && info.altNames.length > 0) {
          console.log(`${colors.bold('Subject Alternative Names:')}`);
          info.altNames.slice(0, 10).forEach(san => console.log(`  ${colors.gray('•')} ${san}`));
          if (info.altNames.length > 10) console.log(`  ${colors.gray(`... and ${info.altNames.length - 10} more`)}`);
          console.log('');
        }
      } catch (err: any) {
        console.error(colors.red(`TLS Inspection Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // WHOIS
  program.command('whois')
    .description('Look up domain registration and ownership info')
    .argument('<query>', 'Domain name or IP address')
    .argument('[args...]', 'Options: raw')
    .addHelpText('after', generateHelp(whoisSchema))
    .action(async (query, rawArgs) => {
      const { options } = RekArgs.parse(rawArgs, whoisSchema);
      const { whois } = await import('../../utils/whois.js');

      console.log(colors.gray(`Looking up WHOIS for ${query}...`));

      try {
        const result = await whois(query);

        if (options.raw) {
          console.log(result.raw);
          return;
        }

        console.log(`
${colors.bold(colors.cyan('📋 WHOIS Report'))}

${colors.bold('Query:')} ${result.query}
${colors.bold('Server:')} ${result.server}
`);

        if (result.data && Object.keys(result.data).length > 0) {
          console.log(colors.bold('Parsed Data:'));
          const importantKeys = ['Domain Name', 'Registrar', 'Creation Date', 'Expiration Date', 'Updated Date', 'Name Server', 'Status'];

          for (const key of importantKeys) {
            const value = result.data[key];
            if (value) {
              if (Array.isArray(value)) {
                console.log(`  ${colors.cyan(key)}:`);
                value.forEach((v: string) => console.log(`    ${colors.gray('•')} ${v}`));
              } else {
                console.log(`  ${colors.cyan(key)}: ${value}`);
              }
            }
          }
        }
        console.log('');
      } catch (err: any) {
        console.error(colors.red(`WHOIS Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // RDAP
  program.command('rdap')
    .description('RDAP lookup (modern WHOIS with JSON)')
    .argument('<domain>', 'Domain name to lookup')
    .addHelpText('after', generateHelp(rdapSchema))
    .action(async (domain) => {
      const { rdap } = await import('../../utils/rdap.js');
      const { Client } = await import('../../core/client.js');

      console.log(colors.gray(`Looking up RDAP for ${domain}...`));

      try {
        const client = new Client();
        const result = await rdap(client, domain);

        console.log(`
${colors.bold(colors.cyan('📋 RDAP Report'))}

${colors.bold('Domain:')} ${result.ldhName || domain}
${colors.bold('Handle:')} ${result.handle || 'N/A'}
${colors.bold('Status:')} ${result.status?.join(', ') || 'N/A'}
`);

        if (result.events?.length) {
          console.log(`${colors.bold('Events:')}`);
          result.events.forEach((event: any) => {
            const date = event.eventDate ? new Date(event.eventDate).toISOString().split('T')[0] : 'N/A';
            console.log(`  ${colors.gray(event.eventAction + ':')} ${date}`);
          });
          console.log('');
        }

        if (result.entities?.length) {
          console.log(`${colors.bold('Entities:')}`);
          result.entities.slice(0, 5).forEach((entity: any) => {
            const roles = entity.roles?.join(', ') || 'N/A';
            console.log(`  ${colors.gray(roles + ':')} ${entity.handle || 'Unknown'}`);
          });
          console.log('');
        }
      } catch (err: any) {
        console.error(colors.red(`RDAP Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // Ping
  program.command('ping')
    .description('Test TCP connectivity to host:port')
    .argument('<host>', 'Hostname or IP address')
    .argument('[args...]', 'Port and options: [port] count=4')
    .addHelpText('after', generateHelp(pingSchema))
    .action(async (host: string, rawArgs: string[]) => {
      const { data, args: posArgs } = RekArgs.parse(rawArgs, pingSchema);
      const net = await import('node:net');

      // Check if port is in positional args
      let port = 443;
      if (posArgs.length > 0 && typeof posArgs[0] === 'number') {
        port = posArgs[0];
      } else if (posArgs.length > 0 && /^\d+$/.test(String(posArgs[0]))) {
        port = parseInt(String(posArgs[0]));
      }

      const count = data.count || 4;
      const results: number[] = [];

      console.log(colors.gray(`Pinging ${host}:${port}...`));
      console.log('');

      for (let i = 0; i < count; i++) {
        const start = performance.now();

        try {
          await new Promise<void>((resolve, reject) => {
            const socket = net.connect(port, host, () => {
              socket.destroy();
              resolve();
            });
            socket.setTimeout(5000);
            socket.on('timeout', () => {
              socket.destroy();
              reject(new Error('Timeout'));
            });
            socket.on('error', reject);
          });

          const elapsed = performance.now() - start;
          results.push(elapsed);
          console.log(`${colors.green('✔')} Connected to ${host}:${port} - ${colors.cyan(elapsed.toFixed(2) + 'ms')}`);
        } catch (err: any) {
          console.log(`${colors.red('✖')} Failed to connect: ${err.message}`);
        }

        if (i < count - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (results.length > 0) {
        const avg = results.reduce((a, b) => a + b, 0) / results.length;
        const min = Math.min(...results);
        const max = Math.max(...results);

        console.log(`
${colors.bold('Statistics:')}
  ${colors.gray('Sent:')}     ${count}
  ${colors.gray('Received:')} ${results.length}
  ${colors.gray('Lost:')}     ${count - results.length} (${((count - results.length) / count * 100).toFixed(0)}%)
  ${colors.gray('Min:')}      ${min.toFixed(2)}ms
  ${colors.gray('Avg:')}      ${avg.toFixed(2)}ms
  ${colors.gray('Max:')}      ${max.toFixed(2)}ms
`);
      }
    });
}
