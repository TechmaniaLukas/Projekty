import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";

const MagicLinkEmail = Email({
  id: "magic-link",
  maxAge: 60 * 30,
  authorize: undefined,
  async sendVerificationRequest({ identifier: email, url }) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    const from = process.env.AUTH_EMAIL_FROM ?? "Techmania Projekty <onboarding@resend.dev>";
    const subject = "Přihlášení do Techmania Projekty";

    if (!apiKey) {
      console.log("\n=========================================");
      console.log(" MAGIC LINK pro:", email);
      console.log(" URL:", url);
      console.log("=========================================\n");
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        html: renderMagicLinkHtml({ url, email }),
        text: `Přihlášení do Techmania Projekty\n\nKlikni pro přihlášení: ${url}\n\nPokud jste o přihlášení nežádali, e-mail ignorujte.`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }
  },
});

function renderMagicLinkHtml({ url, email }: { url: string; email: string }) {
  return `<!doctype html>
<html lang="cs">
<body style="font-family: system-ui, -apple-system, sans-serif; background:#f5f5f5; padding:24px;">
  <div style="max-width:480px; margin:auto; background:#fff; padding:32px; border-radius:12px;">
    <h2 style="margin-top:0; color:#0f172a;">Přihlášení do Techmania Projekty</h2>
    <p style="color:#475569;">Pro přihlášení účtu <strong>${email}</strong> klikni na tlačítko níže:</p>
    <p style="text-align:center; margin:32px 0;">
      <a href="${url}" style="background:#0f172a; color:#fff; padding:12px 24px; text-decoration:none; border-radius:8px; font-weight:600;">Přihlásit se</a>
    </p>
    <p style="color:#94a3b8; font-size:12px;">Odkaz je platný 30 minut. Pokud jste o přihlášení nežádali, e-mail ignorujte.</p>
  </div>
</body>
</html>`;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [MagicLinkEmail],
  callbacks: {
    // Pokud už existuje uživatel se stejným e-mailem (např. ze seedu), použij
    // jeho ID místo vytvoření duplicitního záznamu. Tím zachováme role,
    // department a jméno přiřazené adminem.
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) return args.existingUserId;
      const email = args.profile.email as string | undefined;
      if (email) {
        // Convex Auth callback dostává generický db typ bez znalosti našich
        // indexů, proto cast přes any. Index "email" je definovaný v schema.ts.
        const db = ctx.db as any;
        const existing = await db
          .query("users")
          .withIndex("email", (q: any) => q.eq("email", email))
          .unique();
        if (existing) return existing._id;
      }
      return await ctx.db.insert("users" as any, {
        email,
        name: args.profile.name as string | undefined,
        image: args.profile.image as string | undefined,
        emailVerificationTime:
          (args.profile.emailVerificationTime as number | undefined) ?? undefined,
        isActive: true,
      });
    },
  },
});
