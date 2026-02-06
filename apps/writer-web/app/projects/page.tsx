import Link from "next/link";
import type { Route } from "next";

const demoViewerRoute = "/projects/script_demo_01/viewer" as Route;

export default function ProjectsPage() {
  return (
    <section className="card">
      <h2>Projects</h2>
      <p>Project creation, draft uploads, and access controls will land incrementally in this phase.</p>
      <p>
        Viewer scaffold: <Link href={demoViewerRoute}>open demo script viewer</Link>
      </p>
    </section>
  );
}
