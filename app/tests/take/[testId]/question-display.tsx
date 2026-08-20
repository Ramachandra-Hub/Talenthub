'use client';

import { useCallback } from 'react';
import { Question } from '@/lib/types';
import { useTest } from './test-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodingQuestionPanel } from '@/components/exam/coding-question-panel';
import { isCodingQuestion } from '@/lib/practice-mappers';

interface QuestionDisplayProps {
  question: Question;
  /** Shorter timers — hide optional review clutter, tighten layout */
  speedMode?: boolean;
}

export default function QuestionDisplay({ question, speedMode }: QuestionDisplayProps) {
  const { answers, setAnswer, markForReview } = useTest();
  const currentAnswer = answers[question.id]?.userAnswer;
  const isMarked = answers[question.id]?.isMarkedForReview || false;

  const handleAnswerChange = useCallback(
    (value: string) => {
      setAnswer(question.id, value);
    },
    [question.id, setAnswer],
  );

  const coding = isCodingQuestion(question);

  if (coding) {
    return (
      <div>
        <CodingQuestionPanel
          question={question}
          answer={typeof currentAnswer === 'string' ? currentAnswer : null}
          onAnswerChange={handleAnswerChange}
        />
        {!speedMode ? (
          <div className="flex justify-end pt-2 mt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => markForReview(question.id, !isMarked)}
              variant="outline"
              className={`h-8 px-3 text-xs font-semibold ${
                isMarked
                  ? 'border-amber-700 bg-amber-100 text-amber-950'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              {isMarked ? '⚑ Marked' : 'Mark for review'}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const stemIsVisual =
    /\n/.test(question.question_text) || /[■□▲▼●○◆◇◤◣◥◢◇]/.test(question.question_text);

  return (
    <div>
      {stemIsVisual ? (
        <pre className="text-xl font-bold text-gray-950 mb-6 whitespace-pre-wrap font-mono leading-relaxed tracking-tight">
          {question.question_text}
        </pre>
      ) : (
        <h2 className="text-xl font-bold text-gray-950 mb-6 leading-snug">{question.question_text}</h2>
      )}

      {/* Question Options */}
      <div className={`space-y-3 ${speedMode ? 'mb-4' : 'mb-8'}`}>
        {question.type === 'MCQ' && (question.question_type === 'mcq' || question.option_a != null || question.option_b != null) && (
          <>
            {( [
              ['A', question.option_a],
              ['B', question.option_b],
              ['C', question.option_c],
              ['D', question.option_d],
            ].filter(([, text]) => text != null && String(text).trim() !== '') as [string, string][]).map(([letter, text]) => (
              <label key={letter} className={`flex items-center border-2 border-gray-300 rounded-lg cursor-pointer hover:border-[#1e4a7a] hover:bg-blue-50/80 transition ${speedMode ? 'p-3' : 'p-4'}`} style={{
                borderColor: currentAnswer === letter ? '#7c3aed' : undefined,
                backgroundColor: currentAnswer === letter ? '#ede9fe' : undefined,
              }}>
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={letter}
                  checked={currentAnswer === letter}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="ml-3 text-gray-950 text-base">
                  <span className="font-bold text-[#1e3a5f]800">{letter}. </span>{text}
                </span>
              </label>
            ))}
          </>
        )}

        {question.type === 'MCQ' && question.options && !(question.question_type === 'mcq' || question.option_a != null || question.option_b != null) && (
          <>
            {question.options.map((option, index) => (
              <label key={index} className={`flex items-center border-2 border-gray-300 rounded-lg cursor-pointer hover:border-[#1e4a7a] hover:bg-blue-50/80 transition ${speedMode ? 'p-3' : 'p-4'}`} style={{
                borderColor: currentAnswer === option ? '#7c3aed' : undefined,
                backgroundColor: currentAnswer === option ? '#ede9fe' : undefined,
              }}>
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option}
                  checked={currentAnswer === option}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="ml-3 text-gray-950 text-base font-medium">{option}</span>
              </label>
            ))}
          </>
        )}

        {question.type === 'numeric' && (
          <div>
            <Input
              type="number"
              value={currentAnswer || ''}
              onChange={(e) => handleAnswerChange(e.target.value)}
              placeholder="Enter your answer"
              className="text-lg p-3"
            />
          </div>
        )}

        {question.type === 'verbal' && (
          <textarea
            value={currentAnswer || ''}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Enter your answer"
            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none min-h-24"
          />
        )}
      </div>

      {!speedMode && (
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <Button
            onClick={() => markForReview(question.id, !isMarked)}
            variant="ghost"
            className={`flex-1 border-2 font-bold ${
              isMarked
                ? 'border-amber-950 bg-amber-900 text-amber-50 hover:bg-amber-950 hover:text-[#16304f]'
                : 'border-amber-800 bg-amber-100 text-amber-950 hover:bg-amber-200'
            }`}
          >
            {isMarked ? '⚑ Marked for Review' : '○ Mark for Review'}
          </Button>
        </div>
      )}
    </div>
  );
}
