import { notFound } from "next/navigation";
import Studio from "@/components/Studio";
import { ErrorState } from "@/components/ErrorState";
import { getProjectWithBrand } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Catch data-layer failures here rather than letting them escape. An
  // unhandled throw makes Next return an HTML error document with a 500, so the
  // user gets an unreadable page and no way to recover; rendering ErrorState
  // keeps the message readable and actionable instead.
  let project;
  try {
    project = await getProjectWithBrand(id);
  } catch (error) {
    return (
      <ErrorState
        code="ERR 503"
        title="The workspace database is unreachable."
        description="This project could not be loaded. If you are on a hosted deployment, make sure a Postgres database is attached so DATABASE_URL is set."
        detail={error instanceof Error ? error.message : null}
      />
    );
  }

  if (!project) notFound();
  return <Studio initialProject={project} />;
}
