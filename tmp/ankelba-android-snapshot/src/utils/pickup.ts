export type PickupStepState = "complete" | "current" | "waiting";
// Authorization and this visit's verification are independent of enrollment.
export function pickupSteps(
  authorized: boolean,
  identityVerified = false,
  checkedOut = false,
): PickupStepState[] {
  const verified = authorized && identityVerified;
  const collected = verified && checkedOut;
  return [
    authorized ? "complete" : "current",
    verified ? "complete" : authorized ? "current" : "waiting",
    collected ? "complete" : verified ? "current" : "waiting",
  ];
}
