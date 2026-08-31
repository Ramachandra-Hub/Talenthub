import { DsaAssessmentView } from '@/components/dsa/dsa-assessment-view';

type Ctx = { params: Promise<{ weekId: string }> };

export default async function DsaAssessmentPage({ params }: Ctx) {
  const { weekId } = await params;
  return <DsaAssessmentView weekId={weekId} />;
}
