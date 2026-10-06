export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function actionError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong. Please try again.",
  };
}
