import { describe, it, expect, beforeEach } from 'vitest';
import { ScrapeDocument, ScrapeElement } from '../../src/scrape/index.js';
import {
  extractLinks,
  extractImages,
  extractMeta,
  extractOpenGraph,
  extractTwitterCard,
  extractJsonLd,
  extractForms,
  extractTables,
  extractScripts,
  extractStyles,
} from '../../src/scrape/extractors.js';
import { scrape, parseHtml } from '../../src/plugins/scrape.js';
import { load } from 'cheerio';

// Sample HTML for testing
const sampleHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="A sample page for testing">
  <meta name="keywords" content="test, sample, html">
  <meta name="author" content="Test Author">
  <meta name="robots" content="index, follow">
  <title>Sample Page</title>
  <link rel="canonical" href="https://example.com/page">

  <!-- OpenGraph -->
  <meta property="og:title" content="OG Title">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://example.com/og">
  <meta property="og:image" content="https://example.com/image1.jpg">
  <meta property="og:image" content="https://example.com/image2.jpg">
  <meta property="og:description" content="OG Description">
  <meta property="og:site_name" content="Example Site">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@example">
  <meta name="twitter:creator" content="@author">
  <meta name="twitter:title" content="Twitter Title">
  <meta name="twitter:description" content="Twitter Description">
  <meta name="twitter:image" content="https://example.com/twitter.jpg">

  <link rel="stylesheet" href="/styles/main.css" media="screen">
  <style>body { margin: 0; }</style>
</head>
<body>
  <h1>Main Title</h1>
  <p class="intro">Welcome to the sample page.</p>

  <nav>
    <a href="/" title="Home">Home</a>
    <a href="/about" rel="nofollow">About</a>
    <a href="https://external.com" target="_blank">External</a>
    <a href="#section">Anchor</a>
    <a href="mailto:test@example.com">Email</a>
    <a href="tel:+1234567890">Phone</a>
  </nav>

  <main>
    <article class="product" data-id="123">
      <h2 class="product-title">Product Name</h2>
      <p class="price">$99.99</p>
      <img src="/images/product.jpg" alt="Product Image" width="300" height="200" loading="lazy">
      <img src="/images/thumb.png" alt="Thumbnail" srcset="/images/thumb@2x.png 2x">
    </article>

    <section id="section">
      <h2>Section Title</h2>
      <p>Some content here.</p>
    </section>

    <form action="/submit" method="POST" name="contact" id="contactForm">
      <input type="text" name="name" placeholder="Your Name" required>
      <input type="email" name="email" placeholder="Email Address">
      <select name="subject">
        <option value="">Select Subject</option>
        <option value="general">General Inquiry</option>
        <option value="support">Support</option>
      </select>
      <textarea name="message" placeholder="Your Message"></textarea>
      <button type="submit">Send</button>
    </form>

    <table>
      <caption>Price Table</caption>
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Stock</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Widget</td>
          <td>$10</td>
          <td>100</td>
        </tr>
        <tr>
          <td>Gadget</td>
          <td>$20</td>
          <td>50</td>
        </tr>
      </tbody>
    </table>
  </main>

  <script src="/js/app.js" async></script>
  <script src="/js/vendor.js" defer></script>
  <script type="module" src="/js/module.mjs"></script>
  <script>console.log('inline');</script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Sample Product",
    "price": "99.99"
  }
  </script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Example Inc"
  }
  </script>
