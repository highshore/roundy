import { Suspense } from 'react';
import { App } from '@/components/app';
import { LoadingScreen } from '@/components/loading-screen';

export default function Page() {
  return <Suspense fallback={<LoadingScreen/>}><App path="reset-password"/></Suspense>;
}
