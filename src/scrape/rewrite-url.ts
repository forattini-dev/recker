/**
 * URL rewrites for non-scrapable document hosts.
 *
 * Some URLs (Google Docs editor, Drive viewer, etc.) don't return useful HTML
 * when fetched directly — the host returns a JS shell that hydrates client-side.
 * Rewriting to the export endpoint yields plain HTML/CSV that a spider can parse.
 *
 * Pure function: no network, no state. Rewrites happen before URL normalization
 * so that tracking-param stripping doesn't corrupt export query strings.
 */

export interface UrlRewriteResult {
  url: string;
  rewritten: boolean;
  reason?: string;
}

const GOOGLE_DOC_PREFIXES = [
  'https://docs.google.com/document/d/',
  'http://docs.google.com/document/d/',
];

const GOOGLE_PRESENTATION_PREFIXES = [
  'https://docs.google.com/presentation/d/',
  'http://docs.google.com/presentation/d/',
];

const GOOGLE_SPREADSHEET_PREFIXES = [
  'https://docs.google.com/spreadsheets/d/',
  'http://docs.google.com/spreadsheets/d/',
];

const GOOGLE_DRIVE_FILE_PREFIXES = [
  'https://drive.google.com/file/d/',
  'http://drive.google.com/file/d/',
];

function startsWithAny(url: string, prefixes: readonly string[]): boolean {
  for (const p of prefixes) {
    if (url.startsWith(p)) return true;
  }
  return false;
}

export function rewriteUrl(input: string): UrlRewriteResult {
  if (startsWithAny(input, GOOGLE_DOC_PREFIXES)) {
    // Published documents (/d/e/) are already public HTML — leave alone
    if (input.includes('/document/d/e/')) {
      return { url: input, rewritten: false };
    }
    const id = input.match(/\/document\/d\/([-\w]+)/)?.[1];
    if (id) {
      return {
        url: `https://docs.google.com/document/d/${id}/export?format=html`,
        rewritten: true,
        reason: 'google-docs-export',
      };
    }
  }

  if (startsWithAny(input, GOOGLE_PRESENTATION_PREFIXES)) {
    if (input.includes('/presentation/d/e/')) {
      return { url: input, rewritten: false };
    }
    const id = input.match(/\/presentation\/d\/([-\w]+)/)?.[1];
    if (id) {
      return {
        url: `https://docs.google.com/presentation/d/${id}/export?format=html`,
        rewritten: true,
        reason: 'google-slides-export',
      };
    }
  }

  if (startsWithAny(input, GOOGLE_SPREADSHEET_PREFIXES)) {
    if (input.includes('/spreadsheets/d/e/')) {
      return { url: input, rewritten: false };
    }
    const id = input.match(/\/spreadsheets\/d\/([-\w]+)/)?.[1];
    if (id) {
      // Preserve gid (tab selection) from query or hash fragment
      const gidMatch = input.match(/[?&#]gid=(\d+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      return {
        url: `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:html${gidParam}`,
        rewritten: true,
        reason: 'google-sheets-export',
      };
    }
  }

  if (startsWithAny(input, GOOGLE_DRIVE_FILE_PREFIXES)) {
    const id = input.match(/\/file\/d\/([-\w]+)/)?.[1];
    if (id) {
      return {
        url: `https://drive.google.com/uc?export=download&id=${id}`,
        rewritten: true,
        reason: 'google-drive-download',
      };
    }
  }

  return { url: input, rewritten: false };
}
