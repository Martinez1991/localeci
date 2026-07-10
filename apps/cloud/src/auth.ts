/**
 * Auth.js (NextAuth v5) with GitHub OAuth (spec §8). On first sign-in we ensure
 * a user + a personal org exist. Reference implementation.
 */
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { eq } from "drizzle-orm";
import { db, schema } from "./db/index.js";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;
      const githubId = String(profile.id);
      const existing = await db.select().from(schema.users).where(eq(schema.users.githubId, githubId));
      if (existing.length === 0) {
        const [user] = await db
          .insert(schema.users)
          .values({ githubId, email: String(profile.email ?? ""), name: profile.name ?? null })
          .returning();
        await db.insert(schema.orgs).values({ name: `${profile.login ?? "My"} org`, ownerId: user!.id });
      }
      return true;
    },
    async session({ session }) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, session.user!.email!));
      if (user) session.user!.id = user.id;
      return session;
    },
  },
});
