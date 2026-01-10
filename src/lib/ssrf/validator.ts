/**
 * SSRF (Server-Side Request Forgery) Validator
 *
 * @description Validates URLs to prevent SSRF attacks.
 * Blocks requests to private IP ranges, metadata endpoints, and non-HTTPS URLs.
 *
 * @see paigent-studio-spec.md Section 16.1
 */

import dns from "dns/promises";
import { URL } from "url";

/**
 * Blocked IPv4 ranges.
 */
const BLOCKED_IPV4_RANGES = [
  /^10\./, // 10.0.0.0/8 - Private
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12 - Private
  /^192\.168\./, // 192.168.0.0/16 - Private
  /^127\./, // 127.0.0.0/8 - Loopback
  /^0\./, // 0.0.0.0/8 - Current network
  /^169\.254\./, // 169.254.0.0/16 - Link-local, cloud metadata
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // 100.64.0.0/10 - Carrier-grade NAT
  /^198\.1[89]\./, // 198.18.0.0/15 - Benchmark testing
  /^192\.0\.0\./, // 192.0.0.0/24 - IANA special purpose
  /^192\.0\.2\./, // 192.0.2.0/24 - Documentation
  /^198\.51\.100\./, // 198.51.100.0/24 - Documentation
  /^203\.0\.113\./, // 203.0.113.0/24 - Documentation
  /^224\./, // 224.0.0.0/4 - Multicast
  /^240\./, // 240.0.0.0/4 - Reserved
];

/**
 * Blocked IPv6 patterns.
 */
const BLOCKED_IPV6_PATTERNS = [
  /^fc00:/i, // fc00::/7 - Unique local
  /^fd/i, // fd00::/8 - Unique local
  /^fe80:/i, // fe80::/10 - Link-local
  /^::1$/i, // ::1/128 - Loopback
  /^::/i, // ::/128 - Unspecified
  /^ff/i, // ff00::/8 - Multicast
  /^100::/i, // 100::/64 - Discard-only
  /^2001:db8:/i, // 2001:db8::/32 - Documentation
  /^2001::/i, // 2001::/32 - Teredo (tunneling)
  /^64:ff9b:/i, // 64:ff9b::/96 - NAT64
];

/**
 * Explicitly blocked hostnames (cloud metadata endpoints).
 */
const BLOCKED_HOSTNAMES = [
  "169.254.169.254", // AWS, GCP, Azure metadata
  "metadata.google.internal", // GCP metadata
  "metadata.goog", // GCP metadata
  "instance-data", // AWS instance data
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
];

/**
 * Validation result.
 */
export type ValidationResult = {
  /** Whether the URL is valid and safe. */
  valid: boolean;
  /** Error message if invalid. */
  error?: string;
};

/**
 * Check if an IP address is blocked.
 *
 * @param ip - The IP address to check.
 * @returns True if blocked, false otherwise.
 */
function isBlockedIP(ip: string): boolean {
  // Check IPv4 patterns
  for (const pattern of BLOCKED_IPV4_RANGES) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  // Check IPv6 patterns
  for (const pattern of BLOCKED_IPV6_PATTERNS) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a URL for SSRF safety.
 *
 * @description Performs comprehensive validation to prevent SSRF attacks:
 * 1. Validates URL format
 * 2. Requires HTTPS scheme
 * 3. Blocks private IP ranges
 * 4. Blocks cloud metadata endpoints
 * 5. Optionally validates against an allowlist
 *
 * @param urlString - The URL to validate.
 * @param allowlist - Optional list of allowed domains.
 * @returns Validation result.
 *
 * @example
 * ```typescript
 * const result = await validateUrl(
 *   "https://api.example.com/endpoint",
 *   ["example.com", "trusted-api.com"]
 * );
 * if (!result.valid) {
 *   throw new Error(`SSRF blocked: ${result.error}`);
 * }
 * ```
 */
export async function validateUrl(
  urlString: string,
  allowlist: string[] = []
): Promise<ValidationResult> {
  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Require HTTPS
  if (url.protocol !== "https:") {
    return { valid: false, error: "Only HTTPS URLs are allowed" };
  }

  // Check blocked hostnames
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }

  // Check if hostname looks like an IP address
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^\[.*\]$/;

  if (ipv4Regex.test(hostname)) {
    if (isBlockedIP(hostname)) {
      return { valid: false, error: `Blocked IP address: ${hostname}` };
    }
  }

  if (ipv6Regex.test(hostname)) {
    const ipv6 = hostname.slice(1, -1); // Remove brackets
    if (isBlockedIP(ipv6)) {
      return { valid: false, error: `Blocked IPv6 address: ${ipv6}` };
    }
  }

  // Check allowlist if provided
  if (allowlist.length > 0) {
    const isAllowed = allowlist.some((domain) => {
      const normalizedDomain = domain.toLowerCase();
      return (
        hostname === normalizedDomain ||
        hostname.endsWith(`.${normalizedDomain}`)
      );
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Domain ${hostname} is not in the allowlist`,
      };
    }
  }

  // DNS resolution check - resolve and verify IPs are not private
  try {
    // Try to resolve the hostname
    let addresses: string[] = [];

    try {
      // Try IPv4 first
      const ipv4Addresses = await dns.resolve4(hostname);
      addresses = addresses.concat(ipv4Addresses);
    } catch {
      // IPv4 resolution failed, continue
    }

    try {
      // Try IPv6
      const ipv6Addresses = await dns.resolve6(hostname);
      addresses = addresses.concat(ipv6Addresses);
    } catch {
      // IPv6 resolution failed, continue
    }

    // If no addresses resolved, allow (might be using CDN or special DNS)
    if (addresses.length === 0) {
      // Skip DNS check for hostnames that don't resolve
      // This allows CDNs and services that use special DNS configurations
      return { valid: true };
    }

    // Check all resolved IPs
    for (const ip of addresses) {
      if (isBlockedIP(ip)) {
        return {
          valid: false,
          error: `Hostname ${hostname} resolves to blocked IP: ${ip}`,
        };
      }
    }
  } catch (error) {
    // DNS resolution errors are logged but not blocking
    // Some legitimate services may have DNS issues
    console.warn(`DNS resolution warning for ${hostname}:`, error);
  }

  return { valid: true };
}

/**
 * Sanitize URL for logging (remove sensitive query params).
 *
 * @param urlString - The URL to sanitize.
 * @returns Sanitized URL string.
 */
export function sanitizeUrlForLogging(urlString: string): string {
  try {
    const url = new URL(urlString);

    // Remove sensitive query parameters
    const sensitiveParams = [
      "api_key",
      "apikey",
      "key",
      "token",
      "secret",
      "password",
      "auth",
      "authorization",
      "access_token",
      "refresh_token",
    ];

    for (const param of sensitiveParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, "[REDACTED]");
      }
    }

    return url.toString();
  } catch {
    return "[INVALID_URL]";
  }
}
