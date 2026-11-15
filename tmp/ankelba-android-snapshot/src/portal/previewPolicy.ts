/** Preview routes must never use an authenticated session or call the live API. */
export function isPortalPreviewPath(path: string): boolean {
  return /^\/(admin|staff)\/preview(\/|$)/.test(path);
}

export function assertLivePortalRequest(path: string): void {
  if (isPortalPreviewPath(path)) {
    throw new Error("The sample preview cannot connect to the live service.");
  }
}
