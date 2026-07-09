import type { Question } from '@/lib/types';
import { makeMcq } from '@/lib/competitive-exam/question-factory';

export const C_LANGUAGE_MCQ_TOPIC_SLUG = 'technical-c-language';

type CuratedMcq = {
  q: string;
  options: [string, string, string, string];
  correct: 'A' | 'B' | 'C' | 'D';
  difficulty?: 'easy' | 'medium' | 'hard';
  explanation?: string;
};

/** Official ElevateX C Language Assessment — 20 MCQs (1 mark each). */
export const C_LANGUAGE_MCQS: CuratedMcq[] = [
  {
    q: 'Which header file is required for printf() and scanf() in C?',
    options: ['conio.h', 'stdio.h', 'stdlib.h', 'math.h'],
    correct: 'B',
    difficulty: 'easy',
    explanation: 'Standard I/O functions are declared in <stdio.h>.',
  },
  {
    q: 'What is the output of: printf("%d", 5 / 2);',
    options: ['2.5', '2', '3', '2.0'],
    correct: 'B',
    difficulty: 'easy',
    explanation: 'Integer division truncates the fractional part.',
  },
  {
    q: 'Which operator is used to obtain the address of a variable?',
    options: ['*', '&', '->', '%'],
    correct: 'B',
    difficulty: 'easy',
    explanation: 'The address-of operator is &.',
  },
  {
    q: 'Which keyword declares a read-only variable in C?',
    options: ['constant', 'const', 'readonly', 'static'],
    correct: 'B',
    difficulty: 'easy',
  },
  {
    q: 'Which loop is guaranteed to execute at least once?',
    options: ['for', 'while', 'do-while', 'if'],
    correct: 'C',
    difficulty: 'easy',
  },
  {
    q: 'Which format specifier prints an int value with printf()?',
    options: ['%c', '%f', '%d', '%s'],
    correct: 'C',
    difficulty: 'easy',
  },
  {
    q: 'What is a valid declaration for a string storing "Hello"?',
    options: ['char s[] = "Hello";', 'char s = "Hello";', 'string s = "Hello";', 'char s = Hello;'],
    correct: 'A',
    difficulty: 'easy',
  },
  {
    q: 'Which operator accesses a structure member through a structure variable?',
    options: ['->', '.', ':', '&'],
    correct: 'B',
    difficulty: 'medium',
    explanation: 'Use . for variables and -> for pointers to structures.',
  },
  {
    q: 'What does int x = 5; printf("%d", x++); print?',
    options: ['4', '5', '6', 'Undefined'],
    correct: 'B',
    difficulty: 'medium',
    explanation: 'Post-increment uses the value before incrementing.',
  },
  {
    q: 'Which is a valid one-dimensional array declaration?',
    options: ['int arr[10];', 'int arr[];', 'arr int[10];', 'int[10] arr;'],
    correct: 'A',
    difficulty: 'easy',
  },
  {
    q: 'In file handling, mode "w" when opening a file means:',
    options: ['Read only', 'Write (create/truncate)', 'Append', 'Binary read'],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: 'A preprocessor directive in C begins with:',
    options: ['#', '@', '$', '%'],
    correct: 'A',
    difficulty: 'easy',
  },
  {
    q: 'Which function returns the length of a string (excluding the null terminator)?',
    options: ['sizeof', 'strlen', 'strcmp', 'strcat'],
    correct: 'B',
    difficulty: 'easy',
  },
  {
    q: 'Which declares a pointer to int?',
    options: ['int p;', 'int* p;', 'pointer int p;', 'int &p;'],
    correct: 'B',
    difficulty: 'easy',
  },
  {
    q: 'What does break do inside a switch statement?',
    options: [
      'Terminates the program',
      'Exits the switch (or loop)',
      'Skips to the next case only',
      'Returns from main',
    ],
    correct: 'B',
    difficulty: 'easy',
  },
  {
    q: 'calloc() differs from malloc() because calloc():',
    options: [
      'Frees memory',
      'Initializes allocated memory to zero',
      'Allocates on the stack',
      'Cannot be used with pointers',
    ],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: 'Which is the logical AND operator in C?',
    options: ['&', '&&', '|', '||'],
    correct: 'B',
    difficulty: 'easy',
  },
  {
    q: 'Which storage class gives a local variable persistent value across function calls?',
    options: ['auto', 'register', 'static', 'extern'],
    correct: 'C',
    difficulty: 'medium',
  },
  {
    q: 'What is the size of char in C (in bytes)?',
    options: ['1', '2', '4', 'Depends on the compiler only — never 1'],
    correct: 'A',
    difficulty: 'easy',
    explanation: 'By definition, sizeof(char) is 1.',
  },
  {
    q: 'Which is a correct ANSI C function definition?',
    options: [
      'int add(int a, int b) { return a + b; }',
      'add(int a, int b) { return a + b; }',
      'int add(a, b) int a, b; { return a + b; }',
      'function int add(int a, int b) { return a + b; }',
    ],
    correct: 'A',
    difficulty: 'medium',
  },
];

export function cLanguageMcqBank(): Question[] {
  return C_LANGUAGE_MCQS.map((item, i) =>
    makeMcq({
      id: `c-lang-mcq-${i + 1}`,
      topicSlug: C_LANGUAGE_MCQ_TOPIC_SLUG,
      difficulty: item.difficulty ?? 'medium',
      question_text: item.q,
      options: item.options,
      correctLetter: item.correct,
      explanation: item.explanation ?? null,
    }),
  );
}
