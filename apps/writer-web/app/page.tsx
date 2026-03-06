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
    title: "Profile",
    description: "Create a public writer profile with your bio, genres, and representation status.",
    href: "/profile" as Route,
    iconKey: "profile"
  },
  {
    title: "Projects",
    description: "Manage scripts, co-writers, and your draft lifecycle in one workspace.",
    href: "/projects" as Route,
    iconKey: "projects"
  },
  {
    title: "Competitions",
    description: "Search opportunities by format, fee, genre, and deadline proximity.",
    href: "/competitions" as Route,
    iconKey: "competitions"
  },
  {
    title: "Leaderboard",
    description: "Track momentum with a lightweight public ranking of active writers.",
    href: "/leaderboard" as Route,
    iconKey: "leaderboard"
  },
  {
    title: "Submissions",
    description: "Track placements and move submissions across project drafts.",
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
