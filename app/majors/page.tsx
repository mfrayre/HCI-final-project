'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getUserId, isLoggedIn } from '@/lib/auth';

interface TermPlan {
  id: string;
  termCode: string;
  plannedCourses: any[];
}

interface PlanTemplate {
  id: string;
  name: string;
  description?: string;
  classYear: number;
  major?: {
    id: string;
    name: string;
  };
  plan: {
    id: string;
    primaryMajor: { id: string; name: string } | null;
    termPlans: TermPlan[];
  };
}

async function fetchTemplates() {
  const res = await fetch('/api/plan-templates');
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

async function fetchPlan(userId: string) {
  const res = await fetch('/api/plan', {
    headers: { 'x-user-id': userId },
  });
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

async function updatePlanWithTemplate(planId: string, templateId: string, userId: string) {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      templateId,
      primaryMajorId: null,
    }),
  });
  if (!res.ok) throw new Error('Failed to load template');
  return res.json();
}

export default function MajorPathwaysPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<PlanTemplate | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const userId = getUserId();
  const loggedIn = isLoggedIn();

  useEffect(() => {
    if (!loggedIn) {
      router.push('/');
    }
  }, [loggedIn, router]);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['plan', userId],
    queryFn: () => fetchPlan(userId!),
    enabled: loggedIn && userId !== null,
  });

  const loadTemplateMutation = useMutation({
    mutationFn: () =>
      updatePlanWithTemplate(planData?.plan?.id, selectedTemplate?.plan.id || '', userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan'] });

      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-3 rounded shadow-lg z-50';
      successMsg.textContent = 'Major pathway loaded! Check your dashboard.';
      document.body.appendChild(successMsg);
      setTimeout(() => {
        if (document.body.contains(successMsg)) {
          document.body.removeChild(successMsg);
        }
      }, 3000);

      setShowDetails(false);
      setSelectedTemplate(null);
    },
    onError: () => {
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50';
      errorMsg.textContent = 'Failed to load pathway';
      document.body.appendChild(errorMsg);
      setTimeout(() => {
        if (document.body.contains(errorMsg)) {
          document.body.removeChild(errorMsg);
        }
      }, 5000);
    },
  });

  if (!loggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen mt-16">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    );
  }

  if (templatesLoading || planLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen mt-16">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const majorGroups = templates.reduce((acc: Record<string, PlanTemplate[]>, template) => {
    const majorName = template.major?.name || 'Other';
    if (!acc[majorName]) acc[majorName] = [];
    acc[majorName].push(template);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Major Pathways</h1>
          <p className="mt-2 text-gray-600">
            Browse common major pathways and load them to your plan as a starting point
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No major pathways available yet</p>
            <p className="text-gray-400 text-sm mt-2">
              Check back later as more pathways are created
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(majorGroups).map(([majorName, majorTemplates]) => (
              <div key={majorName}>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">{majorName}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {majorTemplates.map(template => (
                    <div
                      key={template.id}
                      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
                    >
                      <div className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {template.name}
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          {template.description || 'No description'}
                        </p>

                        <div className="space-y-2 mb-4 text-sm text-gray-700">
                          <div>
                            <span className="font-medium">Class Year:</span> {template.classYear}
                          </div>
                          <div>
                            <span className="font-medium">Terms:</span>{' '}
                            {template.plan.termPlans.length}
                          </div>
                          <div>
                            <span className="font-medium">Courses:</span>{' '}
                            {template.plan.termPlans.reduce(
                              (sum, term) => sum + term.plannedCourses.length,
                              0
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedTemplate(template);
                            setShowDetails(true);
                          }}
                          className="w-full px-6 py-3 bg-[#1b7a4d] text-white font-semibold rounded-lg hover:bg-[#0d4a2c] shadow-md hover:shadow-lg transition-all text-sm"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Details Modal */}
        {showDetails && selectedTemplate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 mt-0">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedTemplate.name}
              </h2>
              {selectedTemplate.description && (
                <p className="text-gray-600 mb-4">{selectedTemplate.description}</p>
              )}

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <span className="text-sm font-medium text-gray-700">Class Year</span>
                  <p className="text-lg text-gray-900">{selectedTemplate.classYear}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-700">Major</span>
                  <p className="text-lg text-gray-900">
                    {selectedTemplate.major?.name || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Course Schedule</h3>
                <div className="space-y-2">
                  {selectedTemplate.plan.termPlans.map(term => (
                    <div key={term.id} className="flex justify-between items-start p-2 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium text-gray-900">{term.termCode}</span>
                        <p className="text-sm text-gray-600">
                          {term.plannedCourses.length} course
                          {term.plannedCourses.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {term.plannedCourses.length > 0 && (
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            {term.plannedCourses.map(pc => pc.course.id).join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => {
                    setShowDetails(false);
                    setSelectedTemplate(null);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => loadTemplateMutation.mutate()}
                  disabled={loadTemplateMutation.isPending}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#1b7a4d] to-[#00a651] text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 transition-all transform disabled:scale-100 hover:scale-105"
                >
                  {loadTemplateMutation.isPending ? 'Loading...' : 'Load Pathway'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
