import { Suspense } from 'react';
import { InviteForm } from '@/components/invite-form';

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteForm />
    </Suspense>
  );
}
