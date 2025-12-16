import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';
import { promises as fs } from 'node:fs';
import pathMod from 'node:path';
import { installCurlImpersonate, hasImpersonate, getCurlPath } from '../../utils/binary-manager.js';

const uploadSchema: CommandSchema = {
  name: 'upload',
  description: 'Upload a file to a URL',
  params: {
    field: { type: 'string', default: 'file', description: 'Form field name' },
  },
  flags: {
    progress: { description: 'Show upload progress', default: true },
    'no-progress': { description: 'Disable progress bar' }
  },
  examples: [
    { cmd: 'rek upload api.com/files ./image.png', desc: 'Simple upload' },
    { cmd: 'rek upload api.com/files data.json field=doc', desc: 'Custom field' }
  ]
};

const downloadSchema: CommandSchema = {
  name: 'download',
  description: 'Download a file from a URL',
  flags: {
    resume: { description: 'Resume partial download', default: false },
    progress: { description: 'Show progress', default: true },
    'no-progress': { description: 'Disable progress' }
  },
  examples: [
    { cmd: 'rek download example.com/file.zip', desc: 'Download' },
    { cmd: 'rek download example.com/large.iso resume', desc: 'Resume download' }
  ]
};

const proxySchema: CommandSchema = {
  name: 'proxy',
  description: 'Route requests through a proxy',
  params: {
    method: { type: 'string', default: 'GET', description: 'HTTP Method' },
  },
  examples: [
    { cmd: 'rek proxy http://127.0.0.1:8080 api.com/get', desc: 'Proxy GET' },
    { cmd: 'rek proxy socks5://127.0.0.1:9050 api.com/post method=POST', desc: 'SOCKS5 POST' }
  ]
};

export function registerUtilsCommands(program: Command) {
  // Upload
  program.command('upload')
    .description(uploadSchema.description)
    .argument('<url>', 'Target URL')
    .argument('<file>', 'File path')
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(uploadSchema))
    .action(async (url, file, rawArgs) => {
      const { data, options, headers } = RekArgs.parse(rawArgs, uploadSchema);
      const showProgress = options['no-progress'] ? false : (options.progress !== false);

      if (!url.startsWith('http')) url = `https://${url}`;

      const { createClient } = await import('../../core/client.js');
      
      try {
        await fs.access(file);
        const stats = await fs.stat(file);
        
        console.log(colors.gray(`Uploading ${pathMod.basename(file)} (${(stats.size / 1024).toFixed(1)} KB)...`));

        const client = createClient();
        const fileContent = await fs.readFile(file);
        const boundary = `----ReckerBoundary${Date.now()}`;
        const filename = pathMod.basename(file);

        const bodyParts = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="${data.field}"; filename="${filename}"`, 
          'Content-Type: application/octet-stream',
          '',
          ''
        ];

        const header = Buffer.from(bodyParts.join('\r\n'));
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, fileContent, footer]);

        const response = await client.post(url, body, {
          headers: {
            ...headers,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
        });

        console.log(colors.green(`✔ Upload complete: ${response.status} ${response.statusText}`));
        const text = await response.text();
        if (text) console.log(text);

      } catch (err: any) {
        console.error(colors.red(`Upload Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Download
  program.command('download')
    .description(downloadSchema.description)
    .argument('<url>', 'Source URL')
    .argument('[args...]', 'Output path and options')
    .addHelpText('after', generateHelp(downloadSchema))
    .action(async (url, rawArgs) => {
      const { options, headers, args } = RekArgs.parse(rawArgs, downloadSchema);
      const output = args[0] as string; // Optional positional arg
      const showProgress = options['no-progress'] ? false : (options.progress !== false);
      const resume = !!options.resume;

      if (!url.startsWith('http')) url = `https://${url}`;
      
      const { downloadToFile } = await import('../../utils/download.js');
      const { createClient } = await import('../../core/client.js');

      const urlPath = new URL(url).pathname;
      const filename = output || pathMod.basename(urlPath) || 'download';

      console.log(colors.gray(`Downloading to ${filename}...`));

      try {
        const client = createClient();
        await downloadToFile(client, url, filename, {
          resume,
          headers,
          onProgress: showProgress ? (p) => {
            const total = p.total || 0;
            const pct = total > 0 ? Math.round((p.loaded / total) * 100) : 0;
            const mb = (p.loaded / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r  ${pct}% (${mb} MB)`);
          } : undefined
        });
        if (showProgress) process.stdout.write('\n');
        console.log(colors.green(`✔ Download complete`));
      } catch (err: any) {
        console.error(colors.red(`Download Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Proxy
  program.command('proxy')
    .description(proxySchema.description)
    .argument('<proxy>', 'Proxy URL')
    .argument('<target>', 'Target URL')
    .argument('[args...]', 'Request options')
    .addHelpText('after', generateHelp(proxySchema))
    .action(async (proxy, target, rawArgs) => {
      const { data, headers } = RekArgs.parse(rawArgs, proxySchema);
      
      if (!target.startsWith('http')) target = `https://${target}`;

      console.log(colors.gray(`Proxy: ${proxy}`));
      console.log(colors.gray(`Target: ${target}`));

      const { createClient } = await import('../../core/client.js');

      try {
        const client = createClient({ proxy: { url: proxy } });
        const method = (data.method as string).toLowerCase() as any;
        
        // Remove known params from data to send rest as body
        const body = { ...data };
        delete body.method;

        const hasBody = Object.keys(body).length > 0;
        const options = hasBody ? { json: body, headers } : { headers };

        const response = await (client as any)[method](target, options);
        console.log(colors.green(`✔ ${response.status} ${response.statusText}`));
        console.log(await response.text());
      } catch (err: any) {
        console.error(colors.red(`Proxy Error: ${err.message}`));
        process.exit(1);
      }
    });

  program.command('setup')
    .description('Install external dependencies (curl-impersonate) for advanced features')
    .action(async () => {
        if (await hasImpersonate()) {
            console.log(colors.green(`✔ curl-impersonate is already installed at:`));
            console.log(colors.gray(getCurlPath()));
            return;
        }
        
        try {
            console.log(colors.cyan('Installing curl-impersonate...'));
            await installCurlImpersonate(console);
        } catch (e: any) {
            console.error(colors.red(`Installation failed: ${e.message}`));
            process.exit(1);
        }
    });
}
