const STYLES: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  stopped: "bg-orange-100 text-orange-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.queued}`}>
      {status}
    </span>
  );
}
