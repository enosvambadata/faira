import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert("x")&'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;');
  });

  it('escapes & before other entities (no double-escaping)', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('leaves a plain string untouched', () => {
    expect(escapeHtml('Jane Customer')).toBe('Jane Customer');
  });
});
