# Selectors & DOM Traversal

CSS selectors, jQuery-like selection, and DOM navigation methods.

## Selection Methods

### `select(selector)` - jQuery-like Selection

Returns a `ScrapeElement` containing all matching elements:

```typescript
// Select all links
const links = doc.select('a');
console.log(links.length); // Number of matches

// Iterate with each()
links.each((el, i) => {
  console.log(`${i}: ${el.attr('href')}`);
});

// Map to values
const urls = links.map(el => el.attr('href'));
```

### `selectFirst(selector)` - Single Element

Returns the first matching element:

```typescript
const title = doc.selectFirst('h1').text();
const logo = doc.selectFirst('img.logo').attr('src');
```

### `selectAll(selector)` - Array of Elements

Returns an array of `ScrapeElement` objects:

```typescript
const articles = doc.selectAll('article');

for (const article of articles) {
  console.log(article.find('h2').text());
}
```

## CSS Selector Syntax

All standard CSS selectors are supported:

| Selector | Description | Example |
|----------|-------------|---------|
| `tag` | Element type | `div`, `a`, `p` |
| `.class` | Class name | `.product`, `.active` |
| `#id` | Element ID | `#header`, `#main` |
| `[attr]` | Has attribute | `[href]`, `[data-id]` |
| `[attr=val]` | Attribute equals | `[type="email"]` |
| `[attr^=val]` | Starts with | `[href^="https"]` |
| `[attr$=val]` | Ends with | `[src$=".jpg"]` |
| `[attr*=val]` | Contains | `[class*="btn"]` |
| `parent > child` | Direct child | `ul > li` |
| `ancestor descendant` | Any descendant | `nav a` |
| `el + sibling` | Adjacent sibling | `h2 + p` |
| `el ~ siblings` | All siblings after | `h2 ~ p` |
| `:first-child` | First child | `li:first-child` |
| `:last-child` | Last child | `li:last-child` |
| `:nth-child(n)` | Nth child | `tr:nth-child(2n)` |
| `:not(sel)` | Negation | `input:not([type="hidden"])` |
| `:has(sel)` | Contains selector | `div:has(img)` |
| `:contains(text)` | Contains text | `a:contains("Read more")` |

### Complex Selectors

```typescript
// Multiple classes
doc.select('div.card.featured');

// Multiple selectors (OR)
doc.select('h1, h2, h3');

// Combining conditions
doc.select('input[type="text"]:not(.disabled)');

// Pseudo-classes
doc.select('tr:nth-child(odd)');
doc.select('li:first-child');
doc.select('p:last-of-type');

// Contains text (Cheerio extension)
doc.select('a:contains("Download")');
```

## Element Traversal

Chainable methods for navigating the DOM:

### Parent Navigation

```typescript
const item = doc.selectFirst('.item');

// Direct parent
item.parent();

// Closest ancestor matching selector
item.closest('div.container');

// All ancestors
item.parents();

// Ancestors up to selector
item.parentsUntil('.wrapper');
```

### Child Navigation

```typescript
// All direct children
item.children();

// Filtered children
item.children('li');
item.children('.active');

// All descendants matching selector
item.find('.nested');
item.find('a[href]');
```

### Sibling Navigation

```typescript
// All siblings
item.siblings();

// Filtered siblings
item.siblings('.related');

// Adjacent siblings
item.next();
item.prev();

// All following siblings
item.nextAll();
item.nextAll('.item');

// All preceding siblings
item.prevAll();

// Until a selector
item.nextUntil('.separator');
item.prevUntil('.header');
```

## Filtering

### Filter Selection

```typescript
const items = doc.selectAll('.item');

// Keep matching elements
const active = items.filter('.active');

// Exclude matching elements
const enabled = items.not('.disabled');

// Elements containing selector
const withImages = items.has('img');

// By callback
const expensive = items.filter(el => {
  const price = parseFloat(el.find('.price').text());
  return price > 100;
});
```

### Position-Based

```typescript
const items = doc.selectAll('li');

// First in selection
items.first();

// Last in selection
items.last();

// Element at specific index
items.eq(2);  // Third element (0-indexed)
items.eq(-1); // Last element

// Slice of elements
items.slice(0, 5);   // First 5
items.slice(-3);     // Last 3
```

## Content Extraction

### Text Content

