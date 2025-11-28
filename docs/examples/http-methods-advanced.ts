// Advanced HTTP Methods Examples for Recker HTTP Client
// Includes WebDAV, CDN, Diagnostic, and Link methods

import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://example.com'
});

// ======================
// Diagnostic Methods
// ======================

// TRACE - diagnostic method to trace request path
const traceResponse = await client.trace('/api/endpoint');
const trace = await traceResponse.text();
console.log('Request trace:', trace);

// CONNECT - establish tunnel through proxy
const connectResponse = await client.connect('/tunnel');
console.log('Connection status:', connectResponse.status);

// ======================
// CDN/Cache Methods
// ======================

// PURGE - purge cached content (Varnish, Fastly, Cloudflare)
await client.purge('/api/cached-resource');
console.log('Cache purged successfully');

// ======================
// WebDAV Methods
// ======================

// PROPFIND - retrieve properties
const props = await client.propfind('/webdav/folder', `<?xml version="1.0"?>
<propfind xmlns="DAV:">
  <prop>
    <getcontentlength/>
    <getlastmodified/>
  </prop>
</propfind>`).text();
console.log('Properties:', props);

// PROPPATCH - update properties
await client.proppatch('/webdav/file.txt', `<?xml version="1.0"?>
<propertyupdate xmlns="DAV:">
  <set>
    <prop>
      <displayname>My Document</displayname>
    </prop>
  </set>
</propertyupdate>`);

// MKCOL - create collection/directory
await client.mkcol('/webdav/newfolder');
console.log('Directory created');

// COPY - copy resource
await client.copy('/webdav/source.txt', {
  headers: { 'Destination': '/webdav/destination.txt' }
});
console.log('Resource copied');

// MOVE - move/rename resource
await client.move('/webdav/old-name.txt', {
  headers: { 'Destination': '/webdav/new-name.txt' }
});
console.log('Resource moved');

// LOCK - lock resource
const lockToken = await client.lock('/webdav/document.txt', `<?xml version="1.0"?>
<lockinfo xmlns="DAV:">
  <lockscope><exclusive/></lockscope>
  <locktype><write/></locktype>
</lockinfo>`).text();
console.log('Lock token:', lockToken);

// UNLOCK - unlock resource
await client.unlock('/webdav/document.txt', {
  headers: { 'Lock-Token': '<opaquelocktoken:abc123>' }
});
console.log('Resource unlocked');

// ======================
// Link Methods (RFC 2068)
// ======================

// LINK - establish relationship between resources
await client.link('/resource', null, {
  headers: { 'Link': '</other-resource>; rel="related"' }
});
console.log('Link relationship established');

// UNLINK - remove relationship
await client.unlink('/resource', null, {
  headers: { 'Link': '</other-resource>; rel="related"' }
});
console.log('Link relationship removed');
