import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT_DIR = process.cwd();
export const IS_VERCEL = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

function copyDirIfMissing(srcDir: string, destDir: string) {
  try {
    if (!fs.existsSync(srcDir)) return;
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyDirIfMissing(srcPath, destPath);
      } else if (entry.isFile() && !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch {
    // Best-effort seed copy on serverless cold start
  }
}

export function resolveDataDir(): string {
  const override = process.env.SALAR_DATA_DIR?.trim();
  const base = override
    ? path.resolve(override)
    : IS_VERCEL
    ? path.join(os.tmpdir(), 'salar-runtime-auth')
    : path.resolve(ROOT_DIR, '.runtime_auth');

  fs.mkdirSync(base, { recursive: true });

  if (IS_VERCEL || override) {
    const bundledSeedDir = path.resolve(ROOT_DIR, '.runtime_auth');
    if (bundledSeedDir !== base) {
      copyDirIfMissing(bundledSeedDir, base);
    }
  }

  return base;
}

export function resolveUploadsDir(): string {
  const override = process.env.SALAR_UPLOADS_DIR?.trim();
  const dir = override
    ? path.resolve(override)
    : IS_VERCEL
    ? path.join(os.tmpdir(), 'salar-uploads')
    : path.resolve(ROOT_DIR, 'uploads');

  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const DATA_DIR = resolveDataDir();
export const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const UPLOADS_DIR = resolveUploadsDir();
export const ADMIN_CRED_FILE = path.join(DATA_DIR, 'admin-gate.json');

fs.mkdirSync(TENANTS_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

export function getBundledConfigPath(fileName: string): string {
  return path.resolve(ROOT_DIR, fileName);
}
