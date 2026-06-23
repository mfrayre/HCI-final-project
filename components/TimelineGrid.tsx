'use client';

import { useState, useEffect } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { getUserId } from '@/lib/auth';
import type { PlanWithRelations } from '@/lib/types';
import CourseCard from './CourseCard';

interface TimelineGridProps {
  plan: PlanWithRelations;
  onTermSelect: (termCode: string | null) => void;
}

export default function TimelineGrid({ plan, onTermSelect }: TimelineGridProps) {
  const queryClient = useQueryClient();
  const userId = getUserId();
  const [selectedTermCode, setSelectedTermCode] = useState<string | null>(null);
  
  // Mutation for deleting courses with optimistic updates
  const deleteCourseMutation = useMutation({
    mutationFn: async (plannedCourseId: string) => {
      const res = await fetch(`/api/plan/course/${plannedCourseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete course');
      }
      return res.json();
    },
    onMutate: async (plannedCourseId) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['plan', userId] });
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['plan', userId]);
      
      // Optimistically update the cache
      queryClient.setQueryData(['plan', userId], (old: any) => {
        if (!old?.plan) return old;
        
        const plan = { ...old.plan };
        const termPlanIndex = plan.termPlans.findIndex((tp: any) =>
          tp.plannedCourses.some((pc: any) => pc.id === plannedCourseId)
        );
        
        if (termPlanIndex >= 0) {
          const termPlan = plan.termPlans[termPlanIndex];
          const newTermPlans = [...plan.termPlans];
          newTermPlans[termPlanIndex] = {
            ...termPlan,
            plannedCourses: termPlan.plannedCourses.filter(
              (pc: any) => pc.id !== plannedCourseId
            ),
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
    onError: (err, plannedCourseId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['plan', userId], context.previousData);
      }
      console.error('Error deleting course:', err);
      alert('Failed to delete course. Please try again.');
    },
    onSettled: () => {
      // Refetch in the background to sync with server (requirements, violations, etc.)
      queryClient.invalidateQueries({ queryKey: ['plan', userId] });
    },
  });

  const handleTermSelect = (termCode: string | null) => {
    // Toggle: if clicking the same term, unselect it; otherwise select the new term
    const newSelectedTerm = selectedTermCode === termCode ? null : termCode;
    setSelectedTermCode(newSelectedTerm);
    onTermSelect(newSelectedTerm);
  };

  // Parse AP credits from plan
  let apCreditsMap: Record<string, string[]> = {};
  try {
    const apCreditsData = (plan as any).apCredits;
    if (apCreditsData) {
      const parsed = typeof apCreditsData === 'string' 
        ? JSON.parse(apCreditsData) 
        : apCreditsData;
      
      if (Array.isArray(parsed)) {
        // Old format: array of course IDs
        parsed.forEach((courseId: string) => {
          apCreditsMap[courseId] = [courseId];
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        // New format: Record<string, string[]>
        apCreditsMap = parsed;
      }
    }
  } catch (e) {
    console.error('Error parsing AP credits:', e);
  }

  // Generate term codes if not present
  const generateTerms = () => {
    return ['22F','23W','23S','23X','23F','24W','24S','24X','24F','25W','25S', '25X', '25F', '26W','26S'];
  };

  // Parse termsOff from plan (it's stored as a JSON string)
  const termsOff = plan.termsOff 
    ? (typeof plan.termsOff === 'string' ? JSON.parse(plan.termsOff) : plan.termsOff)
    : [];
  
  // Filter out terms that are marked as "off"
  const allTerms = generateTerms().filter(termCode => !termsOff.includes(termCode));
  const termPlansMap = new Map(plan.termPlans.map(tp => [tp.termCode, tp]));

  // Get all Dartmouth courses satisfied by AP credits
  const apCreditCourseIds = new Set<string>();
  Object.values(apCreditsMap).forEach(courses => {
    courses.forEach(courseId => apCreditCourseIds.add(courseId));
  });
  const apCreditCourseIdsArray = Array.from(apCreditCourseIds).sort();

  // Fetch course details for AP credit courses
  const [apCreditCourses, setApCreditCourses] = useState<Record<string, any>>({});
  
  useEffect(() => {
    if (apCreditCourseIdsArray.length > 0) {
      // Fetch course details for all AP credit courses
      Promise.all(
        apCreditCourseIdsArray.map(async (courseId) => {
          try {
            const res = await fetch(`/api/courses?query=${courseId}`);
            if (res.ok) {
              const courses = await res.json();
              const course = courses.find((c: any) => c.id === courseId);
              return { courseId, course };
            }
          } catch (e) {
            console.error(`Failed to fetch course ${courseId}:`, e);
          }
          return { courseId, course: null };
        })
      ).then(results => {
        const coursesMap: Record<string, any> = {};
        results.forEach(({ courseId, course }) => {
          if (course) {
            coursesMap[courseId] = course;
          }
        });
        setApCreditCourses(coursesMap);
      });
    }
  }, [apCreditCourseIdsArray.join(',')]);

  // Only show Pre-Matriculation Credits column if there are AP credits with loaded course data
  const hasApCreditsToDisplay = apCreditCourseIdsArray.length > 0 && 
    apCreditCourseIdsArray.some(courseId => apCreditCourses[courseId]);

  return (
    <div className="flex gap-4 pb-4">
      {/* Pre-Matriculation Credits Column - appears before 22F */}
      {hasApCreditsToDisplay && (
        <div className="flex-shrink-0 w-64 rounded-lg p-4 bg-gray-50 border border-gray-300 shadow-sm">
          <div className="font-semibold text-sm mb-2 text-gray-900">
            Pre-Matriculation Credits
          </div>
          <div className="min-h-[200px] space-y-2">
            {apCreditCourseIdsArray.map((courseId) => {
              const course = apCreditCourses[courseId];
              if (!course) {
                // Skip courses that haven't loaded yet
                return null;
              }
              
              // Create a mock PlannedCourse structure for CourseCard
              const mockPlannedCourse = {
                id: `ap-${courseId}`,
                courseId: course.id,
                course: course,
                isCompleted: true, // AP credits are always completed
                termPlanId: 'ap-credits',
                planId: plan.id,
              };

              return (
                <div key={courseId} className="relative">
                  <div className="absolute top-1 right-1 z-10">
                    <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-medium">
                      AP
                    </span>
                  </div>
                  <CourseCard
                    plannedCourse={mockPlannedCourse as any}
                    onDelete={() => {}}
                    hideDelete={true}
                    hideOfferedTerms={true}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {allTerms.map((termCode) => {
          const termPlan = termPlansMap.get(termCode) || {
            id: `temp-${termCode}`,
            termCode,
            maxCourses: 4,
            isStudyAbroad: false,
            plannedCourses: [],
          };

          return (
            <div
              key={termCode}
              className={`flex-shrink-0 w-64 rounded-lg p-4 cursor-pointer transition-all ${
                selectedTermCode === termCode
                  ? 'bg-blue-50 border-2 border-blue-500 shadow-lg shadow-blue-400/50'
                  : 'bg-white border border-gray-200 shadow-sm'
              }`}
              onClick={() => handleTermSelect(termCode)}
            >
              <div className={`font-semibold text-sm mb-2 flex items-center justify-between ${
                selectedTermCode === termCode ? 'text-blue-900' : 'text-gray-900'
              }`}>
                <span>{termCode}</span>
                {termPlan.isStudyAbroad && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Abroad
                  </span>
                )}
              </div>
              <Droppable droppableId={termPlan.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[200px] space-y-2 ${
                      snapshot.isDraggingOver ? 'bg-blue-50' : ''
                    }`}
                  >
                    {termPlan.plannedCourses.map((plannedCourse, index) => (
                      <Draggable
                        key={plannedCourse.id}
                        draggableId={plannedCourse.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={snapshot.isDragging ? 'opacity-50' : ''}
                          >
                            <CourseCard
                              plannedCourse={plannedCourse}
                              onDelete={() => {
                                // Trigger mutation - UI updates immediately, API call happens in background
                                deleteCourseMutation.mutate(plannedCourse.id);
                              }}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {termPlan.plannedCourses.length < termPlan.maxCourses && (
                      <div className="text-xs text-gray-600 text-center py-2">
                        Drop courses here
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
  );
}

