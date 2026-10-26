import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";
import { db } from "@/server/db";
import { sendMail } from "@/server/mail";
import { syncGrantedPlans } from "@/server/services/grants";
import { confirmLink } from "./confirm-link";

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
      await sendMail({
        to: identifier,
        subject: "Sign in to MeetOwl",
        text: `Sign in to MeetOwl: ${link}\n\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this e-mail: nobody can sign in without it.`,
        html: `<p>Click to sign in to MeetOwl:</p><p><a href="${link}">Sign in</a></p><p>The link works once and expires in 15 minutes. If you did not ask for it, ignore this e-mail: nobody can sign in without it.</p>`,
      });
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
