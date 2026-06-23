'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isLoggedIn } from '@/lib/auth';
import Onboarding from '@/components/Onboarding';

export default function SignupPage() {
  const router = useRouter();
  const loggedIn = isLoggedIn();

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (loggedIn) {
      router.push('/');
    }
  }, [loggedIn, router]);

  // Show loading while checking auth status
  if (loggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Redirecting...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-gray-50 pt-8 pb-4 mt-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Your Account</h1>
          <p className="text-gray-600">Set up your degree plan to get started</p>
        </div>
      </div>
      <Onboarding onComplete={() => router.push('/')} />
    </>
  );
}

