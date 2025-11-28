// Pagination Examples for Recker HTTP Client

import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

// ======================
// Auto Pagination (Link Headers)
// ======================

// Iterate through all items automatically
for await (const user of client.paginate('/users')) {
  console.log(user.name);
}

// ======================
// Manual Page Access
// ======================

// Get a specific page
const page5 = await client.page('/users', 5).json();
console.log('Page 5 data:', page5);

// ======================
// Iterate Through Pages
// ======================

// Get full response for each page
for await (const page of client.pages('/users', {
  pageParam: 'page', // Query parameter name for page number
  maxPages: 10 // Limit to 10 pages
})) {
  console.log(`Page ${page.pageNumber}:`, page.data);
}

// ======================
// Cursor-Based Pagination
// ======================

// Using cursor from response body
for await (const item of client.paginate('/feed', {
  nextCursorPath: 'meta.next_cursor' // JSONPath to next cursor
})) {
  console.log(item);
}

// ======================
// Custom Pagination Logic
// ======================

for await (const page of client.pages('/items', {
  pageParam: 'offset',
  maxPages: 5,
  getNextPage: (currentPage) => {
    // Custom logic to determine next page
    const nextOffset = currentPage.data.offset + currentPage.data.limit;
    return nextOffset < currentPage.data.total ? nextOffset : null;
  }
})) {
  console.log('Items:', page.data.items);
}
