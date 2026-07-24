export function isMcpGoogleAuthEnabled(): boolean {
  return process.env.MCP_GOOGLE_AUTH_ENABLED === "true"
}
