import { notFound } from "next/navigation";
import Studio from "@/components/Studio";
import StudioClientFallback from "@/components/StudioClientFallback";
import { hasDatabaseUrl } from "@/db";
import { getProject, isValidUuid } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const project = await getProject(id);
  if (project) {
    return <Studio initialProject={project} ephemeralMode={!hasDatabaseUrl()} />;
  }

  if (!hasDatabaseUrl()) {
    return <StudioClientFallback id={id} />;
  }

  notFound();
}
