import { notFound } from "next/navigation";
import Studio from "@/components/Studio";
import { getProjectWithBrand } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectWithBrand(id);
  if (!project) notFound();
  return <Studio initialProject={project} />;
}
