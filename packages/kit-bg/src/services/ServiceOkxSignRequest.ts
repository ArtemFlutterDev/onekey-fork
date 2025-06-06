// src/config/okxConfigAndUtils.ts

import { createHmac } from 'crypto';

// --------- Temporary Hardcoded Keys (replace with .env in production) ---------
export const OKX_API_KEY = 'e4c56547-ae48-41a6-907a-5419e2e9403f';
export const OKX_API_SECRET = '2B84F552308AF002C4C27FE56A399C0C';
export const OKX_PASSPHRASE = 'Haxwallet24!';

export const OKX_BASE_URL = 'https://web3.okx.com';
export const OKX_API_PATH_PREFIX = '/api/v5/dex/aggregator';

interface SignOptions {
  method: 'GET' | 'POST';
  requestPath: string;       // e.g. '/api/v5/dex/aggregator/quote'
  queryString?: string;      // URLSearchParams.toString()
  body?: string;             // JSON.stringify(body)
}

/**
 * Generate OKX API headers for authenticated requests using Node's crypto
 */
export function signOkxRequest({ method, requestPath, queryString = '', body = '' }: SignOptions) {
  const timestamp = new Date().toISOString();

  // Construct full path with query string if present
  const fullPath = queryString ? `${requestPath}?${queryString}` : requestPath;
  const prehash = timestamp + method + fullPath + body;

  // Create HMAC-SHA256 signature and encode to Base64
  const signature = createHmac('sha256', OKX_API_SECRET)
    .update(prehash)
    .digest('base64');

  return {
    'OK-ACCESS-KEY': OKX_API_KEY,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
    'Content-Type': 'application/json',
  };
}
