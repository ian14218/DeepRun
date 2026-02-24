/**
 * Strip HTML tags from a string to prevent XSS in stored content.
 */
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

module.exports = { stripHtml };
