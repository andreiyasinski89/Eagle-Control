/**
 * What a speech-recognition error means for the person: no microphone (not allowed, or busy), no connection to the recognition service,
 * or nothing to worry about ("no-speech" after a pause, "aborted" when stopped) — then listening simply goes on.
 */
export function recognitionProblem(error: string | undefined): "mic" | "network" | null {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
    case "audio-capture":
      return "mic";
    case "network":
      return "network";
    default:
      return null;
  }
}
