/** RFC 3986 section 3 / appendix A URI-reference grammar, including IP literals. */
const unreserved = '[A-Za-z0-9._~-]';
const pctEncoded = '%[0-9A-Fa-f]{2}';
const subDelims = "[!$&'()*+,;=]";
const atom = `(?:${unreserved}|${pctEncoded}|${subDelims})`;
const pchar = `(?:${atom}|[:@])`;
const decOctet = '(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])';
const ipv4 = `${decOctet}(?:\\.${decOctet}){3}`;
const h16 = '[0-9A-Fa-f]{1,4}';
const ls32 = `(?:${h16}:${h16}|${ipv4})`;
const ipv6 = [
  `(?:${h16}:){6}${ls32}`,
  `::(?:${h16}:){5}${ls32}`,
  `(?:${h16})?::(?:${h16}:){4}${ls32}`,
  `(?:(?:${h16}:){0,1}${h16})?::(?:${h16}:){3}${ls32}`,
  `(?:(?:${h16}:){0,2}${h16})?::(?:${h16}:){2}${ls32}`,
  `(?:(?:${h16}:){0,3}${h16})?::${h16}:${ls32}`,
  `(?:(?:${h16}:){0,4}${h16})?::${ls32}`,
  `(?:(?:${h16}:){0,5}${h16})?::${h16}`,
  `(?:(?:${h16}:){0,6}${h16})?::`,
].join('|');
const ipvFuture = `[vV][0-9A-Fa-f]+\\.(?:${unreserved}|${subDelims}|:)+`;
const host = `(?:\\[(?:${ipv6}|${ipvFuture})\\]|${atom}*)`;
const authority = `(?:(?:${atom}|:)*@)?${host}(?::[0-9]*)?`;
const pathAbempty = `(?:/${pchar}*)*`;
const pathAbsolute = `/(?:${pchar}+(?:/${pchar}*)*)?`;
const pathRootless = `${pchar}+(?:/${pchar}*)*`;
const pathNoscheme = `(?:${atom}|@)+(?:/${pchar}*)*`;
const hierPart = `(?://${authority}${pathAbempty}|${pathAbsolute}|${pathRootless}|)`;
const relativePart = `(?://${authority}${pathAbempty}|${pathAbsolute}|${pathNoscheme}|)`;
const queryOrFragment = `(?:${pchar}|[/?])*`;
// (?![\s\S]) is a strict end assertion: JavaScript $ also matches before a final newline.
export const URI_REFERENCE_PATTERN = `^(?:[A-Za-z][A-Za-z0-9+.-]*:${hierPart}|${relativePart})(?:\\?${queryOrFragment})?(?:#${queryOrFragment})?(?![\\s\\S])`;
