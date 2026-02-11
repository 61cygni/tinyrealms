export function requireAdminKey(adminKey: string): void {
  const expected = (globalThis as any)?.process?.env?.ADMIN_API_KEY as string | undefined;
  if (!expected) {
    throw new Error("Server misconfigured: ADMIN_API_KEY is not set");
  }
  if (!adminKey || adminKey !== expected) {
    throw new Error("Unauthorized: invalid admin key");
  }
}
