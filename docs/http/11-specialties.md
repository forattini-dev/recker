# Specialties

Recker supports various protocols and formats beyond REST. Each specialty has its own detailed documentation.

## Available Protocols

| Protocol | Description | Documentation |
|----------|-------------|---------------|
| **GraphQL** | GraphQL client with mutations, subscriptions, and error handling | [View documentation](13-graphql.md) |
| **Web Scraping** | HTML data extraction with declarative schema | [View documentation](14-scraping.md) |
| **SOAP & XML-RPC** | SOAP 1.1/1.2 and XML-RPC clients with automatic parsing | [View documentation](15-soap.md) |
| **JSON-RPC 2.0** | Complete client with batch requests and notifications | [View documentation](16-jsonrpc.md) |
| **OData** | OData v4 client with typed query builder | [View documentation](17-odata.md) |

## Quick Overview

### GraphQL

```typescript
import { graphql } from 'recker';

const data = await graphql(client, `
  query GetUser($id: ID!) {
    user(id: $id) { name, email }
  }
`, { id: '123' });
```

### Web Scraping

```typescript
import { scrape } from 'recker/plugins/scrape';

const data = await scrape(client.get('/page')).extract({
  title: 'h1',
  price: { selector: '.price', transform: v => parseFloat(v) },
  links: { selector: 'a', attribute: 'href', multiple: true }
});
```

### SOAP

```typescript
const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.2'
});

const result = await soapClient.call('GetUser', { userId: 123 });
```

### XML-RPC

```typescript
const rpc = client.xmlrpc('/xmlrpc');

const result = await rpc.call('math.add', [1, 2, 3]);
console.log(result.result); // 6
```

### JSON-RPC 2.0

```typescript
const rpc = client.jsonrpc('/rpc');

// Simple call
const result = await rpc.call('add', [1, 2]);

// Batch of calls
const results = await rpc.batch([
  { method: 'user.get', params: { id: 1 } },
  { method: 'user.get', params: { id: 2 } },
]);
```

### OData

```typescript
const od = client.odata({
  serviceRoot: '/V4/TripPinServiceRW'
});

const people = await od.get('People', {
  $select: ['FirstName', 'LastName'],
  $filter: { eq: ['City', 'NYC'] },
  $orderby: [{ property: 'LastName', direction: 'asc' }],
  $top: 10
});
```

## Choosing the Right Protocol

| Scenario | Recommended Protocol |
|----------|---------------------|
| Modern API with flexible queries | GraphQL |
| Data extraction from web pages | Web Scraping |
| Integration with legacy enterprise systems | SOAP |
| Simple services like WordPress, Bitcoin | XML-RPC |
| Blockchain APIs (Ethereum, etc.) | JSON-RPC |
| Microsoft Graph, SAP, SharePoint | OData |

## Next Steps

- **[GraphQL](13-graphql.md)** - Queries, mutations, subscriptions, cache
- **[Web Scraping](14-scraping.md)** - DOM navigation, extraction schemas
- **[SOAP & XML-RPC](15-soap.md)** - Enterprise integration, WSDL
- **[JSON-RPC](16-jsonrpc.md)** - Batch requests, notifications, Ethereum
- **[OData](17-odata.md)** - Query options, pagination, Microsoft Graph
