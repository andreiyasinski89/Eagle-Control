/** Only the Auth.js e-mail callback may be the target of the confirmation button: this must never become a general redirector. */
export const isSignInTarget = (next: string): boolean => next.startsWith("/api/auth/callback/email?") && !next.includes("\\") && !next.includes("//") && !/[\r\n]/.test(next);
