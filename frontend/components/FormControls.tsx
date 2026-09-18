export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-ink mb-1">{label}</span>
      <input
        {...props}
        className="w-full border border-line bg-paper px-3 py-2 text-slate focus:border-indigo transition-colors"
      />
    </label>
  );
}

export function SubmitButton({
  children,
  loading,
}: {
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-indigo text-paper px-4 py-3 hover:bg-ink transition-colors disabled:opacity-60"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mb-4 text-sm text-red-700 border-l-2 border-red-700 pl-3">{message}</p>;
}
