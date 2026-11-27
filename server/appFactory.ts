import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { createSalarRouter, telemetryMiddleware } from './salarRouter.ts';
import { SERVER_KEYS } from './salarStore.ts';
import { ADMIN_CRED_FILE, ROOT_DIR, UPLOADS_DIR } from './runtimePaths.ts';
import {
  cloudPersistenceMiddleware,
  loadUploadedFileFromCloud,
  markCloudDirty,
  persistUploadedFileToCloud,
} from './cloudPersistence.ts';

dotenv.config();

interface AdminCredRecord {
  salt: string;
  hash: string;
  claimedAt: string;
}

function readClaimedAdminCred(): AdminCredRecord | null {
  try {
    if (!fs.existsSync(ADMIN_CRED_FILE)) return null;
    const raw = fs.readFileSync(ADMIN_CRED_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AdminCredRecord;
    if (parsed && typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function hashPasscode(passcode: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPasscode(passcode: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPasscode(passcode, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || SERVER_KEYS.sessionSecret;
}

function signSessionToken(payload: { role: string; sub: string; exp: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): { role: string; sub: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      role: string;
      sub: string;
      exp: number;
    };
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const ADMIN_COOKIE_NAME = 'gurukul_admin_session';
const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function isSecureRequest(req: Request): boolean {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return req.secure || xfProto === 'https' || process.env.VERCEL === '1';
}

function setAdminSessionCookie(req: Request, res: Response, token: string) {
  const maxAgeSec = Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  const attrs = isSecureRequest(req)
    ? 'HttpOnly; Secure; SameSite=None; Partitioned'
    : 'HttpOnly; SameSite=Lax';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; ${attrs}`);
}

function clearAdminSessionCookie(req: Request, res: Response) {
  const attrs = isSecureRequest(req)
    ? 'HttpOnly; Secure; SameSite=None; Partitioned'
    : 'HttpOnly; SameSite=Lax';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; ${attrs}`);
}

function verifyCsrfRequest(req: Request): boolean {
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return true;
  }
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  if (origin && host) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

function getAdminTokenFromReq(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ADMIN_COOKIE_NAME] || null;
}

function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const token = getAdminTokenFromReq(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing admin session token' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'SUPER_ADMIN') {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired admin session' });
    return;
  }
  next();
}

const ALLOWED_MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

export function createApiApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));
  app.use('/api', cloudPersistenceMiddleware);
  app.use(telemetryMiddleware);

  // Admin Gate Auth Endpoints
  app.use('/api/auth/admin', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  });

  app.get('/api/auth/admin/status', (_req: Request, res: Response) => {
    const hasEnvPasscode = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    const claimed = readClaimedAdminCred();
    res.json({
      hasEnvPasscode,
      hasClaimedPasscode: Boolean(claimed),
      requiresClaim: !hasEnvPasscode && !claimed,
    });
  });

  app.get('/api/auth/admin/session', (req: Request, res: Response) => {
    const token = getAdminTokenFromReq(req);
    if (!token) {
      res.json({ authenticated: false });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload || payload.role !== 'SUPER_ADMIN') {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, role: 'SUPER_ADMIN', token });
  });

  app.post('/api/auth/admin/claim', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const hasEnvPasscode = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    if (hasEnvPasscode) {
      res.status(409).json({ error: 'Admin passcode is configured via environment secret.' });
      return;
    }
    if (readClaimedAdminCred()) {
      res.status(409).json({ error: 'Admin passcode has already been claimed.' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 6 || passcode.length > 128) {
      res.status(400).json({ error: 'Passcode must be between 6 and 128 characters.' });
      return;
    }
    const { salt, hash } = hashPasscode(passcode);
    const record: AdminCredRecord = {
      salt,
      hash,
      claimedAt: new Date().toISOString(),
    };
    fs.writeFileSync(ADMIN_CRED_FILE, JSON.stringify(record, null, 2), 'utf-8');
    markCloudDirty('admin_gate');
    const token = signSessionToken({
      role: 'SUPER_ADMIN',
      sub: 'admin-gate',
      exp: Date.now() + ADMIN_SESSION_TTL_MS,
    });
    setAdminSessionCookie(req, res, token);
    res.json({ ok: true, token });
  });

  app.post('/api/auth/admin/login', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }

    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode && envPasscode.length > 0) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({ error: 'Invalid administrator passcode.' });
        return;
      }
      const token = signSessionToken({
        role: 'SUPER_ADMIN',
        sub: 'admin-gate',
        exp: Date.now() + ADMIN_SESSION_TTL_MS,
      });
      setAdminSessionCookie(req, res, token);
      res.json({ ok: true, token });
      return;
    }

    const claimed = readClaimedAdminCred();
    if (!claimed) {
      res.status(400).json({ error: 'No admin passcode configured yet. Claim your initial admin passcode first.' });
      return;
    }

    if (!verifyPasscode(passcode, claimed.salt, claimed.hash)) {
      res.status(401).json({ error: 'Invalid administrator passcode.' });
      return;
    }

    const token = signSessionToken({
      role: 'SUPER_ADMIN',
      sub: 'admin-gate',
      exp: Date.now() + ADMIN_SESSION_TTL_MS,
    });
    setAdminSessionCookie(req, res, token);
    res.json({ ok: true, token });
  });

  app.post('/api/auth/admin/logout', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    clearAdminSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/admin/verify', requireAdminToken, (_req: Request, res: Response) => {
    res.json({ valid: true, role: 'SUPER_ADMIN' });
  });

  // File Upload & Download Storage Endpoints
  app.post('/api/files/upload', async (req: Request, res: Response) => {
    try {
      const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : 'upload';
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.toLowerCase() : '';
      const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';

      if (!base64Data) {
        res.status(400).json({ error: 'Missing file data.' });
        return;
      }

      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) {
        res.status(400).json({ error: 'File must be between 1 byte and 20 MB.' });
        return;
      }

      const inferredExt = ALLOWED_MIME_EXT[mimeType] || path.extname(fileName).toLowerCase();
      if (!inferredExt || !EXT_TO_MIME[inferredExt]) {
        res.status(400).json({ error: 'Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, TXT, CSV.' });
        return;
      }

      const baseSafe =
        path
          .basename(fileName, path.extname(fileName))
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 48) || 'file';
      const uniqueName = `${baseSafe}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${inferredExt}`;
      const targetPath = path.resolve(UPLOADS_DIR, uniqueName);
      if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid target file path.' });
        return;
      }

      fs.writeFileSync(targetPath, buffer);
      const resolvedMime = EXT_TO_MIME[inferredExt] || 'application/octet-stream';
      const cloudStatus = await persistUploadedFileToCloud(uniqueName, buffer, resolvedMime);

      const sizeKb = buffer.length / 1024;
      const fileSize = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(sizeKb))} KB`;

      res.json({
        url: `/api/files/${uniqueName}`,
        storedName: uniqueName,
        fileName: path.basename(fileName),
        fileSize,
        persistent: cloudStatus.persistent,
      });
    } catch (err) {
      console.error('File upload failed:', err);
      res.status(500).json({ error: 'File upload failed.' });
    }
  });

  app.get('/api/files/:filename', async (req: Request, res: Response) => {
    const rawName = String(req.params.filename || '');
    const safeName = path.basename(rawName);
    if (!safeName || safeName !== rawName || !/^[a-zA-Z0-9_.\-]+$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }

    const ext = path.extname(safeName).toLowerCase();
    const fallbackMime = EXT_TO_MIME[ext] || 'application/octet-stream';
    const asAttachment = req.query.download === '1';

    let resolvedPath = path.resolve(UPLOADS_DIR, safeName);
    if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      const bundledUploads = path.resolve(ROOT_DIR, 'uploads');
      const fallbackPath = path.resolve(bundledUploads, safeName);
      if (fallbackPath.startsWith(bundledUploads + path.sep) && fs.existsSync(fallbackPath)) {
        resolvedPath = fallbackPath;
      } else {
        const recovered = await loadUploadedFileFromCloud(safeName);
        if (recovered) {
          res.setHeader('Content-Type', recovered.mimeType || fallbackMime);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Content-Disposition', `${asAttachment ? 'attachment' : 'inline'}; filename="${safeName}"`);
          res.send(recovered.buffer);
          return;
        }
        res.status(404).json({ error: 'File not found.' });
        return;
      }
    }

    res.setHeader('Content-Type', fallbackMime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `${asAttachment ? 'attachment' : 'inline'}; filename="${safeName}"`);
    fs.createReadStream(resolvedPath).pipe(res);
  });

  app.get('/api/public/starter-formula-sheet', (req: Request, res: Response) => {
    const content = [
      'CALCULUS & ALGEBRA — QUICK REVISION FORMULA COMPENDIUM',
      '======================================================',
      '',
      '1. STANDARD LIMITS',
      '   - lim(x->0) sin(x)/x = 1',
      '   - lim(x->0) (1 - cos(ax))/x^2 = a^2 / 2',
      '   - lim(x->0) (e^x - 1)/x = 1',
      '',
      '2. DEFINITE INTEGRATION PROPERTIES',
      '   - King Property: int_a^b f(x) dx = int_a^b f(a + b - x) dx',
      '   - Queen Property: int_0^(2a) f(x) dx = 2 * int_0^a f(x) dx if f(2a - x) = f(x)',
      '',
      '3. MATRICES & DETERMINANTS (ORDER n)',
      '   - |adj(A)| = |A|^(n-1)',
      '   - |kA| = k^n * |A|',
      '   - |A^(-1)| = 1 / |A|',
      '',
      '4. QUADRATIC EQUATIONS (ax^2 + bx + c = 0)',
      '   - alpha + beta = -b/a,  alpha * beta = c/a',
      '   - alpha^2 + beta^2 = (alpha + beta)^2 - 2*alpha*beta',
      '',
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const asAttachment = req.query.download === '1';
    res.setHeader(
      'Content-Disposition',
      `${asAttachment ? 'attachment' : 'inline'}; filename="Formula-Compendium.txt"`
    );
    res.send(content);
  });

  // Mathematical OCR Extraction Endpoint (@google/genai Server-Side)
  app.post('/api/ocr/extract', async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured. Please add your Gemini API key in environment secrets.',
        });
        return;
      }

      const fileBase64 = typeof req.body?.fileBase64 === 'string' ? req.body.fileBase64 : '';
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'image/png';
      const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText : '';
      const defaultClass = typeof req.body?.defaultClass === 'string' ? req.body.defaultClass : 'Class 12th';
      const defaultExamCategory =
        typeof req.body?.defaultExamCategory === 'string' ? req.body.defaultExamCategory : 'JEE Main';

      if (!fileBase64 && !rawText.trim()) {
        res.status(400).json({ error: 'Provide an uploaded image/PDF or raw mathematical text for extraction.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `You are a precision Mathematics OCR & Exam Question Extraction Engine for JEE Main, JEE Advanced, and MHT-CET.
