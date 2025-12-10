import { describe, it, expect } from 'vitest';
import { analyzeSeo, createRulesEngine, SEO_THRESHOLDS, ALL_SEO_RULES } from '../../src/seo/index.js';

describe('SEO Analyzer', () => {
  describe('analyzeSeo', () => {
    it('should analyze a minimal HTML page', async () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Page</title>
        </head>
        <body>
          <h1>Welcome</h1>
          <p>This is a test page with some content.</p>
        </body>
        </html>
      `;

      const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });

      expect(report.url).toBe('https://example.com');
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(report.grade).toMatch(/^[A-F]$/);
      expect(report.checks.length).toBeGreaterThan(0);
    });

    it('should detect missing title', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head></head>
        <body><h1>No title</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const titleCheck = report.checks.find((c) => c.name === 'Title Tag');
      expect(titleCheck).toBeDefined();
      expect(titleCheck?.status).toBe('fail');
    });

    it('should detect good title length', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>This is a good title that is between 50 and 60 chars</title>
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const titleCheck = report.checks.find((c) => c.name === 'Title Length');
      expect(titleCheck).toBeDefined();
      expect(titleCheck?.status).toBe('pass');
    });

    it('should detect short title', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Short</title></head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const titleCheck = report.checks.find((c) => c.name === 'Title Length');
      expect(titleCheck).toBeDefined();
      expect(titleCheck?.status).toBe('warn');
    });

    it('should detect missing meta description', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const descCheck = report.checks.find((c) => c.name === 'Meta Description');
      expect(descCheck).toBeDefined();
      expect(descCheck?.status).toBe('fail');
    });

    it('should detect multiple H1 tags', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <h1>First H1</h1>
          <h1>Second H1</h1>
        </body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const h1Check = report.checks.find((c) => c.name === 'H1 Tag');
      expect(h1Check).toBeDefined();
      expect(h1Check?.status).toBe('warn');
    });

    it('should detect missing H1', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <h2>Only H2</h2>
        </body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const h1Check = report.checks.find((c) => c.name === 'H1 Tag');
      expect(h1Check).toBeDefined();
      expect(h1Check?.status).toBe('fail');
    });

    it('should analyze OpenGraph tags', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description that is long enough to meet the minimum requirements">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:url" content="https://example.com">
          <meta property="og:type" content="website">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const ogUrlCheck = report.checks.find((c) => c.name === 'OG URL');
      expect(ogUrlCheck?.status).toBe('pass');

      const ogImageCheck = report.checks.find((c) => c.name === 'OG Image HTTPS');
      expect(ogImageCheck?.status).toBe('pass');
    });

    it('should detect HTTP og:image', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:image" content="http://example.com/image.jpg">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const ogImageCheck = report.checks.find((c) => c.name === 'OG Image HTTPS');
      expect(ogImageCheck).toBeDefined();
      expect(ogImageCheck?.status).toBe('fail');
    });

    it('should detect images without alt text', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <h1>Page</h1>
          <img src="image1.jpg">
          <img src="image2.jpg" alt="Description">
        </body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const imageCheck = report.checks.find((c) => c.name === 'Image Alt Text');
      expect(imageCheck).toBeDefined();
      expect(imageCheck?.status).toBe('warn');
      expect(report.images.withoutAlt).toBe(1);
      expect(report.images.withAlt).toBe(1);
    });

    it('should detect missing viewport', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const viewportCheck = report.checks.find((c) => c.name === 'Viewport');
      expect(viewportCheck).toBeDefined();
      expect(viewportCheck?.status).toBe('fail');
    });

    it('should detect viewport with disabled scaling', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const scalableCheck = report.checks.find((c) => c.name === 'Viewport Scalable');
      expect(scalableCheck).toBeDefined();
      expect(scalableCheck?.status).toBe('warn');
    });

    it('should analyze JSON-LD structured data', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <script type="application/ld+json">
            {"@context": "https://schema.org", "@type": "Organization", "name": "Test"}
          </script>
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      expect(report.structuredData.count).toBe(1);
      expect(report.structuredData.types).toContain('Organization');

      const structuredCheck = report.checks.find((c) => c.name === 'Structured Data');
      expect(structuredCheck?.status).toBe('pass');
    });
  });

  describe('SEO Rules Engine', () => {
    it('should create engine with all rules by default', () => {
      const engine = createRulesEngine();
      expect(engine.getRules().length).toBe(ALL_SEO_RULES.length);
    });

    it('should filter by category', () => {
      const engine = createRulesEngine({ categories: ['og'] });
      const rules = engine.getRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.category === 'og')).toBe(true);
    });

    it('should exclude categories', () => {
      const engine = createRulesEngine({ excludeCategories: ['og', 'twitter'] });
      const rules = engine.getRules();

      expect(rules.every((r) => r.category !== 'og' && r.category !== 'twitter')).toBe(true);
    });

    it('should filter by minimum severity', () => {
      const engine = createRulesEngine({ minSeverity: 'error' });
      const rules = engine.getRules();

      expect(rules.every((r) => r.severity === 'error')).toBe(true);
    });

    it('should get unique categories', () => {
      const engine = createRulesEngine();
      const categories = engine.getCategories();

      expect(categories.length).toBeGreaterThan(0);
      expect(new Set(categories).size).toBe(categories.length);
    });
  });

  describe('SEO Thresholds', () => {
    it('should have valid title thresholds', () => {
      expect(SEO_THRESHOLDS.title.min).toBeLessThan(SEO_THRESHOLDS.title.ideal.min);
      expect(SEO_THRESHOLDS.title.ideal.max).toBeLessThan(SEO_THRESHOLDS.title.max);
    });

    it('should have valid meta description thresholds', () => {
      expect(SEO_THRESHOLDS.metaDescription.min).toBeLessThan(SEO_THRESHOLDS.metaDescription.ideal.min);
      expect(SEO_THRESHOLDS.metaDescription.ideal.max).toBeLessThan(SEO_THRESHOLDS.metaDescription.max);
    });

    it('should have valid OG thresholds', () => {
      expect(SEO_THRESHOLDS.og.title.max).toBe(90);
      expect(SEO_THRESHOLDS.og.description.max).toBe(200);
    });

    it('should have generic link texts defined', () => {
      expect(SEO_THRESHOLDS.links.genericTexts).toContain('click here');
      expect(SEO_THRESHOLDS.links.genericTexts).toContain('clique aqui');
    });
  });

  describe('Full SEO Report', () => {
    it('should analyze a complete page', async () => {
      const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Empresa XYZ - Soluções Inovadoras para o Seu Negócio</title>
          <meta name="description" content="A Empresa XYZ oferece soluções inovadoras em tecnologia para empresas de todos os portes. Conheça nossos serviços e transforme seu negócio.">
          <link rel="canonical" href="https://example.com">
          <meta property="og:title" content="Empresa XYZ - Soluções Inovadoras">
          <meta property="og:description" content="A Empresa XYZ oferece soluções inovadoras em tecnologia para empresas de todos os portes.">
          <meta property="og:image" content="https://example.com/og-image.jpg">
          <meta property="og:url" content="https://example.com">
          <meta property="og:type" content="website">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="Empresa XYZ">
          <meta name="twitter:description" content="Soluções inovadoras em tecnologia.">
          <script type="application/ld+json">
            {"@context": "https://schema.org", "@type": "Organization", "name": "Empresa XYZ"}
          </script>
        </head>
        <body>
          <h1>Bem-vindo à Empresa XYZ</h1>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
          <h2>Nossos Serviços</h2>
          <p>Oferecemos uma ampla gama de serviços para atender às necessidades do seu negócio.</p>
          <img src="https://example.com/service.jpg" alt="Nossos serviços" width="800" height="600">
          <h2>Por que nos escolher?</h2>
          <p>Com mais de 10 anos de experiência, somos líderes no mercado.</p>
          <a href="/about">Saiba mais sobre nós</a>
          <a href="/contact">Entre em contato</a>
          <a href="https://external.com" rel="nofollow">Parceiro</a>
        </body>
        </html>
      `;

      const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });

      expect(report.grade).toMatch(/^[AB]$/);
      expect(report.score).toBeGreaterThanOrEqual(80);

      // Check content metrics
      expect(report.content.wordCount).toBeGreaterThan(50);
      expect(report.content.paragraphCount).toBe(3);

      // Check headings
      expect(report.headings.h1Count).toBe(1);
      expect(report.headings.hasProperHierarchy).toBe(true);

      // Check links
      expect(report.links.internal).toBe(2);
      expect(report.links.external).toBe(1);

      // Check images
      expect(report.images.total).toBe(1);
      expect(report.images.withAlt).toBe(1);

      // Check social
      expect(report.social.openGraph.present).toBe(true);
      expect(report.social.twitterCard.present).toBe(true);

      // Check technical
      expect(report.technical.hasCanonical).toBe(true);
      expect(report.technical.hasViewport).toBe(true);
      expect(report.technical.hasLang).toBe(true);
      expect(report.technical.langValue).toBe('pt-BR');
    });
  });

  describe('Meta/Facebook/Instagram Rules', () => {
    it('should detect all caps in og:title', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:title" content="THIS IS ALL CAPS TITLE FOR TESTING">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const capsCheck = report.checks.find((c) => c.name === 'OG Title Caps');
      expect(capsCheck).toBeDefined();
      expect(capsCheck?.status).toBe('warn');
    });

    it('should detect excessive emojis in og:description', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:description" content="Check this out! 🎉🎊🎁🔥🚀 Amazing stuff here">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const emojiCheck = report.checks.find((c) => c.name === 'OG Description Emojis');
      expect(emojiCheck).toBeDefined();
      expect(emojiCheck?.status).toBe('info');
    });

    it('should pass Meta complete check when all OG tags present', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:title" content="Test Title">
          <meta property="og:description" content="Test description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:url" content="https://example.com">
          <meta property="og:type" content="website">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const metaComplete = report.checks.find((c) => c.name === 'Meta Complete');
      expect(metaComplete).toBeDefined();
      expect(metaComplete?.status).toBe('pass');
    });

    it('should warn on incomplete Meta OG tags', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:title" content="Test Title">
          <meta property="og:description" content="Test description">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const metaComplete = report.checks.find((c) => c.name === 'Meta Complete');
      expect(metaComplete).toBeDefined();
      expect(metaComplete?.status).toBe('warn');
      expect(metaComplete?.message).toContain('og:image');
    });

    it('should detect expiring tokens in og:image URL', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:image" content="https://example.com/image.jpg?expires=12345&token=abc123">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const urlQuality = report.checks.find((c) => c.name === 'OG Image URL Quality');
      expect(urlQuality).toBeDefined();
      expect(urlQuality?.status).toBe('warn');
    });

    it('should pass og:title emoji check when no emojis', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:title" content="Normal title without emojis">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const emojiCheck = report.checks.find((c) => c.name === 'OG Title Emoji');
      expect(emojiCheck).toBeUndefined(); // No issue means no check result
    });

    it('should detect emoji in og:title', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <meta property="og:title" content="Amazing Product! 🔥">
        </head>
        <body><h1>Page</h1></body>
        </html>
      `;

      const report = await analyzeSeo(html);

      const emojiCheck = report.checks.find((c) => c.name === 'OG Title Emoji');
      expect(emojiCheck).toBeDefined();
      expect(emojiCheck?.status).toBe('warn');
    });
  });
});
