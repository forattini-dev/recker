# OData

Complete OData v4 client with typed query builder, automatic pagination, and batch request support.

## Quick Start

```typescript
import { createClient, odata } from 'recker';

const client = createClient({
  baseUrl: 'https://services.odata.org',
});

// Create OData client
const od = client.odata({
  serviceRoot: '/V4/TripPinServiceRW',
});

// Fetch entities
const people = await od.get('People');
console.log(people.value);
```

## Configuration

```typescript
interface ODataOptions {
  // OData service root URL
  serviceRoot: string;

  // OData version (default: '4.0')
  version?: '4.0' | '4.01';

  // Maximum page size
  maxPageSize?: number;

  // Request options
  requestOptions?: RequestOptions;
}
```

## Query Options

### $select - Select Properties

```typescript
// Select specific fields
const people = await od.get('People', {
  $select: ['FirstName', 'LastName', 'Email'],
});

// Or as string
const people = await od.get('People', {
  $select: 'FirstName,LastName,Email',
});
```

### $expand - Expand Relationships

```typescript
// Expand relationship
const people = await od.get('People', {
  $expand: 'Friends',
});

// Expand multiple
const people = await od.get('People', {
  $expand: ['Friends', 'Trips'],
});

// Expand with options
const people = await od.get('People', {
  $expand: [{
    property: 'Trips',
    select: ['Name', 'Budget'],
    filter: { gt: ['Budget', 1000] },
    top: 5,
    orderby: [{ property: 'Budget', direction: 'desc' }],
  }],
});
```

### $filter - Filter Results

```typescript
// Simple filter (string)
const people = await od.get('People', {
  $filter: "FirstName eq 'John'",
});

// Filter with typed expressions
const people = await od.get('People', {
  $filter: {
    eq: ['FirstName', 'John'],
  },
});

// Comparisons
const products = await od.get('Products', {
  $filter: {
    and: [
      { ge: ['Price', 10] },
      { le: ['Price', 100] },
    ],
  },
});

// OR
const people = await od.get('People', {
  $filter: {
    or: [
      { eq: ['City', 'NYC'] },
      { eq: ['City', 'LA'] },
    ],
  },
});

// NOT
const people = await od.get('People', {
  $filter: {
    not: { eq: ['Status', 'Inactive'] },
  },
});

// String functions
const people = await od.get('People', {
  $filter: {
    contains: ['Email', '@gmail.com'],
  },
});

const people = await od.get('People', {
  $filter: {
    startswith: ['LastName', 'Sm'],
  },
});
```

### $orderby - Sort Results

```typescript
// Sort by one property
const people = await od.get('People', {
  $orderby: 'LastName',
});

// Multiple properties
const people = await od.get('People', {
  $orderby: [
    { property: 'LastName', direction: 'asc' },
    { property: 'FirstName', direction: 'asc' },
  ],
});

// Descending
const products = await od.get('Products', {
  $orderby: [{ property: 'Price', direction: 'desc' }],
});
```

### $top and $skip - Pagination

```typescript
// Limit results
const people = await od.get('People', {
  $top: 10,
});

// Paginate
const page1 = await od.get('People', {
  $top: 10,
  $skip: 0,
});

const page2 = await od.get('People', {
  $top: 10,
  $skip: 10,
});
```

### $count - Count Results

```typescript
const people = await od.get('People', {
  $count: true,
  $top: 10,
});

console.log('Total:', people['@odata.count']);
console.log('Page:', people.value.length);
```

### $search - Text Search

```typescript
const products = await od.get('Products', {
  $search: 'laptop',
});
```

### Combining Options

```typescript
const products = await od.get('Products', {
  $select: ['Name', 'Price', 'Category'],
  $expand: 'Category',
  $filter: {
    and: [
      { ge: ['Price', 100] },
      { contains: ['Name', 'Pro'] },
    ],
  },
  $orderby: [{ property: 'Price', direction: 'desc' }],
  $top: 20,
  $count: true,
});
```

## CRUD Operations

### Get (Read)

```typescript
// Fetch collection
const people = await od.get('People');

// Fetch entity by key
const person = await od.get('People', { key: 'russellwhyte' });

// Fetch with composite key
const order = await od.get('OrderDetails', {
  key: { OrderID: 1, ProductID: 42 },
});

// Fetch navigation property
const friends = await od.get('People', {
  key: 'russellwhyte',
  navigation: 'Friends',
});
```

### Post (Create)

```typescript
const newPerson = await od.post('People', {
  UserName: 'johndoe',
  FirstName: 'John',
  LastName: 'Doe',
  Email: 'john@example.com',
});
```

### Patch (Update)

```typescript
await od.patch('People', {
  key: 'johndoe',
  body: {
    Email: 'newemail@example.com',
  },
});
```

### Put (Replace)

```typescript
await od.put('People', {
  key: 'johndoe',
  body: {
    UserName: 'johndoe',
    FirstName: 'John',
    LastName: 'Doe Updated',
    Email: 'john.updated@example.com',
  },
});
```

### Delete

