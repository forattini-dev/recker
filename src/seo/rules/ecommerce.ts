/**
 * SEO E-commerce Rules
 * Rules for product pages, pricing, and e-commerce structured data
 */

import { SeoRule, createResult } from './types.js';

export const ecommerceRules: SeoRule[] = [
  {
    id: 'ecommerce-product-schema',
    name: 'Product Schema',
    category: 'structured-data',
    severity: 'warning',
    description: 'Product pages should have Product schema for rich snippets',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) return null;

      // Only check if page appears to be a product page
      if (!ctx.isProductPage) return null;

      const hasProduct = ctx.jsonLdTypes.includes('Product');

      if (!hasProduct) {
        return createResult(
          { id: 'ecommerce-product-schema', name: 'Product Schema', category: 'structured-data', severity: 'warning' },
          'warn',
          'Product page missing Product schema',
          {
            recommendation: 'Add Product structured data for rich snippets in search results',
            evidence: {
              expected: 'Product schema with name, image, price, availability',
              example: `{
  "@type": "Product",
  "name": "Product Name",
  "image": "https://example.com/image.jpg",
  "offers": {
    "@type": "Offer",
    "price": "99.99",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  }
}`,
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/product',
            },
          }
        );
      }

      return createResult(
        { id: 'ecommerce-product-schema', name: 'Product Schema', category: 'structured-data', severity: 'warning' },
        'pass',
        'Product schema found'
      );
    },
  },
  {
    id: 'ecommerce-product-price',
    name: 'Product Price',
    category: 'structured-data',
    severity: 'warning',
    description: 'Product schema should include price information',
    check: (ctx) => {
      if (!ctx.productSchema) return null;

      const hasPrice = ctx.productSchema.offers?.price !== undefined ||
                       ctx.productSchema.offers?.lowPrice !== undefined;
      const hasCurrency = ctx.productSchema.offers?.priceCurrency !== undefined;

      if (!hasPrice) {
        return createResult(
          { id: 'ecommerce-product-price', name: 'Product Price', category: 'structured-data', severity: 'warning' },
          'warn',
          'Product schema missing price',
          {
            recommendation: 'Add price to Product offers for price display in search results',
            evidence: {
              expected: 'offers.price or offers.lowPrice with priceCurrency',
              impact: 'Products without price may not show in Google Shopping results',
            },
          }
        );
      }

      if (!hasCurrency) {
        return createResult(
          { id: 'ecommerce-product-price', name: 'Product Price', category: 'structured-data', severity: 'warning' },
          'warn',
          'Product schema missing currency',
          {
            recommendation: 'Add priceCurrency (e.g., USD, EUR, BRL) to offers',
            evidence: {
              found: `price: ${ctx.productSchema.offers?.price}`,
              expected: 'priceCurrency: "USD" or similar ISO 4217 code',
            },
          }
        );
      }

      return createResult(
        { id: 'ecommerce-product-price', name: 'Product Price', category: 'structured-data', severity: 'warning' },
        'pass',
        `Price: ${ctx.productSchema.offers?.priceCurrency} ${ctx.productSchema.offers?.price || ctx.productSchema.offers?.lowPrice}`
      );
    },
  },
  {
    id: 'ecommerce-product-availability',
    name: 'Product Availability',
    category: 'structured-data',
    severity: 'info',
    description: 'Product schema should include availability status',
    check: (ctx) => {
      if (!ctx.productSchema?.offers) return null;

      const availability = ctx.productSchema.offers.availability;

      if (!availability) {
        return createResult(
          { id: 'ecommerce-product-availability', name: 'Product Availability', category: 'structured-data', severity: 'info' },
          'info',
          'Product schema missing availability',
          {
            recommendation: 'Add availability to help users know if product is in stock',
            evidence: {
              expected: 'availability: "https://schema.org/InStock" or similar',
              example: 'InStock, OutOfStock, PreOrder, BackOrder, Discontinued',
              learnMore: 'https://schema.org/ItemAvailability',
            },
          }
        );
      }

      // Extract availability type from URL or string
      const availType = availability.replace('https://schema.org/', '').replace('http://schema.org/', '');

      return createResult(
        { id: 'ecommerce-product-availability', name: 'Product Availability', category: 'structured-data', severity: 'info' },
        'pass',
        `Availability: ${availType}`
      );
    },
  },
  {
    id: 'ecommerce-product-image',
    name: 'Product Image',
    category: 'structured-data',
    severity: 'warning',
    description: 'Product schema should include high-quality images',
    check: (ctx) => {
      if (!ctx.productSchema) return null;

      const hasImage = ctx.productSchema.image !== undefined;

      if (!hasImage) {
        return createResult(
          { id: 'ecommerce-product-image', name: 'Product Image', category: 'structured-data', severity: 'warning' },
          'warn',
          'Product schema missing image',
          {
            recommendation: 'Add product images for visual search results',
            evidence: {
              expected: 'At least one high-quality product image',
              impact: 'Products without images are less likely to appear in image search and shopping results',
            },
          }
        );
      }

      const imageCount = Array.isArray(ctx.productSchema.image)
        ? ctx.productSchema.image.length
        : 1;

      return createResult(
        { id: 'ecommerce-product-image', name: 'Product Image', category: 'structured-data', severity: 'warning' },
        'pass',
        `${imageCount} product image(s) in schema`
      );
    },
  },
  {
    id: 'ecommerce-product-reviews',
    name: 'Product Reviews',
    category: 'structured-data',
    severity: 'info',
    description: 'Product schema can include aggregate ratings for star snippets',
    check: (ctx) => {
      if (!ctx.productSchema) return null;

      const hasRating = ctx.productSchema.aggregateRating !== undefined;
      const hasReviews = ctx.productSchema.review !== undefined;

      if (!hasRating && !hasReviews) {
        return createResult(
          { id: 'ecommerce-product-reviews', name: 'Product Reviews', category: 'structured-data', severity: 'info' },
          'info',
          'Product schema has no reviews or ratings',
          {
            recommendation: 'Add aggregateRating for star ratings in search results',
            evidence: {
              example: `"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.5",
  "reviewCount": "42"
}`,
              impact: 'Star ratings in search results can improve click-through rate by 20-30%',
            },
          }
        );
      }

      if (hasRating && ctx.productSchema.aggregateRating) {
        const rating = ctx.productSchema.aggregateRating;
        return createResult(
          { id: 'ecommerce-product-reviews', name: 'Product Reviews', category: 'structured-data', severity: 'info' },
          'pass',
          `Rating: ${rating.ratingValue ?? '?'}/5 (${rating.reviewCount ?? rating.ratingCount ?? '?'} reviews)`
        );
      }

      return createResult(
        { id: 'ecommerce-product-reviews', name: 'Product Reviews', category: 'structured-data', severity: 'info' },
        'pass',
        'Product has review data'
      );
    },
  },
  {
    id: 'ecommerce-product-brand',
    name: 'Product Brand',
    category: 'structured-data',
    severity: 'info',
    description: 'Product schema should include brand information',
    check: (ctx) => {
      if (!ctx.productSchema) return null;

      const hasBrand = ctx.productSchema.brand !== undefined;

      if (!hasBrand) {
        return createResult(
          { id: 'ecommerce-product-brand', name: 'Product Brand', category: 'structured-data', severity: 'info' },
          'info',
          'Product schema missing brand',
          {
            recommendation: 'Add brand for better product identification',
            evidence: {
              example: `"brand": { "@type": "Brand", "name": "Brand Name" }`,
              impact: 'Brand helps Google understand product context for shopping queries',
            },
          }
        );
      }

      const brandName = typeof ctx.productSchema.brand === 'string'
        ? ctx.productSchema.brand
        : ctx.productSchema.brand?.name;

      return createResult(
        { id: 'ecommerce-product-brand', name: 'Product Brand', category: 'structured-data', severity: 'info' },
        'pass',
        `Brand: ${brandName || 'specified'}`
      );
    },
  },
  {
    id: 'ecommerce-product-sku',
    name: 'Product Identifiers',
    category: 'structured-data',
    severity: 'info',
    description: 'Product schema should include unique identifiers (SKU, GTIN, MPN)',
    check: (ctx) => {
      if (!ctx.productSchema) return null;

      const hasSku = ctx.productSchema.sku !== undefined;
      const hasGtin = ctx.productSchema.gtin !== undefined ||
                      ctx.productSchema.gtin13 !== undefined ||
                      ctx.productSchema.gtin14 !== undefined ||
                      ctx.productSchema.gtin8 !== undefined;
      const hasMpn = ctx.productSchema.mpn !== undefined;

      const identifiers: string[] = [];
      if (hasSku) identifiers.push('SKU');
      if (hasGtin) identifiers.push('GTIN');
      if (hasMpn) identifiers.push('MPN');

      if (identifiers.length === 0) {
        return createResult(
          { id: 'ecommerce-product-sku', name: 'Product Identifiers', category: 'structured-data', severity: 'info' },
          'info',
          'Product schema missing identifiers',
          {
            recommendation: 'Add SKU, GTIN, or MPN for better product matching',
            evidence: {
              expected: 'At least one of: sku, gtin, gtin13, gtin14, gtin8, mpn',
              impact: 'Product identifiers help Google match products across retailers',
              learnMore: 'https://support.google.com/merchants/answer/6324461',
            },
          }
        );
      }

      return createResult(
        { id: 'ecommerce-product-sku', name: 'Product Identifiers', category: 'structured-data', severity: 'info' },
        'pass',
        `Identifiers: ${identifiers.join(', ')}`
      );
    },
  },
  {
    id: 'ecommerce-offer-valid-dates',
    name: 'Offer Valid Dates',
    category: 'structured-data',
    severity: 'info',
    description: 'Time-sensitive offers should have valid date ranges',
    check: (ctx) => {
      if (!ctx.productSchema?.offers) return null;

      const offers = ctx.productSchema.offers;
      const priceValidUntil = offers.priceValidUntil;
      const validFrom = offers.validFrom;
      const validThrough = offers.validThrough;

      if (priceValidUntil) {
        const endDate = new Date(priceValidUntil);
        const now = new Date();

        if (endDate < now) {
          return createResult(
            { id: 'ecommerce-offer-valid-dates', name: 'Offer Valid Dates', category: 'structured-data', severity: 'info' },
            'warn',
            'Offer priceValidUntil date has passed',
            {
              evidence: {
                found: priceValidUntil,
                issue: 'Expired offer dates should be updated or removed',
                impact: 'Expired dates may cause Google to distrust your pricing data',
              },
            }
          );
        }
      }

      if (validThrough) {
        const endDate = new Date(validThrough);
        const now = new Date();

        if (endDate < now) {
          return createResult(
            { id: 'ecommerce-offer-valid-dates', name: 'Offer Valid Dates', category: 'structured-data', severity: 'info' },
            'warn',
            'Offer validThrough date has passed',
            {
              evidence: {
                found: validThrough,
                issue: 'Expired validity dates should be updated',
              },
            }
          );
        }
      }

      return null; // Only report issues
    },
  },
];
