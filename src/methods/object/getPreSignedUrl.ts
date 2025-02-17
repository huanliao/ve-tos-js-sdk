import TosClientError from '../../TosClientError';
import { covertCamelCase2Kebab, normalizeProxy } from '../../utils';
import TOSBase from '../base';
import { validateObjectName } from './utils';

export interface GetPreSignedUrlInput {
  bucket?: string;
  key: string;
  /**
   * default: 'GET'
   */
  method?: 'GET' | 'PUT';
  /**
   * unit: second, default: 1800
   */
  expires?: number;
  response?: {
    contentType?: string;
    contentDisposition?: string;
  };
  versionId?: string;
}

export function getPreSignedUrl(
  this: TOSBase,
  input: GetPreSignedUrlInput | string
) {
  validateObjectName(input);
  const normalizedInput = typeof input === 'string' ? { key: input } : input;
  const subdomain = true;
  const bucket = normalizedInput.bucket || this.opts.bucket;
  if (!bucket) {
    throw new TosClientError('Must provide bucket param');
  }

  const [newHost, newPath, signingPath] = (() => {
    const encodedKey = encodeURIComponent(normalizedInput.key);
    const objectKeyPath = normalizedInput.key
      .split('/')
      .map(it => encodeURIComponent(it))
      .join('/');

    if (subdomain) {
      return [
        `${bucket}.${this.opts.endpoint}`,
        `/${objectKeyPath}`,
        `/${encodedKey}`,
      ];
    }
    return [
      this.opts.endpoint!,
      `/${bucket}/${objectKeyPath}`,
      `/${bucket}/${encodedKey}`,
    ];
  })();

  const nextQuery: Record<string, any> = {};
  const response = normalizedInput.response || {};
  Object.keys(response).forEach(_key => {
    const key = _key as keyof typeof response;
    const kebabKey = covertCamelCase2Kebab(key);
    nextQuery[`response-${kebabKey}`] = response?.[key];
  });
  if (normalizedInput.versionId) {
    nextQuery.versionId = normalizedInput.versionId;
  }

  const query = this.getSignatureQuery({
    bucket,
    method: normalizedInput.method || 'GET',
    path: signingPath,
    subdomain,
    expires: normalizedInput.expires || 1800,
    query: nextQuery,
  });

  const normalizedProxy = normalizeProxy(this.opts.proxy);
  let baseURL = `http${this.opts.secure ? 's' : ''}://${newHost}`;
  if (normalizedProxy?.url) {
    // if `baseURL` ends with '/'，we filter it.
    // because `newPath` starts with '/'
    baseURL = normalizedProxy.url.replace(/\/+$/g, '');
    if (normalizedProxy?.needProxyParams) {
      query['x-proxy-tos-host'] = newHost;
    }
  }

  const queryStr = Object.keys(query)
    .map(key => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`;
    })
    .join('&');

  return `${baseURL}${newPath}?${queryStr}`;
}

export default getPreSignedUrl;
