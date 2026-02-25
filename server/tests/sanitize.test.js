const { stripHtml } = require('../src/utils/sanitize');

describe('stripHtml', () => {
  it('removes HTML tags from a string', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
    expect(stripHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it('removes nested and multiple tags', () => {
    expect(stripHtml('<div><p>hello</p></div>')).toBe('hello');
    expect(stripHtml('a <br/> b')).toBe('a  b');
  });

  it('trims whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello');
    expect(stripHtml('  <b>hi</b>  ')).toBe('hi');
  });

  it('returns plain strings unchanged (after trim)', () => {
    expect(stripHtml('hello world')).toBe('hello world');
  });

  it('returns non-string input as-is', () => {
    expect(stripHtml(null)).toBe(null);
    expect(stripHtml(undefined)).toBe(undefined);
    expect(stripHtml(42)).toBe(42);
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});
