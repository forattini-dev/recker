export const LEGACY_TOOL_GROUPS = {
  docs: [
    'rek_search_docs',
    'rek_get_doc',
    'rek_code_examples',
    'rek_api_schema',
    'rek_suggest',
  ],
  http: ['rek_http_request'],
  dns: ['rek_dns'],
  whois: ['rek_whois'],
  ping: ['rek_ping'],
  ip: ['rek_ip_lookup'],
  network: [
    'rek_http_request',
    'rek_dns',
    'rek_whois',
    'rek_ping',
  ],
} as const;
