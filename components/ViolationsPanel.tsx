'use client';

import type { Violation } from '@/lib/types';

interface ViolationsPanelProps {
  violations: Violation[];
}

export default function ViolationsPanel({ violations }: ViolationsPanelProps) {
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return (
    <div className="p-4 max-h-64 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-3 text-gray-900">Violations & Alerts</h2>
      {violations.length === 0 ? (
        <div className="text-sm text-green-600">✓ No violations</div>
      ) : (
        <div className="space-y-3">
          {errors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-600 mb-2">
                Errors ({errors.length})
              </h3>
              <div className="space-y-2">
                {errors.map((violation) => (
                  <div
                    key={violation.id}
                    className="p-2 bg-red-50 border border-red-200 rounded text-sm"
                  >
                    <div className="font-medium text-red-800">{violation.message}</div>
                    {violation.termCode && (
                      <div className="text-xs text-red-600 mt-1">
                        Term: {violation.termCode}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-yellow-600 mb-2">
                Warnings ({warnings.length})
              </h3>
              <div className="space-y-2">
                {warnings.map((violation) => (
                  <div
                    key={violation.id}
                    className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm"
                  >
                    <div className="font-medium text-yellow-800">{violation.message}</div>
                    {violation.termCode && (
                      <div className="text-xs text-yellow-600 mt-1">
                        Term: {violation.termCode}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

