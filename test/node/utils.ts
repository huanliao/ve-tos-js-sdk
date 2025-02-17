import path from 'path';
import fs from 'fs';

export const tmpDir = path.resolve(__dirname, 'tmp');
const autoGeneratedObjectsDir = path.resolve(tmpDir, 'auto-generated-objects');
export const objectKey10M = 'test-object-10M.txt';
export const objectPath10M = path.resolve(
  autoGeneratedObjectsDir,
  objectKey10M
);
export const objectKey100M = 'test-object-100M.txt';
export const objectPath100M = path.resolve(
  autoGeneratedObjectsDir,
  objectKey100M
);
export const objectKey1K = 'test-object-1K.txt';
export const objectPath1K = path.resolve(autoGeneratedObjectsDir, objectKey1K);
export const checkpointsDir =
  path.resolve(tmpDir, 'auto-generated-checkpoints') + '/';

export function initAutoGeneratedObjects() {
  fs.mkdirSync(autoGeneratedObjectsDir, { recursive: true });
  if (!fs.existsSync(objectPath10M)) {
    fs.writeFileSync(objectPath10M, Buffer.alloc(10 * 1024 * 1024, 'a'));
  }
  if (!fs.existsSync(objectPath100M)) {
    fs.writeFileSync(objectPath100M, Buffer.alloc(100 * 1024 * 1024, 'a'));
  }
  if (!fs.existsSync(objectPath1K)) {
    fs.writeFileSync(objectPath1K, Buffer.alloc(1 * 1024, 'a'));
  }
}
