import { Router, Request, Response } from 'express';
import {
  DESKTOP_CLIENT_ID,
  EXTENSION_CLIENT_ID,
  getAllowedCertFingerprints,
  getAllowedPackageName,
  getAllowedPackageNames,
  isAllowedPackageName,
  getAuthJwtSecret,
  getTokenTtlSeconds,
  isDesktopAuthEnabled,
  isValidCertFingerprint,
  normalizeCertSha256,
  signJwt,
  verifyDesktopAuthSecret,
} from '../services/jwt.js';
import { rateLimitAuth } from '../middleware/rate-limit.js';
import { exportTransportKeyBase64 } from '../services/client-secrets-transport.js';

const router = Router();

interface TokenRequestBody {
  install_id?: string;
  package_name?: string;
  cert_sha256?: string;
  app_version?: string;
  client_type?: string;
  desktop_secret?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function issueDesktopToken(
  installId: string,
  jwtSecret: string,
  ttl: number,
  res: Response,
  clientId: string = DESKTOP_CLIENT_ID,
): void {
  const accessToken = signJwt(
    {
      sub: installId,
      client: clientId,
    },
    jwtSecret,
    ttl,
  );

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ttl,
    secrets_transport_key: exportTransportKeyBase64(installId),
  });
}

router.post('/token', rateLimitAuth, (req: Request, res: Response) => {
  const jwtSecret = getAuthJwtSecret();
  if (!jwtSecret) {
    res.status(503).json({ error: 'Server auth is not configured' });
    return;
  }

  const body = req.body as TokenRequestBody;
  const installId = body.install_id?.trim();

  if (!installId || !UUID_RE.test(installId)) {
    res.status(400).json({ error: 'Invalid install_id' });
    return;
  }

  const clientType = body.client_type?.trim().toLowerCase();
  if (clientType === 'desktop' || clientType === 'extension') {
    if (!isDesktopAuthEnabled()) {
      res.status(503).json({ error: 'Desktop auth is not configured' });
      return;
    }

    const desktopSecret = body.desktop_secret?.trim() ?? '';
    if (!verifyDesktopAuthSecret(desktopSecret)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const clientId = clientType === 'extension' ? EXTENSION_CLIENT_ID : DESKTOP_CLIENT_ID;
    issueDesktopToken(installId, jwtSecret, getTokenTtlSeconds(), res, clientId);
    return;
  }

  const { package_name: packageName, cert_sha256: certSha256 } = body;

  if (!isAllowedPackageName(packageName)) {
    console.warn(
      `[auth] 403 package mismatch install=${installId.slice(0, 8)} got=${packageName ?? '-'} allowed=${[...getAllowedPackageNames()].join(',')}`,
    );
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const normalizedCert = normalizeCertSha256(certSha256 ?? '');
  if (!isValidCertFingerprint(normalizedCert)) {
    res.status(400).json({ error: 'Invalid cert_sha256' });
    return;
  }

  const allowedCerts = getAllowedCertFingerprints();
  if (allowedCerts.size === 0 || !allowedCerts.has(normalizedCert)) {
    console.warn(
      `[auth] 403 cert not allowed install=${installId.slice(0, 8)} cert=${normalizedCert} — add to ALLOWED_CERT_SHA256 (Play App signing key for Store installs)`,
    );
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ttl = getTokenTtlSeconds();
  const accessToken = signJwt(
    {
      sub: installId,
      pkg: packageName?.trim() ?? getAllowedPackageName(),
      cert: normalizedCert,
    },
    jwtSecret,
    ttl,
  );

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ttl,
    secrets_transport_key: exportTransportKeyBase64(installId),
  });
});

export default router;
