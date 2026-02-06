import Fastify from "fastify";
import { WriterProfileSchema } from "@script-manifest/contracts";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4001);

const demoProfile = WriterProfileSchema.parse({
  id: "writer_01",
  displayName: "Demo Writer",
  bio: "Phase 1 seed profile",
  genres: ["Drama", "Thriller"],
  representationStatus: "unrepresented"
});

server.get("/health", async () => ({ service: "profile-project-service", ok: true }));

server.get("/internal/profiles/:writerId", async (req, reply) => {
  const { writerId } = req.params as { writerId: string };
  if (writerId !== demoProfile.id) {
    return reply.status(404).send({ error: "profile_not_found" });
  }

  return reply.send({ profile: demoProfile });
});

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