```typescript
await od.delete('People', { key: 'johndoe' });
```

## Automatic Pagination

### Follow @odata.nextLink

```typescript
// Fetch all pages automatically
const allPeople = await od.getAll('People');
console.log('Total fetched:', allPeople.length);

// With page limit
const somePeople = await od.getAll('People', {
  maxPages: 5,
});
```

### Manual Iteration

```typescript
let response = await od.get('People', { $top: 100 });
let allPeople = [...response.value];

while (response['@odata.nextLink']) {
  response = await od.get(response['@odata.nextLink']);
  allPeople.push(...response.value);
}
```

## Batch Requests

```typescript
const batch = await od.batch([
  { method: 'GET', url: 'People' },
  { method: 'GET', url: 'Airlines' },
  { method: 'POST', url: 'People', body: { UserName: 'test', ... } },
]);

console.log('People:', batch.responses[0].value);
console.log('Airlines:', batch.responses[1].value);
console.log('New Person:', batch.responses[2]);
```

### Changesets (Transactions)

```typescript
const batch = await od.batch([
  {
    changeset: [
      { method: 'POST', url: 'People', body: person1 },
      { method: 'POST', url: 'People', body: person2 },
      { method: 'POST', url: 'People', body: person3 },
    ],
  },
]);

// All operations in the changeset are atomic
```

## Actions and Functions

### Functions (GET)

```typescript
// Function without parameters
const nearest = await od.function('GetNearestAirport');

// Function with parameters
const nearest = await od.function('GetNearestAirport', {
  lat: 40.7128,
  lon: -74.0060,
});

// Function on entity
const trips = await od.function('People', {
  key: 'russellwhyte',
  function: 'GetFavoriteAirline',
});
```

### Actions (POST)

```typescript
// Action without parameters
await od.action('ResetDataSource');

// Action with parameters
await od.action('People', {
  key: 'russellwhyte',
  action: 'ShareTrip',
  body: {
    userName: 'scottketchum',
    tripId: 1,
  },
});
```

## Metadata

```typescript
// Fetch service metadata
const metadata = await od.metadata();

// Fetch available entity sets
const entitySets = await od.entitySets();
console.log(entitySets);
// ['People', 'Airlines', 'Airports', 'Trips', ...]
```

## Typing

```typescript
interface Person {
  UserName: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Gender: 'Male' | 'Female';
}

// Typed result
const people = await od.get<Person>('People');

for (const person of people.value) {
  console.log(person.FirstName); // TypeScript knows it's a string
}

// Typed entity
const person = await od.get<Person>('People', { key: 'russellwhyte' });
console.log(person.Email);
```

## Examples

### Microsoft Graph

```typescript
const client = createClient({
  baseUrl: 'https://graph.microsoft.com',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const graph = client.odata({
  serviceRoot: '/v1.0',
});

// Fetch current user
const me = await graph.get('me', {
  $select: ['displayName', 'mail', 'jobTitle'],
});

// Fetch calendar events
const events = await graph.get('me/events', {
  $select: ['subject', 'start', 'end'],
  $filter: {
    ge: ['start/dateTime', new Date().toISOString()],
  },
  $top: 10,
  $orderby: [{ property: 'start/dateTime', direction: 'asc' }],
});

// Fetch OneDrive files
const files = await graph.get('me/drive/root/children', {
  $select: ['name', 'size', 'lastModifiedDateTime'],
});
```

### SAP

```typescript
const sap = client.odata({
  serviceRoot: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
});

// Fetch business partners
const partners = await sap.get('A_BusinessPartner', {
  $select: ['BusinessPartner', 'BusinessPartnerName', 'BusinessPartnerCategory'],
  $filter: {
    eq: ['BusinessPartnerCategory', '1'], // Person
  },
  $top: 100,
});
```

### SharePoint

```typescript
const sp = client.odata({
  serviceRoot: '/_api',
});

// Fetch lists
const lists = await sp.get('web/lists', {
  $select: ['Title', 'ItemCount', 'Created'],
  $filter: {
    eq: ['Hidden', false],
  },
});

// Fetch items from a list
const items = await sp.get("web/lists/getbytitle('Documents')/items", {
  $select: ['Title', 'FileLeafRef', 'Modified'],
  $top: 50,
});
```

## ETag and Optimistic Concurrency

```typescript
// Fetch with ETag
const person = await od.get('People', { key: 'russellwhyte' });
const etag = person['@odata.etag'];

// Update with If-Match (optimistic concurrency)
try {
  await od.patch('People', {
    key: 'russellwhyte',
    body: { Email: 'new@email.com' },
    headers: { 'If-Match': etag },
  });
} catch (error) {
  if (error.status === 412) {
    console.log('Conflict! Entity was modified by another user.');
  }
}
```

## Tips

1. **Use $select** to reduce payload
2. **Use $expand** carefully - it can be slow
3. **Paginate results** to avoid timeouts
4. **Use batch** for multiple related operations
5. **Changesets** guarantee atomicity
6. **ETags** for optimistic concurrency
