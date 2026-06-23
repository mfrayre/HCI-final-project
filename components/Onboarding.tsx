'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getUserId, setUserEmail } from '@/lib/auth';

interface OnboardingProps {
  onComplete: () => void;
}

async function fetchMajors() {
  const res = await fetch('/api/majors');
  if (!res.ok) throw new Error('Failed to fetch majors');
  return res.json();
}

async function fetchTemplates(majorId?: string) {
  const res = await fetch(`/api/plan-templates${majorId ? `?majorId=${majorId}` : ''}`);
  if (!res.ok) return [];
  return res.json();
}

async function updatePlan(data: {
  primaryMajorId?: string;
  classYear?: number;
  planType?: string;
  termsOff?: string[];
  templateId?: string;
}) {
  const userId = getUserId();
  if (!userId) throw new Error('User not logged in');
  
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update plan');
  return res.json();
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
  if (!res.ok) throw new Error('Failed to upload transcript');
  return res.json();
}

async function importCompletedCourses() {
  const userId = getUserId();
  if (!userId) throw new Error('User not logged in');
  
  const res = await fetch('/api/plan', {
    headers: { 'x-user-id': userId },
  });
  const data = await res.json();
  const plan = data.plan;

  // Generate all terms from matriculation to graduation
  const terms: string[] = ['22F','23W','23S','23X','23F','24W','24S','24X','24F','25W','25S', '25X', '25F', '26W','26S'];

  // Create term plans for all terms
  for (const termCode of terms) {
    await fetch('/api/plan/term', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: plan.id,
        termCode,
        maxCourses: 4,
      }),
    });
  }
}

