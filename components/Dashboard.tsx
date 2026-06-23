'use client';

import { useState, useEffect, useRef } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserId } from '@/lib/auth';
import TimelineGrid from './TimelineGrid';
import RequirementsSidebar from './RequirementsSidebar';
import RecommendationsSidebar from './RecommendationsSidebar';
import ViolationsPanel from './ViolationsPanel';
import type { PlanWithRelations, RequirementStatus, Violation } from '@/lib/types';

interface DashboardProps {
  planData: {
    plan: PlanWithRelations;
    requirementStatuses: RequirementStatus[];
    violations: Violation[];
  };
  planId?: string | null;
  setPlanId?: (planId: string | null) => void;
}

async function moveCourse(plannedCourseId: string, newTermPlanId: string) {
  const res = await fetch(`/api/plan/course/${plannedCourseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ termPlanId: newTermPlanId }),
  });
  if (!res.ok) throw new Error('Failed to move course');
  return res.json();
}

async function fetchCourse(courseId: string) {
  const res = await fetch(`/api/courses?query=${courseId}`);
  if (!res.ok) throw new Error('Failed to fetch course');
  const courses = await res.json();
  return courses.find((c: any) => c.id === courseId);
}

async function addCourse(planId: string, termPlanId: string, courseId: string, termCode?: string) {
  // If termPlanId starts with 'temp-', we need to create the term plan first
  let actualTermPlanId = termPlanId;
  if (termPlanId.startsWith('temp-') && termCode) {
    const termRes = await fetch('/api/plan/term', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId,
        termCode,
        maxCourses: 4,
        isStudyAbroad: false,
      }),
    });
    if (!termRes.ok) throw new Error('Failed to create term plan');
    const termPlan = await termRes.json();
    actualTermPlanId = termPlan.id;
  }

  const res = await fetch('/api/plan/course', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, termPlanId: actualTermPlanId, courseId, source: 'planned' }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to add course');
  }
  return res.json();
}

async function updatePlan(userId: string, data: {
  termsOff?: string[];
}) {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update plan');
  }
  
  return res.json();
}

export default function Dashboard({ planData, planId, setPlanId }: DashboardProps) {
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [isRequirementsSidebarExpanded, setIsRequirementsSidebarExpanded] = useState(true);
  const [isRecommendationsSidebarExpanded, setIsRecommendationsSidebarExpanded] = useState(true);
  const [termsOff, setTermsOff] = useState<string[]>([]);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [showPlanSwitcher, setShowPlanSwitcher] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const mainContentRef = useRef<HTMLDivElement>(null);
  const scrollPreventionCleanupRef = useRef<(() => void) | null>(null);
  const isDraggingRef = useRef(false);
  const savedScrollLeftRef = useRef<number>(0);
  const queryClient = useQueryClient();
  const userId = getUserId();

  // Initialize termsOff from plan data
  useEffect(() => {
    if (planData?.plan?.termsOff) {
      const parsed = typeof planData.plan.termsOff === 'string' 
        ? JSON.parse(planData.plan.termsOff) 
        : planData.plan.termsOff;
      setTermsOff(parsed || []);
    }
  }, [planData?.plan?.termsOff]);

  // Fetch all plans when switcher is opened
  useEffect(() => {
    if (showPlanSwitcher && userId) {
      setIsLoadingPlans(true);
      fetch('/api/plans', {
        headers: { 'x-user-id': userId },
      })
        .then(res => res.json())
        .then(data => {
          setPlans(data);
          setIsLoadingPlans(false);
        })
        .catch(err => {
          console.error('Failed to fetch plans:', err);
          setIsLoadingPlans(false);
        });
    }
  }, [showPlanSwitcher, userId]);

  // Guard against undefined data
  if (!planData || !planData.plan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">No plan data available</div>
      </div>
    );
  }

  const moveMutation = useMutation({
    mutationFn: ({ plannedCourseId, newTermPlanId }: { plannedCourseId: string; newTermPlanId: string }) =>
      moveCourse(plannedCourseId, newTermPlanId),
    onMutate: async ({ plannedCourseId, newTermPlanId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['plan', userId] });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(['plan', userId]);
      
      // Optimistically update
      queryClient.setQueryData(['plan', userId], (old: any) => {
        if (!old?.plan) return old;
        
        const plan = { ...old.plan };
        const sourceTermPlanIndex = plan.termPlans.findIndex((tp: any) => 
          tp.plannedCourses.some((pc: any) => pc.id === plannedCourseId)
        );
        const destTermPlanIndex = plan.termPlans.findIndex((tp: any) => tp.id === newTermPlanId);
        
        if (sourceTermPlanIndex >= 0 && destTermPlanIndex >= 0) {
          const sourceTermPlan = plan.termPlans[sourceTermPlanIndex];
          const destTermPlan = plan.termPlans[destTermPlanIndex];
          const plannedCourse = sourceTermPlan.plannedCourses.find((pc: any) => pc.id === plannedCourseId);
          
          if (plannedCourse) {
            // Create new term plans with updated courses
            const newTermPlans = [...plan.termPlans];
            newTermPlans[sourceTermPlanIndex] = {
              ...sourceTermPlan,
              plannedCourses: sourceTermPlan.plannedCourses.filter(
                (pc: any) => pc.id !== plannedCourseId
              ),
            };
            newTermPlans[destTermPlanIndex] = {
              ...destTermPlan,
              plannedCourses: [...destTermPlan.plannedCourses, plannedCourse],
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
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['plan', userId], context.previousData);
      }
      console.error('Error moving course:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to move course. Please try again.';
      
      // Show error message in the same style as success messages
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50 max-w-md';
      errorMsg.innerHTML = `<div class="font-bold">Cannot Move Course</div><div class="text-sm mt-1">${errorMessage}</div>`;
      document.body.appendChild(errorMsg);
      setTimeout(() => {
        if (document.body.contains(errorMsg)) {
          document.body.removeChild(errorMsg);
        }
      }, 5000);
    },
    onSettled: () => {
      // Refetch to get updated requirements and violations
      queryClient.invalidateQueries({ queryKey: ['plan', userId] });
    },
  });

  const addMutation = useMutation({
    mutationFn: ({ planId, termPlanId, courseId, termCode }: { planId: string; termPlanId: string; courseId: string; termCode?: string }) =>
      addCourse(planId, termPlanId, courseId, termCode),
    onMutate: async ({ planId, termPlanId, courseId, termCode }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['plan', userId] });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(['plan', userId]);
      
      // Create minimal course object for immediate optimistic update
      // Parse courseId to get department and number (e.g., "COSC-10" -> department: "COSC", number: "10")
      const [department, number] = courseId.split('-');
      const minimalCourse = {
        id: courseId,
        title: courseId, // Will be replaced when full course data loads
        department: department || '',
        number: number || '',
        description: null,
        distributives: '[]',
        worldCulture: null,
        credits: 1,
        offeredTerms: '[]',
        prerequisites: '[]',
        isAbroadOnly: false,
      };
      
      // Optimistically update immediately
      queryClient.setQueryData(['plan', userId], (old: any) => {
        if (!old?.plan) return old;
        
        const plan = { ...old.plan };
        let targetTermPlanIndex = plan.termPlans.findIndex((tp: any) => tp.id === termPlanId);
        
        // If term plan doesn't exist yet (temp term), create it optimistically
        if (targetTermPlanIndex < 0 && termCode) {
          const newTermPlan = {
            id: termPlanId,
            termCode,
            maxCourses: 4,
            isStudyAbroad: false,
            plannedCourses: [],
          };
          return {
            ...old,
            plan: {
              ...plan,
              termPlans: [...plan.termPlans, {
                ...newTermPlan,
                plannedCourses: [{
                  id: `temp-${Date.now()}`,
                  planId,
                  termPlanId: newTermPlan.id,
                  courseId,
                  isCompleted: false,
                  source: 'planned',
                  course: minimalCourse,
                }],
              }],
            },
          };
        }
        
        if (targetTermPlanIndex >= 0) {
          const targetTermPlan = plan.termPlans[targetTermPlanIndex];
          // Create optimistic plannedCourse
          const optimisticPlannedCourse = {
            id: `temp-${Date.now()}`,
            planId,
            termPlanId: targetTermPlan.id,
            courseId,
            isCompleted: false,
            source: 'planned',
            course: minimalCourse,
          };
          
          const newTermPlans = [...plan.termPlans];
          newTermPlans[targetTermPlanIndex] = {
            ...targetTermPlan,
            plannedCourses: [...targetTermPlan.plannedCourses, optimisticPlannedCourse],
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
      
      // Fetch full course details in background and update when ready
      fetchCourse(courseId).then((fullCourse) => {
        if (fullCourse) {
          queryClient.setQueryData(['plan', userId], (old: any) => {
            if (!old?.plan) return old;
            
            const plan = { ...old.plan };
            const termPlan = plan.termPlans.find((tp: any) => 
              tp.plannedCourses.some((pc: any) => 
                pc.courseId === courseId && pc.id?.toString().startsWith('temp-')
              )
            );
            
            if (termPlan) {
              const plannedCourseIndex = termPlan.plannedCourses.findIndex((pc: any) =>
                pc.courseId === courseId && pc.id?.toString().startsWith('temp-')
              );
              
              if (plannedCourseIndex >= 0) {
                const newTermPlans = [...plan.termPlans];
                const termPlanIndex = plan.termPlans.indexOf(termPlan);
                const updatedPlannedCourses = [...termPlan.plannedCourses];
                updatedPlannedCourses[plannedCourseIndex] = {
                  ...updatedPlannedCourses[plannedCourseIndex],
                  course: fullCourse,
                };
                
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
        }
      }).catch(() => {
        // Silently fail - the mutation response will have the correct data
      });
      
      return { previousData };
    },
    onSuccess: (data) => {
      // Update with the real plannedCourse data from the server
      // The server returns the full plannedCourse with real ID
      queryClient.setQueryData(['plan', userId], (old: any) => {
        if (!old?.plan || !data) return old;
        
        const plan = { ...old.plan };
        // Find the term plan that contains the temp course
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
    },
    onSettled: () => {
      // Refetch to get updated requirements and violations
      queryClient.invalidateQueries({ queryKey: ['plan', userId] });
    },
  });

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination, source } = result;

    // Check if dragging from recommendations (starts with 'course-')
    if (draggableId.startsWith('course-')) {
      const courseId = draggableId.replace('course-', '');
      let termPlan = planData.plan.termPlans.find(tp => tp.id === destination.droppableId);
      let termCode: string;
      
      // If destination is a temp term (doesn't exist yet), extract termCode from the ID
      if (destination.droppableId.startsWith('temp-')) {
        termCode = destination.droppableId.replace('temp-', '');
      } else if (termPlan) {
        termCode = termPlan.termCode;
      } else {
        // Fallback: try to find termPlan by termCode if destination.droppableId is actually a termCode
        termCode = destination.droppableId;
        termPlan = planData.plan.termPlans.find(tp => tp.termCode === termCode);
      }

      if (!termCode) {
        console.error('Could not determine termCode for destination:', destination.droppableId);
        return;
      }

      addMutation.mutate({
          planId: planData.plan.id,
          termPlanId: termPlan?.id || destination.droppableId,
          courseId,
          termCode,
      });
      return;
    }

    // Moving existing planned course
    const sourceTermPlan = planData.plan.termPlans.find(tp => tp.id === source.droppableId);
    let destTermPlan = planData.plan.termPlans.find(tp => tp.id === destination.droppableId);
    
    // If destination is a temp term, create it first
    if (!destTermPlan && destination.droppableId.startsWith('temp-')) {
      const termCode = destination.droppableId.replace('temp-', '');
      try {
        const termRes = await fetch('/api/plan/term', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: planData.plan.id,
            termCode,
            maxCourses: 4,
            isStudyAbroad: false,
          }),
        });
        if (termRes.ok) {
          destTermPlan = await termRes.json();
          // Invalidate to refresh the plan data
          queryClient.invalidateQueries({ queryKey: ['plan', userId] });
        } else {
          console.error('Failed to create term plan');
          return;
        }
      } catch (error) {
        console.error('Error creating term plan:', error);
        return;
      }
    }

    if (sourceTermPlan && destTermPlan) {
      const plannedCourse = sourceTermPlan.plannedCourses.find(
        pc => pc.id === draggableId
      );
      if (plannedCourse) {
        moveMutation.mutate(
          {
            plannedCourseId: plannedCourse.id,
            newTermPlanId: destTermPlan.id,
          },
          {
            onError: (error) => {
              console.error('Error moving course:', error);
              alert(`Failed to move course: ${error instanceof Error ? error.message : 'Unknown error'}`);
            },
          }
        );
      }
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
    isDraggingRef.current = true;
    
    // Save initial scroll position
    if (mainContentRef.current) {
      savedScrollLeftRef.current = mainContentRef.current.scrollLeft;
    }
    
    // Prevent scrolling on body and html
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Completely disable scrolling on main content container using CSS
    if (mainContentRef.current) {
      const container = mainContentRef.current;
      container.style.overflow = 'hidden';
      container.style.overflowX = 'hidden';
      container.style.overflowY = 'hidden';
      container.style.touchAction = 'none'; // Prevent touch scrolling
    }
    
    // Override scroll methods to prevent auto-scroll
    if (mainContentRef.current) {
      const container = mainContentRef.current;
      
      // Store original methods
      const originalScrollTo = container.scrollTo.bind(container);
      const originalScrollBy = container.scrollBy.bind(container);
      const originalScroll = container.scroll.bind(container);
      
      // Override scrollTo
      container.scrollTo = (...args: any[]) => {
        if (!isDraggingRef.current) {
          originalScrollTo(...args);
        }
      };
      
      // Override scrollBy
      container.scrollBy = (...args: any[]) => {
        if (!isDraggingRef.current) {
          originalScrollBy(...args);
        }
      };
      
      // Override scroll (which can be used as scrollTo or scrollBy)
      container.scroll = (...args: any[]) => {
        if (!isDraggingRef.current) {
          originalScroll(...args);
        }
      };
      
      // Store original methods for cleanup
      (container as any).__originalScrollTo = originalScrollTo;
      (container as any).__originalScrollBy = originalScrollBy;
      (container as any).__originalScroll = originalScroll;
      
      // Also use a fast loop to catch any direct scrollLeft changes
      // This runs at 60fps to catch changes immediately
      let animationFrameId: number;
      const lockScrollLoop = () => {
        if (isDraggingRef.current && container.scrollLeft !== savedScrollLeftRef.current) {
          container.scrollLeft = savedScrollLeftRef.current;
        }
        if (isDraggingRef.current) {
          animationFrameId = requestAnimationFrame(lockScrollLoop);
        }
      };
      animationFrameId = requestAnimationFrame(lockScrollLoop);
      (container as any).__scrollLockFrameId = animationFrameId;
    }
    
    // Intercept scroll events and immediately reset position
    const handleScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (mainContentRef.current && isDraggingRef.current) {
        // Force reset using direct property access
        (mainContentRef.current as any).scrollLeft = savedScrollLeftRef.current;
      }
      return false;
    };
    
    // Prevent all scroll-related events at capture phase
    const preventAllScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };
    
    const preventScrollOptions = { passive: false, capture: true };
    
    // Add scroll handler to container first (highest priority)
    if (mainContentRef.current) {
      const container = mainContentRef.current;
      container.addEventListener('scroll', handleScroll, { passive: false, capture: true });
      container.addEventListener('wheel', preventAllScroll, preventScrollOptions);
      container.addEventListener('touchmove', preventAllScroll, preventScrollOptions);
    }
    
    // Prevent events on document and window
    document.addEventListener('wheel', preventAllScroll, preventScrollOptions);
    document.addEventListener('touchmove', preventAllScroll, preventScrollOptions);
    document.addEventListener('scroll', preventAllScroll, preventScrollOptions);
    window.addEventListener('wheel', preventAllScroll, preventScrollOptions);
    window.addEventListener('touchmove', preventAllScroll, preventScrollOptions);
    window.addEventListener('scroll', preventAllScroll, preventScrollOptions);
    
    // Store cleanup function
    scrollPreventionCleanupRef.current = () => {
      // Cancel animation frame loop
      if (mainContentRef.current) {
        const container = mainContentRef.current;
        if ((container as any).__scrollLockFrameId) {
          cancelAnimationFrame((container as any).__scrollLockFrameId);
        }
      }
      
      // Restore original scroll methods
      if (mainContentRef.current) {
        const container = mainContentRef.current;
        if ((container as any).__originalScrollTo) {
          container.scrollTo = (container as any).__originalScrollTo;
        }
        if ((container as any).__originalScrollBy) {
          container.scrollBy = (container as any).__originalScrollBy;
        }
        if ((container as any).__originalScroll) {
          container.scroll = (container as any).__originalScroll;
        }
      }
      
      document.removeEventListener('wheel', preventAllScroll, { capture: true });
      document.removeEventListener('touchmove', preventAllScroll, { capture: true });
      document.removeEventListener('scroll', preventAllScroll, { capture: true });
      window.removeEventListener('wheel', preventAllScroll, { capture: true });
      window.removeEventListener('touchmove', preventAllScroll, { capture: true });
      window.removeEventListener('scroll', preventAllScroll, { capture: true });
      if (mainContentRef.current) {
        const container = mainContentRef.current;
        container.removeEventListener('scroll', handleScroll, { capture: true });
        container.removeEventListener('wheel', preventAllScroll, { capture: true });
        container.removeEventListener('touchmove', preventAllScroll, { capture: true });
      }
    };
  };

  const handleDragEndWrapper = (result: DropResult) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    // Re-enable scrolling
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    
    if (mainContentRef.current) {
      mainContentRef.current.style.overflow = '';
      mainContentRef.current.style.overflowX = '';
      mainContentRef.current.style.overflowY = '';
    }
    
    // Clean up event listeners
    if (scrollPreventionCleanupRef.current) {
      scrollPreventionCleanupRef.current();
      scrollPreventionCleanupRef.current = null;
    }
    
    handleDragEnd(result);
  };

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEndWrapper} autoScrollerOptions={{ disabled: true }}>
      <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
        {/* Left Sidebar - Requirements */}
        <div 
          className={`bg-white border-r border-gray-200 overflow-hidden transition-all duration-300 ${
            isRequirementsSidebarExpanded ? 'w-80' : 'w-12'
          }`}
        >
          <RequirementsSidebar 
            requirements={planData.requirementStatuses}
            plan={planData.plan}
            onToggleCollapse={(expanded) => setIsRequirementsSidebarExpanded(expanded)}
            isExpanded={isRequirementsSidebarExpanded}
          />
        </div>

        {/* Main Content - Timeline Grid */}
        <div 
          ref={mainContentRef}
          className={`flex-1 flex flex-col ${isDragging ? 'overflow-hidden' : 'overflow-hidden'}`}
        >
          {/* Fixed Header */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 bg-gray-50 border-b border-gray-200 z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                {/* Plan Switcher */}
                {setPlanId && (
                  <div className="relative">
                    <button
                      onClick={() => setShowPlanSwitcher(!showPlanSwitcher)}
                      className="flex items-center gap-2 px-3 py-1.5 text-2xl font-bold text-gray-900 bg-transparent border-none hover:opacity-80 transition-opacity"
                    >
                      <span className="font-bold text-gray-900">
                        {(planData.plan as any).name || 'My Plan'}
                      </span>
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {showPlanSwitcher && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                        <div className="p-2">
                          <div className="flex items-center justify-between mb-2 px-2 py-1">
                            <span className="text-xs font-semibold text-gray-700">Plans</span>
                            <button
                              onClick={() => setShowCreatePlanModal(true)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              + New Plan
                            </button>
                          </div>
                          {isLoadingPlans ? (
                            <div className="px-2 py-4 text-sm text-gray-500 text-center">Loading...</div>
                          ) : plans.length === 0 ? (
                            <div className="px-2 py-4 text-sm text-gray-500 text-center">No plans found</div>
                          ) : (
                            <div className="max-h-64 overflow-y-auto">
                              {plans.map((plan) => {
                                const status = plan.status || 'draft';
                                const statusConfig = {
                                  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-300' },
                                  submitted: { label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                                  approved: { label: 'Approved', color: 'bg-green-100 text-green-800 border-green-300' },
                                  requires_changes: { label: 'Requires Changes', color: 'bg-red-100 text-red-800 border-red-300' },
                                };
                                const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
                                
                                return (
                                  <button
                                    key={plan.id}
                                    onClick={() => {
                                      setPlanId(plan.id);
                                      setShowPlanSwitcher(false);
                                      queryClient.invalidateQueries({ queryKey: ['plan', userId] });
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors ${
                                      plan.id === planId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="font-medium">{plan.name || 'Unnamed Plan'}</div>
                                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${config.color}`}>
                                        {config.label}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {plan.primaryMajor?.name || 'No major'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Plan Status Badge */}
                {(() => {
                  // @ts-ignore - status field exists in database but may not be in types yet
                  const status = planData.plan.status || 'draft';
                  const statusConfig = {
                    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-300' },
                    submitted: { label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                    approved: { label: 'Approved', color: 'bg-green-100 text-green-800 border-green-300' },
                    requires_changes: { label: 'Requires Changes', color: 'bg-red-100 text-red-800 border-red-300' },
                  };
                  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
                  return (
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${config.color}`}>
                      {config.label}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsEditingTerms(!isEditingTerms)}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  {isEditingTerms ? 'Done Editing' : 'Edit D-Plan Terms'}
                </button>
                <button
                  onClick={() => {
                    if (!userId) {
                      alert('Please log in to submit your plan.');
                      return;
                    }
                    setShowSubmitConfirmation(true);
                  }}
                  disabled={isSubmitting}
                  className="text-sm px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Plan
                </button>
              </div>
            </div>
            {submitMessage && (
              <div className={`mt-3 text-sm px-4 py-2 rounded ${
                submitMessage.type === 'success' 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                {submitMessage.text}
              </div>
            )}
          </div>
          
          {/* Submit Confirmation Modal */}
          {showSubmitConfirmation && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    Submit Plan for Major Declaration
                  </h2>
                  <p className="text-gray-700 mb-4">
                    Are you sure you want to submit your plan for major declaration review? 
                    This will submit your current plan for advisor review.
                  </p>
                  
                  {/* Display Majors and Minors */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="space-y-3">
                      {planData.plan.primaryMajor && (
                        <div>
                          <span className="text-sm font-semibold text-gray-700">Major:</span>
                          <p className="text-sm text-gray-900 mt-1">{planData.plan.primaryMajor.name}</p>
                        </div>
                      )}
                      {planData.plan.secondaryMajor && (
                        <div>
                          <span className="text-sm font-semibold text-gray-700">Major:</span>
                          <p className="text-sm text-gray-900 mt-1">{planData.plan.secondaryMajor.name}</p>
                        </div>
                      )}
                      {planData.plan.minors && (() => {
                        try {
                          const minors = typeof planData.plan.minors === 'string' 
                            ? JSON.parse(planData.plan.minors) 
                            : planData.plan.minors;
                          if (Array.isArray(minors) && minors.length > 0) {
                            return (
                              <div>
                                <span className="text-sm font-semibold text-gray-700">Minors:</span>
                                <p className="text-sm text-gray-900 mt-1">
                                  {minors.join(', ')}
                                </p>
                              </div>
                            );
                          }
                        } catch (e) {
                          // Ignore parsing errors
                        }
                        return null;
                      })()}
                      {!planData.plan.primaryMajor && !planData.plan.secondaryMajor && (!planData.plan.minors || (() => {
                        try {
                          const minors = typeof planData.plan.minors === 'string' 
                            ? JSON.parse(planData.plan.minors) 
                            : planData.plan.minors;
                          return !Array.isArray(minors) || minors.length === 0;
                        } catch {
                          return true;
                        }
                      })()) && (
                        <p className="text-sm text-gray-500 italic">No majors or minors selected</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowSubmitConfirmation(false);
                        setShowPlanSwitcher(false);
                      }}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setShowSubmitConfirmation(false);
                        setIsSubmitting(true);
                        setSubmitMessage(null);
                        
                        try {
                          const response = await fetch('/api/plan/submit', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-user-id': userId || '',
                            },
                          });
                          
                          const data = await response.json();
                          
                          if (!response.ok) {
                            throw new Error(data.error || 'Failed to submit plan');
                          }
                          
                          setSubmitMessage({
                            type: 'success',
                            text: data.message || 'Plan submitted successfully!',
                          });
                          // Invalidate plan query to refresh status
                          queryClient.invalidateQueries({ queryKey: ['plan', userId] });
                        } catch (error) {
                          setSubmitMessage({
                            type: 'error',
                            text: error instanceof Error ? error.message : 'Failed to submit plan. Please try again.',
                          });
                        } finally {
                          setIsSubmitting(false);
                          // Clear message after 5 seconds
                          setTimeout(() => setSubmitMessage(null), 5000);
                        }
                      }}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Scrollable Content */}
          <div className={`flex-1 ${isDragging ? 'overflow-hidden' : 'overflow-x-auto overflow-y-auto'}`}>
          <div className="p-6">
            
            {/* D-Plan Terms Editor */}
            {isEditingTerms && (
              <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  D-Plan: Terms You're Off
                </label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {['22F','23W','23S','23X','23F','24W','24S','24X','24F','25W','25S', '25X', '25F', '26W','26S'].map((termCode) => (
                    <button
                      key={termCode}
                      type="button"
                      onClick={() => {
                        const newTermsOff = termsOff.includes(termCode)
                          ? termsOff.filter(t => t !== termCode)
                          : [...termsOff, termCode];
                        setTermsOff(newTermsOff);
                        
                        // Update plan immediately
                        if (userId) {
                          updatePlan(userId, {
                            termsOff: newTermsOff,
                          }).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['plan', userId] });
                          }).catch((err: Error) => {
                            console.error('Failed to update terms:', err);
                            alert('Failed to update terms. Please try again.');
                          });
                        }
                      }}
                      className={`px-3 py-2 text-sm rounded transition-colors ${
                        termsOff.includes(termCode)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {termCode}
                    </button>
                  ))}
                </div>
                {termsOff.length > 0 && (
                  <p className="text-xs text-gray-600">
                    Terms off: {termsOff.join(', ')}
                  </p>
                )}
              </div>
            )}
            
            <TimelineGrid 
              plan={planData.plan}
              onTermSelect={setSelectedTerm}
            />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Recommendations & Violations */}
        <div 
          className={`bg-white border-l border-gray-200 flex flex-col transition-all duration-300 ${
            isRecommendationsSidebarExpanded ? 'w-80' : 'w-12'
          }`}
        >
          <div className="flex-1 overflow-hidden">
            <RecommendationsSidebar 
              planId={planData.plan.id}
              targetTermCode={selectedTerm}
              onToggleCollapse={(expanded) => setIsRecommendationsSidebarExpanded(expanded)}
              isExpanded={isRecommendationsSidebarExpanded}
            />
          </div>
          {isRecommendationsSidebarExpanded && (
          <div className="border-t border-gray-200">
            <ViolationsPanel violations={planData.violations} />
          </div>
          )}
        </div>
      </div>
    </DragDropContext>
  );
}

