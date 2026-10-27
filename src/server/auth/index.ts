import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";
import { db } from "@/server/db";
import { sendMail } from "@/server/mail";
import { syncGrantedPlans } from "@/server/services/grants";
import { applySignupIntent, intentLocale } from "@/server/services/signup";
import { confirmLink } from "./confirm-link";
import { signInMail } from "./mail-texts";

const providers: Provider[] = [
  {
    id: "email",
    type: "email",
    name: "Email",
    maxAge: 15 * 60,
    from: process.env.MAIL_FROM,
    options: {},
    async sendVerificationRequest({ identifier, url }) {
      const link = confirmLink(url);
      // In the language the person was using on the page, when they said so while creating the account.
      const locale = await intentLocale(identifier).catch(() => "en" as const);
      await sendMail({ to: identifier, ...signInMail(locale, link) });
    },
  },
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Same email → same user: Google verifies addresses, so linking is safe here.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers,
  pages: { signIn: "/sign-in", verifyRequest: "/sign-in?sent=1" },
  events: {
    // A brand-new account: give it the name and language typed on the sign-up form, and the sponsor's link it came through.
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      try {
        await applySignupIntent({ id: user.id, email: user.email });
      } catch (e) {
        console.error("sign-up bookkeeping failed", e instanceof Error ? e.message : e);
      }
    },
    // Signing in required agreeing to the terms (the form will not send without it), so this is the first agreement.
    async signIn({ user }) {
      if (!user.id) return;
      try {
        await db.user.updateMany({ where: { id: user.id, termsAcceptedAt: null }, data: { termsAcceptedAt: new Date() } });
        await syncGrantedPlans(user.id);
      } catch (e) {
        console.error("sign-in bookkeeping failed", e instanceof Error ? e.message : e);
      }
    },
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
