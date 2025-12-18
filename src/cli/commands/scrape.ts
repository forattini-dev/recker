import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';

export function registerScrapeCommand(program: Command) {
  program
    .command('scrape')
    .alias('extract')
    .description('Extract data from web pages using CSS selectors or built-in extractors')
    .argument('<url>', {
      type: 'url',
      description: 'URL to scrape',
      example: 'example.com',
    })
    .option('select', {
      type: 'string',
      short: 's',
      description: 'CSS selector to extract elements',
      example: 'h1',
    })
    .option('attr', {
      type: 'string',
      short: 'a',
      description: 'Extract specific attribute (use with --select)',
      example: 'href',
    })
    .option('links', {
      short: 'L',
      description: 'Extract all links with text and href',
    })
    .option('images', {
      short: 'I',
      description: 'Extract all images with src and alt',
    })
    .option('meta', {
      short: 'M',
      description: 'Extract all meta tags',
    })
    .option('tables', {
      short: 'T',
      description: 'Extract tables as structured JSON',
    })
    .option('scripts', {
      short: 'S',
      description: 'Extract all external script sources',
    })
    .option('jsonld', {
      description: 'Extract JSON-LD structured data',
    })
    .example('rek scrape example.com', 'Show basic page info')
    .example('rek scrape example.com -s "h1"', 'Extract all h1 text')
    .example('rek scrape example.com -s "a" -a href', 'Extract link hrefs')
    .example('rek scrape example.com --links', 'Get all links with text')
    .example('rek scrape example.com --tables', 'Extract tables as JSON')
    .example('rek scrape example.com --jsonld', 'Get structured data')
    .action(async (url: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      // 2. Dynamic Imports
      const { ScrapeDocument } = await import('../../scrape/document.js');
      const { Client } = await import('../../core/client.js');

      // Normalize URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      console.log(colors.gray(`Fetching ${url}...`));

      try {
        const client = new Client();
        const response = await client.get(url);
        const html = await response.text();
        const doc = await ScrapeDocument.create(html, { baseUrl: url });

        // Check if any extraction flag is set
        const hasExtraction = options.select || options.links || options.images || options.meta || options.tables || options.scripts || options.jsonld;

        // Default: show basic page info
        if (!hasExtraction) {
          const title = doc.text('title') || 'N/A';
          const description = doc.attr('meta[name="description"]', 'content') || 'N/A';
          const h1 = doc.text('h1') || 'N/A';
          const linkCount = doc.links().length;
          const imageCount = doc.images().length;

          console.log(`
${colors.bold(colors.cyan('📄 Page Info'))}

${colors.bold('Title:')}       ${title}
${colors.bold('Description:')} ${description.slice(0, 100)}${description.length > 100 ? '...' : ''}
${colors.bold('H1:')}          ${h1}
${colors.bold('Links:')}       ${linkCount}
${colors.bold('Images:')}      ${imageCount}
`);
          return;
        }

        // CSS Selector extraction
        if (options.select) {
          if (options.attr) {
            // Extract attribute
            const values = doc.attrs(options.select, options.attr);
            console.log(`\n${colors.bold(`Found ${values.length} values for "${options.attr}" in "${options.select}"`)}\n`);
            values.slice(0, 50).forEach((value, i) => {
              if (value) {
                console.log(`${colors.gray(`${i + 1}.`)} ${value}`);
              }
            });
            if (values.length > 50) {
              console.log(colors.gray(`\n... and ${values.length - 50} more`));
            }
          } else {
            // Extract text
            const texts = doc.texts(options.select);
            console.log(`\n${colors.bold(`Found ${texts.length} elements matching "${options.select}"`)}\n`);
            texts.slice(0, 50).forEach((text, i) => {
              const trimmed = text.trim();
              if (trimmed) {
                console.log(`${colors.gray(`${i + 1}.`)} ${trimmed.slice(0, 200)}`);
              }
            });
            if (texts.length > 50) {
              console.log(colors.gray(`\n... and ${texts.length - 50} more`));
            }
          }
          return;
        }

        // Extract links
        if (options.links) {
          const links = doc.links();
          console.log(`\n${colors.bold(`Found ${links.length} links`)}\n`);

          links.slice(0, 50).forEach((link, i) => {
            const text = (link.text || '').trim().slice(0, 50) || '[no text]';
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.cyan(text)}`);
            console.log(`   ${colors.gray(link.href)}`);
          });

          if (links.length > 50) {
            console.log(colors.gray(`\n... and ${links.length - 50} more`));
          }
          return;
        }

        // Extract images
        if (options.images) {
          const images = doc.images();
          console.log(`\n${colors.bold(`Found ${images.length} images`)}\n`);

          images.slice(0, 30).forEach((img, i) => {
            const alt = img.alt || '[no alt]';
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.cyan(alt.slice(0, 50))}`);
            console.log(`   ${colors.gray(img.src)}`);
          });

          if (images.length > 30) {
            console.log(colors.gray(`\n... and ${images.length - 30} more`));
          }
          return;
        }

        // Extract meta tags
        if (options.meta) {
          const meta = doc.meta();
          const entries = Object.entries(meta);
          console.log(`\n${colors.bold(`Found ${entries.length} meta entries`)}\n`);

          entries.forEach(([name, content]) => {
            if (name && content) {
              const value = String(content);
              console.log(`${colors.cyan(name)}: ${value.slice(0, 100)}${value.length > 100 ? '...' : ''}`);
            }
          });
          return;
        }

        // Extract tables
        if (options.tables) {
          const tables = doc.tables();
          console.log(`\n${colors.bold(`Found ${tables.length} tables`)}\n`);

          tables.slice(0, 5).forEach((table, tableIndex) => {
            console.log(`${colors.bold(`Table ${tableIndex + 1}:`)} ${table.rows?.length || 0} rows`);
            console.log(JSON.stringify((table.rows || []).slice(0, 10), null, 2));
            if ((table.rows?.length || 0) > 10) {
              console.log(colors.gray(`... and ${(table.rows?.length || 0) - 10} more rows`));
            }
            console.log('');
          });
          return;
        }

        // Extract scripts
        if (options.scripts) {
          const scripts = doc.scripts();
          const external = scripts.filter(s => s.src);
          const inline = scripts.filter(s => !s.src);

          console.log(`\n${colors.bold(`Found ${external.length} external scripts, ${inline.length} inline`)}\n`);

          if (external.length > 0) {
            console.log(colors.bold('External Scripts:'));
            external.slice(0, 20).forEach((script, i) => {
              console.log(`${colors.gray(`${i + 1}.`)} ${script.src}`);
            });
            if (external.length > 20) {
              console.log(colors.gray(`... and ${external.length - 20} more`));
            }
          }
          return;
        }

        // Extract JSON-LD
        if (options.jsonld) {
          const jsonld = doc.jsonLd();
          console.log(`\n${colors.bold(`Found ${jsonld.length} JSON-LD blocks`)}\n`);

          jsonld.forEach((data, i) => {
            console.log(`${colors.bold(`Block ${i + 1}:`)} ${data['@type'] || 'Unknown type'}`);
            console.log(JSON.stringify(data, null, 2));
            console.log('');
          });
          return;
        }

      } catch (error: any) {
        console.error(colors.red(`Scrape failed: ${error.message}`));
        process.exit(1);
      }
    });
}