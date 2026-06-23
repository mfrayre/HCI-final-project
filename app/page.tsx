'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Dashboard from '@/components/Dashboard';
import Onboarding from '@/components/Onboarding';
import { getUserId, isLoggedIn } from '@/lib/auth';

async function fetchPlan(userId: string, planId?: string) {
  const url = planId ? `/api/plan?planId=${planId}` : '/api/plan';
  const res = await fetch(url, {
    headers: {
      'x-user-id': userId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

export default function Home() {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const userId = getUserId();
  const loggedIn = isLoggedIn();
  
  // Get planId from URL query params or localStorage
  const [planId, setPlanId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('currentPlanId');
    }
    return null;
  });
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['plan', userId, planId],
    queryFn: () => fetchPlan(userId!, planId || undefined),
    enabled: loggedIn && userId !== null,
    retry: 1,
  });
  
  // Update localStorage when planId changes
  useEffect(() => {
    if (planId && typeof window !== 'undefined') {
      localStorage.setItem('currentPlanId', planId);
    }
  }, [planId]);

  useEffect(() => {
    // Redirect to login page if not logged in
    if (!loggedIn) {
      router.push('/login');
      return;
    }

    // If plan data exists, show dashboard (don't show onboarding)
    // Onboarding should only be shown if explicitly needed, not based on plan content
    if (data?.plan) {
      setShowOnboarding(false);
      return;
    }

    // Only show onboarding if there's no plan data at all
    setShowOnboarding(!data);
  }, [data, loggedIn, router]);

  // Show loading/redirect message if not logged in
  if (!loggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg text-red-600 mb-2">Error loading plan</div>
          <div className="text-sm text-gray-600">{error.message}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">No plan data available</div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="min-h-screen">
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      </div>
    );
  }

  return <Dashboard planData={data} planId={planId} setPlanId={setPlanId} />;
}

