export function actionError(error: unknown): string {
  if (typeof error === "object" && error && "digest" in error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) throw error;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}
