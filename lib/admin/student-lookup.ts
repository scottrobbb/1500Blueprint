// Next 16 hands dynamic route segments to the page still URL-encoded, so an
// email keyed into the path arrives as "a%40b.com" rather than "a@b.com".
// Decoding is therefore required, not optional -- comparing the raw segment
// against a stored address never matches.
//
// A literal "%" that is not a valid escape makes decodeURIComponent throw
// (emails may carry one in a quoted local part), and in that case the segment
// was never encoded to begin with, so the raw value is the better guess.
export function studentEmailFromParam(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.trim().toLowerCase();
}
