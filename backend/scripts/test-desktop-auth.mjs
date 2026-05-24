/**
 * Integration smoke test for desktop auth.
 * Run: ALLOW_DESKTOP_AUTH=true GROQ_API_KEY=... PORT=3099 node dist/index.js
 * Then: node scripts/test-desktop-auth.mjs [port]
 */
const port = Number(process.argv[2] ?? 3099);
const installId = "11111111-1111-4111-8111-111111111111";

const res = await fetch(`http://127.0.0.1:${port}/v1/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    install_id: installId,
    client_type: "desktop",
    desktop_secret: "",
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error("FAIL", res.status, body);
  process.exit(1);
}

const json = JSON.parse(body);
if (!json.access_token) {
  console.error("FAIL: no access_token", json);
  process.exit(1);
}

console.log("OK desktop auth:", json.token_type, "expires_in=", json.expires_in);
