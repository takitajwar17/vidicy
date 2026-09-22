import { notFound } from "next/navigation";

interface SingleSegmentFallbackPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function SingleSegmentFallbackPage({
  params,
}: SingleSegmentFallbackPageProps) {
  await params;

  notFound();
}
