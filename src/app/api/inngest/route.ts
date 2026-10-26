import { serve } from "inngest/next";
import { functions, inngest } from "@/server/jobs/inngest";

// Inngest calls this endpoint to run scheduled and queued jobs; requests are verified with INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