CRITICAL RULES:
1. Preserve ALL mathematical symbols and expressions faithfully: √, π, ∫, Σ, ∞, θ, α, β, matrices, determinants, fractions, exponents, and subscripts.
2. Wrap inline LaTeX math in $...$ and display equations in $$...$$ so KaTeX renders them accurately, OR preserve Unicode mathematical glyphs verbatim. NEVER silently alter numbers, signs, limits of integration, or mathematical expressions.
3. Extract each question into the structured JSON schema with options A, B, C, D (empty array for NUMERICAL or INTEGER types).
4. Set questionType to one of: SINGLE_MCQ, MULTI_MCQ, NUMERICAL, INTEGER, IMAGE_BASED.
5. Do not invent fake answers if not present in the source; if an answer key is not visible, leave correctAnswer empty string "" so the faculty reviewer can verify and fill it.`;

      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
      if (fileBase64) {
        const cleanData = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
        parts.push({
          inlineData: {
            mimeType,
            data: cleanData,
          },
        });
      }
      parts.push({
        text: rawText.trim()
          ? `Extract all Mathematics questions from the attached source and/or text below (default class: ${defaultClass}, target: ${defaultExamCategory}):\n\n${rawText}`
          : `Extract all Mathematics questions from this uploaded document/image accurately (default class: ${defaultClass}, target: ${defaultExamCategory}). Preserve all integrals, matrices, square roots, trigonometric expressions, fractions, and symbols without modifying them.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Short descriptive title of the math question' },
                questionText: { type: Type.STRING, description: 'Full question text preserving math symbols and LaTeX' },
                questionType: {
                  type: Type.STRING,
                  description: 'SINGLE_MCQ, MULTI_MCQ, NUMERICAL, INTEGER, or IMAGE_BASED',
                },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      text: { type: Type.STRING },
                    },
                  },
                },
                correctAnswer: { type: Type.STRING, description: 'Correct option (e.g. A or A,C) or numeric value' },
                explanation: { type: Type.STRING, description: 'Solution steps if present' },
                difficulty: { type: Type.STRING, description: 'EASY, MEDIUM, or HARD' },
                chapter: { type: Type.STRING },
                topic: { type: Type.STRING },
                positiveMarks: { type: Type.NUMBER },
                negativeMarks: { type: Type.NUMBER },
              },
            },
          },
        },
      });

      const text = (response.text ?? '[]').trim();
      const extracted = JSON.parse(text);
      res.json({ questions: Array.isArray(extracted) ? extracted : [] });
    } catch (err: unknown) {
      console.error('OCR extraction error:', err);
      const message = err instanceof Error ? err.message : 'Mathematical OCR extraction failed.';
      res.status(500).json({ error: message });
    }
  });

  // SALAR Tech Multi-Tenant SaaS & Owner Governance API
  app.use('/api', createSalarRouter());

  return app;
}
