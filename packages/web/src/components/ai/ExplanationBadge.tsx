// "왜?" 설명 팝오버

import React, { useState } from 'react';

interface Props {
  readonly explanation: string;
}

export function ExplanationBadge({ explanation }: Props): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200"
      >
        왜?
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <p className="text-xs text-gray-700">{explanation}</p>
          </div>
        </>
      )}
    </div>
  );
}
