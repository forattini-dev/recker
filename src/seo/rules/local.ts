/**
 * SEO Local Business Rules
 * Rules for local SEO, NAP consistency, and LocalBusiness schema
 */

import { SeoRule, createResult } from './types.js';

export const localRules: SeoRule[] = [
  {
    id: 'local-business-schema',
    name: 'LocalBusiness Schema',
    category: 'structured-data',
    severity: 'info',
    description: 'Local businesses should have LocalBusiness schema',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) return null;

      // Check for any LocalBusiness type or subtypes
      const localBusinessTypes = [
        'LocalBusiness', 'Restaurant', 'Store', 'MedicalBusiness',
        'FinancialService', 'FoodEstablishment', 'HealthAndBeautyBusiness',
        'HomeAndConstructionBusiness', 'LegalService', 'RealEstateAgent',
        'SportingGoodsStore', 'AutoDealer', 'AutoRepair', 'Bakery',
        'BarOrPub', 'BeautySalon', 'CafeOrCoffeeShop', 'Dentist',
        'DryCleaningOrLaundry', 'Florist', 'GasStation', 'GroceryStore',
        'HairSalon', 'HardwareStore', 'Hospital', 'Hotel', 'InsuranceAgency',
        'LodgingBusiness', 'MovingCompany', 'Pharmacy', 'Physician',
        'PlaceOfWorship', 'Plumber', 'RealEstateAgent', 'ShoppingCenter',
      ];

      const hasLocalBusiness = ctx.jsonLdTypes.some(t =>
        localBusinessTypes.includes(t)
      );

      // Only suggest if page looks like a local business
      if (!hasLocalBusiness && ctx.hasLocalBusinessSignals) {
        return createResult(
          { id: 'local-business-schema', name: 'LocalBusiness Schema', category: 'structured-data', severity: 'info' },
          'info',
          'Page may benefit from LocalBusiness schema',
          {
            recommendation: 'Add LocalBusiness structured data for local search visibility',
            evidence: {
              expected: 'LocalBusiness schema with name, address, phone, hours',
              example: `{
  "@type": "LocalBusiness",
  "name": "Business Name",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "City",
    "addressRegion": "State",
    "postalCode": "12345"
  },
  "telephone": "+1-234-567-8900"
}`,
              learnMore: 'https://developers.google.com/search/docs/appearance/structured-data/local-business',
            },
          }
        );
      }

      if (hasLocalBusiness) {
        const foundTypes = ctx.jsonLdTypes.filter(t => localBusinessTypes.includes(t));
        return createResult(
          { id: 'local-business-schema', name: 'LocalBusiness Schema', category: 'structured-data', severity: 'info' },
          'pass',
          `LocalBusiness schema found: ${foundTypes.join(', ')}`
        );
      }

      return null;
    },
  },
  {
    id: 'local-business-address',
    name: 'Business Address',
    category: 'structured-data',
    severity: 'warning',
    description: 'LocalBusiness schema should include complete address',
    check: (ctx) => {
      if (!ctx.localBusinessSchema) return null;

      const address = ctx.localBusinessSchema.address;

      if (!address) {
        return createResult(
          { id: 'local-business-address', name: 'Business Address', category: 'structured-data', severity: 'warning' },
          'warn',
          'LocalBusiness schema missing address',
          {
            recommendation: 'Add PostalAddress for Google Maps and local search',
            evidence: {
              expected: 'address with streetAddress, addressLocality, addressRegion, postalCode',
              impact: 'Businesses without address may not appear in local pack results',
            },
          }
        );
      }

      const missingFields: string[] = [];
      if (!address.streetAddress) missingFields.push('streetAddress');
      if (!address.addressLocality) missingFields.push('addressLocality (city)');
      if (!address.addressRegion) missingFields.push('addressRegion (state)');
      if (!address.postalCode) missingFields.push('postalCode');

      if (missingFields.length > 0) {
        return createResult(
          { id: 'local-business-address', name: 'Business Address', category: 'structured-data', severity: 'warning' },
          'warn',
          `Address incomplete: missing ${missingFields.join(', ')}`,
          {
            recommendation: 'Complete address for better local SEO',
            evidence: {
              found: Object.keys(address).join(', '),
              expected: 'streetAddress, addressLocality, addressRegion, postalCode, addressCountry',
            },
          }
        );
      }

      return createResult(
        { id: 'local-business-address', name: 'Business Address', category: 'structured-data', severity: 'warning' },
        'pass',
        'Complete address in LocalBusiness schema'
      );
    },
  },
  {
    id: 'local-business-phone',
    name: 'Business Phone',
    category: 'structured-data',
    severity: 'warning',
    description: 'LocalBusiness schema should include phone number',
    check: (ctx) => {
      if (!ctx.localBusinessSchema) return null;

      const phone = ctx.localBusinessSchema.telephone;

      if (!phone) {
        return createResult(
          { id: 'local-business-phone', name: 'Business Phone', category: 'structured-data', severity: 'warning' },
          'warn',
          'LocalBusiness schema missing phone number',
          {
            recommendation: 'Add telephone for click-to-call functionality',
            evidence: {
              expected: 'telephone in E.164 format: +1-234-567-8900',
              impact: 'Phone number is crucial for local search and mobile users',
            },
          }
        );
      }

      // Check phone format (basic validation)
      const phoneStr = String(phone);
      const hasCountryCode = phoneStr.startsWith('+');

      if (!hasCountryCode) {
        return createResult(
          { id: 'local-business-phone', name: 'Business Phone', category: 'structured-data', severity: 'warning' },
          'info',
          'Phone number should include country code',
          {
            evidence: {
              found: phoneStr,
              expected: 'E.164 format with country code: +1-234-567-8900',
            },
          }
        );
      }

      return createResult(
        { id: 'local-business-phone', name: 'Business Phone', category: 'structured-data', severity: 'warning' },
        'pass',
        `Phone: ${phoneStr}`
      );
    },
  },
  {
    id: 'local-business-hours',
    name: 'Business Hours',
    category: 'structured-data',
    severity: 'info',
    description: 'LocalBusiness schema should include opening hours',
    check: (ctx) => {
      if (!ctx.localBusinessSchema) return null;

      const hours = ctx.localBusinessSchema.openingHoursSpecification ||
                    ctx.localBusinessSchema.openingHours;

      if (!hours) {
        return createResult(
          { id: 'local-business-hours', name: 'Business Hours', category: 'structured-data', severity: 'info' },
          'info',
          'LocalBusiness schema missing opening hours',
          {
            recommendation: 'Add openingHoursSpecification for "open now" filters',
            evidence: {
              example: `"openingHoursSpecification": [{
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "opens": "09:00",
  "closes": "17:00"
}]`,
              impact: 'Opening hours help users find open businesses',
            },
          }
        );
      }

      return createResult(
        { id: 'local-business-hours', name: 'Business Hours', category: 'structured-data', severity: 'info' },
        'pass',
        'Opening hours specified'
      );
    },
  },
  {
    id: 'local-business-geo',
    name: 'Business Coordinates',
    category: 'structured-data',
    severity: 'info',
    description: 'LocalBusiness schema should include geo coordinates',
    check: (ctx) => {
      if (!ctx.localBusinessSchema) return null;

      const geo = ctx.localBusinessSchema.geo;

      if (!geo) {
        return createResult(
          { id: 'local-business-geo', name: 'Business Coordinates', category: 'structured-data', severity: 'info' },
          'info',
          'LocalBusiness schema missing geo coordinates',
          {
            recommendation: 'Add latitude/longitude for precise map placement',
            evidence: {
              example: `"geo": {
  "@type": "GeoCoordinates",
  "latitude": "40.7128",
  "longitude": "-74.0060"
}`,
              impact: 'Coordinates ensure accurate Google Maps integration',
            },
          }
        );
      }

      const lat = geo.latitude;
      const lng = geo.longitude;

      if (!lat || !lng) {
        return createResult(
          { id: 'local-business-geo', name: 'Business Coordinates', category: 'structured-data', severity: 'info' },
          'warn',
          'Geo coordinates incomplete',
          {
            evidence: {
              found: `lat: ${lat}, lng: ${lng}`,
              expected: 'Both latitude and longitude required',
            },
          }
        );
      }

      return createResult(
        { id: 'local-business-geo', name: 'Business Coordinates', category: 'structured-data', severity: 'info' },
        'pass',
        `Geo: ${lat}, ${lng}`
      );
    },
  },
  {
    id: 'local-nap-presence',
    name: 'NAP Presence',
    category: 'content',
    severity: 'info',
    description: 'Local business pages should display Name, Address, Phone (NAP)',
    check: (ctx) => {
      if (!ctx.hasLocalBusinessSignals) return null;

      const missing: string[] = [];

      if (!ctx.hasPhoneOnPage) missing.push('Phone');
      if (!ctx.hasAddressOnPage) missing.push('Address');

      if (missing.length > 0) {
        return createResult(
          { id: 'local-nap-presence', name: 'NAP Presence', category: 'content', severity: 'info' },
          'info',
          `Missing visible NAP elements: ${missing.join(', ')}`,
          {
            recommendation: 'Display business name, address, and phone prominently on page',
            evidence: {
              issue: 'NAP should be visible to users, not just in schema',
              impact: 'Visible NAP improves trust and local SEO consistency',
            },
          }
        );
      }

      return createResult(
        { id: 'local-nap-presence', name: 'NAP Presence', category: 'content', severity: 'info' },
        'pass',
        'NAP information visible on page'
      );
    },
  },
  {
    id: 'local-service-area',
    name: 'Service Area',
    category: 'structured-data',
    severity: 'info',
    description: 'Service area businesses should specify their coverage',
    check: (ctx) => {
      if (!ctx.localBusinessSchema) return null;

      // Check if it's a service area business
      const isServiceArea = ctx.localBusinessSchema['@type'] === 'ServiceAreaBusiness' ||
                            ctx.localBusinessSchema.areaServed !== undefined;

      if (!isServiceArea) return null;

      const areaServed = ctx.localBusinessSchema.areaServed;

      if (!areaServed) {
        return createResult(
          { id: 'local-service-area', name: 'Service Area', category: 'structured-data', severity: 'info' },
          'info',
          'Service area business missing areaServed',
          {
            recommendation: 'Define the geographic area you serve',
            evidence: {
              example: `"areaServed": {
  "@type": "GeoCircle",
  "geoMidpoint": { "latitude": "40.7128", "longitude": "-74.0060" },
  "geoRadius": "50 mi"
}`,
            },
          }
        );
      }

      return createResult(
        { id: 'local-service-area', name: 'Service Area', category: 'structured-data', severity: 'info' },
        'pass',
        'Service area defined'
      );
    },
  },
  {
    id: 'local-pricerange',
    name: 'Price Range',
    category: 'structured-data',
    severity: 'info',
    description: 'LocalBusiness can include price range for user expectations',
    check: (ctx) => {
      if (!ctx.localBusinessSchema) return null;

      const priceRange = ctx.localBusinessSchema.priceRange;

      if (!priceRange) {
        return createResult(
          { id: 'local-pricerange', name: 'Price Range', category: 'structured-data', severity: 'info' },
          'info',
          'LocalBusiness missing price range',
          {
            recommendation: 'Add priceRange (e.g., "$$", "$$$") for user expectations',
            evidence: {
              example: '"priceRange": "$$" (uses $ symbols: $, $$, $$$, $$$$)',
              impact: 'Helps users filter by budget in search results',
            },
          }
        );
      }

      return createResult(
        { id: 'local-pricerange', name: 'Price Range', category: 'structured-data', severity: 'info' },
        'pass',
        `Price range: ${priceRange}`
      );
    },
  },
];
