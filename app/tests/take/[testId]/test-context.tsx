'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface TestAnswer {
  questionId: string;
  userAnswer: string | null;
  isMarkedForReview: boolean;
}

interface TestContextType {
  currentQuestionIndex: number;
  setCurrentQuestionIndex: (index: number) => void;
  answers: Record<string, TestAnswer>;
  setAnswer: (questionId: string, answer: string) => void;
  markForReview: (questionId: string, marked: boolean) => void;
  timeRemaining: number;
  setTimeRemaining: React.Dispatch<React.SetStateAction<number>>;
  isSubmitted: boolean;
  setIsSubmitted: (submitted: boolean) => void;
  restoreExamState: (payload: {
    answers: Record<string, TestAnswer>;
    currentQuestionIndex: number;
    timeRemaining?: number;
  }) => void;
}

const TestContext = createContext<TestContextType | undefined>(undefined);

export function TestProvider({ children }: { children: React.ReactNode }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, TestAnswer>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const setAnswer = useCallback((questionId: string, answer: string) => {
    setAnswers((prev) => {
      const current = prev[questionId];
      if (current?.userAnswer === answer && current.questionId === questionId) {
        return prev;
      }
      return {
        ...prev,
        [questionId]: {
          ...current,
          questionId,
          userAnswer: answer,
          isMarkedForReview: current?.isMarkedForReview || false,
        },
      };
    });
  }, []);

  const markForReview = useCallback((questionId: string, marked: boolean) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        userAnswer: prev[questionId]?.userAnswer ?? null,
        isMarkedForReview: marked,
      },
    }));
  }, []);

  const restoreExamState = useCallback(
    (payload: {
      answers: Record<string, TestAnswer>;
      currentQuestionIndex: number;
      timeRemaining?: number;
    }) => {
      setAnswers(payload.answers);
      setCurrentQuestionIndex(payload.currentQuestionIndex);
      if (payload.timeRemaining !== undefined) {
        setTimeRemaining(payload.timeRemaining);
      }
    },
    [setTimeRemaining],
  );

  return (
    <TestContext.Provider
      value={{
        currentQuestionIndex,
        setCurrentQuestionIndex,
        answers,
        setAnswer,
        markForReview,
        timeRemaining,
        setTimeRemaining,
        isSubmitted,
        setIsSubmitted,
        restoreExamState,
      }}
    >
      {children}
    </TestContext.Provider>
  );
}

export function useTest() {
  const context = useContext(TestContext);
  if (!context) {
    throw new Error('useTest must be used within TestProvider');
  }
  return context;
}
