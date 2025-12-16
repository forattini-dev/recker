import colors from '../../../utils/colors.js';
import { ShellContext } from './context.js';

export async function runIpIntelligence(ctx: ShellContext, address?: string) {
    if (!address) {
      console.log(colors.yellow('Usage: ip <address>'));
      console.log(colors.gray('  Examples: ip 8.8.8.8 | ip 192.168.1.1'));
      return;
    }

    console.log(colors.gray(`Looking up ${address} using local GeoLite2 database...`));

    try {
      // Fix import path: from src/cli/tui/commands/ip.ts to src/mcp/ip-intel.js
      const { getIpInfo, isGeoIPAvailable } = await import('../../../mcp/ip-intel.js');

      if (!isGeoIPAvailable()) {
        console.log(colors.gray(`Downloading GeoLite2 database...`));
      }

      const info = await getIpInfo(address);

      if (info.bogon) {
          console.log(colors.yellow(`
⚠  ${address} is a Bogon/Private IP.`));
          console.log(colors.gray(`   Type: ${info.bogonType}`));
          ctx.lastResponse = info;
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
      ctx.lastResponse = info;

    } catch (error: any) {
      console.error(colors.red(`IP Lookup Failed: ${error.message}`));
    }
    console.log(''); // Spacer
}
