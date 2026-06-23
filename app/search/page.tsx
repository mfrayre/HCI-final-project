'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserId, isLoggedIn } from '@/lib/auth';

interface Course {
  id: string;
  title: string;
  department: string;
  number: string;
  description?: string;
  credits: number;
  offeredTerms: string;
}

interface TermPlan {
  id: string;
  termCode: string;
}

async function fetchAllCourses() {
  const res = await fetch('/api/courses');
  if (!res.ok) throw new Error('Failed to fetch courses');
  return res.json();
}

async function fetchCourses(query: string, department?: string) {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (department) params.append('department', department);

  const res = await fetch(`/api/courses?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch courses');
  return res.json();
}

async function fetchPlan(userId: string) {
  const res = await fetch('/api/plan', {
    headers: { 'x-user-id': userId },
  });
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

async function addCourseToTerm(planId: string, termPlanId: string, courseId: string) {
  const res = await fetch('/api/plan/course', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, termPlanId, courseId, source: 'search' }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to add course');
  }
  return res.json();
}

export default function SearchCoursesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedTermForAdd, setSelectedTermForAdd] = useState('');
  const [selectedCourseForAdd, setSelectedCourseForAdd] = useState<Course | null>(null);
  const userId = getUserId();
  const loggedIn = isLoggedIn();

  useEffect(() => {
    if (!loggedIn) {
      router.push('/');
    }
  }, [loggedIn, router]);

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['plan', userId],
    queryFn: () => fetchPlan(userId!),
    enabled: loggedIn && userId !== null,
  });

  const { data: allCourses = [] } = useQuery({
    queryKey: ['allCourses'],
    queryFn: fetchAllCourses,
  });

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', searchQuery, selectedDepartment],
    queryFn: () => fetchCourses(searchQuery, selectedDepartment),
    enabled: searchQuery.length > 0 || selectedDepartment.length > 0,
  });

  // Extract unique departments from all courses
  const departments = Array.from(
    new Set((allCourses as Course[]).map(c => c.department))
  ).sort();

  // Mutation for adding courses with optimistic updates
  const addCourseMutation = useMutation({
    mutationFn: async ({ planId, termPlanId, courseId }: { planId: string; termPlanId: string; courseId: string }) => {
      return await addCourseToTerm(planId, termPlanId, courseId);
    },
    onMutate: async ({ planId, termPlanId, courseId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['plan', userId] });
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['plan', userId]);
      
      // Find the course details from allCourses
      const course = (allCourses as Course[]).find(c => c.id === courseId);
      const minimalCourse = course || {
        id: courseId,
        title: courseId,
        department: courseId.split('-')[0] || '',
        number: courseId.split('-')[1] || '',
        description: null,
        distributives: '[]',
        worldCulture: null,
        credits: 1,
        offeredTerms: '[]',
        prerequisites: '[]',
        isAbroadOnly: false,
      };
      
      // Optimistically update the cache
      queryClient.setQueryData(['plan', userId], (old: any) => {
        if (!old?.plan) return old;
        
        const plan = { ...old.plan };
        const termPlanIndex = plan.termPlans.findIndex((tp: any) => tp.id === termPlanId);
        
        if (termPlanIndex >= 0) {
          const termPlan = plan.termPlans[termPlanIndex];
          const optimisticPlannedCourse = {
            id: `temp-${Date.now()}`,
            planId,
            termPlanId: termPlan.id,
            courseId,
            isCompleted: false,
            source: 'search',
            course: minimalCourse,
          };
          
          const newTermPlans = [...plan.termPlans];
          newTermPlans[termPlanIndex] = {
            ...termPlan,
            plannedCourses: [...termPlan.plannedCourses, optimisticPlannedCourse],
          };
          
          return {
            ...old,
            plan: {
              ...plan,
              termPlans: newTermPlans,
            },
          };
        }
        
        return old;
      });
      
      // Return context with previous data for rollback
      return { previousData };
    },
    onSuccess: (data) => {
      // Update with the real plannedCourse data from the server
      queryClient.setQueryData(['plan', userId], (old: any) => {
        if (!old?.plan || !data) return old;
        
        const plan = { ...old.plan };
        const termPlanIndex = plan.termPlans.findIndex((tp: any) => 
          tp.plannedCourses.some((pc: any) => 
            pc.courseId === data.courseId && pc.id?.toString().startsWith('temp-')
          )
        );
        
        if (termPlanIndex >= 0) {
          const termPlan = plan.termPlans[termPlanIndex];
          const plannedCourseIndex = termPlan.plannedCourses.findIndex((pc: any) =>
            pc.courseId === data.courseId && pc.id?.toString().startsWith('temp-')
          );
          
          if (plannedCourseIndex >= 0) {
            const newTermPlans = [...plan.termPlans];
            const updatedPlannedCourses = [...termPlan.plannedCourses];
            // Replace temp course with real one from server
            updatedPlannedCourses[plannedCourseIndex] = data;
            
            newTermPlans[termPlanIndex] = {
              ...termPlan,
              plannedCourses: updatedPlannedCourses,
            };
            
            return {
              ...old,
              plan: {
                ...plan,
                termPlans: newTermPlans,
              },
            };
          }
        }
        
        return old;
      });
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-3 rounded shadow-lg z-50';
      successMsg.textContent = `Added ${data.courseId} to term!`;
      document.body.appendChild(successMsg);
      setTimeout(() => {
        if (document.body.contains(successMsg)) {
          document.body.removeChild(successMsg);
        }
      }, 3000);

      setSelectedCourseForAdd(null);
      setSelectedTermForAdd('');
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['plan', userId], context.previousData);
      }
      console.error('Error adding course:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add course. Please try again.';
      
      // Show error message in the same style as success messages
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50 max-w-md';
      errorMsg.innerHTML = `<div class="font-bold">Cannot Add Course</div><div class="text-sm mt-1">${errorMessage}</div>`;
      document.body.appendChild(errorMsg);
      setTimeout(() => {
        if (document.body.contains(errorMsg)) {
          document.body.removeChild(errorMsg);
        }
      }, 5000);
      
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50';
      errorMsg.textContent = 'Failed to add course. Please try again.';
      document.body.appendChild(errorMsg);
      setTimeout(() => {
        if (document.body.contains(errorMsg)) {
          document.body.removeChild(errorMsg);
        }
      }, 5000);
    },
    onSettled: () => {
      // Refetch in the background to sync with server (requirements, violations, etc.)
      queryClient.invalidateQueries({ queryKey: ['plan', userId] });
    },
  });

  const handleAddCourse = () => {
    if (!selectedCourseForAdd || !selectedTermForAdd || !planData?.plan) return;
    
    // Trigger mutation - UI updates immediately, API call happens in background
    addCourseMutation.mutate({
      planId: planData.plan.id,
      termPlanId: selectedTermForAdd,
      courseId: selectedCourseForAdd.id,
    });
  };

  if (!loggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen mt-16">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    );
  }

  if (planLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen mt-16">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const termPlans = planData?.plan?.termPlans || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Search & Add Courses</h1>
          <p className="mt-2 text-gray-600">Find courses and add them to your degree plan</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-20">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>

              {/* Search Query */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Courses
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Course title or code..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Department Filter */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2">
            {coursesLoading ? (
              <div className="text-center text-gray-500 py-8">Loading courses...</div>
            ) : courses.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchQuery || selectedDepartment ? 'No courses found' : 'Start searching to find courses'}
              </div>
            ) : (
              <div className="space-y-4">
                {(courses as Course[]).map(course => (
                  <div
                    key={course.id}
                    className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {course.id}
                        </h3>
                        <p className="text-gray-700">{course.title}</p>
                      </div>
                      <button
                        onClick={() => setSelectedCourseForAdd(course)}
                        className="px-6 py-3 bg-[#1b7a4d] text-white font-semibold rounded-lg hover:bg-[#0d4a2c] shadow-md hover:shadow-lg transition-all text-sm"
                      >
                        Add Course
                      </button>
                    </div>
                    {course.description && (
                      <p className="text-sm text-gray-600 mt-2">{course.description}</p>
                    )}
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">Offered:</span>
                        {JSON.parse(course.offeredTerms || '[]').map((term: string) => (
                          <span
                            key={term}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-4 text-sm text-gray-500">
                        <span>Credits: {course.credits}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add Course Modal */}
        {selectedCourseForAdd && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 mt-0">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Add {selectedCourseForAdd.id}
              </h2>
              <p className="text-gray-600 mb-6">{selectedCourseForAdd.title}</p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Term
                </label>
                <select
                  value={selectedTermForAdd}
                  onChange={(e) => setSelectedTermForAdd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose a term --</option>
                  {termPlans.map((term: TermPlan) => (
                    <option key={term.id} value={term.id}>
                      {term.termCode}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setSelectedCourseForAdd(null)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCourse}
                  disabled={!selectedTermForAdd || addCourseMutation.isPending}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#1b7a4d] to-[#00a651] text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 transition-all transform disabled:scale-100 hover:scale-105"
                >
                  {addCourseMutation.isPending ? 'Adding...' : 'Add Course'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
