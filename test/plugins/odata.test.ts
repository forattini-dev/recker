import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, createODataClient, odata, ODataException, FilterBuilder } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('OData Plugin', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    vi.clearAllMocks();
  });

  describe('ODataClient', () => {
    it('should query entity set', async () => {
      mockTransport.setMockResponse('GET', '/Products', 200, {
        '@odata.context': '$metadata#Products',
        value: [
          { ProductID: 1, ProductName: 'Widget', UnitPrice: 10.00 },
          { ProductID: 2, ProductName: 'Gadget', UnitPrice: 20.00 }
        ]
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const result = await od.get('Products');

      expect(result.value).toHaveLength(2);
      expect(result.value![0].ProductName).toBe('Widget');
    });

    it('should get entity by key', async () => {
      mockTransport.setMockResponse('GET', '/Products(1)', 200, {
        '@odata.context': '$metadata#Products/$entity',
        ProductID: 1,
        ProductName: 'Widget',
        UnitPrice: 10.00
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const product = await od.getById('Products', 1);

      expect(product.ProductID).toBe(1);
      expect(product.ProductName).toBe('Widget');
    });

    it('should get entity by string key', async () => {
      mockTransport.setMockResponse("GET", "/Categories('beverages')", 200, {
        CategoryID: 'beverages',
        CategoryName: 'Beverages'
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const category = await od.getById('Categories', 'beverages');

      expect(category.CategoryID).toBe('beverages');
    });

    it('should create entity', async () => {
      mockTransport.setMockResponse('POST', '/Products', 201, {
        ProductID: 3,
        ProductName: 'New Product',
        UnitPrice: 15.00
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const created = await od.create('Products', {
        ProductName: 'New Product',
        UnitPrice: 15.00
      });

      expect(created.ProductID).toBe(3);
    });

    it('should update entity', async () => {
      mockTransport.setMockResponse('PATCH', '/Products(1)', 200, {
        ProductID: 1,
        ProductName: 'Widget',
        UnitPrice: 25.00
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const updated = await od.update('Products', 1, {
        UnitPrice: 25.00
      });

      expect(updated.UnitPrice).toBe(25.00);
    });

    it('should delete entity', async () => {
      mockTransport.setMockResponse('DELETE', '/Products(1)', 204, null);

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.delete('Products', 1);

      expect(mockTransport.getCallCount('DELETE', '/Products(1)')).toBe(1);
    });

    it('should handle OData error', async () => {
      mockTransport.setMockResponse('GET', '/Products(-1)', 404, {
        error: {
          code: 'ResourceNotFound',
          message: 'Product with ID -1 not found'
        }
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await expect(od.getById('Products', -1)).rejects.toThrow(ODataException);
    });
  });

  describe('ODataQueryBuilder', () => {
    it('should build $select query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$select=ProductName%2CUnitPrice', 200, {
        value: [{ ProductName: 'Widget', UnitPrice: 10.00 }]
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .select('ProductName', 'UnitPrice')
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$select=ProductName%2CUnitPrice')).toBe(1);
    });

    it('should build $filter query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$filter=UnitPrice%20gt%2020', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .filter('UnitPrice gt 20')
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$filter=UnitPrice%20gt%2020')).toBe(1);
    });

    it('should build $filter with FilterBuilder', async () => {
      mockTransport.setMockResponse('GET', '/Products?$filter=UnitPrice%20gt%2020%20and%20contains(ProductName%2C%27Widget%27)', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .filter(f => f.gt('UnitPrice', 20).and().contains('ProductName', 'Widget'))
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$filter=UnitPrice%20gt%2020%20and%20contains(ProductName%2C%27Widget%27)')).toBe(1);
    });

    it('should build $orderby query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$orderby=UnitPrice%20desc', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .orderBy('UnitPrice', 'desc')
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$orderby=UnitPrice%20desc')).toBe(1);
    });

    it('should build $top and $skip queries', async () => {
      mockTransport.setMockResponse('GET', '/Products?$top=10&$skip=20', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .top(10)
        .skip(20)
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$top=10&$skip=20')).toBe(1);
    });

    it('should build $count query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$count=true', 200, {
        '@odata.count': 100,
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const result = await od.query('Products')
        .count()
        .get();

      expect(result['@odata.count']).toBe(100);
    });

    it('should build $expand query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$expand=Category', 200, {
        value: [{
          ProductID: 1,
          ProductName: 'Widget',
          Category: { CategoryID: 1, CategoryName: 'Electronics' }
        }]
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const result = await od.query('Products')
        .expand('Category')
        .get();

      expect(result.value![0].Category).toBeDefined();
    });

    it('should build $search query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$search=widget', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .search('widget')
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$search=widget')).toBe(1);
    });

    it('should generate URL with toUrl()', () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.query('Products')
        .select('ProductName')
        .filter('UnitPrice gt 10')
        .top(5)
        .toUrl();

      expect(url).toContain('$select=ProductName');
      expect(url).toContain('$filter=UnitPrice%20gt%2010');
      expect(url).toContain('$top=5');
    });
  });

  describe('FilterBuilder', () => {
    it('should build equality filter', () => {
      const filter = new FilterBuilder()
        .eq('Status', 'Active')
        .build();

      expect(filter).toBe("Status eq 'Active'");
    });

    it('should build comparison filters', () => {
      const filter = new FilterBuilder()
        .gt('Price', 100)
        .and()
        .le('Price', 500)
        .build();

      expect(filter).toBe('Price gt 100 and Price le 500');
    });

    it('should build string filters', () => {
      const filter = new FilterBuilder()
        .contains('Name', 'widget')
        .or()
        .startswith('Name', 'super')
        .build();

      expect(filter).toBe("contains(Name,'widget') or startswith(Name,'super')");
    });

    it('should build null checks', () => {
      const filter = new FilterBuilder()
        .isNotNull('Email')
        .build();

      expect(filter).toBe('Email ne null');
    });

    it('should build IN filter', () => {
      const filter = new FilterBuilder()
        .in('Status', ['Active', 'Pending'])
        .build();

      expect(filter).toBe("Status in ('Active','Pending')");
    });

    it('should build grouped filters', () => {
      const filter = new FilterBuilder()
        .group(f => f.eq('Type', 'A').or().eq('Type', 'B'))
        .and()
        .gt('Price', 0)
        .build();

      expect(filter).toBe("(Type eq 'A' or Type eq 'B') and Price gt 0");
    });
  });

  describe('odata plugin', () => {
    it('should add odata method to client', async () => {
      mockTransport.setMockResponse('GET', '/Products', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport,
        plugins: [odata()]
      });

      const od = client.odata('https://services.odata.org');
      const result = await od.get('Products');

      expect(result.value).toEqual([]);
    });
  });

  describe('ODataClient advanced operations', () => {
    it('should handle composite key', async () => {
      mockTransport.setMockResponse('GET', "/OrderDetails(OrderID=1,ProductID=2)", 200, {
        OrderID: 1,
        ProductID: 2,
        Quantity: 5
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const detail = await od.getById('OrderDetails', { OrderID: 1, ProductID: 2 });
      expect(detail.Quantity).toBe(5);
    });

    it('should replace entity with PUT', async () => {
      mockTransport.setMockResponse('PUT', '/Products(1)', 200, {
        ProductID: 1,
        ProductName: 'Replaced Widget',
        UnitPrice: 99.00
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const replaced = await od.replace('Products', 1, {
        ProductID: 1,
        ProductName: 'Replaced Widget',
        UnitPrice: 99.00
      });

      expect(replaced.ProductName).toBe('Replaced Widget');
    });

    it('should call action', async () => {
      mockTransport.setMockResponse('POST', '/CalculateDiscount', 200, {
        discount: 15.5
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const result = await od.action('CalculateDiscount', { amount: 100 });
      expect(result.discount).toBe(15.5);
    });

    it('should call function with params', async () => {
      mockTransport.setMockResponse('GET', "/GetProductsByCategory(categoryId=1)", 200, {
        value: [{ ProductID: 1 }]
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const result = await od.function('GetProductsByCategory', { categoryId: 1 });
      expect(result.value).toHaveLength(1);
    });

    it('should call function without params', async () => {
      mockTransport.setMockResponse('GET', '/GetAllCategories', 200, {
        value: []
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.function('GetAllCategories');
      expect(mockTransport.getCallCount('GET', '/GetAllCategories')).toBe(1);
    });

    it('should get metadata', async () => {
      mockTransport.setMockResponse('GET', '/$metadata', 200, '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx></edmx:Edmx>');

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const metadata = await od.getMetadata();
      expect(metadata).toContain('edmx:Edmx');
    });

    it('should batch requests', async () => {
      // The batch response regex expects JSON body to follow \r\n\r\n
      const batchResponse =
`--batchresponse_1234\r
Content-Type: application/http\r
Content-Transfer-Encoding: binary\r
\r
HTTP/1.1 200 OK\r
Content-Type: application/json\r
\r
{"ProductID":1,"ProductName":"Widget"}\r
--batchresponse_1234\r
Content-Type: application/http\r
Content-Transfer-Encoding: binary\r
\r
HTTP/1.1 200 OK\r
Content-Type: application/json\r
\r
{"ProductID":2,"ProductName":"Gadget"}\r
--batchresponse_1234--`;

      mockTransport.setMockResponse('POST', '/$batch', 200, batchResponse, {
        'Content-Type': 'multipart/mixed; boundary=batchresponse_1234'
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const results = await od.batch([
        { method: 'GET', url: 'Products(1)' },
        { method: 'GET', url: 'Products(2)', headers: { 'Custom-Header': 'value' } }
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(200);
      expect(results[0].body).toEqual({ ProductID: 1, ProductName: 'Widget' });
    });

    it('should batch requests with body', async () => {
      const batchResponse = `--batchresponse_5678
Content-Type: application/http
Content-Transfer-Encoding: binary

HTTP/1.1 201 Created
Content-Type: application/json

{"ProductID":3,"ProductName":"NewProduct"}
--batchresponse_5678--`;

      mockTransport.setMockResponse('POST', '/$batch', 200, batchResponse, {
        'Content-Type': 'multipart/mixed; boundary=batchresponse_5678'
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const results = await od.batch([
        { method: 'POST', url: 'Products', body: { ProductName: 'NewProduct' } }
      ]);

      expect(results[0].status).toBe(201);
    });

    it('should handle batch response without body', async () => {
      const batchResponse = `--batchresponse_empty
Content-Type: application/http
Content-Transfer-Encoding: binary

HTTP/1.1 204 No Content

--batchresponse_empty--`;

      mockTransport.setMockResponse('POST', '/$batch', 200, batchResponse);

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const results = await od.batch([
        { method: 'DELETE', url: 'Products(1)' }
      ]);

      expect(results[0].status).toBe(204);
      expect(results[0].body).toBeNull();
    });

    it('should follow @odata.nextLink for pagination', async () => {
      mockTransport.setMockResponse('GET', '/Products', 200, {
        '@odata.nextLink': 'https://services.odata.org/Products?$skip=10',
        value: [{ ProductID: 1 }]
      });

      mockTransport.setMockResponse('GET', 'https://services.odata.org/Products?$skip=10', 200, {
        value: [{ ProductID: 2 }]
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const items: any[] = [];
      for await (const item of od.query('Products').getAll()) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items[0].ProductID).toBe(1);
      expect(items[1].ProductID).toBe(2);
    });

    it('should strip trailing slash from serviceRoot', async () => {
      mockTransport.setMockResponse('GET', '/Products', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org/'
      });

      const url = od.buildUrl('Products');
      expect(url).toBe('https://services.odata.org/Products');
    });

    it('should handle error without error.error structure', async () => {
      mockTransport.setMockResponse('GET', '/Products(999)', 500, {
        message: 'Server error'
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await expect(od.getById('Products', 999)).rejects.toThrow(/500/);
    });

    it('should handle ODataException with details and innererror', async () => {
      mockTransport.setMockResponse('GET', '/Products(-2)', 400, {
        error: {
          code: 'ValidationError',
          message: 'Validation failed',
          target: 'ProductID',
          details: [{ code: 'InvalidId', message: 'ID must be positive', target: 'ProductID' }],
          innererror: { message: 'Internal details', type: 'System.ArgumentException', stacktrace: 'at...' }
        }
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      try {
        await od.getById('Products', -2);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ODataException);
        const odErr = err as ODataException;
        expect(odErr.code).toBe('ValidationError');
        expect(odErr.target).toBe('ProductID');
        expect(odErr.details).toHaveLength(1);
        expect(odErr.innererror?.type).toBe('System.ArgumentException');
      }
    });

    it('should use OData version headers', async () => {
      mockTransport.setMockResponse('GET', '/Products', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org',
        version: '4.01'
      });

      await od.get('Products');

      // Verify request was made
      expect(mockTransport.getCallCount('GET', '/Products')).toBe(1);
    });
  });

  describe('ODataQueryBuilder advanced', () => {
    it('should use key() method', async () => {
      mockTransport.setMockResponse('GET', '/Products(5)', 200, {
        ProductID: 5,
        ProductName: 'Widget'
      });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .key(5)
        .get();

      expect(mockTransport.getCallCount('GET', '/Products(5)')).toBe(1);
    });

    it('should use custom() method', async () => {
      mockTransport.setMockResponse('GET', '/Products?customParam=customValue', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .custom('customParam', 'customValue')
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?customParam=customValue')).toBe(1);
    });

    it('should use options() method', async () => {
      mockTransport.setMockResponse('GET', '/Products', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .options({ timeout: 5000 })
        .get();

      expect(mockTransport.getCallCount('GET', '/Products')).toBe(1);
    });

    it('should build $filter with FilterExpression object', async () => {
      mockTransport.setMockResponse('GET', '/Products?$filter=UnitPrice%20eq%2050', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .filter({ eq: ['UnitPrice', 50] })
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$filter=UnitPrice%20eq%2050')).toBe(1);
    });

    it('should build count(false)', async () => {
      mockTransport.setMockResponse('GET', '/Products?$count=false', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .count(false)
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$count=false')).toBe(1);
    });

    it('should chain multiple orderBy calls', async () => {
      mockTransport.setMockResponse('GET', '/Products?$orderby=CategoryID%20asc%2CUnitPrice%20desc', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.query('Products')
        .orderBy('CategoryID', 'asc')
        .orderBy('UnitPrice', 'desc')
        .get();

      expect(mockTransport.getCallCount('GET', '/Products?$orderby=CategoryID%20asc%2CUnitPrice%20desc')).toBe(1);
    });

    it('should build nested expand with ExpandOption', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.query('Orders')
        .expand({
          property: 'OrderDetails',
          select: ['Quantity', 'UnitPrice'],
          filter: 'Quantity gt 0',
          orderby: [{ property: 'UnitPrice', direction: 'desc' }],
          top: 10,
          skip: 5,
          count: true,
          expand: [{ property: 'Product', select: ['ProductName'] }]
        })
        .toUrl();

      expect(url).toContain('$expand=');
      // URL-encoded nested params use %24 instead of $
      expect(url).toContain('%24select');
      expect(url).toContain('Quantity');
      expect(url).toContain('%24filter');
      expect(url).toContain('%24top');
      expect(url).toContain('%24skip');
      expect(url).toContain('%24count');
    });

    it('should build $format query', async () => {
      mockTransport.setMockResponse('GET', '/Products?$format=json', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.get('Products', undefined, { $format: 'json' });

      expect(mockTransport.getCallCount('GET', '/Products?$format=json')).toBe(1);
    });

    it('should handle string $select', async () => {
      mockTransport.setMockResponse('GET', '/Products?$select=ProductName', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.get('Products', undefined, { $select: 'ProductName' });

      expect(mockTransport.getCallCount('GET', '/Products?$select=ProductName')).toBe(1);
    });

    it('should handle string $expand', async () => {
      mockTransport.setMockResponse('GET', '/Products?$expand=Category', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.get('Products', undefined, { $expand: 'Category' });

      expect(mockTransport.getCallCount('GET', '/Products?$expand=Category')).toBe(1);
    });

    it('should handle string $orderby', async () => {
      mockTransport.setMockResponse('GET', '/Products?$orderby=ProductName', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.get('Products', undefined, { $orderby: 'ProductName' });

      expect(mockTransport.getCallCount('GET', '/Products?$orderby=ProductName')).toBe(1);
    });
  });

  describe('FilterBuilder advanced', () => {
    it('should build ne filter', () => {
      const filter = new FilterBuilder()
        .ne('Status', 'Deleted')
        .build();

      expect(filter).toBe("Status ne 'Deleted'");
    });

    it('should build ge filter', () => {
      const filter = new FilterBuilder()
        .ge('Price', 10)
        .build();

      expect(filter).toBe('Price ge 10');
    });

    it('should build lt filter', () => {
      const filter = new FilterBuilder()
        .lt('Quantity', 5)
        .build();

      expect(filter).toBe('Quantity lt 5');
    });

    it('should build endswith filter', () => {
      const filter = new FilterBuilder()
        .endswith('Email', '@example.com')
        .build();

      expect(filter).toBe("endswith(Email,'@example.com')");
    });

    it('should build isNull filter', () => {
      const filter = new FilterBuilder()
        .isNull('DeletedAt')
        .build();

      expect(filter).toBe('DeletedAt eq null');
    });

    it('should build not filter', () => {
      const filter = new FilterBuilder()
        .not()
        .eq('Active', true)
        .build();

      expect(filter).toBe('not Active eq true');
    });

    it('should build raw filter', () => {
      const filter = new FilterBuilder()
        .raw('year(CreatedAt) eq 2023')
        .build();

      expect(filter).toBe('year(CreatedAt) eq 2023');
    });

    it('should escape single quotes in string values', () => {
      const filter = new FilterBuilder()
        .eq('Name', "O'Brien")
        .build();

      expect(filter).toBe("Name eq 'O''Brien'");
    });

    it('should escape single quotes in contains', () => {
      const filter = new FilterBuilder()
        .contains('Description', "it's")
        .build();

      expect(filter).toBe("contains(Description,'it''s')");
    });

    it('should format null value', () => {
      const filter = new FilterBuilder()
        .eq('Manager', null)
        .build();

      expect(filter).toBe('Manager eq null');
    });

    it('should format boolean value', () => {
      const filter = new FilterBuilder()
        .eq('IsActive', true)
        .build();

      expect(filter).toBe('IsActive eq true');
    });

    it('should format Date value', () => {
      const date = new Date('2023-06-15T10:30:00Z');
      const filter = new FilterBuilder()
        .eq('CreatedAt', date)
        .build();

      expect(filter).toContain('2023-06-15');
    });

    it('should format object value as JSON', () => {
      const filter = new FilterBuilder()
        .eq('Metadata', { key: 'value' })
        .build();

      expect(filter).toBe('Metadata eq {"key":"value"}');
    });

    it('should skip and/or when no parts exist', () => {
      const filter = new FilterBuilder()
        .and()  // Should be ignored
        .eq('A', 1)
        .or()   // Should add 'or'
        .eq('B', 2)
        .build();

      expect(filter).toBe('A eq 1 or B eq 2');
    });
  });

  describe('FilterExpression formatting', () => {
    it('should format FilterExpression with all comparison operators', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.buildUrl('Products', undefined, {
        $filter: {
          ne: ['Status', 'Deleted'],
          gt: ['Price', 10],
          ge: ['Quantity', 1],
          lt: ['Stock', 100],
          le: ['Weight', 50]
        }
      });

      expect(url).toContain('$filter=');
    });

    it('should format FilterExpression with string functions', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.buildUrl('Products', undefined, {
        $filter: {
          contains: ['Name', 'widget'],
          startswith: ['Code', 'WID'],
          endswith: ['Email', '.com']
        }
      });

      expect(url).toContain('$filter=');
      expect(url).toContain('contains');
      expect(url).toContain('startswith');
      expect(url).toContain('endswith');
    });

    it('should format FilterExpression with and/or/not', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.buildUrl('Products', undefined, {
        $filter: {
          and: [
            { eq: ['Type', 'A'] },
            { gt: ['Price', 0] }
          ]
        }
      });

      expect(url).toContain('$filter=');
      expect(url).toContain('and');
    });

    it('should format FilterExpression with or', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.buildUrl('Products', undefined, {
        $filter: {
          or: [
            { eq: ['Status', 'Active'] },
            { eq: ['Status', 'Pending'] }
          ]
        }
      });

      expect(url).toContain('$filter=');
      expect(url).toContain('or');
    });

    it('should format FilterExpression with not', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.buildUrl('Products', undefined, {
        $filter: {
          not: { eq: ['IsDeleted', true] }
        }
      });

      expect(url).toContain('$filter=');
      expect(url).toContain('not');
    });

    it('should format FilterExpression with raw', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.buildUrl('Products', undefined, {
        $filter: {
          raw: 'year(CreatedAt) eq 2023'
        }
      });

      expect(url).toContain('year(CreatedAt)%20eq%202023');
    });

    it('should format FilterExpression with expand filter using FilterExpression', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const url = od.query('Orders')
        .expand({
          property: 'Items',
          filter: { gt: ['Quantity', 0] }
        })
        .toUrl();

      expect(url).toContain('$expand=');
      // URL-encoded nested $filter uses %24filter
      expect(url).toContain('%24filter');
    });

    it('should format filter value for various types', async () => {
      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      // null
      const urlNull = od.buildUrl('Products', undefined, {
        $filter: { eq: ['Manager', null] }
      });
      expect(urlNull).toContain('null');

      // boolean
      const urlBool = od.buildUrl('Products', undefined, {
        $filter: { eq: ['IsActive', true] }
      });
      expect(urlBool).toContain('true');

      // Date
      const date = new Date('2023-01-15T00:00:00Z');
      const urlDate = od.buildUrl('Products', undefined, {
        $filter: { eq: ['CreatedAt', date] }
      });
      expect(urlDate).toContain('2023');
    });
  });

  describe('formatKeyValue edge cases', () => {
    it('should format string key value with quotes', async () => {
      mockTransport.setMockResponse('GET', "/GetProduct(name='Widget')", 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.function('GetProduct', { name: 'Widget' });
      expect(mockTransport.getCallCount('GET', "/GetProduct(name='Widget')")).toBe(1);
    });

    it('should format Date key value', async () => {
      const date = new Date('2023-06-15T00:00:00Z');
      mockTransport.setMockResponse('GET', `/GetByDate(date=${date.toISOString()})`, 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.function('GetByDate', { date });
    });

    it('should format null key value', async () => {
      mockTransport.setMockResponse('GET', '/GetOptional(param=null)', 200, { value: [] });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      await od.function('GetOptional', { param: null });
      expect(mockTransport.getCallCount('GET', '/GetOptional(param=null)')).toBe(1);
    });

    it('should escape single quotes in string key', async () => {
      mockTransport.setMockResponse("GET", "/Categories('Food%20%26%20Drink''s')", 200, { CategoryID: 1 });

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      // The key should escape single quotes
      const url = od.buildUrl('Categories', "Food & Drink's");
      expect(url).toContain("''");
    });
  });

  describe('batch response parsing edge cases', () => {
    it('should return empty array when no boundary found', async () => {
      mockTransport.setMockResponse('POST', '/$batch', 200, 'Invalid response without boundary');

      const client = createClient({
        baseUrl: 'https://services.odata.org',
        transport: mockTransport
      });

      const od = createODataClient(client, {
        serviceRoot: 'https://services.odata.org'
      });

      const results = await od.batch([{ method: 'GET', url: 'Products' }]);
      expect(results).toEqual([]);
    });
  });
});