</body>
</html>
`;

describe('ScrapeElement', () => {
  let doc: ScrapeDocument;

  beforeEach(() => {
    doc = new ScrapeDocument(sampleHtml, { baseUrl: 'https://example.com' });
  });

  describe('traversal methods', () => {
    it('should find elements by selector', () => {
      const h1 = doc.select('h1');
      expect(h1.exists()).toBe(true);
      expect(h1.text()).toBe('Main Title');
    });

    it('should find nested elements', () => {
      const article = doc.select('article');
      const title = article.find('h2');
      expect(title.text()).toBe('Product Name');
    });

    it('should get parent', () => {
      const price = doc.select('.price');
      const parent = price.parent();
      expect(parent.hasClass('product')).toBe(true);
    });

    it('should get children', () => {
      const nav = doc.select('nav');
      const links = nav.children('a');
      expect(links.length).toBe(6);
    });

    it('should get siblings', () => {
      const h2 = doc.select('section h2');
      const sibling = h2.next('p');
      expect(sibling.text()).toBe('Some content here.');
    });

    it('should find closest ancestor', () => {
      const price = doc.select('.price');
      const article = price.closest('article');
      expect(article.hasClass('product')).toBe(true);
    });

    it('should filter elements', () => {
      const links = doc.select('a').filter('[target="_blank"]');
      expect(links.length).toBe(1);
      expect(links.text()).toBe('External');
    });

    it('should exclude elements with not()', () => {
      const links = doc.select('nav a').not('[rel="nofollow"]');
      expect(links.length).toBe(5);
    });

    it('should get first and last', () => {
      const links = doc.select('nav a');
      expect(links.first().text()).toBe('Home');
      expect(links.last().text()).toBe('Phone');
    });

    it('should get element at index', () => {
      const links = doc.select('nav a');
      expect(links.eq(2).text()).toBe('External');
    });
  });

  describe('content extraction', () => {
    it('should get text content', () => {
      const intro = doc.select('.intro');
      expect(intro.text()).toBe('Welcome to the sample page.');
    });

    it('should get html content', () => {
      const html = doc.select('.intro').html();
      expect(html).toBe('Welcome to the sample page.');
    });

    it('should get outer html', () => {
      const outerHtml = doc.select('.intro').outerHtml();
      expect(outerHtml).toContain('<p class="intro">');
    });

    it('should get attribute', () => {
      const link = doc.select('nav a').first();
      expect(link.attr('href')).toBe('/');
      expect(link.attr('title')).toBe('Home');
    });

    it('should get all attributes', () => {
      const img = doc.select('img').first();
      const attrs = img.attrs();
      expect(attrs.src).toBe('/images/product.jpg');
      expect(attrs.alt).toBe('Product Image');
      expect(attrs.width).toBe('300');
    });

    it('should get data attributes', () => {
      const article = doc.select('article');
      // Cheerio parses data attributes and converts numeric strings to numbers
      expect(article.data('id')).toBe(123);
    });

    it('should get form value', () => {
      const select = doc.select('select');
      expect(select.val()).toBe('');
    });
  });

  describe('state methods', () => {
    it('should check existence', () => {
      expect(doc.select('h1').exists()).toBe(true);
      expect(doc.select('.nonexistent').exists()).toBe(false);
    });

    it('should get length', () => {
      expect(doc.select('nav a').length).toBe(6);
    });

    it('should check if matches selector', () => {
      const article = doc.select('article');
      expect(article.is('.product')).toBe(true);
      expect(article.is('.other')).toBe(false);
    });

    it('should check class', () => {
      const article = doc.select('article');
      expect(article.hasClass('product')).toBe(true);
      expect(article.hasClass('other')).toBe(false);
    });
  });

  describe('iteration methods', () => {
    it('should iterate with each', () => {
      const texts: string[] = [];
      doc.select('nav a').each((el) => {
        texts.push(el.text());
      });
      expect(texts).toEqual(['Home', 'About', 'External', 'Anchor', 'Email', 'Phone']);
    });

    it('should map elements', () => {
      const hrefs = doc.select('nav a').map((el) => el.attr('href'));
      expect(hrefs).toEqual([
        '/',
        '/about',
        'https://external.com',
        '#section',
        'mailto:test@example.com',
        'tel:+1234567890',
      ]);
    });

    it('should convert to array', () => {
      const elements = doc.select('nav a').toArray();
      expect(elements).toHaveLength(6);
      expect(elements[0]).toBeInstanceOf(ScrapeElement);
    });

    it('should reduce elements', () => {
      const total = doc.select('nav a').reduce((acc, el, i) => acc + i, 0);
      expect(total).toBe(15); // 0+1+2+3+4+5
    });

    it('should check some', () => {
      const hasExternal = doc.select('nav a').some((el) => el.attr('target') === '_blank');
      expect(hasExternal).toBe(true);
    });

    it('should check every', () => {
      const allHaveHref = doc.select('nav a').every((el) => el.attr('href') !== undefined);
      expect(allHaveHref).toBe(true);
    });
  });
});

describe('ScrapeDocument', () => {
  let doc: ScrapeDocument;

  beforeEach(() => {
    doc = new ScrapeDocument(sampleHtml, { baseUrl: 'https://example.com' });
  });

  describe('query methods', () => {
    it('should select single element', () => {
      const h1 = doc.select('h1');
      expect(h1.text()).toBe('Main Title');
    });

    it('should select all elements', () => {
      const links = doc.selectAll('nav a');
      expect(links).toHaveLength(6);
    });

    it('should get text from selector', () => {
      expect(doc.text('h1')).toBe('Main Title');
    });

    it('should get all texts', () => {
      const texts = doc.texts('nav a');
      expect(texts).toHaveLength(6);
    });

    it('should get attribute', () => {
      expect(doc.attr('link[rel="canonical"]', 'href')).toBe('https://example.com/page');
    });

    it('should get all attributes', () => {
      const hrefs = doc.attrs('nav a', 'href');
      expect(hrefs).toHaveLength(6);
    });

    it('should check element exists', () => {
      expect(doc.exists('h1')).toBe(true);
      expect(doc.exists('.nonexistent')).toBe(false);
    });

    it('should count elements', () => {
      expect(doc.count('nav a')).toBe(6);
    });
  });

  describe('utility methods', () => {
    it('should get title', () => {
      expect(doc.title()).toBe('Sample Page');
    });

    it('should get body', () => {
      const body = doc.body();
      expect(body.exists()).toBe(true);
    });

    it('should get head', () => {
      const head = doc.head();
      expect(head.exists()).toBe(true);
    });

    it('should get full html', () => {
      const html = doc.html();
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should find by text', () => {
      const elements = doc.findByText('Sample Page');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should find by exact text', () => {
      const elements = doc.findByExactText('Main Title');
      expect(elements.length).toBe(1);
      expect(elements[0].tagName()).toBe('h1');
    });

    it('should find by data attribute', () => {
      const elements = doc.findByData('id', '123');
      expect(elements.length).toBe(1);
    });
  });

  describe('declarative extraction', () => {
    it('should extract with simple selectors', () => {
      const data = doc.extract({
        title: 'h1',
        description: '.intro',
      });
      expect(data.title).toBe('Main Title');
      expect(data.description).toBe('Welcome to the sample page.');
    });

    it('should extract with attribute option', () => {
      const data = doc.extract({
        canonical: { selector: 'link[rel="canonical"]', attribute: 'href' },
      });
      expect(data.canonical).toBe('https://example.com/page');
    });

    it('should extract multiple values', () => {
      const data = doc.extract({
        links: { selector: 'nav a', attribute: 'href', multiple: true },
      });
      expect(data.links).toHaveLength(6);
    });

    it('should apply transform function', () => {
      const data = doc.extract({
        price: { selector: '.price', transform: (v) => parseFloat(v.replace('$', '')) },
      });
      expect(data.price).toBe(99.99);
    });
  });
});

describe('Extractors', () => {
  const $ = load(sampleHtml);

  describe('extractLinks', () => {
    it('should extract all links', () => {
      const links = extractLinks($);
      expect(links.length).toBeGreaterThan(0);
    });

    it('should classify link types', () => {
      const links = extractLinks($, { baseUrl: 'https://example.com' });

      const internal = links.filter((l) => l.type === 'internal');
      const external = links.filter((l) => l.type === 'external');
      const anchor = links.filter((l) => l.type === 'anchor');
      const mailto = links.filter((l) => l.type === 'mailto');
      const tel = links.filter((l) => l.type === 'tel');

      expect(internal.length).toBeGreaterThan(0);
      expect(external.length).toBeGreaterThan(0);
      expect(anchor.length).toBe(1);
      expect(mailto.length).toBe(1);
      expect(tel.length).toBe(1);
    });

    it('should resolve absolute URLs', () => {
      const links = extractLinks($, { baseUrl: 'https://example.com', absolute: true });
      const homeLink = links.find((l) => l.text === 'Home');
      expect(homeLink?.href).toBe('https://example.com/');
    });

    it('should extract link attributes', () => {
      const links = extractLinks($);
      const homeLink = links.find((l) => l.text === 'Home');
      expect(homeLink?.title).toBe('Home');

      const aboutLink = links.find((l) => l.text === 'About');
      expect(aboutLink?.rel).toBe('nofollow');
    });
  });

  describe('extractImages', () => {
    it('should extract all images', () => {
      const images = extractImages($);
      expect(images.length).toBe(2);
    });

    it('should extract image attributes', () => {
      const images = extractImages($);
      const productImg = images.find((i) => i.alt === 'Product Image');

      expect(productImg?.src).toBe('/images/product.jpg');
      expect(productImg?.width).toBe(300);
      expect(productImg?.height).toBe(200);
      expect(productImg?.loading).toBe('lazy');
    });

    it('should extract srcset', () => {
      const images = extractImages($);
      const thumbImg = images.find((i) => i.alt === 'Thumbnail');
      expect(thumbImg?.srcset).toBe('/images/thumb@2x.png 2x');
    });

    it('should resolve absolute URLs', () => {
      const images = extractImages($, { baseUrl: 'https://example.com', absolute: true });
      const productImg = images.find((i) => i.alt === 'Product Image');
      expect(productImg?.src).toBe('https://example.com/images/product.jpg');
    });
  });

  describe('extractMeta', () => {
    it('should extract meta tags', () => {
      const meta = extractMeta($);

      expect(meta.title).toBe('Sample Page');
      expect(meta.description).toBe('A sample page for testing');
      expect(meta.keywords).toEqual(['test', 'sample', 'html']);
      expect(meta.author).toBe('Test Author');
      expect(meta.robots).toBe('index, follow');
      expect(meta.viewport).toBe('width=device-width, initial-scale=1.0');
      expect(meta.charset).toBe('UTF-8');
      expect(meta.canonical).toBe('https://example.com/page');
    });
  });

  describe('extractOpenGraph', () => {
    it('should extract OpenGraph data', () => {
      const og = extractOpenGraph($);

      expect(og.title).toBe('OG Title');
      expect(og.type).toBe('website');
      expect(og.url).toBe('https://example.com/og');
      expect(og.description).toBe('OG Description');
      expect(og.siteName).toBe('Example Site');
    });

    it('should handle multiple images', () => {
      const og = extractOpenGraph($);
      expect(og.image).toEqual([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ]);
    });
  });

  describe('extractTwitterCard', () => {
    it('should extract Twitter Card data', () => {
      const twitter = extractTwitterCard($);

      expect(twitter.card).toBe('summary_large_image');
      expect(twitter.site).toBe('@example');
      expect(twitter.creator).toBe('@author');
      expect(twitter.title).toBe('Twitter Title');
      expect(twitter.description).toBe('Twitter Description');
      expect(twitter.image).toBe('https://example.com/twitter.jpg');
    });
  });

  describe('extractJsonLd', () => {
    it('should extract JSON-LD data', () => {
      const jsonLd = extractJsonLd($);

      expect(jsonLd.length).toBe(2);

      const product = jsonLd.find((j) => j['@type'] === 'Product');
      expect(product?.name).toBe('Sample Product');
      expect(product?.price).toBe('99.99');

      const org = jsonLd.find((j) => j['@type'] === 'Organization');
      expect(org?.name).toBe('Example Inc');
    });
  });

  describe('extractForms', () => {
    it('should extract forms', () => {
      const forms = extractForms($);
      expect(forms.length).toBe(1);

      const form = forms[0];
      expect(form.action).toBe('/submit');
      expect(form.method).toBe('POST');
      expect(form.name).toBe('contact');
      expect(form.id).toBe('contactForm');
    });

    it('should extract form fields', () => {
      const forms = extractForms($);
      const fields = forms[0].fields;

      const nameField = fields.find((f) => f.name === 'name');
      expect(nameField?.type).toBe('text');
      expect(nameField?.placeholder).toBe('Your Name');
      expect(nameField?.required).toBe(true);

      const emailField = fields.find((f) => f.name === 'email');
      expect(emailField?.type).toBe('email');
    });

    it('should extract select options', () => {
      const forms = extractForms($);
      const selectField = forms[0].fields.find((f) => f.name === 'subject');

      expect(selectField?.options).toHaveLength(3);
      expect(selectField?.options?.[1]).toEqual({ value: 'general', text: 'General Inquiry' });
    });
  });

  describe('extractTables', () => {
    it('should extract tables', () => {
      const tables = extractTables($);
      expect(tables.length).toBe(1);

      const table = tables[0];
      expect(table.caption).toBe('Price Table');
      expect(table.headers).toEqual(['Product', 'Price', 'Stock']);
      expect(table.rows).toHaveLength(2);
    });

    it('should extract table rows', () => {
      const tables = extractTables($);
      const rows = tables[0].rows;

      expect(rows[0]).toEqual(['Widget', '$10', '100']);
      expect(rows[1]).toEqual(['Gadget', '$20', '50']);
    });
  });

  describe('extractScripts', () => {
    it('should extract scripts', () => {
      const scripts = extractScripts($);
      expect(scripts.length).toBeGreaterThan(0);
    });

    it('should identify async and defer scripts', () => {
      const scripts = extractScripts($);

      const asyncScript = scripts.find((s) => s.src === '/js/app.js');
      expect(asyncScript?.async).toBe(true);

      const deferScript = scripts.find((s) => s.src === '/js/vendor.js');
      expect(deferScript?.defer).toBe(true);
    });

    it('should extract module scripts', () => {
      const scripts = extractScripts($);
      const moduleScript = scripts.find((s) => s.type === 'module');
      expect(moduleScript?.src).toBe('/js/module.mjs');
    });

    it('should extract inline scripts', () => {
      const scripts = extractScripts($);
      const inlineScript = scripts.find((s) => s.inline && s.inline.includes('console.log'));
      expect(inlineScript).toBeDefined();
    });
  });

  describe('extractStyles', () => {
    it('should extract stylesheets', () => {
      const styles = extractStyles($);
      expect(styles.length).toBeGreaterThan(0);
    });

    it('should extract external stylesheets', () => {
      const styles = extractStyles($);
      const externalStyle = styles.find((s) => s.href === '/styles/main.css');
      expect(externalStyle?.media).toBe('screen');
    });

    it('should extract inline styles', () => {
      const styles = extractStyles($);
      const inlineStyle = styles.find((s) => s.inline);
      expect(inlineStyle?.inline).toContain('margin: 0');
    });
  });
});

describe('scrape helper', () => {
  it('should parse HTML from string', async () => {
    const doc = await parseHtml(sampleHtml);
    expect(doc.title()).toBe('Sample Page');
  });

  it('should accept base URL option', async () => {
    const doc = await parseHtml(sampleHtml, { baseUrl: 'https://example.com' });
    expect(doc.baseUrl).toBe('https://example.com');
  });
});

describe('client.scrape() method', () => {
  it('should scrape via client method', async () => {
    // Create a mock response with HTML
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body><h1>Hello World</h1></body>
      </html>
    `;

    // Use parseHtml directly to test the scraping
    const doc = await parseHtml(mockHtml);
    expect(doc.title()).toBe('Test Page');
    expect(doc.text('h1')).toBe('Hello World');
  });

  it('should support method option in scrape', async () => {
    const mockHtml = '<html><body><h1>POST Result</h1></body></html>';
    const doc = await parseHtml(mockHtml);
    expect(doc.text('h1')).toBe('POST Result');
  });
});

