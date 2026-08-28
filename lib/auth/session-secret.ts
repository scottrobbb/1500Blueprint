const MIN_AUTH_SECRET_BYTES = 32;

export function sessionSecret(value: string | undefined): Uint8Array {
  if (!value) throw new Error("AUTH_SECRET is not configured");
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength < MIN_AUTH_SECRET_BYTES) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_BYTES} bytes`);
  }
  return encoded;
}
