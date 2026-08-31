const EMAIL_MAX_LENGTH = 254;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "RequestBodyTooLargeError";
  }
}

export function contentLengthExceeds(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get("content-length");
  if (raw === null) return false;
  if (!/^\d+$/.test(raw)) return true;
  const length = Number(raw);
  return !Number.isSafeInteger(length) || length > maxBytes;
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  if (contentLengthExceeds(request, maxBytes)) throw new RequestBodyTooLargeError();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let value = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      value += decoder.decode(part.value, { stream: true });
    }
    return value + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readTextBody(request, maxBytes));
}

export async function readUrlEncodedForm(request: Request, maxBytes: number): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new TypeError("Expected an application/x-www-form-urlencoded request");
  }
  return new URLSearchParams(await readTextBody(request, maxBytes));
}

export function normalizeEmailInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX_LENGTH || /[\s\u0000-\u001f\u007f]/.test(email)) {
    return null;
  }

  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length > 253 || !domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  return email;
}

export function normalizeHttpUrl(value: unknown, maxLength = 2048): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request, expectedOrigin?: string): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const requestOrigin = new URL(request.url).origin;
    const trustedOrigin = new URL(expectedOrigin ?? request.url).origin;
    if (requestOrigin !== trustedOrigin) return false;
    const origin = request.headers.get("origin");
    return !origin || new URL(origin).origin === trustedOrigin;
  } catch {
    return false;
  }
}

export function clientAddress(request: Request): string {
  return clientAddressFromHeaders(request.headers);
}

export function clientAddressFromHeaders(headers: Pick<Headers, "get">): string {
  const raw = headers.get("x-vercel-forwarded-for")
    ?? headers.get("cf-connecting-ip")
    ?? headers.get("x-forwarded-for")
    ?? "unknown";
  const address = raw.split(",", 1)[0]?.trim() ?? "unknown";
  if (!address || address.length > 64 || /[\s\u0000-\u001f\u007f]/.test(address)) return "unknown";
  return address;
}

export function hasImageSignature(bytes: Uint8Array, contentType: string): boolean {
  switch (contentType) {
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a");
    case "image/webp":
      return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
    default:
      return false;
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, signature: string): boolean {
  if (bytes.length < offset + signature.length) return false;
  return [...signature].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}
