import Link from "next/link";
import { Prompt } from "@/components/terminal";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 p-4 sm:p-10">
      <Prompt command="cd ./that-page" cursor={false} />
      <h1 className="font-bold text-danger">retrace: cd: no such file or directory</h1>
      <p className="text-sm text-muted">
        That page or project does not exist (it may have been deleted).
      </p>
      <Link href="/" className="btn">
        Back to projects
      </Link>
    </div>
  );
}
