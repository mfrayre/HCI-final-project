'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getUserId, isLoggedIn } from '@/lib/auth';

async function fetchPlan(userId: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const res = await fetch('/api/plan', {
      headers: {
        'x-user-id': userId,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Failed to fetch plan');
    return res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - server is not responding');
    }
    throw error;
  }
}

async function fetchMajors() {
  const res = await fetch('/api/majors');
  if (!res.ok) throw new Error('Failed to fetch majors');
  return res.json();
}

async function updatePlan(data: {
  primaryMajorId?: string | null;
  secondaryMajorId?: string | null;
  minors?: string[];
  planType?: string;
  termsOff?: string[];
  apCredits?: Record<string, string[]>; // Map: AP course name -> array of Dartmouth course IDs
}) {
  const userId = getUserId();
  if (!userId) throw new Error('User not logged in');
  
  console.log('updatePlan called with:', data);
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error('API error response:', errorData);
    throw new Error(errorData.error || `Failed to update plan: ${res.status} ${res.statusText}`);
  }
  
  const result = await res.json();
  console.log('updatePlan response:', result);
  return result;
}

async function uploadTranscript(file: File) {
  const userId = getUserId();
  if (!userId) throw new Error('User not logged in');
  
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/transcript/upload', {
    method: 'POST',
    headers: {
      'x-user-id': userId,
    },
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to upload transcript');
  }
  return res.json();
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
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
  const { data: majors, isLoading: majorsLoading } = useQuery({
    queryKey: ['majors'],
    queryFn: fetchMajors,
  });

  const [primaryMajorId, setPrimaryMajorId] = useState('');
  const [secondaryMajorId, setSecondaryMajorId] = useState('');
  const [minors, setMinors] = useState<string[]>([]);
  const [selectedMinor, setSelectedMinor] = useState('');
  
  // Common minors list (can be expanded)
  const commonMinors = [
    'African and African American Studies',
    'Anthropology',
    'Art History',
    'Asian and Middle Eastern Studies',
    'Astronomy',
    'Biology',
    'Chemistry',
    'Classical Studies',
    'Computer Science',
    'Economics',
    'Education',
    'Engineering',
    'English',
    'Environmental Studies',
    'Film and Media Studies',
    'French',
    'Geography',
    'German Studies',
    'Government',
    'History',
    'Human-Centered Design',
    'Italian',
    'Latin American, Latino, and Caribbean Studies',
    'Linguistics',
    'Mathematics',
    'Music',
    'Native American Studies',
    'Philosophy',
    'Physics',
    'Psychology',
    'Religion',
    'Russian',
    'Sociology',
    'Spanish',
    'Theater',
    'Women\'s, Gender, and Sexuality Studies',
  ].sort();
  const [planType, setPlanType] = useState<'full' | 'major-only'>('full');
  const [termsOff, setTermsOff] = useState<string[]>([]);
  const [apCredits, setApCredits] = useState<Record<string, string[]>>({}); // Map: AP course name -> array of Dartmouth course IDs
  const [selectedApCourses, setSelectedApCourses] = useState<string[]>([]); // Array of selected AP course names
  const [apCourseSelections, setApCourseSelections] = useState<Record<string, string[]>>({}); // Track selected Dartmouth courses for each AP

  // Mapping of AP courses to possible Dartmouth courses they can satisfy
  const apToDartmouthMapping: Record<string, string[]> = {
    'AP Calculus AB': ['MATH-3'],
    'AP Calculus BC': ['MATH-3', 'MATH-8'], // Can satisfy both Calc I and Calc II
    'AP Chemistry': ['CHEM-5'],
    'AP Computer Science A': ['COSC-1'],
    'AP Environmental Science': ['ENVS-2'],
    'AP French: Language': ['FREN-3'],
    'AP Geography': ['GEOG-2.01'],
    'AP German': ['GERM-3'],
    'AP Italian: Language': ['ITAL-3'],
    'AP Latin': ['LATN-3'],
    'AP Physics: C (Mechanics)': ['PHYS-3'],
    'AP Physics: C (Electricity)': ['PHYS-4'],
    'AP Spanish: Language': ['SPAN-3'],
    'AP Spanish: Literature': ['SPAN-3'],
    'AP Statistics': ['MATH-10'],
  };

  // Common AP courses list
  const apCourses = [
    'AP Calculus AB',
    'AP Calculus BC',
    'AP Chemistry',
    'AP Computer Science A',
    'AP Environmental Science',
    'AP French: Language',
    'AP Geography',
    'AP German',
    'AP Italian: Language',
    'AP Latin',
    'AP Physics: C (Mechanics)',
    'AP Physics: C (Electricity)',
    'AP Spanish: Language',
    'AP Spanish: Literature',
    'AP Statistics',
  ];
  const [isEditing, setIsEditing] = useState(true); // Start in edit mode by default
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [isUploadingTranscript, setIsUploadingTranscript] = useState(false);

  // Initialize form when plan data loads
  useEffect(() => {
    if (planData?.plan) {
      setPrimaryMajorId(planData.plan.primaryMajorId || '');
      setSecondaryMajorId(planData.plan.secondaryMajorId || '');
      setMinors(planData.plan.minors ? JSON.parse(planData.plan.minors) : []);
      setPlanType((planData.plan.planType as 'full' | 'major-only') || 'full');
      setTermsOff(planData.plan.termsOff ? JSON.parse(planData.plan.termsOff) : []);
      const parsedApCredits = (planData.plan as any).apCredits ? JSON.parse((planData.plan as any).apCredits) : [];
      // Convert to new format: Record<string, string[]>
      if (Array.isArray(parsedApCredits)) {
        const apCreditsMap: Record<string, string[]> = {};
        parsedApCredits.forEach((courseId: string) => {
          apCreditsMap[courseId] = [courseId];
        });
        setApCredits(apCreditsMap);
      } else if (typeof parsedApCredits === 'object' && parsedApCredits !== null) {
        const apCreditsMap: Record<string, string[]> = {};
        for (const [apCourse, dartmouthCourses] of Object.entries(parsedApCredits)) {
          if (Array.isArray(dartmouthCourses)) {
            apCreditsMap[apCourse] = dartmouthCourses;
          } else {
            // Old format: single string, convert to array
            apCreditsMap[apCourse] = [dartmouthCourses as string];
          }
        }
        setApCredits(apCreditsMap);
      } else {
        setApCredits({});
      }
    }
  }, [planData]);

  const updateMutation = useMutation({
    mutationFn: updatePlan,
    onSuccess: (data) => {
      console.log('Mutation success, received data:', data);
      // Update local state with the response
      if (data) {
        setPrimaryMajorId(data.primaryMajorId || '');
        setSecondaryMajorId(data.secondaryMajorId || '');
        setMinors(data.minors ? JSON.parse(data.minors) : []);
        setPlanType((data.planType as 'full' | 'major-only') || 'full');
        setTermsOff(data.termsOff ? JSON.parse(data.termsOff) : []);
        const parsedApCredits = (data as any).apCredits ? JSON.parse((data as any).apCredits) : [];
        // Convert to new format: Record<string, string[]>
        if (Array.isArray(parsedApCredits)) {
          const apCreditsMap: Record<string, string[]> = {};
          parsedApCredits.forEach((courseId: string) => {
            apCreditsMap[courseId] = [courseId];
          });
          setApCredits(apCreditsMap);
        } else if (typeof parsedApCredits === 'object' && parsedApCredits !== null) {
          const apCreditsMap: Record<string, string[]> = {};
          for (const [apCourse, dartmouthCourses] of Object.entries(parsedApCredits)) {
            if (Array.isArray(dartmouthCourses)) {
              apCreditsMap[apCourse] = dartmouthCourses;
            } else {
              apCreditsMap[apCourse] = [dartmouthCourses as string];
            }
          }
          setApCredits(apCreditsMap);
        } else {
          setApCredits({});
        }
      }
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setIsEditing(false);
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-3 rounded shadow-lg z-50';
      successMsg.textContent = 'Profile updated successfully!';
      document.body.appendChild(successMsg);
      setTimeout(() => {
        if (document.body.contains(successMsg)) {
          document.body.removeChild(successMsg);
        }
      }, 3000);
    },
    onError: (error: Error) => {
      console.error('Update error:', error);
      console.error('Error details:', error.message);
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50 max-w-md';
      errorMsg.innerHTML = `<div class="font-bold">Failed to update:</div><div class="text-sm mt-1">${error.message}</div>`;
      document.body.appendChild(errorMsg);
      setTimeout(() => {
        if (document.body.contains(errorMsg)) {
          document.body.removeChild(errorMsg);
        }
      }, 5000);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isEditing) {
      console.warn('Form submitted but not in edit mode');
      return;
    }
    
    const submitData = {
      primaryMajorId: primaryMajorId === '' ? null : primaryMajorId,
      secondaryMajorId: secondaryMajorId === '' ? null : secondaryMajorId,
      minors: minors,
      planType,
      termsOff,
      apCredits,
    };
    
    console.log('Submitting form with data:', submitData);
    
    try {
      const result = await updateMutation.mutateAsync(submitData);
      console.log('Update successful:', result);
    } catch (error) {
      console.error('Failed to update plan:', error);
      // Error is already handled by mutation onError
    }
  };

  const addMinor = () => {
    const trimmedMinor = selectedMinor.trim();
    if (trimmedMinor && !minors.includes(trimmedMinor)) {
      console.log('Adding minor:', trimmedMinor);
      setMinors([...minors, trimmedMinor]);
      setSelectedMinor('');
    } else if (minors.includes(trimmedMinor)) {
      alert('This minor is already added');
    }
  };

  const removeMinor = (minor: string) => {
    setMinors(minors.filter(m => m !== minor));
  };

  // Available terms for D-Plan selection - restricted to these four terms only
  const availableTerms = ['22F','23W','23S','23X','23F','24W','24S','24X','24F','25W','25S', '25X', '25F', '26W','26S'];

  const toggleTermOff = (termCode: string) => {
    if (!isEditing) return;
    console.log('Toggling term off:', termCode);
    setTermsOff(prev => {
      const newTermsOff = prev.includes(termCode)
        ? prev.filter(t => t !== termCode)
        : [...prev, termCode];
      console.log('New terms off:', newTermsOff);
      return newTermsOff;
    });
  };

  const handleTranscriptUpload = async () => {
    if (!transcriptFile) {
      alert('Please select a file first');
      return;
    }

    setIsUploadingTranscript(true);
    try {
      const result = await uploadTranscript(transcriptFile);
      console.log('Transcript upload successful:', result);
      
      // Always show success message, even if some courses weren't imported
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-3 rounded shadow-lg z-50 max-w-md';
      successMsg.innerHTML = `<div class="font-bold">Import Successful</div><div class="text-sm mt-1">${result.message || `Imported ${result.importedCount || 0} course(s) from transcript.`}</div>`;
      document.body.appendChild(successMsg);
      setTimeout(() => {
        if (document.body.contains(successMsg)) {
          document.body.removeChild(successMsg);
        }
      }, 5000); // Show for 5 seconds to allow reading of details

      // Refresh plan data
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      setTranscriptFile(null);
    } catch (error) {
      console.error('Error uploading transcript:', error);
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50 max-w-md';
      errorMsg.innerHTML = `<div class="font-bold">Failed to upload transcript:</div><div class="text-sm mt-1">${error instanceof Error ? error.message : 'Unknown error'}</div>`;
      document.body.appendChild(errorMsg);
      setTimeout(() => {
        if (document.body.contains(errorMsg)) {
          document.body.removeChild(errorMsg);
        }
      }, 5000);
    } finally {
      setIsUploadingTranscript(false);
    }
  };

  if (!loggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen mt-16">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    );
  }

  if (planLoading || majorsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen mt-16">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Profile & Settings</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your degree plan, majors, minors, and D-Plan
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6" noValidate>
            {/* Plan Type */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Plan Type
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="planType"
                    value="full"
                    checked={planType === 'full'}
                    onChange={(e) => setPlanType(e.target.value as 'full' | 'major-only')}
                    className="mr-3"
                    disabled={!isEditing}
                  />
                  <div>
                    <div className="font-medium text-gray-900">Full Dartmouth Plan</div>
                    <div className="text-sm text-gray-600">Track all requirements including distributives and world culture</div>
                  </div>
                </label>
                <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="planType"
                    value="major-only"
                    checked={planType === 'major-only'}
                    onChange={(e) => setPlanType(e.target.value as 'full' | 'major-only')}
                    className="mr-3"
                    disabled={!isEditing}
                  />
                  <div>
                    <div className="font-medium text-gray-900">Major-Only Plan</div>
                    <div className="text-sm text-gray-600">Focus only on major requirements</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Primary Major */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Primary Major
              </label>
              <select
                value={primaryMajorId}
                onChange={(e) => {
                  console.log('Primary major changed to:', e.target.value);
                  setPrimaryMajorId(e.target.value);
                }}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">No major selected</option>
                {majors?.map((major: any) => (
                  <option key={major.id} value={major.id}>
                    {major.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Secondary Major */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Secondary Major (Optional)
              </label>
              <select
                value={secondaryMajorId}
                onChange={(e) => {
                  console.log('Secondary major changed to:', e.target.value);
                  setSecondaryMajorId(e.target.value);
                }}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">No secondary major</option>
                {majors?.map((major: any) => (
                  <option key={major.id} value={major.id}>
                    {major.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Minors */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Minors
              </label>
              <div className="space-y-2">
                {minors.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {minors.map((minor) => (
                      <span
                        key={minor}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                      >
                        {minor}
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => removeMinor(minor)}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {isEditing && (
                  <div className="flex gap-2">
                    <select
                      value={selectedMinor}
                      onChange={(e) => setSelectedMinor(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select a minor</option>
                      {commonMinors
                        .filter(minor => !minors.includes(minor))
                        .map((minor) => (
                          <option key={minor} value={minor}>
                            {minor}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={addMinor}
                      disabled={!selectedMinor}
                      className="px-6 py-2 bg-[#1b7a4d] text-white font-semibold rounded-lg hover:bg-[#0d4a2c] transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* D-Plan: Terms Off */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                D-Plan: Terms You're Off
              </label>
              <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto p-2 border rounded">
                {availableTerms.map((termCode) => (
                  <button
                    key={termCode}
                    type="button"
                    onClick={() => toggleTermOff(termCode)}
                    disabled={!isEditing}
                    className={`px-3 py-2 text-sm rounded ${
                      termsOff.includes(termCode)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {termCode}
                  </button>
                ))}
              </div>
              {termsOff.length > 0 && (
                <p className="text-xs text-gray-600 mt-2">
                  Selected: {termsOff.join(', ')}
                </p>
              )}
            </div>

            {/* AP Credits */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                AP Credits (satisfy prerequisites, don't count toward graduation)
              </label>
              <div className="space-y-2">
                <div className="space-y-3">
                  <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-md p-3 bg-white space-y-2">
                    {apCourses
                      .filter(course => !apCredits[course]) // Only show courses not already added
                      .map(course => (
                        <div key={course} className="border border-gray-200 rounded-md p-2">
                          <label className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedApCourses.includes(course)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedApCourses([...selectedApCourses, course]);
                                  // Initialize selections for this AP course
                                  if (!apCourseSelections[course]) {
                                    setApCourseSelections({
                                      ...apCourseSelections,
                                      [course]: apToDartmouthMapping[course] ? [apToDartmouthMapping[course][0]] : []
                                    });
                                  }
                                } else {
                                  setSelectedApCourses(selectedApCourses.filter(c => c !== course));
                                  // Remove selections for this AP course
                                  const newSelections = { ...apCourseSelections };
                                  delete newSelections[course];
                                  setApCourseSelections(newSelections);
                                }
                              }}
                              disabled={!isEditing}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-gray-900">{course}</span>
                            </div>
                          </label>
                          {selectedApCourses.includes(course) && apToDartmouthMapping[course] && apToDartmouthMapping[course].length > 0 && (
                            <div className="ml-6 mt-2 space-y-1">
                              <div className="text-xs text-gray-600 mb-1">Select Dartmouth courses this AP satisfies:</div>
                              {apToDartmouthMapping[course].map(dartmouthCourse => (
                                <label
                                  key={dartmouthCourse}
                                  className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={apCourseSelections[course]?.includes(dartmouthCourse) || false}
                                    onChange={(e) => {
                                      const currentSelections = apCourseSelections[course] || [];
                                      if (e.target.checked) {
                                        setApCourseSelections({
                                          ...apCourseSelections,
                                          [course]: [...currentSelections, dartmouthCourse]
                                        });
                                      } else {
                                        setApCourseSelections({
                                          ...apCourseSelections,
                                          [course]: currentSelections.filter(c => c !== dartmouthCourse)
                                        });
                                      }
                                    }}
                                    disabled={!isEditing}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <span className="text-xs text-gray-700">{dartmouthCourse}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    {apCourses.filter(course => !apCredits[course]).length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">All available AP courses have been added.</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        const newApCredits = { ...apCredits };
                        selectedApCourses.forEach(apCourse => {
                          const selectedDartmouthCourses = apCourseSelections[apCourse] || [];
                          if (selectedDartmouthCourses.length > 0 && !apCredits[apCourse]) {
                            newApCredits[apCourse] = selectedDartmouthCourses;
                          }
                        });
                        setApCredits(newApCredits);
                        setSelectedApCourses([]);
                        setApCourseSelections({});
                      }}
                      disabled={!isEditing || selectedApCourses.length === 0 || selectedApCourses.some(ap => !apCourseSelections[ap] || apCourseSelections[ap].length === 0)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Selected ({selectedApCourses.length})
                    </button>
                    {selectedApCourses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedApCourses([]);
                          setApCourseSelections({});
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
                {Object.keys(apCredits).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(apCredits).map(([apCourseName, dartmouthCourseIds]) => (
                      <div
                        key={apCourseName}
                        className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-md"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-blue-900 text-sm">{apCourseName}</div>
                          <div className="text-xs text-blue-700">
                            → {Array.isArray(dartmouthCourseIds) ? dartmouthCourseIds.join(', ') : dartmouthCourseIds}
                          </div>
                        </div>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              const newApCredits = { ...apCredits };
                              delete newApCredits[apCourseName];
                              setApCredits(newApCredits);
                            }}
                            className="px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors font-bold text-lg"
                            title="Remove AP credit"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  AP credits satisfy prerequisites but do not count toward the 35 credits needed for graduation.
                </p>
              </div>
            </div>

            {/* Transcript Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Upload Transcript
              </label>
              <p className="text-xs text-gray-600 mb-3">
                Upload a PDF or text file of your transcript to automatically import completed courses
              </p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="transcript-upload"
                  disabled={isUploadingTranscript}
                />
                <label
                  htmlFor="transcript-upload"
                  className={`cursor-pointer flex flex-col items-center ${
                    isUploadingTranscript ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <svg
                    className="w-12 h-12 text-gray-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="text-sm text-blue-600 hover:text-blue-700">
                    {transcriptFile ? transcriptFile.name : 'Click to upload transcript'}
                  </span>
                </label>
                {transcriptFile && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-700">
                      Selected: <span className="font-medium">{transcriptFile.name}</span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTranscriptFile(null)}
                        className="text-sm text-gray-600 hover:text-gray-800"
                        disabled={isUploadingTranscript}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={handleTranscriptUpload}
                        disabled={isUploadingTranscript}
                        className="px-6 py-2 bg-[#1b7a4d] text-white font-semibold rounded-lg hover:bg-[#0d4a2c] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                      >
                        {isUploadingTranscript ? 'Uploading...' : 'Upload & Import'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    console.log('Enabling edit mode');
                    setIsEditing(true);
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-[#1b7a4d] to-[#00a651] text-white font-semibold rounded-lg hover:shadow-lg transition-all transform hover:scale-105 active:scale-95"
                >
                  Edit Profile
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      console.log('Canceling edit');
                      setIsEditing(false);
                      // Reset form to current plan data
                      if (planData?.plan) {
                        const plan = planData.plan;
                        setPrimaryMajorId(plan.primaryMajorId || '');
                        setSecondaryMajorId(plan.secondaryMajorId || '');
                        setMinors(plan.minors ? JSON.parse(plan.minors) : []);
                        setPlanType((plan.planType as 'full' | 'major-only') || 'full');
                        setTermsOff(plan.termsOff ? JSON.parse(plan.termsOff) : []);
                      }
                    }}
                    className="px-8 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="px-8 py-3 bg-gradient-to-r from-[#1b7a4d] to-[#00a651] text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 transition-all transform disabled:scale-100 hover:scale-105"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

