export type ReadinessState = "ready" | "attention" | "blocked";

export function getReadinessState({
  blocked = false,
  attention = false
}: {
  blocked?: boolean;
  attention?: boolean;
}): ReadinessState {
  if (blocked) {
    return "blocked";
  }

  if (attention) {
    return "attention";
  }

  return "ready";
}

export function getReadinessLabel(state: ReadinessState) {
  switch (state) {
    case "ready":
      return "Ready";
    case "attention":
      return "Needs attention";
    case "blocked":
      return "Blocked";
  }
}
