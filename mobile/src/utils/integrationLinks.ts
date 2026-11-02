export function integrationAuthorizationUrl(
  provider: "quickbooks" | "stripe",
  value: unknown,
) {
  const u = new URL(String(value));
  const expected =
    provider === "stripe"
      ? ["connect.stripe.com", "/oauth/authorize"]
      : ["appcenter.intuit.com", "/connect/oauth2"];
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hostname !== expected[0] ||
    u.pathname !== expected[1] ||
    u.hash ||
    !u.searchParams.get("client_id") ||
    !/^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get("state") || "") ||
    u.searchParams.has("access_token")
  )
    throw Error("Authorization link could not be verified.");
  return u.toString();
}
