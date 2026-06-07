'use client';

import { ProgrammingExamWorkspace } from '@/components/coding/programming-exam-workspace';
import { RoleGate } from '@/components/role-gate';

export function ProgrammingGated() {
  return (
    <RoleGate allow={['student']}>
      <ProgrammingExamWorkspace />
    </RoleGate>
  );
}
