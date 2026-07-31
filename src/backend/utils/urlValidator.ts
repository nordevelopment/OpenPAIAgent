/**
 * urlValidator.ts - Security utility for validating external URLs and preventing SSRF
 * Author: Antigravity AI
 */

import dns from 'dns';
import net from 'net';

/**
 * Checks whether an IP address belongs to a private, loopback, link-local, or reserved range.
 */
export function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) {
      return true; // Invalid IPv4 -> block
    }

    const [p0, p1, p2] = parts;

    // 0.0.0.0/8, 127.0.0.0/8 (Loopback)
    if (p0 === 0 || p0 === 127) return true;

    // 10.0.0.0/8 (Private)
    if (p0 === 10) return true;

    // 172.16.0.0/12 (Private)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (p0 === 192 && p1 === 168) return true;

    // 169.254.0.0/16 (Link-local / AWS & Cloud Metadata)
    if (p0 === 169 && p1 === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments), 192.0.2.0/24 (TEST-NET-1)
    if (p0 === 192 && p1 === 0 && (p2 === 0 || p2 === 2)) return true;

    // 198.18.0.0/15 (Benchmarking), 198.51.100.0/24 (TEST-NET-2)
    if (p0 === 198 && (p1 === 18 || p1 === 19 || (p1 === 51 && p2 === 100))) return true;

    // 203.0.113.0/24 (TEST-NET-3)
    if (p0 === 203 && p1 === 0 && p2 === 113) return true;

    // 224.0.0.0/4 (Multicast / Reserved)
    if (p0 >= 224) return true;

    return false;
  } else if (version === 6) {
    const normalized = ip.toLowerCase().trim();

    // Loopback & Unspecified
    if (normalized === '::1' || normalized === '::') return true;

    // Link-local: fe80::/10
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
      return true;
    }

    // Unique Local Addresses: fc00::/7 (fc00.. / fd00..)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }

    // IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (normalized.startsWith('::ffff:')) {
      const ipv4Part = normalized.substring(7);
      if (net.isIP(ipv4Part) === 4) {
        return isPrivateIp(ipv4Part);
      }
    }

    return false;
  }

  return true; // Unknown format -> block for safety
}

/**
 * Validates a target URL string against scheme and IP restrictions.
 */
export async function validateAndResolveUrl(urlStr: string): Promise<{ valid: boolean; reason?: string; parsedUrl?: URL }> {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, reason: 'URL string is required' };
  }

  try {
    const parsed = new URL(urlStr);

    // Enforce http/https protocols only
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: `Disallowed protocol: '${parsed.protocol}'. Only 'http:' and 'https:' are allowed.` };
    }

    const hostname = parsed.hostname;
    if (!hostname) {
      return { valid: false, reason: 'URL missing hostname' };
    }

    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        return { valid: false, reason: `Access to private or internal IP address (${hostname}) is blocked.` };
      }
    } else {
      try {
        const addresses = await dns.promises.lookup(hostname, { all: true });
        if (!addresses || addresses.length === 0) {
          return { valid: false, reason: `DNS resolution failed for hostname '${hostname}'` };
        }
        for (const addr of addresses) {
          if (isPrivateIp(addr.address)) {
            return { valid: false, reason: `Hostname '${hostname}' resolves to restricted IP address (${addr.address}).` };
          }
        }
      } catch (err: any) {
        return { valid: false, reason: `DNS lookup failed for '${hostname}': ${err.message}` };
      }
    }

    return { valid: true, parsedUrl: parsed };
  } catch (err: any) {
    return { valid: false, reason: `Invalid URL format: ${err.message}` };
  }
}
