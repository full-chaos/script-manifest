import Link from "next/link";
import type { Route } from "next";

const sections = [
  {
    title: "Auth",
    description: "Register and sign in with session token storage for local flows.",
    href: "/signin" as Route
  },
  {
    title: "Profile",
    description: "Load and update your writer profile fields through profile-project-service.",
    href: "/profile" as Route
  },
  {
    title: "Projects",
    description: "Create and list projects with metadata, discoverability, and viewer scaffold links.",
    href: "/projects" as Route
  },
  {
    title: "Competitions",
    description: "Query indexed competitions with keyword/format/genre/fee filters.",
    href: "/competitions" as Route
  },
  {
    title: "Submissions",
    description: "Record manual competition submissions and track statuses in one place.",
    href: "/submissions" as Route
  }
];

export default function HomePage() {
  return (
    <section className="card stack">
      <h2>Phase 1 Writer Hub</h2>
      <p className="muted">Core MVP surfaces are now wired to gateway-backed services.</p>
      <div className="stack">
        {sections.map((section) => (
          <article className="subcard" key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.description}</p>
            <Link href={section.href}>Open {section.title}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
