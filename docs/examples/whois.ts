// WHOIS Examples for Recker HTTP Client

import { createClient } from 'recker';

const client = createClient();

// ======================
// Basic WHOIS Lookup
// ======================

const whoisData = await client.whois('google.com');
console.log('WHOIS data:', whoisData);

// ======================
// Check Domain Availability
// ======================

const isAvailable = await client.isDomainAvailable('my-awesome-domain.com');
console.log('Domain available:', isAvailable);

// ======================
// Parse WHOIS Data
// ======================

const parsed = await client.whois('example.com', { parse: true });
console.log('Registrar:', parsed.registrar);
console.log('Creation date:', parsed.creationDate);
console.log('Expiration date:', parsed.expirationDate);
console.log('Name servers:', parsed.nameServers);

// ======================
// Custom WHOIS Server
// ======================

const customWhois = await client.whois('example.com', {
  server: 'whois.verisign-grs.com'
});

// ======================
// IP Address Lookup
// ======================

const ipWhois = await client.whois('8.8.8.8');
console.log('IP WHOIS:', ipWhois);
