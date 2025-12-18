import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';

export function registerNetworkCommands(program: Command) {
  // IP Geolocation
  program
    .command('ip')
    .alias('geo')
    .alias('geoip')
    .description('Look up geolocation and ISP info for an IP address using local MaxMind GeoLite2 database')
    .argument('<address>', {
      type: 'string',
      description: 'IPv4 or IPv6 address to lookup',
      example: '8.8.8.8',
    })
    .example('rek ip 8.8.8.8', 'Google DNS geolocation')
    .example('rek ip 1.1.1.1', 'Cloudflare DNS geolocation')
    .example('rek ip 2001:4860:4860::8888', 'IPv6 lookup')
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

  // TLS Certificate Inspection
  program
    .command('tls')
    .alias('ssl')
    .alias('cert')
    .description('Inspect TLS/SSL certificate of a host showing issuer, validity, fingerprints, and SANs')
    .argument('<host>', {
      type: 'string',
      description: 'Hostname or IP address to inspect',
      example: 'google.com',
    })
    .argument('[port]', {
      type: 'number',
      description: 'Port number (default: 443)',
      default: 443,
      example: '8443',
    })
    .example('rek tls google.com', 'Inspect Google certificate')
    .example('rek tls example.com 8443', 'Custom port')
    .example('rek tls 192.168.1.1', 'Check IP directly')
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

  // WHOIS Lookup
  program
    .command('whois')
    .description('Look up domain registration and ownership info from WHOIS servers')
    .argument('<query>', {
      type: 'string',
      description: 'Domain name or IP address to lookup',
      example: 'github.com',
    })
    .option('raw', {
      short: 'r',
      description: 'Show raw WHOIS response instead of parsed data',
    })
    .example('rek whois github.com', 'Get domain registration info')
    .example('rek whois google.com --raw', 'Show raw WHOIS response')
    .example('rek whois 8.8.8.8', 'Lookup IP address owner')
    .action(async (query: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
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

  // RDAP (Modern WHOIS)
  program
    .command('rdap')
    .description('RDAP lookup - modern WHOIS replacement with structured JSON data')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain name to lookup',
      example: 'github.com',
    })
    .example('rek rdap github.com', 'Get structured domain info')
    .example('rek rdap google.com --json', 'Get full JSON response')
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

  // TCP Ping
  program
    .command('ping')
    .description('Test TCP connectivity to host:port and measure connection latency (not ICMP)')
    .argument('<host>', {
      type: 'string',
      description: 'Hostname or IP address to ping',
      example: 'google.com',
    })
    .argument('[port]', {
      type: 'number',
      description: 'Port number to connect to',
      default: 443,
      example: '80',
    })
    .option('count', {
      type: 'number',
      short: 'c',
      default: 4,
      description: 'Number of pings to send',
      example: '10',
    })
    .option('timeout', {
      type: 'number',
      short: 't',
      default: 5000,
      description: 'Connection timeout in milliseconds',
      example: '3000',
    })
    .example('rek ping google.com', 'Test HTTPS connectivity (port 443)')
    .example('rek ping google.com 80', 'Test HTTP port')
    .example('rek ping redis.local 6379 -c 10', '10 pings to Redis')
    .action(async (host: string, portArg: number | string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const net = await import('node:net');

      // Port comes from argument (already parsed)
      const port = typeof portArg === 'number' ? portArg : parseInt(String(portArg)) || 443;

      const count = options.count || 4;
      const timeout = options.timeout || 5000;
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
            socket.setTimeout(timeout);
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
