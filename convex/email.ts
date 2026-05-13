import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const sendNotificationEmail = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.runQuery(internal.emailInternal.getNotification, {
      notificationId: args.notificationId,
    });
    if (!notification) return;
    if (notification.readAt || notification.emailSentAt) return;
    if (!notification.recipient || !notification.recipient.email) return;
    if (notification.recipient.isActive === false) return;

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      console.log(
        `[email] AUTH_RESEND_KEY not set, skipping email for "${notification.title}" → ${notification.recipient.email}`,
      );
      return;
    }
    const from =
      process.env.AUTH_EMAIL_FROM ??
      "Techmania Projekty <onboarding@resend.dev>";
    const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
    const link = notification.projectId
      ? notification.taskId
        ? `${siteUrl}/projekty/${notification.projectId}?task=${notification.taskId}`
        : `${siteUrl}/projekty/${notification.projectId}`
      : `${siteUrl}/notifikace`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [notification.recipient.email],
        subject: notification.title,
        text: `${notification.title}\n\n${notification.body ?? ""}\n\nOtevřít: ${link}`,
        html: render(notification.title, notification.body ?? "", link),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[email] Resend error ${res.status}: ${text}`);
      return;
    }

    await ctx.runMutation(internal.emailInternal.markEmailSent, {
      notificationId: args.notificationId,
    });
  },
});

function render(title: string, body: string, link: string): string {
  const safe = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="cs"><body style="font-family: system-ui, -apple-system, sans-serif; background:#f5f5f5; padding:24px;">
  <div style="max-width:480px; margin:auto; background:#fff; padding:24px; border-radius:12px;">
    <h2 style="margin-top:0; color:#0f172a; font-size:18px;">${safe(title)}</h2>
    ${body ? `<p style="color:#475569;">${safe(body)}</p>` : ""}
    <p style="text-align:center; margin:24px 0;">
      <a href="${link}" style="background:#0f172a; color:#fff; padding:10px 20px; text-decoration:none; border-radius:8px; font-weight:600;">Otevřít v aplikaci</a>
    </p>
    <p style="color:#94a3b8; font-size:12px; margin-bottom:0;">Techmania Projekty · interní notifikace</p>
  </div>
</body></html>`;
}
