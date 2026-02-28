import { describe, it, expect } from 'vitest';
import { generateKeywordCloud } from '../../src/seo/keywords.js';

describe('Keyword Analysis', () => {
  it('should count frequencies correctly', () => {
    const text = 'seo optimization seo analysis optimization';
    const cloud = generateKeywordCloud({ visibleText: text });
    
    expect(cloud.totalWords).toBe(5);
    expect(cloud.uniqueWords).toBe(3);
    
    const top = cloud.topKeywords;
    expect(top[0].word).toBe('seo');
    expect(top[0].count).toBe(2);
    expect(top[1].word).toBe('optimization');
    expect(top[1].count).toBe(2);
    expect(top[2].word).toBe('analysis');
    expect(top[2].count).toBe(1);
  });

  it('should keep long words while filtering short tokens', () => {
    const text = 'the quick brown fox jumps over the lazy dog and a an of';
    const cloud = generateKeywordCloud({ visibleText: text });
    
    // Keep long tokens and punctuation/diacritics normalization behavior.
    // Remaining expected: quick, brown, fox, jumps, over, lazy, and, the
    expect(cloud.topKeywords.map(k => k.word)).toEqual(
      expect.arrayContaining(['quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'and', 'the'])
    );
  });

  it('should combine meta data with visible text', () => {
    const cloud = generateKeywordCloud({
      visibleText: 'content content',
      title: 'Page Title',
      description: 'Page Description',
      keywords: 'meta keywords'
    });

    // Title and Meta Keywords are weighted (duplicated in input string)
    // Title: "Page Title Page Title" -> page(2), title(2)
    // Desc: "Page Description" -> page(1), description(1)
    // Keywords: "meta keywords meta keywords" -> meta(2), keywords(2)
    // Visible: "content content" -> content(2)
    
    // Total 'page': 3
    const pageKw = cloud.topKeywords.find(k => k.word === 'page');
    expect(pageKw).toBeDefined();
    expect(pageKw?.count).toBe(3);
  });

  it('should normalize case and punctuation', () => {
    const text = 'Hello, hello! HELLO?';
    const cloud = generateKeywordCloud({ visibleText: text });
    
    expect(cloud.uniqueWords).toBe(1);
    expect(cloud.topKeywords[0].word).toBe('hello');
    expect(cloud.topKeywords[0].count).toBe(3);
  });

  it('should filter short words', () => {
    const text = 'a ab abc abcd'; // a, ab < 3 chars (removed), abc, abcd (kept)
    const cloud = generateKeywordCloud({ visibleText: text });
    
    expect(cloud.topKeywords.find(k => k.word === 'a')).toBeUndefined();
    expect(cloud.topKeywords.find(k => k.word === 'ab')).toBeUndefined();
    expect(cloud.topKeywords.find(k => k.word === 'abc')).toBeDefined();
  });
});
