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
});
