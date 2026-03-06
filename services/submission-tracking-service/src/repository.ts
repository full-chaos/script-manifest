import type {
  Placement,
  PlacementFilters,
  Submission,
  SubmissionFilters,
} from "@script-manifest/contracts";

export interface SubmissionTrackingRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  createSubmission(data: {
    writerId: string;
    projectId: string;
    competitionId: string;
    status: string;
  }): Promise<Submission>;
  getSubmission(id: string): Promise<Submission | null>;
  updateSubmissionProject(id: string, projectId: string): Promise<Submission | null>;
  updateSubmissionStatus(id: string, status: string): Promise<Submission | null>;
  listSubmissions(filters: SubmissionFilters): Promise<Submission[]>;

  createPlacement(submissionId: string, status: string): Promise<Placement>;
  getPlacement(id: string): Promise<Placement | null>;
  updatePlacementVerification(id: string, verificationState: string): Promise<Placement | null>;
  listPlacementsBySubmission(submissionId: string): Promise<Placement[]>;
  listPlacements(filters: PlacementFilters): Promise<{ placement: Placement; submission: Submission }[]>;
}
