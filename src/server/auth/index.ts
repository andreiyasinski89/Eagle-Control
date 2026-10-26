import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";
import { db } from "@/server/db";
import { sendMail } from "@/server/mail";

const providers: Provider[] = [
  {
    id: "email",
    type: "email",
    name: "Email",
    maxAge: 15 * 60,
    from: process.env.MAIL_FROM,
    options: {},
    async sendVerificationRequest({ identifier, url }) {
      await sendMail({
        to: identifier,
        subject: "Sign in to MeetOwl",
        text: `Sign in to MeetOwl: ${url}\n\nThe link expires in 15 minutes.`,
        html: `<p>Click to sign in to MeetOwl:</p><p><a href="${url}">Sign in</a></p><p>The link expires in 15 minutes.</p>`,
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
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