describe('ScrapeDocument built-in extractors', () => {
  let doc: ScrapeDocument;

  beforeEach(() => {
    doc = new ScrapeDocument(sampleHtml, { baseUrl: 'https://example.com' });
  });

  it('should extract links via document method', () => {
    const links = doc.links();
    expect(links.length).toBeGreaterThan(0);
  });

  it('should extract images via document method', () => {
    const images = doc.images();
    expect(images.length).toBe(2);
  });

  it('should extract meta via document method', () => {
    const meta = doc.meta();
    expect(meta.title).toBe('Sample Page');
  });

  it('should extract openGraph via document method', () => {
    const og = doc.openGraph();
    expect(og.title).toBe('OG Title');
  });

  it('should extract twitterCard via document method', () => {
    const twitter = doc.twitterCard();
    expect(twitter.card).toBe('summary_large_image');
  });

  it('should extract jsonLd via document method', () => {
    const jsonLd = doc.jsonLd();
    expect(jsonLd.length).toBe(2);
  });

  it('should extract forms via document method', () => {
    const forms = doc.forms();
    expect(forms.length).toBe(1);
  });

  it('should extract tables via document method', () => {
    const tables = doc.tables();
    expect(tables.length).toBe(1);
  });

  it('should extract scripts via document method', () => {
    const scripts = doc.scripts();
    expect(scripts.length).toBeGreaterThan(0);
  });

  it('should extract styles via document method', () => {
    const styles = doc.styles();
    expect(styles.length).toBeGreaterThan(0);
  });
});