```typescript
// Combined text content (trimmed)
const text = el.text();

// Inner HTML
const html = el.html();

// Outer HTML (including the element itself)
const outer = el.outerHtml();
```

### Attributes

```typescript
// Single attribute
const href = el.attr('href');
const src = el.attr('src');
const cls = el.attr('class');

// All attributes as object
const attrs = el.attrs();
// { href: '/path', class: 'link active', id: 'main-link' }

// Data attributes
const userId = el.data('user-id');  // data-user-id="123" → "123"
const allData = el.data();          // All data-* attributes as object
```

### Form Values

```typescript
// Input value
const input = doc.selectFirst('input[name="email"]');
const value = input.val();

// Select element (returns selected value)
const select = doc.selectFirst('select');
const selected = select.val();

// Multi-select (returns array)
const multiSelect = doc.selectFirst('select[multiple]');
const values = multiSelect.val(); // ['option1', 'option2']

// Checkbox/radio
const checkbox = doc.selectFirst('input[type="checkbox"]');
const isChecked = checkbox.is(':checked');
```

## State Checking

```typescript
// Element exists in selection
el.exists();

// Matches selector
el.is('a');
el.is('.active');
el.is('[href]');

// Has specific class
el.hasClass('active');
el.hasClass('btn primary'); // Has all classes

// Position among siblings
el.index();

// Get tag name
el.tagName(); // 'div', 'a', 'span', etc.

// Count elements
el.length;
```

## Finding by Text

```typescript
// Find elements containing text (partial match)
const elements = doc.findByText('Add to Cart');

// Find with exact text match
const exactMatch = doc.findByExactText('$99.99');

// Filter by element type
const buttons = doc.findByText('Submit', 'button');
const links = doc.findByText('Learn more', 'a');
```

## Finding by Data Attributes

```typescript
// Find by data attribute presence
const products = doc.findByData('product-id');

// Find by data attribute with specific value
const featured = doc.findByData('featured', 'true');
const category = doc.findByData('category', 'electronics');
```

## Iteration Methods

```typescript
const items = doc.select('.item');

// Each - iterate with callback
items.each((el, index) => {
  console.log(`${index}: ${el.text()}`);
});

// Map - transform to array
const titles = items.map(el => el.find('h3').text());

// ToArray - convert to ScrapeElement array
const arr = items.toArray();

// Reduce - accumulate values
const totalPrice = items.reduce((sum, el) => {
  return sum + parseFloat(el.find('.price').text());
}, 0);

// Some - check if any match
const hasDiscount = items.some(el => el.hasClass('discounted'));

// Every - check if all match
const allInStock = items.every(el => el.find('.stock').text() !== 'Out');

// Find - get first matching
const first100 = items.find(el => {
  const price = parseFloat(el.find('.price').text());
  return price < 100;
});
```

## Utility Methods

```typescript
// Clone element (deep copy)
const cloned = el.clone();

// Get raw Cheerio object (for advanced usage)
const $el = el.raw;

// Get underlying DOM element at index
const domEl = el.get(0);

// Check if element matches count
doc.count('img');      // Number of images
doc.count('a[href]');  // Number of links with href
```

## Chaining

All methods return `ScrapeElement` for fluent chaining:

```typescript
const price = doc
  .selectFirst('.product')
  .find('.details')
  .children('.price-section')
  .first()
  .find('span.amount')
  .text();
```

## Error Handling

Methods are null-safe and return empty elements when not found:

```typescript
// Returns empty element (not null)
const missing = doc.selectFirst('.does-not-exist');
console.log(missing.exists());  // false
console.log(missing.text());    // ''
console.log(missing.length);    // 0

// Safe chaining
const safe = doc
  .selectFirst('.maybe')
  .find('.nested')
  .text() || 'default';

// Explicit check
if (doc.exists('.author')) {
  const author = doc.selectFirst('.author').text();
}
```

## TypeScript Support

```typescript
import type {
  ScrapeDocument,
  ScrapeElement
} from 'recker';

function extractTitle(doc: ScrapeDocument): string {
  return doc.selectFirst('h1').text();
}

function processElements(elements: ScrapeElement): string[] {
  return elements.map(el => el.text());
}
```

## Next Steps

- **[Extractors](03-extractors.md)** - Built-in data extractors
- **[Schemas](04-schemas.md)** - Declarative extraction schemas
- **[Overview](01-overview.md)** - Getting started with scraping
