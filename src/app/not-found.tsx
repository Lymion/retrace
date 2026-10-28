import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">
        That page or project does not exist (it may have been deleted).
      </p>
      <Link href="/" className="btn mt-4">
        Back to projects
      </Link>
    </div>
  );
}
