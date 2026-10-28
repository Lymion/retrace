import { getEnv } from "@/server/env";
import { handleRouteError } from "@/server/http";
import { listProfile, updateProfileFromChat } from "@/server/learner/profile";
import { checkAiRateLimit } from "@/server/rate-limit";

/** "Update my profile now": turns pending chat questions into mastery changes. */
export async function POST() {
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    const changed = await updateProfileFromChat({ force: true });
    return Response.json({ changed, concepts: listProfile() });
  } catch (error) {
    return handleRouteError(error, "profile.update_failed");
  }
}
