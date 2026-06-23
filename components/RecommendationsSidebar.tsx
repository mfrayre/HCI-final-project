'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import type { RecommendedCourse, Course } from '@/lib/types';

interface RecommendationsSidebarProps {
  planId: string;
  targetTermCode?: string | null;
  onToggleCollapse?: (expanded: boolean) => void;
  isExpanded?: boolean;
}

async function fetchRecommendations(planId: string, targetTermCode?: string | null) {
  const res = await fetch('/api/ai/recommend-courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, targetTermCode: targetTermCode || undefined }),
  });
  if (!res.ok) throw new Error('Failed to fetch recommendations');
  return res.json() as Promise<RecommendedCourse[]>;
}

async function fetchCourses(query: string, termCode?: string | null) {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (termCode) params.append('termCode', termCode);
  
  const res = await fetch(`/api/courses?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch courses');
  return res.json() as Promise<Course[]>;
}

async function scoreCourses(planId: string, courseIds: string[], targetTermCode?: string | null) {
  const res = await fetch('/api/ai/score-courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, courseIds, targetTermCode: targetTermCode || undefined }),
  });
  if (!res.ok) throw new Error('Failed to score courses');
  return res.json() as Promise<RecommendedCourse[]>;
}

export default function RecommendationsSidebar({ planId, targetTermCode, onToggleCollapse, isExpanded: externalIsExpanded }: RecommendationsSidebarProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  const isSidebarExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  
  const handleToggle = () => {
    const newState = !isSidebarExpanded;
    if (externalIsExpanded === undefined) {
      setInternalIsExpanded(newState);
    }
    onToggleCollapse?.(newState);
  };
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  
  const { data: recommendations, isLoading: recommendationsLoading } = useQuery({
    queryKey: ['recommendations', planId, targetTermCode],
    queryFn: () => fetchRecommendations(planId, targetTermCode),
  });

  // Fetch all courses when there's an active search query - always fetch fresh from database
  const { data: searchCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', activeSearchQuery, targetTermCode],
    queryFn: () => fetchCourses(activeSearchQuery, targetTermCode),
    enabled: activeSearchQuery.trim().length > 0,
    staleTime: 0, // Always consider data stale, fetch fresh on each search
    gcTime: 0, // Don't cache results (formerly cacheTime)
    refetchOnMount: 'always',
  });

  // Score the search courses
  const { data: scoredSearchCourses = [], isLoading: scoringLoading } = useQuery({
    queryKey: ['scoredCourses', planId, searchCourses.map(c => c.id).join(','), targetTermCode],
    queryFn: () => scoreCourses(planId, searchCourses.map(c => c.id), targetTermCode),
    enabled: activeSearchQuery.trim().length > 0 && searchCourses.length > 0,
  });

  const isLoading = recommendationsLoading || (activeSearchQuery.trim().length > 0 && (coursesLoading || scoringLoading));

  // Get set of recommended course IDs to avoid duplicates
  const recommendedCourseIds = new Set(recommendations?.map(r => r.courseId) || []);

  // Combine recommendations and search results
  // If searching, show search results (excluding those already in recommendations)
  // If not searching, show recommendations
  const displayItems = (activeSearchQuery.trim().length > 0
    ? [
        // First show matching recommendations
        ...(recommendations?.filter(rec => {
          const query = activeSearchQuery.toLowerCase();
          return rec.courseId.toLowerCase().includes(query) ||
                 rec.tags.some(tag => tag.toLowerCase().includes(query)) ||
                 rec.reasons.some(reason => reason.toLowerCase().includes(query));
        }) || []),
        // Then show scored search results that aren't already recommended
        ...scoredSearchCourses
          .filter(rec => !recommendedCourseIds.has(rec.courseId))
          .map(rec => ({
            ...rec,
            isSearchResult: true, // Flag to distinguish from AI recommendations
          }))
      ]
    : recommendations || []
  ).sort((a, b) => b.score - a.score); // Sort by score descending

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setActiveSearchQuery(searchQuery);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 shrink-0 border-b border-gray-200">
        <button
          onClick={handleToggle}
          className={`flex items-center justify-between w-full text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors ${
            !isSidebarExpanded ? 'justify-center' : ''
          }`}
          title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isSidebarExpanded && <span>Course Recommendations</span>}
          <span className="text-xl">{isSidebarExpanded ? '▶' : '◀'}</span>
        </button>
      </div>
      
      {isSidebarExpanded && (
        <div className="flex-1 p-4 overflow-y-auto min-w-0">
      
      {/* Search Input */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search courses, tags, or reasons... (Press Enter to search)"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>
      
      {targetTermCode && (
        <div className="px-3 py-2 bg-blue-50 border-l-4 border-blue-500 rounded mb-4">
          <div className="text-xs font-semibold text-blue-900">
            Showing courses for {targetTermCode}
          </div>
          <div className="text-xs text-blue-700 mt-1">
            (Only courses offered this term)
          </div>
        </div>
      )}
      {!targetTermCode && (
        <div className="px-3 py-2 bg-gray-100 rounded mb-4 text-xs text-gray-700">
          Select a term to see recommended courses
        </div>
      )}
      {isLoading ? (
        <div className="text-sm text-gray-700">Loading...</div>
      ) : displayItems.length > 0 ? (
        <Droppable droppableId="recommendations" isDropDisabled>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-2"
            >
              {displayItems.map((rec, index) => {
                const isSearchResult = 'isSearchResult' in rec && rec.isSearchResult;
                return (
                  <Draggable
                  key={rec.courseId}
                  draggableId={`course-${rec.courseId}`}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`p-3 bg-white border border-gray-200 rounded text-sm cursor-move ${
                        snapshot.isDragging ? 'opacity-50 shadow-lg' : 'hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-gray-900">{rec.courseId}</div>
                        {isSearchResult && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            Search
                          </span>
                        )}
                      </div>
                      {rec.offeredTerms && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          <span className="text-xs font-semibold text-gray-700">Offered:</span>
                          {JSON.parse(rec.offeredTerms || '[]').map((term: string) => (
                            <span
                              key={term}
                              className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {rec.tags.map((tag) => {
                          // Determine color based on tag type
                          let bgColor = 'bg-gray-100';
                          let textColor = 'text-gray-800';
                          
                          if (tag.startsWith('distributive-')) {
                            const distType = tag.replace('distributive-', '');
                            // Different colors for each distributive type
                            const distColors: Record<string, { bg: string; text: string }> = {
                              'TAS': { bg: 'bg-blue-100', text: 'text-blue-800' },
                              'QDS': { bg: 'bg-purple-100', text: 'text-purple-800' },
                              'ART': { bg: 'bg-pink-100', text: 'text-pink-800' },
                              'LIT': { bg: 'bg-red-100', text: 'text-red-800' },
                              'SOC': { bg: 'bg-orange-100', text: 'text-orange-800' },
                              'INT': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
                              'SCI': { bg: 'bg-green-100', text: 'text-green-800' },
                              'SLA': { bg: 'bg-cyan-100', text: 'text-cyan-800' },
                              'TLA': { bg: 'bg-indigo-100', text: 'text-indigo-800' },
                            };
                            const colors = distColors[distType] || { bg: 'bg-gray-100', text: 'text-gray-800' };
                            bgColor = colors.bg;
                            textColor = colors.text;
                          } else if (tag.startsWith('world-culture-')) {
                            const wcType = tag.replace('world-culture-', '');
                            // Different colors for each world culture type
                            const wcColors: Record<string, { bg: string; text: string }> = {
                              'W': { bg: 'bg-emerald-100', text: 'text-emerald-800' },
                              'NW': { bg: 'bg-teal-100', text: 'text-teal-800' },
                              'CI': { bg: 'bg-lime-100', text: 'text-lime-800' },
                            };
                            const colors = wcColors[wcType] || { bg: 'bg-gray-100', text: 'text-gray-800' };
                            bgColor = colors.bg;
                            textColor = colors.text;
                          } else if (tag === 'major-core') {
                            bgColor = 'bg-amber-100';
                            textColor = 'text-amber-800';
                          } else if (tag.startsWith('offered-')) {
                            bgColor = 'bg-slate-100';
                            textColor = 'text-slate-800';
                          }
                          
                          return (
                            <span
                              key={tag}
                              className={`text-xs ${bgColor} ${textColor} px-2 py-0.5 rounded`}
                            >
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                      {rec.prerequisites && rec.prerequisites.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="text-xs font-medium text-gray-900 mb-1">Prerequisites:</div>
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              // Group OR prerequisites together
                              const orGroups = new Map<string, typeof rec.prerequisites>();
                              const regularPrereqs: typeof rec.prerequisites = [];
                              
                              // Separate OR groups from regular prerequisites
                              rec.prerequisites.forEach(prereq => {
                                if (prereq.isOrGroup && prereq.orGroupId) {
                                  if (!orGroups.has(prereq.orGroupId)) {
                                    orGroups.set(prereq.orGroupId, []);
                                  }
                                  orGroups.get(prereq.orGroupId)!.push(prereq);
                                } else {
                                  regularPrereqs.push(prereq);
                                }
                              });
                              
                              return (
                                <>
                                  {regularPrereqs.map((prereq) => (
                                    <span
                                      key={prereq.courseId}
                                      className={`text-xs px-2 py-0.5 rounded ${
                                        prereq.isCompleted
                                          ? 'bg-green-100 text-green-800'
                                          : prereq.isPlanned
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                      title={
                                        prereq.isCompleted
                                          ? 'Completed'
                                          : prereq.isPlanned
                                          ? 'Planned'
                                          : 'Not satisfied'
                                      }
                                    >
                                      {prereq.courseId}
                                      {prereq.isCompleted && ' ✓'}
                                      {prereq.isPlanned && !prereq.isCompleted && ' ○'}
                                    </span>
                                  ))}
                                  {Array.from(orGroups.entries()).map(([groupId, groupPrereqs]) => {
                                    const anyCompleted = groupPrereqs.some(p => p.isCompleted);
                                    const anyPlanned = groupPrereqs.some(p => p.isPlanned && !p.isCompleted);
                                    const courseIds = groupPrereqs.map(p => p.courseId).join(' OR ');
                                    
                                    return (
                                      <span
                                        key={groupId}
                                        className={`text-xs px-2 py-0.5 rounded ${
                                          anyCompleted
                                            ? 'bg-green-100 text-green-800'
                                            : anyPlanned
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                        title={`Any one of: ${courseIds}`}
                                      >
                                        {courseIds}
                                        {anyCompleted && ' ✓'}
                                        {anyPlanned && !anyCompleted && ' ○'}
                                      </span>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      {!isSearchResult && rec.reasons.length > 0 && (
                        <ul className="text-xs text-gray-700 space-y-1 mt-2">
                          {rec.reasons.slice(0, 2).map((reason, i) => (
                            <li key={i}>• {reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ) : activeSearchQuery.trim().length > 0 ? (
        <div className="text-sm text-gray-700">
          No courses match "{activeSearchQuery}"
        </div>
      ) : (
        <div className="text-sm text-gray-700">No recommendations available</div>
      )}
        </div>
      )}
    </div>
  );
}

