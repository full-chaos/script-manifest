import { z } from "zod";

export const WriterProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  genres: z.array(z.string()).default([]),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"]) 
});

export type WriterProfile = z.infer<typeof WriterProfileSchema>;
