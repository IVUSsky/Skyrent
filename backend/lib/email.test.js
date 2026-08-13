// Unit tests for the email recipient parser (lib/email.js).
// parseRecipients is pure: string in -> array of clean email addresses out
// (or a throw on empty/invalid). It is the contract between the settings UI
// (where multi-recipient values are stored, sometimes JSON-stringified) and
// the Resend transport (which rejects display-names containing Cyrillic /
// special chars with a raw 422). These tests pin every input shape it handles.
const { parseRecipients } = require('./email');

describe('parseRecipients — single valid address', () => {
  test('returns a one-element array for a bare email', () => {
    expect(parseRecipients('user@example.com')).toEqual(['user@example.com']);
  });

  test('trims surrounding whitespace', () => {
    expect(parseRecipients('   user@example.com   ')).toEqual(['user@example.com']);
  });
});

describe('parseRecipients — multiple addresses / separators', () => {
  test('splits on commas', () => {
    expect(parseRecipients('a@x.com,b@x.com,c@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  test('splits on semicolons', () => {
    expect(parseRecipients('a@x.com;b@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  test('splits on newlines', () => {
    expect(parseRecipients('a@x.com\nb@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  test('tolerates mixed separators and stray whitespace', () => {
    expect(parseRecipients('a@x.com , b@x.com;\nc@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });
});

describe('parseRecipients — display-name extraction', () => {
  test('extracts the address from an angle-bracket display name', () => {
    // Resend rejects the Cyrillic display name — only the bare address must survive.
    expect(parseRecipients('Иван Петров <ivan@example.com>')).toEqual(['ivan@example.com']);
  });

  test('keeps working when display name and bare address are mixed', () => {
    expect(parseRecipients('Иван <ivan@example.com>, maria@example.com')).toEqual([
      'ivan@example.com',
      'maria@example.com',
    ]);
  });
});

describe('parseRecipients — quoting / JSON-string wrapping', () => {
  test('unwraps a JSON-stringified value ("...")', () => {
    // settings values are stored JSON.stringify-ed, so a single recipient looks
    // like "user@example.com" (with the quotes) when read back.
    expect(parseRecipients('"user@example.com"')).toEqual(['user@example.com']);
  });

  test('strips per-address single quotes', () => {
    expect(parseRecipients("'user@example.com'")).toEqual(['user@example.com']);
  });
});

describe('parseRecipients — validation / errors', () => {
  test('throws on an empty string', () => {
    expect(() => parseRecipients('')).toThrow('Няма валиден имейл адрес');
  });

  test('throws on null / undefined (treated as empty)', () => {
    expect(() => parseRecipients(null)).toThrow('Няма валиден имейл адрес');
    expect(() => parseRecipients(undefined)).toThrow('Няма валиден имейл адрес');
  });

  test('throws on a malformed address and names the offender', () => {
    expect(() => parseRecipients('not-an-email')).toThrow(/Невалиден имейл.*not-an-email/);
  });

  test('throws on an address without a dot (no TLD)', () => {
    expect(() => parseRecipients('user@example')).toThrow(/Невалиден имейл/);
  });
});
