import TOSBase from '../base';
import { normalizeHeaders, safeAwait } from '../../utils';
import { Acl, DataTransferStatus, DataTransferType } from '../../interface';
import TosClientError from '../../TosClientError';
import * as fsp from '../../nodejs/fs-promises';
import { EmitReadStream } from '../../nodejs/EmitReadStream';
import fs, { Stats } from 'fs';
import { Readable } from 'stream';
import { isBuffer, getSize } from './utils';

export interface PutObjectInput {
  bucket?: string;
  key: string;
  /**
   * body is empty buffer if it's falsy.
   */
  body?: File | Blob | Buffer | NodeJS.ReadableStream;

  dataTransferStatusChange?: (status: DataTransferStatus) => void;

  /**
   * the simple progress feature
   * percent is [0, 1].
   *
   * since putObject is stateless, so if `putObject` fail and you retry it,
   * `percent` will start from 0 again rather than from the previous value.
   * if you need `percent` start from the previous value, you can use `uploadFile` instead.
   */
  progress?: (percent: number) => void;

  headers?: {
    [key: string]: string | undefined;
    'content-length'?: string;
    'content-type'?: string;
    'content-md5'?: string;
    'cache-control'?: string;
    expires?: string;
    'x-tos-acl'?: Acl;
    'x-tos-grant-full-control'?: string;
    'x-tos-grant-read'?: string;
    'x-tos-grant-read-acp'?: string;
    'x-tos-grant-write-acp'?: string;
    'x-tos-server-side-encryption-customer-algorithm'?: string;
    'x-tos-server-side-encryption-customer-key'?: string;
    'x-tos-server-side-encryption-customer-key-md5'?: string;
    'x-tos-website-redirect-location'?: string;
    'x-tos-storage-class'?: string;
    'x-tos-server-side-encryption'?: string;
  };
}

export interface PutObjectOutput {
  'x-tos-server-side-encryption-customer-algorithm'?: string;
  'x-tos-server-side-encryption-customer-key-md5'?: string;
  'x-tos-version-id'?: string;
  'x-tos-hash-crc64ecma'?: string;
  'x-tos-server-side-encryption'?: string;
}

export async function putObject(this: TOSBase, input: PutObjectInput | string) {
  input = this.normalizeObjectInput(input);
  const headers = normalizeHeaders(input.headers);
  this.setObjectContentTypeHeader(input, headers);

  const totalSize = getSize(input.body, headers);
  const totalSizeValid = totalSize != null;

  if (!totalSizeValid && (input.dataTransferStatusChange || input.progress)) {
    console.warn(
      `Don't get totalSize of putObject's body, the \`dataTransferStatusChange\` and \`progress\` callback will not trigger. You can use \`putObjectFromFile\` instead`
    );
  }

  let consumedBytes = 0;
  const { dataTransferStatusChange, progress } = input;
  const triggerDataTransfer = (
    type: DataTransferType,
    rwOnceBytes: number = 0
  ) => {
    // request cancel will make rwOnceBytes < 0 in browser
    if (!totalSizeValid || rwOnceBytes < 0) {
      return;
    }
    if (!dataTransferStatusChange && !progress) {
      return;
    }
    consumedBytes += rwOnceBytes;

    dataTransferStatusChange?.({
      type,
      rwOnceBytes,
      consumedBytes,
      totalBytes: totalSize,
    });
    const progressValue = (() => {
      if (totalSize === 0) {
        if (type === DataTransferType.Succeed) {
          return 1;
        }
        return 0;
      }
      return consumedBytes / totalSize;
    })();
    if (progressValue === 1) {
      if (type === DataTransferType.Succeed) {
        progress?.(progressValue);
      } else {
        // not exec progress
      }
    } else {
      progress?.(progressValue);
    }
  };

  let newBody = input.body;
  if (process.env.TARGET_ENVIRONMENT === 'node') {
    const body = input.body;
    if (totalSizeValid && (isBuffer(body) || body instanceof Readable)) {
      newBody = new EmitReadStream(body, totalSize, n =>
        triggerDataTransfer(DataTransferType.Rw, n)
      ).stream();
    }
  }

  triggerDataTransfer(DataTransferType.Started);
  const [err] = await safeAwait(
    this.fetchObject<PutObjectOutput>(input, 'PUT', {}, headers, newBody, {
      handleResponse: res => res.headers,
      axiosOpts: {
        onUploadProgress: event => {
          triggerDataTransfer(
            DataTransferType.Rw,
            event.loaded - consumedBytes
          );
        },
      },
    })
  );

  if (err) {
    triggerDataTransfer(DataTransferType.Failed);
    throw err;
  }

  triggerDataTransfer(DataTransferType.Succeed);
}

interface PutObjectFromFileInput extends Omit<PutObjectInput, 'body'> {
  filePath: string;
}

export async function putObjectFromFile(
  this: TOSBase,
  input: PutObjectFromFileInput
): Promise<void> {
  const normalizedHeaders = normalizeHeaders(input.headers);
  if (process.env.TARGET_ENVIRONMENT !== 'node') {
    throw new TosClientError(
      "putObjectFromFile doesn't support in browser environment"
    );
  }

  const stream = fs.createReadStream(input.filePath);
  if (!normalizedHeaders['content-length']) {
    const stats: Stats = await fsp.stat(input.filePath);
    normalizedHeaders['content-length'] = `${stats.size}`;
  }

  return putObject.call(this, {
    ...input,
    body: stream,
    headers: normalizedHeaders,
  });
}

export default putObject;
