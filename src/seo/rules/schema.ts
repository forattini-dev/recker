import { SeoRule, createResult } from './types.js';

export const schemaRules: SeoRule[] = [
  {
    id: 'json-ld-exists',
    name: 'Structured Data',
    category: 'structured-data',
    severity: 'info',
    description: 'Page should have JSON-LD structured data',
    check: (ctx) => {
      if (ctx.jsonLdCount === undefined) {
        return createResult(
          { id: 'json-ld-exists', name: 'Structured Data', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD count data unavailable)',
          { recommendation: 'This rule checks for JSON-LD structured data to enable rich snippets in search results' }
        );
      }
      if (ctx.jsonLdCount === 0) {
        return createResult(
          { id: 'json-ld-exists', name: 'Structured Data', category: 'structured-data', severity: 'info' },
          'info',
          'No JSON-LD structured data found',
          {
            recommendation: 'Add Schema.org structured data to enable rich snippets in search results.',
            evidence: {
              found: 'No structured data',
              expected: 'At least one JSON-LD block with Schema.org markup',
              impact: 'Pages with structured data can get rich results like star ratings, prices, FAQs, and more.',
              example: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Page Title"}</script>',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data'
            }
          }
        );
      }
      const types = ctx.jsonLdTypes?.join(', ') || 'unknown';
      return createResult(
        { id: 'json-ld-exists', name: 'Structured Data', category: 'structured-data', severity: 'info' },
        'pass',
        `${ctx.jsonLdCount} JSON-LD block(s) found: ${types}`,
        { value: types }
      );
    },
  },
  {
    id: 'schema-standard-types',
    name: 'Schema Types',
    category: 'structured-data',
    severity: 'info',
    description: 'Use standard Schema.org types',
    check: (ctx) => {
      if (!ctx.jsonLdTypes || ctx.jsonLdTypes.length === 0) {
        return createResult(
          { id: 'schema-standard-types', name: 'Schema Types', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (no JSON-LD types detected)',
          { recommendation: 'This rule checks for standard Schema.org types when structured data is present' }
        );
      }
      
            const recommended = [
              'WebSite', 'WebPage', 'Article', 'Product', 'BreadcrumbList',
              'Organization', 'Person', 'LocalBusiness', 'Recipe', 'Event',
              'JobPosting', 'FAQPage', 'HowTo', 'VideoObject',
              'SoftwareApplication', 'Review' // Added new types
            ];      
      // Check if any of the found types are in the recommended list
      const hasStandard = ctx.jsonLdTypes.some(t => recommended.includes(t));
      
      if (!hasStandard) {
        return createResult(
          { id: 'schema-standard-types', name: 'Schema Types', category: 'structured-data', severity: 'info' },
          'info',
          'Using uncommon Schema.org types',
          { value: ctx.jsonLdTypes.join(', '), recommendation: `Consider using standard types like ${recommended.slice(0, 3).join(', ')}` }
        );
      }
      
      return createResult(
        { id: 'schema-standard-types', name: 'Schema Types', category: 'structured-data', severity: 'info' },
        'pass',
        'Using standard Schema.org types',
        { value: ctx.jsonLdTypes.join(', ') }
      );
    },
  },
  {
    id: 'breadcrumbs-presence',
    name: 'Breadcrumbs Presence',
    category: 'structured-data',
    severity: 'info',
    description: 'Breadcrumbs improve navigation and SEO structure',
    check: (ctx) => {
      if (!ctx.hasBreadcrumbsHtml && !ctx.hasBreadcrumbsSchema) {
        return createResult(
          { id: 'breadcrumbs-presence', name: 'Breadcrumbs Presence', category: 'structured-data', severity: 'info' },
          'info',
          'No breadcrumbs found (HTML or Schema.org)',
          {
            recommendation: 'Add breadcrumbs to help users understand their location in your site hierarchy.',
            evidence: {
              found: 'No breadcrumbs',
              expected: 'HTML breadcrumb navigation with BreadcrumbList schema',
              impact: 'Breadcrumbs appear in Google search results and improve user navigation.',
              example: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://example.com/"},{"@type":"ListItem","position":2,"name":"Category","item":"https://example.com/category/"}]}</script>',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb'
            }
          }
        );
      }

      // Both HTML and Schema
      if (ctx.hasBreadcrumbsHtml && ctx.hasBreadcrumbsSchema) {
        return createResult(
          { id: 'breadcrumbs-presence', name: 'Breadcrumbs Presence', category: 'structured-data', severity: 'info' },
          'pass',
          'Breadcrumbs found (HTML + Schema.org)',
          { value: 'HTML + BreadcrumbList schema' }
        );
      }

      // Only schema
      if (ctx.hasBreadcrumbsSchema) {
        return createResult(
          { id: 'breadcrumbs-presence', name: 'Breadcrumbs Presence', category: 'structured-data', severity: 'info' },
          'pass',
          'Breadcrumbs schema found',
          { value: 'BreadcrumbList schema' }
        );
      }

      // Only HTML
      return createResult(
        { id: 'breadcrumbs-presence', name: 'Breadcrumbs Presence', category: 'structured-data', severity: 'info' },
        'info',
        'HTML breadcrumbs found, consider adding Schema.org markup',
        {
          recommendation: 'Add BreadcrumbList schema for better search visibility.',
          evidence: {
            found: 'HTML breadcrumbs only',
            expected: 'BreadcrumbList schema markup',
            impact: 'Schema.org breadcrumbs enable rich results in search.',
            learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb'
          }
        }
      );
    },
  },

  // ==========================================================================
  // Organization Schema (Identity)
  // ==========================================================================
  {
    id: 'schema-organization',
    name: 'Organization Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Organization schema helps search engines understand your business identity',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-organization', name: 'Organization Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for Organization schema when structured data is present' }
        );
      }

      const hasOrg = ctx.jsonLdTypes.some(t =>
        ['Organization', 'LocalBusiness', 'Corporation', 'NGO', 'EducationalOrganization',
         'GovernmentOrganization', 'MedicalOrganization', 'SportsOrganization'].includes(t)
      );

      if (!hasOrg) {
        // Only suggest for homepage-like pages or pages with certain signals
        if (ctx.isStartPage || ctx.url?.endsWith('/') || ctx.hasAboutPageLink) {
          return createResult(
            { id: 'schema-organization', name: 'Organization Schema', category: 'structured-data', severity: 'info' },
            'info',
            'No Organization schema found',
            {
              recommendation: 'Add Organization schema to establish your brand identity with search engines.',
              evidence: {
                found: 'No Organization-type schema',
                expected: 'Organization, LocalBusiness, or similar schema',
                impact: 'Organization schema can trigger Knowledge Panel and improves E-E-A-T signals.',
                example: '{"@context":"https://schema.org","@type":"Organization","name":"Company Name","url":"https://example.com","logo":"https://example.com/logo.png","sameAs":["https://twitter.com/company","https://linkedin.com/company/name"]}',
                learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/organization'
              }
            }
          );
        }
        return createResult(
          { id: 'schema-organization', name: 'Organization Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (not a homepage or about page)',
          { recommendation: 'Organization schema is typically used on homepage or about pages' }
        );
      }

      return createResult(
        { id: 'schema-organization', name: 'Organization Schema', category: 'structured-data', severity: 'info' },
        'pass',
        'Organization schema found',
        { value: ctx.jsonLdTypes.find(t => t.includes('Organization') || t === 'LocalBusiness' || t === 'Corporation') }
      );
    },
  },

  // ==========================================================================
  // FAQ Schema
  // ==========================================================================
  {
    id: 'schema-faq',
    name: 'FAQ Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'FAQ pages should have FAQPage schema for rich results',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-faq', name: 'FAQ Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for FAQPage schema when FAQ content is detected' }
        );
      }

      const hasFaq = ctx.jsonLdTypes.includes('FAQPage');
      const hasQuestionHeadings = ctx.hasQuestionHeadings;
      const faqCount = ctx.faqCount || 0;

      // Page appears to have FAQ content but no schema
      if (!hasFaq && (hasQuestionHeadings || faqCount >= 3)) {
        return createResult(
          { id: 'schema-faq', name: 'FAQ Schema', category: 'structured-data', severity: 'info' },
          'info',
          'FAQ content detected but no FAQPage schema found',
          {
            recommendation: 'Add FAQPage schema to get FAQ rich results in search.',
            evidence: {
              found: `${faqCount} FAQ-like items detected`,
              expected: 'FAQPage schema with Question/Answer items',
              impact: 'FAQ rich results take more SERP space and increase CTR by up to 30%.',
              example: '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Question text?","acceptedAnswer":{"@type":"Answer","text":"Answer text"}}]}',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage'
            }
          }
        );
      }

      if (hasFaq) {
        return createResult(
          { id: 'schema-faq', name: 'FAQ Schema', category: 'structured-data', severity: 'info' },
          'pass',
          'FAQPage schema found'
        );
      }

      return createResult(
        { id: 'schema-faq', name: 'FAQ Schema', category: 'structured-data', severity: 'info' },
        'info',
        'Not applicable (no FAQ content detected)',
        { recommendation: 'This rule suggests FAQPage schema when FAQ-like content is present' }
      );
    },
  },

  // ==========================================================================
  // Article Schema
  // ==========================================================================
  {
    id: 'schema-article',
    name: 'Article Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Blog posts and articles should have Article schema',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-article', name: 'Article Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for Article schema on blog posts and news articles' }
        );
      }

      const hasArticle = ctx.jsonLdTypes.some(t =>
        ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle'].includes(t)
      );

      // Check if page looks like an article (has article element, og:type=article, etc.)
      const looksLikeArticle = ctx.hasArticle ||
        ctx.ogType === 'article' ||
        ctx.ogArticlePublishedTime ||
        ctx.ogArticleAuthor;

      if (!hasArticle && looksLikeArticle) {
        return createResult(
          { id: 'schema-article', name: 'Article Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Article content detected but no Article schema found',
          {
            recommendation: 'Add Article schema for blog posts and news articles.',
            evidence: {
              found: 'Article-like content without Article schema',
              expected: 'Article, BlogPosting, or NewsArticle schema',
              impact: 'Article schema enables article-specific rich results and improves content indexing.',
              example: '{"@context":"https://schema.org","@type":"Article","headline":"Article Title","author":{"@type":"Person","name":"Author Name"},"datePublished":"2024-01-15","dateModified":"2024-01-20"}',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/article'
            }
          }
        );
      }

      if (hasArticle) {
        return createResult(
          { id: 'schema-article', name: 'Article Schema', category: 'structured-data', severity: 'info' },
          'pass',
          `Article schema found: ${ctx.jsonLdTypes.find(t => t.includes('Article') || t === 'BlogPosting')}`
        );
      }

      return createResult(
        { id: 'schema-article', name: 'Article Schema', category: 'structured-data', severity: 'info' },
        'info',
        'Not applicable (no article-like content detected)',
        { recommendation: 'This rule suggests Article schema when article-like content is detected' }
      );
    },
  },

  // ==========================================================================
  // WebSite Schema (for sitelinks searchbox)
  // ==========================================================================
  {
    id: 'schema-website',
    name: 'WebSite Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Homepage should have WebSite schema for sitelinks searchbox',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-website', name: 'WebSite Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for WebSite schema on homepage to enable sitelinks searchbox' }
        );
      }

      const hasWebSite = ctx.jsonLdTypes.includes('WebSite');

      // Only check on homepage
      if (!ctx.isStartPage && !ctx.url?.match(/^https?:\/\/[^\/]+\/?$/)) {
        return createResult(
          { id: 'schema-website', name: 'WebSite Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (not a homepage)',
          { recommendation: 'WebSite schema is typically used on the homepage for sitelinks searchbox' }
        );
      }

      if (!hasWebSite) {
        return createResult(
          { id: 'schema-website', name: 'WebSite Schema', category: 'structured-data', severity: 'info' },
          'info',
          'No WebSite schema found on homepage',
          {
            recommendation: 'Add WebSite schema to enable sitelinks searchbox in Google results.',
            evidence: {
              found: 'No WebSite schema',
              expected: 'WebSite schema with SearchAction for sitelinks searchbox',
              impact: 'WebSite schema can show a search box directly in Google search results.',
              example: '{"@context":"https://schema.org","@type":"WebSite","url":"https://example.com","name":"Site Name","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://example.com/search?q={search_term_string}"},"query-input":"required name=search_term_string"}}',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox'
            }
          }
        );
      }

      return createResult(
        { id: 'schema-website', name: 'WebSite Schema', category: 'structured-data', severity: 'info' },
        'pass',
        'WebSite schema found'
      );
    },
  },

  // ==========================================================================
  // Person Schema (for E-E-A-T and AI visibility)
  // ==========================================================================
  {
    id: 'schema-person',
    name: 'Person Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Person schema strengthens E-E-A-T signals and helps AI understand authorship',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-person', name: 'Person Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for Person schema to strengthen E-E-A-T signals' }
        );
      }

      const hasPerson = ctx.jsonLdTypes.includes('Person');
      const hasArticle = ctx.jsonLdTypes.some(t =>
        ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle'].includes(t)
      );

      // Only suggest for article-type pages or about/team pages
      const isAboutPage = ctx.url?.toLowerCase().includes('/about') ||
                          ctx.url?.toLowerCase().includes('/team') ||
                          ctx.url?.toLowerCase().includes('/author');

      if (!hasPerson && (hasArticle || isAboutPage)) {
        return createResult(
          { id: 'schema-person', name: 'Person Schema', category: 'structured-data', severity: 'info' },
          'info',
          'No Person schema found',
          {
            recommendation: 'Add Person schema to establish authorship and strengthen E-E-A-T signals.',
            evidence: {
              found: 'No Person schema',
              expected: 'Person schema with name, jobTitle, and sameAs properties',
              impact: 'Person schema helps Google and AI systems understand content authorship and expertise. 72% of top-ranking pages use some type of schema.',
              example: '{"@context":"https://schema.org","@type":"Person","name":"John Doe","jobTitle":"SEO Specialist","url":"https://example.com/team/john","sameAs":["https://twitter.com/johndoe","https://linkedin.com/in/johndoe"]}',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/profile-page'
            }
          }
        );
      }

      if (hasPerson) {
        return createResult(
          { id: 'schema-person', name: 'Person Schema', category: 'structured-data', severity: 'info' },
          'pass',
          'Person schema found (strengthens E-E-A-T)'
        );
      }

      return createResult(
        { id: 'schema-person', name: 'Person Schema', category: 'structured-data', severity: 'info' },
        'info',
        'Not applicable (not an article or about/team page)',
        { recommendation: 'Person schema is recommended for article pages and about/team pages' }
      );
    },
  },

  // ==========================================================================
  // Review Schema (for social proof)
  // ==========================================================================
  {
    id: 'schema-review',
    name: 'Review Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Review and AggregateRating schema enables star ratings in search results',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-review', name: 'Review Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for Review schema to enable star ratings in search results' }
        );
      }

      const hasReview = ctx.jsonLdTypes.some(t =>
        ['Review', 'AggregateRating'].includes(t)
      );
      const hasProduct = ctx.jsonLdTypes.includes('Product');
      const hasLocalBusiness = ctx.jsonLdTypes.some(t =>
        ['LocalBusiness', 'Restaurant', 'Hotel', 'Store'].includes(t)
      );

      // Only suggest for product or local business pages
      if (!hasReview && (hasProduct || hasLocalBusiness || ctx.isProductPage)) {
        return createResult(
          { id: 'schema-review', name: 'Review Schema', category: 'structured-data', severity: 'info' },
          'info',
          'No Review/Rating schema found',
          {
            recommendation: 'Add Review or AggregateRating schema to show star ratings in search results.',
            evidence: {
              found: 'No Review schema',
              expected: 'Review or AggregateRating schema',
              impact: 'Pages with schema receive 40% higher CTR than pages without. Star ratings significantly increase click-through rates.',
              example: '{"@context":"https://schema.org","@type":"AggregateRating","ratingValue":"4.5","reviewCount":"89","bestRating":"5"}',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/review-snippet'
            }
          }
        );
      }

      if (hasReview) {
        return createResult(
          { id: 'schema-review', name: 'Review Schema', category: 'structured-data', severity: 'info' },
          'pass',
          'Review/Rating schema found'
        );
      }

      return createResult(
        { id: 'schema-review', name: 'Review Schema', category: 'structured-data', severity: 'info' },
        'info',
        'Not applicable (not a product or local business page)',
        { recommendation: 'Review schema is recommended for product and local business pages' }
      );
    },
  },

  // ==========================================================================
  // Service Schema (for service businesses)
  // ==========================================================================
  {
    id: 'schema-service',
    name: 'Service Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Service businesses should use Service schema to describe offerings',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-service', name: 'Service Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for Service schema to describe business service offerings' }
        );
      }

      const hasService = ctx.jsonLdTypes.some(t =>
        ['Service', 'ProfessionalService', 'FinancialService', 'LegalService'].includes(t)
      );
      const hasLocalBusiness = ctx.jsonLdTypes.some(t =>
        ['LocalBusiness', 'ProfessionalService', 'LegalService', 'FinancialService',
         'AccountingService', 'AutoRepair', 'Dentist', 'MedicalClinic'].includes(t)
      );

      // Check if page mentions services
      const isServicePage = ctx.url?.toLowerCase().includes('/service') ||
                           ctx.url?.toLowerCase().includes('/pricing');

      if (!hasService && (hasLocalBusiness || isServicePage)) {
        return createResult(
          { id: 'schema-service', name: 'Service Schema', category: 'structured-data', severity: 'info' },
          'info',
          'No Service schema found',
          {
            recommendation: 'Add Service schema to help AI understand your specific service offerings.',
            evidence: {
              found: 'LocalBusiness without Service schema',
              expected: 'Service schema with provider, areaServed, and offers',
              impact: 'Service schema helps AI systems accurately represent your business services in generated responses.',
              example: '{"@context":"https://schema.org","@type":"Service","name":"Tax Preparation","provider":{"@type":"LocalBusiness","name":"ABC Accounting"},"areaServed":"Austin, TX","offers":{"@type":"Offer","price":"150","priceCurrency":"USD"}}',
              learnMore: 'https://schema.org/Service'
            }
          }
        );
      }

      if (hasService) {
        return createResult(
          { id: 'schema-service', name: 'Service Schema', category: 'structured-data', severity: 'info' },
          'pass',
          'Service schema found'
        );
      }

      return createResult(
        { id: 'schema-service', name: 'Service Schema', category: 'structured-data', severity: 'info' },
        'info',
        'Not applicable (not a local business or service page)',
        { recommendation: 'Service schema is recommended for service business pages' }
      );
    },
  },

  // ==========================================================================
  // Schema sameAs (Social profiles for AI visibility)
  // ==========================================================================
  {
    id: 'schema-sameas',
    name: 'Schema sameAs (Social Links)',
    category: 'structured-data',
    severity: 'info',
    description: 'sameAs property links your entity to social profiles, improving AI visibility',
    check: (ctx) => {
      // This rule checks if Organization/Person schema has sameAs
      // We can detect this from jsonLd content or socialLinksFound
      if (!ctx.jsonLdTypes) {
        return createResult(
          { id: 'schema-sameas', name: 'Schema sameAs (Social Links)', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (JSON-LD types data unavailable)',
          { recommendation: 'This rule checks for sameAs property to link entities to social profiles' }
        );
      }

      const hasOrgOrPerson = ctx.jsonLdTypes.some(t =>
        ['Organization', 'LocalBusiness', 'Person', 'Corporation'].includes(t)
      );

      if (!hasOrgOrPerson) {
        return createResult(
          { id: 'schema-sameas', name: 'Schema sameAs (Social Links)', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (no Organization or Person schema detected)',
          { recommendation: 'This rule applies when Organization or Person schema is present' }
        );
      }

      // Check if there are social links on page but potentially not in schema
      const hasSocialLinks = ctx.socialLinksFound && ctx.socialLinksFound.length > 0;

      if (hasSocialLinks) {
        const socialCount = ctx.socialLinksFound?.length ?? 0;
        return createResult(
          { id: 'schema-sameas', name: 'Schema sameAs', category: 'structured-data', severity: 'info' },
          'info',
          'Social links found - ensure they are included in schema sameAs property',
          {
            recommendation: 'Add sameAs property to your Organization/Person schema with all social profile URLs.',
            evidence: {
              found: `${socialCount} social profile(s) on page`,
              expected: 'sameAs array in Organization or Person schema',
              impact: 'sameAs helps AI systems connect your brand across platforms and improves Knowledge Panel eligibility.',
              example: '"sameAs": ["https://twitter.com/company", "https://linkedin.com/company/name", "https://facebook.com/company"]',
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/organization'
            }
          }
        );
      }

      return createResult(
        { id: 'schema-sameas', name: 'Schema sameAs', category: 'structured-data', severity: 'info' },
        'pass',
        'Organization/Person schema present (verify sameAs includes social profiles)'
      );
    },
  },

  // ==========================================================================
  // Schema Completeness for AI (multiple schema types)
  // ==========================================================================
  {
    id: 'schema-ai-completeness',
    name: 'Schema Completeness for AI',
    category: 'structured-data',
    severity: 'info',
    description: 'Comprehensive structured data improves AI citations and visibility',
    check: (ctx) => {
      if (!ctx.jsonLdTypes || ctx.jsonLdTypes.length === 0) {
        return createResult(
          { id: 'schema-ai-completeness', name: 'Schema Completeness for AI', category: 'structured-data', severity: 'info' },
          'info',
          'Not applicable (no JSON-LD types detected)',
          { recommendation: 'This rule checks for comprehensive structured data to improve AI citations' }
        );
      }

      // Important schema types for AI visibility
      const importantTypes = [
        'Organization', 'LocalBusiness', 'Person', 'Product', 'Service',
        'FAQPage', 'Article', 'BlogPosting', 'WebSite', 'BreadcrumbList'
      ];

      const foundImportant = ctx.jsonLdTypes.filter(t => importantTypes.includes(t));

      if (foundImportant.length >= 3) {
        return createResult(
          { id: 'schema-ai-completeness', name: 'Schema AI Completeness', category: 'structured-data', severity: 'info' },
          'pass',
          `Comprehensive schema found (${foundImportant.length} key types)`,
          {
            value: foundImportant.join(', '),
            evidence: {
              found: foundImportant,
              impact: 'Comprehensive structured data significantly increases chances of AI citations.'
            }
          }
        );
      }

      if (foundImportant.length >= 1) {
        const missing = importantTypes.filter(t => !foundImportant.includes(t)).slice(0, 3);
        return createResult(
          { id: 'schema-ai-completeness', name: 'Schema AI Completeness', category: 'structured-data', severity: 'info' },
          'info',
          `Basic schema found (${foundImportant.length} key type(s))`,
          {
            value: foundImportant.join(', '),
            recommendation: 'Add more schema types for better AI visibility.',
            evidence: {
              found: foundImportant,
              expected: 'Multiple schema types for comprehensive coverage',
              impact: 'AI systems prioritize sites with comprehensive structured data for citations.',
              issue: `Consider adding: ${missing.join(', ')}`
            }
          }
        );
      }

      return createResult(
        { id: 'schema-ai-completeness', name: 'Schema AI Completeness', category: 'structured-data', severity: 'info' },
        'info',
        'Not applicable (no key schema types detected)',
        { recommendation: 'This rule analyzes schema completeness when important schema types are present' }
      );
    },
  },
];
