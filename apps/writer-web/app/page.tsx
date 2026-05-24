import type { Route } from "next";
import { AuthBanner } from "./components/AuthBanner";

type Surface = {
  title: string;
  description: string;
  href: Route;
  iconKey: "profile" | "projects" | "competitions" | "leaderboard" | "submissions";
};

const writerSurfaces: Surface[] = [
  {
    title: "My Proof",
    description: "Create the portable proof page that anchors your career record.",
    href: "/profile" as Route,
    iconKey: "profile"
  },
  {
    title: "My Work",
    description: "Manage scripts, co-writers, drafts, and access activity in one workspace.",
    href: "/projects" as Route,
    iconKey: "projects"
  },
  {
    title: "My Discovery",
    description: "Search opportunities by format, fee, genre, and deadline proximity.",
    href: "/competitions" as Route,
    iconKey: "competitions"
  },
  {
    title: "Evidence-backed confidence",
    description: "Read rankings as documented confidence signals, not verdicts.",
    href: "/leaderboard" as Route,
    iconKey: "leaderboard"
  },
  {
    title: "My Submissions",
    description: "Track submissions, placements, and proof you can export or share.",
    href: "/submissions" as Route,
    iconKey: "submissions"
  }
];

const trustPrinciples = [
  "CSV and PDF exports are first-class, not hidden settings.",
  "No script leaves your control without explicit permission.",
  "Every major ranking or recommendation decision is documented."
];

export default function HomePage() {
  return <AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />;
}
