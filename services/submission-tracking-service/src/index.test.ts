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

  const bySubmission = await server.inject({
    method: "GET",
    url: `/internal/submissions/${submissionId}/placements`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(bySubmission.statusCode, 200);
  assert.equal(bySubmission.json().placements.length, 1);
  assert.equal(bySubmission.json().placements[0].writerId, "writer_01");

  const placementDetail = await server.inject({
    method: "GET",
    url: `/internal/placements/${placementId}`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(placementDetail.statusCode, 200);
  assert.equal(placementDetail.json().placement.id, placementId);

  const placementList = await server.inject({
    method: "GET",
    url: "/internal/placements?writerId=writer_01&verificationState=verified",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(placementList.statusCode, 200);
  assert.equal(placementList.json().placements.length, 1);

  const reassignResponse = await server.inject({
    method: "PATCH",
    url: `/internal/submissions/${submissionId}/project`,
    headers: { "x-auth-user-id": "writer_01" },
    payload: { projectId: "project_02" }
  });
  assert.equal(reassignResponse.statusCode, 200);
  assert.equal(reassignResponse.json().submission.projectId, "project_02");
});

test("submission tracking enforces placement visibility by writer", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  const submission = await server.inject({
    method: "POST",
    url: "/internal/submissions",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {
      projectId: "project_01",
      competitionId: "comp_001",
      status: "pending"
    }
  });
  const submissionId = submission.json().submission.id as string;

  const placement = await server.inject({
    method: "POST",
    url: `/internal/submissions/${submissionId}/placements`,
    payload: { status: "finalist" }
  });
  const placementId = placement.json().placement.id as string;

  const forbiddenList = await server.inject({
    method: "GET",
    url: "/internal/placements?writerId=writer_01",
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(forbiddenList.statusCode, 403);

  const forbiddenDetail = await server.inject({
    method: "GET",
    url: `/internal/placements/${placementId}`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(forbiddenDetail.statusCode, 403);
});
