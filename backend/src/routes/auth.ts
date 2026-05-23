import { Router, Request, Response } from 'express';
import {
  getAllowedCertFingerprints,
  getAllowedPackageName,
  getAuthJwtSecret,
  getTokenTtlSeconds,
  isValidCertFingerprint,
  normalizeCertSha256,
  signJwt,
} from '../services/jwt.js';
import { rateLimitAuth } from '../middleware/rate-limit.js';

const router = Router();

interface TokenRequestBody {
  install_id?: string;
  package_name?: string;
  cert_sha256?: string;
  app_version?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post('/token', rateLimitAuth, (req: Request, res: Response) => {
  const jwtSecret = getAuthJwtSecret();
  if (!jwtSecret) {
    res.status(503).json({ error: 'Server auth is not configured' });
    return;
  }

  const { install_id: installId, package_name: packageName, cert_sha256: certSha256 } =
    req.body as TokenRequestBody;

  if (!installId?.trim() || !UUID_RE.test(installId.trim())) {
    res.status(400).json({ error: 'Invalid install_id' });
    return;
  }

  const expectedPackage = getAllowedPackageName();
  if (packageName?.trim() !== expectedPackage) {
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
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ttl = getTokenTtlSeconds();
  const accessToken = signJwt(
    {
      sub: installId.trim(),
      pkg: expectedPackage,
      cert: normalizedCert,
    },
    jwtSecret,
    ttl,
  );

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ttl,
  });
});

export default router;
