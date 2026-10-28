import { Suspense } from 'react';
import { Explorer } from '@/components/Explorer';
import { ResultsSkeleton } from '@/components/Results';

// useSearchParams needs a Suspense boundary. The fallback is a skeleton, never an unfiltered list.
export default function Page() {
  return (
    <Suspense fallback={<div className="shell"><ResultsSkeleton /></div>}>
      <Explorer />
    </Suspense>
  );
}
