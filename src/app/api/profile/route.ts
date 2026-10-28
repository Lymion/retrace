import { handleRouteError } from "@/server/http";
import { listProfile } from "@/server/learner/profile";

/** Concept mastery, weakest first. */
export async function GET() {
  try {
    return Response.json({ concepts: listProfile() });
  } catch (error) {
    return handleRouteError(error, "profile.get_failed");
  }
}
