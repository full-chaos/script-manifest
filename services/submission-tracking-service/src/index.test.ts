import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "./index.js";

test("submission tracking create/list/placement/verify flow", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  const createSubmissionResponse = await server.inject({
    method: "POST",
    url: "/internal/submissions",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {
      projectId: "project_01",
      competitionId: "comp_001",
      status: "pending"
    }
  });

  assert.equal(createSubmissionResponse.statusCode, 201);
  const submissionId = createSubmissionResponse.json().submission.id as string;

  const listResponse = await server.inject({
    method: "GET",
    url: "/internal/submissions?writerId=writer_01"
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().submissions.length, 1);

  const placementResponse = await server.inject({
    method: "POST",
    url: `/internal/submissions/${submissionId}/placements`,
    payload: { status: "quarterfinalist" }
  });
  assert.equal(placementResponse.statusCode, 201);
  const placementId = placementResponse.json().placement.id as string;

  const verifyResponse = await server.inject({
    method: "POST",
    url: `/internal/placements/${placementId}/verify`,
    payload: { verificationState: "verified" }
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(verifyResponse.json().placement.verificationState, "verified");

  const reassignResponse = await server.inject({
    method: "PATCH",
    url: `/internal/submissions/${submissionId}/project`,
    headers: { "x-auth-user-id": "writer_01" },
    payload: { projectId: "project_02" }
  });
  assert.equal(reassignResponse.statusCode, 200);
  assert.equal(reassignResponse.json().submission.projectId, "project_02");
});
