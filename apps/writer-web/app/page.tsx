const milestones = [
  "Writer profile creation",
  "Project + draft management",
  "Competition directory search",
  "Submission and placement tracking"
];

export default function HomePage() {
  return (
    <section className="card">
      <h2>Phase 1 Launch Track</h2>
      <p>The branch starts core surfaces needed to host scripts and track competition outcomes.</p>
      <ul>
        {milestones.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
