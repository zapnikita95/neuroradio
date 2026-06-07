const SECRET_PATTERNS: RegExp[] = [
  /\bgsk_[A-Za-z0-9]{10,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9_-]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bAQVN[A-Za-z0-9_-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{10,}\b/gi,
  /"(?:groq_api_key|gemini_api_key|openrouter_api_key|yandex_api_key|salute_auth_key|salute_client_secret|client_secrets_enc)"\s*:\s*"[^"]{8,}"/gi,
  /\bv1:[A-Za-z0-9_-]{20,}\b/g,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (match.length <= 12) return '[redacted]';
      return `${match.slice(0, 4)}…[redacted]`;
    });
  }
  return out;
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      stack: value.stack ? redactSecrets(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/api[_-]?key|secret|token|authorization|client_secrets/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redactUnknown(v);
      }
    }
    return out;
  }
  return value;
}