async function signup(email: string, password: string, name: string, classYear: number) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, name, classYear }),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Signup failed' }));
    throw new Error(error.error || 'Signup failed');
  }
  
  return res.json();
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [classYear, setClassYear] = useState(2026);
  const [primaryMajorId, setPrimaryMajorId] = useState('');
  const [planType, setPlanType] = useState<'full' | 'major-only'>('full');
  const [termsOff, setTermsOff] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [signupError, setSignupError] = useState('');
  const queryClient = useQueryClient();

  const { data: majors } = useQuery({
    queryKey: ['majors'],
    queryFn: fetchMajors,
  });

  const { data: templates } = useQuery({
    queryKey: ['templates', primaryMajorId],
    queryFn: () => fetchTemplates(primaryMajorId || undefined),
    enabled: step === 3 && !!primaryMajorId,
  });

  // Generate available terms for D-Plan selection
  const generateTerms = () => {
    return ['22F','23W','23S','23X','23F','24W','24S','24X','24F','25W','25S', '25X', '25F', '26W','26S'];
  };

  const availableTerms = generateTerms();

  const signupMutation = useMutation({
    mutationFn: () => signup(email, password, name, classYear),
    onSuccess: async (userData) => {
      // Set user email in localStorage
      setUserEmail(userData.email);
      // Move to next step
      setStep(2);
      setSignupError('');
    },
    onError: (error: Error) => {
      setSignupError(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePlan,
    onSuccess: async () => {
      await importCompletedCourses();
      if (transcriptFile) {
        await uploadTranscript(transcriptFile);
      }
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      onComplete();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      // Step 1: Create account
      if (!email || !password) {
        setSignupError('Email and password are required');
        return;
      }
      signupMutation.mutate();
    } else if (step === 3 && !primaryMajorId) {
      // Skip step 4 (templates) if no primary major selected
      setStep(5);
    } else if (step < 5) {
      setStep(step + 1);
    } else {
      // Final step: Complete onboarding
      updateMutation.mutate({
        primaryMajorId: primaryMajorId || undefined,
        classYear,
        planType,
        termsOff,
        templateId: selectedTemplate || undefined,
      });
    }
  };

  const toggleTermOff = (termCode: string) => {
    setTermsOff(prev =>
      prev.includes(termCode)
        ? prev.filter(t => t !== termCode)
        : [...prev, termCode]
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-gray-50 to-green-50 p-4">
      <div className="bg-white p-10 rounded-xl shadow-lg max-w-2xl w-full border-t-4 border-[#1b7a4d]">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-[#1b7a4d]">Welcome to DartActuallyWorks</h1>
            <span className="text-lg font-semibold text-[#00a651] bg-green-100 px-4 py-2 rounded-full">Step {step} of 5</span>
          </div>
          <div className="w-full bg-gray-300 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-[#1b7a4d] to-[#00a651] h-3 rounded-full transition-all shadow-md"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Create Account */}
          {step === 1 && (
            <>
              {signupError && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-800">{signupError}</div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Your name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="your.email@dartmouth.edu"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Create a password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Class Year
                </label>
                <input
                  type="number"
                  value={classYear}
                  onChange={(e) => setClassYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="2024"
                  max="2030"
                  required
                />
              </div>
            </>
          )}

          {/* Step 2: Basic Info */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Primary Major (Optional)
                </label>
                <select
                  value={primaryMajorId}
                  onChange={(e) => setPrimaryMajorId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select a major...</option>
                  {majors?.map((major: any) => (
                    <option key={major.id} value={major.id}>
                      {major.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Step 3: Plan Type & D-Plan */}
          {step === 3 && (
            <>
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
                    />
                    <div>
                      <div className="font-medium text-gray-900">Major-Only Plan</div>
                      <div className="text-sm text-gray-600">Focus only on major requirements</div>
                    </div>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  D-Plan: Select Terms You're Off
                </label>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border rounded">
                  {availableTerms.map((termCode) => (
                    <button
                      key={termCode}
                      type="button"
                      onClick={() => toggleTermOff(termCode)}
                      className={`px-3 py-2 text-sm rounded ${
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
                  <p className="text-xs text-gray-600 mt-2">
                    Selected: {termsOff.join(', ')}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Step 4: Template Plans */}
          {step === 4 && primaryMajorId && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Use a Template Plan from Upperclassmen (Optional)
              </label>
              {templates && templates.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {templates.map((template: any) => (
                    <label
                      key={template.id}
                      className="flex items-start p-3 border rounded cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="template"
                        value={template.id}
                        checked={selectedTemplate === template.id}
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        className="mt-1 mr-3"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{template.name}</div>
                        {template.description && (
                          <div className="text-sm text-gray-600 mt-1">{template.description}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          Class of {template.classYear} • {template.termsOff ? JSON.parse(template.termsOff).length : 0} terms off
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600">No templates available for this major yet.</p>
              )}
              <label className="flex items-center mt-4 p-3 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="template"
                  value=""
                  checked={selectedTemplate === ''}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="mr-3"
                />
                <div className="font-medium text-gray-900">Start from scratch</div>
              </label>
            </div>
          )}

          {/* Step 5: Transcript Upload */}
          {step === 5 && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Upload Transcript (Optional)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".txt,.pdf"
                  onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="transcript-upload"
                />
                <label
                  htmlFor="transcript-upload"
                  className="cursor-pointer text-blue-600 hover:text-blue-700"
                >
                  {transcriptFile ? transcriptFile.name : 'Click to upload transcript'}
                </label>
                <p className="text-xs text-gray-600 mt-2">
                  Upload a text file with course codes (one per line) or PDF transcript
                </p>
              </div>
              {transcriptFile && (
                <p className="text-sm text-green-600 mt-2">✓ File selected: {transcriptFile.name}</p>
              )}
            </div>
          )}

          <div className="flex justify-between gap-4 pt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-8 py-3 text-gray-700 border-2 border-gray-300 font-semibold rounded-lg hover:bg-gray-50 transition-all"
              >
                ← Back
              </button>
            )}
            <button
              type="submit"
              disabled={updateMutation.isPending || signupMutation.isPending}
              className={`px-10 py-3 bg-gradient-to-r from-[#1b7a4d] to-[#00a651] text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 transition-all transform disabled:scale-100 hover:scale-105 ${step === 1 ? 'ml-auto' : 'flex-1'}`}
            >
              {step === 1
                ? signupMutation.isPending
                  ? 'Creating account...'
                  : 'Create Account'
                : step < 5
                ? 'Next'
                : updateMutation.isPending
                ? 'Setting up...'
                : 'Get Started'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
