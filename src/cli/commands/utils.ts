import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { promises as fs } from 'node:fs';
import pathMod from 'node:path';
import { installCurlImpersonate, hasImpersonate, getCurlPath } from '../../utils/binary-manager.js';

export function registerUtilsCommands(program: Command) {
  // Upload
  program.command('upload')
    .description('Upload a file to a URL using multipart/form-data')
    .argument('<url>', {
      type: 'url',
      description: 'Target upload URL',
      example: 'api.com/files',
    })
    .argument('<file>', {
      type: 'string',
      description: 'Local file path to upload',
      example: './image.png',
    })
    .option('field', {
      type: 'string',
      short: 'f',
      default: 'file',
      description: 'Form field name',
      example: 'document',
    })
    .option('no-progress', {
      description: 'Disable progress bar',
    })
    .example('rek upload api.com/files ./image.png', 'Simple upload')
    .example('rek upload api.com/files data.json -f doc', 'Custom field name')
    .action(async (url: string, file: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const showProgress = !options['no-progress'];

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
        const fieldName = options.field || 'file';

        const bodyParts = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
          'Content-Type: application/octet-stream',
          '',
          ''
        ];

        const header = Buffer.from(bodyParts.join('\r\n'));
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, fileContent, footer]);

        const response = await client.post(url, body, {
          headers: {
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
    .description('Download a file from a URL')
    .argument('<url>', {
      type: 'url',
      description: 'Source URL to download',
      example: 'example.com/file.zip',
    })
    .argument('[output]', {
      type: 'string',
      description: 'Output file path (default: filename from URL)',
      example: './downloaded.zip',
    })
    .option('resume', {
      short: 'r',
      description: 'Resume partial download',
    })
    .option('no-progress', {
      description: 'Disable progress bar',
    })
    .example('rek download example.com/file.zip', 'Download file')
    .example('rek download example.com/large.iso -r', 'Resume partial download')
    .example('rek download example.com/data.zip ./local.zip', 'Specify output path')
    .action(async (url: string, output: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const showProgress = !options['no-progress'];
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
    .description('Make requests through a proxy server')
    .argument('<proxy>', {
      type: 'url',
      description: 'Proxy server URL',
      example: 'http://127.0.0.1:8080',
    })
    .argument('<target>', {
      type: 'url',
      description: 'Target URL to request',
      example: 'httpbin.org/ip',
    })
    .option('method', {
      type: 'string',
      short: 'm',
      default: 'GET',
      description: 'HTTP method',
      example: 'POST',
    })
    .option('data', {
      type: 'string',
      short: 'd',
      description: 'Request body (JSON)',
      example: '{"key":"value"}',
    })
    .example('rek proxy http://localhost:8080 httpbin.org/ip', 'GET through proxy')
    .example('rek proxy http://proxy:8080 api.com/data -m POST -d \'{"x":1}\'', 'POST with data')
    .action(async (proxy: string, target: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      if (!target.startsWith('http')) target = `https://${target}`;

      console.log(colors.gray(`Proxy: ${proxy}`));
      console.log(colors.gray(`Target: ${target}`));

      const { createClient } = await import('../../core/client.js');

      try {
        const client = createClient({ proxy: { url: proxy } });
        const method = (options.method || 'GET').toLowerCase() as any;

        let requestOptions: any = {};
        if (options.data) {
          try {
            requestOptions.json = JSON.parse(options.data);
          } catch {
            requestOptions.body = options.data;
          }
        }

        const response = await (client as any)[method](target, requestOptions);
        console.log(colors.green(`✔ ${response.status} ${response.statusText}`));
        console.log(await response.text());
      } catch (err: any) {
        console.error(colors.red(`Proxy Error: ${err.message}`));
        process.exit(1);
      }
    });

  program.command('setup')
    .description('Install external dependencies (curl-impersonate) for advanced features')
    .example('rek setup', 'Install curl-impersonate binary')
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
