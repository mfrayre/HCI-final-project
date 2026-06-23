'use client';

import { useState } from 'react';
import type { RequirementStatus, PlanWithRelations } from '@/lib/types';

interface RequirementsSidebarProps {
  requirements: RequirementStatus[];
  plan: PlanWithRelations;
  onToggleCollapse?: (expanded: boolean) => void;
  isExpanded?: boolean;
}

export default function RequirementsSidebar({ requirements, plan, onToggleCollapse, isExpanded: externalIsExpanded }: RequirementsSidebarProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  const isSidebarExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  
  const handleToggle = () => {
    const newState = !isSidebarExpanded;
    if (externalIsExpanded === undefined) {
      setInternalIsExpanded(newState);
    }
    onToggleCollapse?.(newState);
  };
  const [isCreditsExpanded, setIsCreditsExpanded] = useState(true);
  const [isMajorExpanded, setIsMajorExpanded] = useState(true);
  const [isDistributiveExpanded, setIsDistributiveExpanded] = useState(true);
  const [isWorldCultureExpanded, setIsWorldCultureExpanded] = useState(true);
  const [isLanguageExpanded, setIsLanguageExpanded] = useState(true);
  const [isMinorExpanded, setIsMinorExpanded] = useState(true);
  
  const majorReqs = requirements.filter(r => r.type === 'major');
  const distributiveReqs = requirements.filter(r => r.type === 'distributive');
  const worldCultureReqs = requirements.filter(r => r.type === 'worldCulture');
  const languageReqs = requirements.filter(r => r.type === 'language');
  const minorReqs = requirements.filter(r => r.type === 'minor');

  // Calculate total credits from all planned courses
  const totalCredits = plan.termPlans.reduce((sum, termPlan) => {
    return sum + termPlan.plannedCourses.reduce((termSum, plannedCourse) => {
      return termSum + (plannedCourse.course?.credits || 1);
    }, 0);
  }, 0);

  const requiredCredits = 35;
  const creditsProgress = Math.min(totalCredits / requiredCredits, 1);
  const isCreditsSatisfied = totalCredits >= requiredCredits;

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-0 shrink-0">
        <button
          onClick={handleToggle}
          className={`flex items-center justify-between w-full text-xl font-bold mb-6 text-[#1b7a4d] border-b-2 border-[#1b7a4d] pb-3 hover:text-[#00a651] transition-colors ${
            !isSidebarExpanded ? 'justify-center' : ''
          }`}
          title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isSidebarExpanded && <span>Requirements</span>}
          <span className="text-2xl">{isSidebarExpanded ? '◀' : '▶'}</span>
        </button>
      </div>
      
      {isSidebarExpanded && (
        <div className="flex-1 p-6 pt-0 overflow-y-auto min-w-0">
          
      {/* Credit Tracker */}
      <div className="mb-8">
        <button
          onClick={() => setIsCreditsExpanded(!isCreditsExpanded)}
          className="flex items-center justify-between w-full text-sm font-bold text-[#1b7a4d] mb-4 uppercase tracking-wide hover:text-[#00a651] transition-colors"
        >
          <span>Credits</span>
          <span className="text-lg">{isCreditsExpanded ? '−' : '+'}</span>
        </button>
        {isCreditsExpanded && (
          <div className={`p-4 rounded-lg text-sm transition-all ${
            isCreditsSatisfied ? 'bg-green-50 border-2 border-[#00a651] shadow-sm' : 'bg-gray-50 border-2 border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-900">
                {totalCredits} / {requiredCredits} Credits
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                isCreditsSatisfied ? 'bg-[#00a651] text-white' : 'bg-gray-300 text-gray-700'
              }`}>
                {Math.round(creditsProgress * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-300 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  isCreditsSatisfied ? 'bg-gradient-to-r from-[#1b7a4d] to-[#00a651]' : 'bg-gray-400'
                }`}
                style={{ width: `${creditsProgress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Major Requirements */}
      {majorReqs.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setIsMajorExpanded(!isMajorExpanded)}
            className="flex items-center justify-between w-full text-sm font-bold text-[#1b7a4d] mb-4 uppercase tracking-wide hover:text-[#00a651] transition-colors"
          >
            <span>Major Requirements</span>
            <span className="text-lg">{isMajorExpanded ? '−' : '+'}</span>
          </button>
          {isMajorExpanded && (
            <div className="space-y-2">
            {majorReqs.map((req) => (
              <div
                key={req.id}
                className={`p-4 rounded-lg text-sm transition-all ${
                  req.isSatisfied ? 'bg-green-50 border-2 border-[#00a651] shadow-sm' : 'bg-gray-50 border-2 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-900">{req.label}</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    req.isSatisfied ? 'bg-[#00a651] text-white' : 'bg-gray-300 text-gray-700'
                  }`}>
                    {Math.round(req.progress * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      req.isSatisfied ? 'bg-gradient-to-r from-[#1b7a4d] to-[#00a651]' : 'bg-gray-400'
                    }`}
                    style={{ width: `${req.progress * 100}%` }}
                  />
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {/* Minor Requirements */}
      {minorReqs.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setIsMinorExpanded(!isMinorExpanded)}
            className="flex items-center justify-between w-full text-sm font-bold text-[#1b7a4d] mb-4 uppercase tracking-wide hover:text-[#00a651] transition-colors"
          >
            <span>Minor Requirements</span>
            <span className="text-lg">{isMinorExpanded ? '−' : '+'}</span>
          </button>
          {isMinorExpanded && (
            <div className="space-y-2">
            {minorReqs.map((req) => (
              <div
                key={req.id}
                className={`p-4 rounded-lg text-sm transition-all ${
                  req.isSatisfied
                    ? 'bg-green-50 border-2 border-[#00a651] shadow-sm'
                    : 'bg-gray-50 border-2 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-900">{req.label}</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    req.isSatisfied ? 'bg-[#00a651] text-white' : 'bg-gray-300 text-gray-700'
                  }`}>
                    {Math.round(req.progress * 100)}%
                  </span>
                </div>
                {req.progress < 1 && (
                  <div className="w-full bg-gray-300 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        req.isSatisfied ? 'bg-gradient-to-r from-[#1b7a4d] to-[#00a651]' : 'bg-gray-400'
                      }`}
                      style={{ width: `${req.progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {/* Distributive Requirements */}
      {distributiveReqs.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setIsDistributiveExpanded(!isDistributiveExpanded)}
            className="flex items-center justify-between w-full text-sm font-bold text-[#1b7a4d] mb-4 uppercase tracking-wide hover:text-[#00a651] transition-colors"
          >
            <span>Distributive Requirements</span>
            <span className="text-lg">{isDistributiveExpanded ? '−' : '+'}</span>
          </button>
          {isDistributiveExpanded && (
            <div className="space-y-2">
            {distributiveReqs.map((req) => {
              // Check if partially satisfied (1 course = 50% progress)
              const isPartiallySatisfied = !req.isSatisfied && req.progress === 0.5;
              
              return (
                <div
                  key={req.id}
                  className={`p-4 rounded-lg text-sm transition-all ${
                    req.isSatisfied
                      ? 'bg-green-50 border-2 border-[#00a651]'
                      : isPartiallySatisfied
                      ? 'bg-amber-50 border-2 border-amber-300'
                      : 'bg-gray-50 border-2 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">{req.label}</span>
                    {req.isSatisfied ? (
                      <span className="text-[#00a651] text-lg font-bold">●</span>
                    ) : isPartiallySatisfied ? (
                      <span className="text-amber-600 text-lg font-bold">◐</span>
                    ) : (
                      <span className="text-gray-400 text-lg font-bold">○</span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* World Culture Requirements */}
      {worldCultureReqs.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setIsWorldCultureExpanded(!isWorldCultureExpanded)}
            className="flex items-center justify-between w-full text-sm font-bold text-[#1b7a4d] mb-4 uppercase tracking-wide hover:text-[#00a651] transition-colors"
          >
            <span>World Culture</span>
            <span className="text-lg">{isWorldCultureExpanded ? '−' : '+'}</span>
          </button>
          {isWorldCultureExpanded && (
            <div className="space-y-2">
            {worldCultureReqs.map((req) => (
              <div
                key={req.id}
                className={`p-4 rounded-lg text-sm transition-all ${
                  req.isSatisfied
                    ? 'bg-green-50 border-2 border-[#00a651]'
                    : 'bg-gray-50 border-2 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{req.label}</span>
                  {req.isSatisfied ? (
                    <span className="text-[#00a651] text-lg font-bold">●</span>
                  ) : (
                    <span className="text-gray-400 text-lg font-bold">○</span>
                  )}
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {/* Language Requirement */}
      {languageReqs.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setIsLanguageExpanded(!isLanguageExpanded)}
            className="flex items-center justify-between w-full text-sm font-bold text-[#1b7a4d] mb-4 uppercase tracking-wide hover:text-[#00a651] transition-colors"
          >
            <span>Language Requirement</span>
            <span className="text-lg">{isLanguageExpanded ? '−' : '+'}</span>
          </button>
          {isLanguageExpanded && (
            <div className="space-y-2">
            {languageReqs.map((req) => (
              <div
                key={req.id}
                className={`p-4 rounded-lg text-sm transition-all ${
                  req.isSatisfied
                    ? 'bg-green-50 border-2 border-[#00a651]'
                    : 'bg-gray-50 border-2 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{req.label}</span>
                  {req.isSatisfied ? (
                    <span className="text-[#00a651] text-lg font-bold">●</span>
                  ) : (
                    <span className="text-gray-400 text-lg font-bold">○</span>
                  )}
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}

        </div>
      )}
    </div>
  );
}

