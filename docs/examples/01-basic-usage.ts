// Basic Usage Examples for Recker HTTP Client

import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Simple GET request
const users = await client.get('/users').json();

// POST with JSON body
const newUser = await client.post('/users', {
  name: 'John Doe',
  email: 'john@example.com'
}).json();

// PUT to update
const updated = await client.put('/users/123', {
  name: 'Jane Doe',
  email: 'jane@example.com'
}).json();

// PATCH for partial update
const patched = await client.patch('/users/123', {
  email: 'newemail@example.com'
}).json();

// DELETE
await client.delete('/users/123');

// HEAD - check if resource exists
const response = await client.head('/users/123');
console.log('User exists:', response.ok);
console.log('Content-Type:', response.headers.get('content-type'));

// OPTIONS - check allowed methods
const optionsResponse = await client.options('/users');
console.log('Allowed methods:', optionsResponse.headers.get('allow'));
