import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';

const schema: CommandSchema = {
  name: 'scrape',
  description: 'Extract data from web pages with CSS selectors.\nFetches a web page and extracts data using CSS selectors or built-in extractors.',
  params: {
    select: { type: 'string', description: 'CSS selector to extract elements' },
    attr:   { type: 'string', description: 'Extract specific attribute (use with select)' },
  },
  keywords: {
    links:   { description: 'Extract all links with text and href' },
    images:  { description: 'Extract all images with src and alt' },
    meta:    { description: 'Extract all meta tags' },
    tables:  { description: 'Extract tables as structured JSON' },
    scripts: { description: 'Extract all script sources' },
    jsonld:  { description: 'Extract JSON-LD structured data' },
  },
  examples: [
    { cmd: 'rek scrape example.com', desc: 'Basic page info' },
    { cmd: 'rek scrape example.com select="h1"', desc: 'Extract h1 text' },
    { cmd: 'rek scrape example.com select="a" attr=href', desc: 'Extract link hrefs' },
    { cmd: 'rek scrape example.com links', desc: 'All links' },
    { cmd: 'rek scrape example.com tables', desc: 'All tables as JSON' }
  ]
};

export function registerScrapeCommand(program: Command) {
  program
    .command('scrape')
    .alias('extract')
    .description('Extract data from web pages with CSS selectors')
    .argument('<url>', 'URL to scrape')
    .argument('[args...]', 'Options: select=SELECTOR, attr=NAME, links, images...')
    .addHelpText('after', generateHelp(schema))
    .action(async (url, rawArgs: string[]) => {
      // 1. Parse Args
      const { data } = RekArgs.parse(rawArgs, schema);

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
        const hasExtraction = data.select || data.links || data.images || data.meta || data.tables || data.scripts || data.jsonld;

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
        if (data.select) {
          if (data.attr) {
            // Extract attribute
            const values = doc.attrs(data.select, data.attr);
            console.log(`\n${colors.bold(`Found ${values.length} values for "${data.attr}" in "${data.select}"`)}\n`);
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
            const texts = doc.texts(data.select);
            console.log(`\n${colors.bold(`Found ${texts.length} elements matching "${data.select}"`)}\n`);
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
        if (data.links) {
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
        if (data.images) {
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
        if (data.meta) {
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
        if (data.tables) {
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
        if (data.scripts) {
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
        if (data.jsonld) {
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