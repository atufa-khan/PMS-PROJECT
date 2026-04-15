export function FormStatus({
  status,
  message
}: {
  status?: "idle" | "success" | "error";
  message?: string;
}) {
  if (!message || status === "idle") {
    return null;
  }

  return (
    <p
      className={`rounded-2xl px-4 py-3 text-sm ${
        status === "success"
          ? "bg-teal-50 text-teal-800"
          : "bg-amber-50 text-amber-800"
      }`}
    >
      {message}
    </p>
  );
}
