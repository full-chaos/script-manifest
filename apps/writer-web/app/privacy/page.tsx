import Link from "next/link";

export default function PrivacyPage() {
  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Legal</p>
        <h1 className="text-4xl text-foreground">Privacy Policy</h1>
      </article>

      <article className="panel stack mx-auto max-w-2xl">
        <p className="text-foreground-secondary">
          This privacy policy explains how Script Manifest collects, uses, and protects your personal data.
        </p>

        <h2 className="text-xl font-semibold text-foreground">1. Data We Collect</h2>
        <p className="text-foreground-secondary">
          We collect your email address, display name, and content you upload. We also collect usage data to improve the platform.
        </p>

        <h2 className="text-xl font-semibold text-foreground">2. How We Use Your Data</h2>
        <p className="text-foreground-secondary">
          Your data is used to provide the platform&apos;s features, send transactional emails (verification, password resets), and improve the service.
        </p>

        <h2 className="text-xl font-semibold text-foreground">3. Data Sharing</h2>
        <p className="text-foreground-secondary">
          We do not sell your personal data. We may share data with service providers (email delivery, hosting) as necessary to operate the platform.
        </p>

        <h2 className="text-xl font-semibold text-foreground">4. Your Rights</h2>
        <p className="text-foreground-secondary">
          You have the right to access, correct, or delete your personal data. You can delete your account from the account settings page.
        </p>

        <h2 className="text-xl font-semibold text-foreground">5. Data Retention</h2>
        <p className="text-foreground-secondary">
          Account data is retained while your account is active. After deletion, data is permanently removed within 30 days.
        </p>

        <p className="text-sm text-muted">
          Last updated: March 2026. This is a placeholder — a full privacy policy will be published before public launch.
        </p>

        <Link href="/signin" className="text-ember-500 hover:underline text-sm">
          &larr; Back to sign in
        </Link>
      </article>
    </section>
  );
}
