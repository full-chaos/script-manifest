import Link from "next/link";

export default function TermsPage() {
  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Legal</p>
        <h1 className="text-4xl text-foreground">Terms of Service</h1>
      </article>

      <article className="panel stack mx-auto max-w-2xl">
        <p className="text-foreground-secondary">
          These terms of service govern your use of Script Manifest. By creating an account, you agree to these terms.
        </p>

        <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
        <p className="text-foreground-secondary">
          By accessing or using Script Manifest, you agree to be bound by these Terms of Service and our Privacy Policy.
        </p>

        <h2 className="text-xl font-semibold text-foreground">2. User Accounts</h2>
        <p className="text-foreground-secondary">
          You are responsible for maintaining the security of your account credentials. You must provide accurate information when creating an account.
        </p>

        <h2 className="text-xl font-semibold text-foreground">3. Content Ownership</h2>
        <p className="text-foreground-secondary">
          You retain all rights to scripts and content you upload. By using Script Manifest, you grant us a limited license to store and display your content as part of the platform&apos;s functionality.
        </p>

        <h2 className="text-xl font-semibold text-foreground">4. Acceptable Use</h2>
        <p className="text-foreground-secondary">
          You agree not to misuse the platform, including uploading content that infringes on others&apos; intellectual property or engaging in harassment.
        </p>

        <h2 className="text-xl font-semibold text-foreground">5. Termination</h2>
        <p className="text-foreground-secondary">
          You may delete your account at any time. We reserve the right to suspend or terminate accounts that violate these terms.
        </p>

        <p className="text-sm text-muted">
          Last updated: March 2026. This is a placeholder — full legal terms will be published before public launch.
        </p>

        <Link href="/signin" className="text-ember-500 hover:underline text-sm">
          &larr; Back to sign in
        </Link>
      </article>
    </section>
  );
}
