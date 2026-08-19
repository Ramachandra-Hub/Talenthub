export const JAVA_ARRAY_MCQ_TOPIC_SLUG = 'technical-java';

type CuratedMcq = {
  q: string;
  options: [string, string, string, string];
  correct: 'A' | 'B' | 'C' | 'D';
  difficulty?: 'easy' | 'medium' | 'hard';
  explanation?: string;
};

/** Java + array DSA MCQs aligned with the 20 Java coding problems. */
export const JAVA_ARRAY_MCQS: CuratedMcq[] = [
  {
    q: 'To find the second largest distinct element without sorting, which approach is correct?',
    options: [
      'Sort descending and pick index 1',
      'Track largest and second-largest in one pass, skipping equals of the max',
      'Use nested loops comparing every pair',
      'Always return a[1]',
    ],
    correct: 'B',
    difficulty: 'hard',
    explanation: 'One scan keeps two distinct maxima without O(n log n) sorting.',
  },
  {
    q: 'Best time complexity to find the second largest distinct value in an unsorted array of n elements?',
    options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(1)'],
    correct: 'C',
    difficulty: 'medium',
  },
  {
    q: 'Finding the third largest distinct element in a single traversal typically requires:',
    options: [
      'Three nested loops',
      'Three variables for 1st, 2nd, and 3rd distinct maxima',
      'Sorting then picking a[n-3]',
      'A binary heap of size n',
    ],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'If an array has only two distinct values, the third largest distinct element should be:',
    options: ['0', 'The smaller of the two', 'Undefined / sentinel like -1', 'Integer.MIN_VALUE always'],
    correct: 'C',
    difficulty: 'medium',
  },
  {
    q: 'Which Java structure finds duplicates without nested loops?',
    options: ['Two for-loops', 'HashMap or HashSet frequency', 'Arrays.sort only', 'A queue of size 2'],
    correct: 'B',
    difficulty: 'medium',
    explanation: 'Hashing counts frequencies in O(n).',
  },
  {
    q: 'Average time complexity of HashMap get/put in Java is:',
    options: ['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'],
    correct: 'C',
    difficulty: 'easy',
  },
  {
    q: 'The first missing positive in [3, 4, -1, 1] is:',
    options: ['0', '2', '3', '5'],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'Which values can be ignored when searching for the first missing positive integer?',
    options: ['All positives', 'Zeros and negatives', 'Only zeros', 'Only the maximum'],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: "Kadane's algorithm computes:",
    options: [
      'Maximum subsequence sum (any subset)',
      'Maximum contiguous subarray sum',
      'Minimum product subarray',
      'Longest increasing subsequence',
    ],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: "In Kadane's, the recurrence for the ending-here sum is:",
    options: [
      'current = max(a[i], current + a[i])',
      'current = current + a[i] always',
      'current = min(a[i], current)',
      'current = a[0] * a[i]',
    ],
    correct: 'A',
    difficulty: 'hard',
  },
  {
    q: 'Maximum product subarray must also track a running minimum because:',
    options: [
      'Java ints overflow otherwise',
      'A negative times a negative can become the new maximum',
      'Zeros cannot appear',
      'Products are always positive',
    ],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'The maximum product of the contiguous subarray [2, 3, -2, 4] is:',
    options: ['24', '6', '-2', '4'],
    correct: 'B',
    difficulty: 'medium',
    explanation: '2 * 3 = 6; including -2 drops the product.',
  },
  {
    q: 'Longest consecutive sequence in [100, 4, 200, 1, 3, 2] has length:',
    options: ['1', '2', '3', '4'],
    correct: 'D',
    difficulty: 'medium',
    explanation: '1,2,3,4.',
  },
  {
    q: 'O(n) longest consecutive sequence uses a HashSet and starts a streak at x only when:',
    options: ['x+1 is present', 'x-1 is absent', 'x is even', 'x is the maximum'],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'Pairs with a given sum can be found in O(n) using:',
    options: ['Nested loops only', 'A HashSet of seen complements', 'Binary search on unsorted data', 'A stack of maxima'],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: 'In Java, the complement of value v for target T is stored as:',
    options: ['T + v', 'T - v', 'v - T', 'T * v'],
    correct: 'B',
    difficulty: 'easy',
  },
  {
    q: 'The standard 3Sum (triplets summing to 0) after sorting uses:',
    options: ['Three nested brute-force loops only', 'Fix one index and two pointers', 'BFS', 'Kadane'],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'Unique triplets require skipping duplicates after sorting so that:',
    options: [
      'The array stays unsorted',
      'The same triplet is not reported twice',
      'N becomes smaller',
      'HashMap is mandatory',
    ],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: 'A majority element (more than N/2 occurrences) can be found by:',
    options: ['Boyer–Moore voting then a verify pass', 'Only sorting', 'Only binary search', 'DFS'],
    correct: 'A',
    difficulty: 'hard',
  },
  {
    q: 'Boyer–Moore candidate must be verified because:',
    options: [
      'The algorithm always returns a true majority',
      'A candidate exists even when no value exceeds N/2',
      'It only works on sorted arrays',
      'Java HashMap cannot count',
    ],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'How many elements can appear more than N/3 times?',
    options: ['At most 1', 'At most 2', 'At most 3', 'Unlimited'],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'Extended Boyer–Moore for N/3 keeps:',
    options: ['One candidate', 'Two candidates', 'N candidates', 'A binary tree'],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: 'If every other element appears twice, the unique element is found by:',
    options: ['XOR of all elements', 'AND of all elements', 'Sorting only', 'Kadane'],
    correct: 'A',
    difficulty: 'medium',
    explanation: 'x ^ x = 0, so pairs cancel.',
  },
  {
    q: 'In Java, 4 ^ 1 ^ 2 ^ 1 ^ 2 equals:',
    options: ['0', '1', '2', '4'],
    correct: 'D',
    difficulty: 'medium',
  },
  {
    q: 'When every other element appears three times, XOR alone fails because:',
    options: [
      'XOR is not associative',
      'x ^ x ^ x = x, so triples do not cancel to 0',
      'Java has no XOR operator',
      'Arrays cannot hold duplicates',
    ],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'A correct approach for the “appears once, others thrice” problem is:',
    options: [
      'Count each bit modulo 3',
      'Single XOR',
      'Print a[0]',
      'Binary search without sorting',
    ],
    correct: 'A',
    difficulty: 'hard',
  },
  {
    q: 'In an array of size N meant to hold 1..N with one repeat and one miss, a valid output is:',
    options: ['Only the missing number', 'Repeating then missing', 'Their product', 'N always'],
    correct: 'B',
    difficulty: 'medium',
  },
  {
    q: 'Which Java structure finds the missing and repeating numbers in O(n)?',
    options: ['Frequency array of size N+1', 'Three nested loops', 'A deque of windows', 'Quickselect only'],
    correct: 'A',
    difficulty: 'medium',
  },
  {
    q: 'An equilibrium index i satisfies:',
    options: [
      'sum(left of i) == sum(right of i)',
      'a[i] == 0',
      'a[i] is the maximum',
      'i == n/2 always',
    ],
    correct: 'A',
    difficulty: 'medium',
  },
  {
    q: 'Equilibrium can be found in O(n) using:',
    options: ['Total sum then a left-running sum', 'O(n²) prefix only', 'Sorting', 'HashSet of indices'],
    correct: 'A',
    difficulty: 'medium',
  },
  {
    q: 'Maximum sum of non-adjacent elements is the same family as:',
    options: ['House Robber DP', 'Dijkstra', 'KMP', 'Floyd–Warshall'],
    correct: 'A',
    difficulty: 'medium',
  },
  {
    q: 'For non-adjacent max sum, the DP transition is:',
    options: [
      'include i with dp[i-1], skip with dp[i-2]',
      'include i with a[i]+dp[i-2], skip with dp[i-1]',
      'always take a[i]',
      'sort then take even indices',
    ],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'Maximum difference a[j]−a[i] with j>i is found by:',
    options: [
      'Tracking the minimum so far while scanning left to right',
      'Always a[n-1]−a[0]',
      'Sorting the array first (which loses index order)',
      'Kadane on the original array unchanged',
    ],
    correct: 'A',
    difficulty: 'hard',
  },
  {
    q: 'If the array is strictly decreasing, the maximum later-larger difference is:',
    options: ['0', 'a[0]', '-1 (no valid pair)', 'Integer.MAX_VALUE'],
    correct: 'C',
    difficulty: 'medium',
  },
  {
    q: 'Next greater element to the right is typically solved with:',
    options: ['A monotonic stack', 'BFS', 'Kadane', 'Union-Find'],
    correct: 'A',
    difficulty: 'medium',
  },
  {
    q: 'For next greater, if no larger element exists to the right, the answer is:',
    options: ['0', 'a[i]', '-1', 'n'],
    correct: 'C',
    difficulty: 'easy',
  },
  {
    q: 'Next smaller element uses a stack that is typically:',
    options: ['Monotonic increasing (pop ≥ current)', 'A max-heap of all n values', 'A queue', 'A BST of prefixes'],
    correct: 'A',
    difficulty: 'hard',
  },
  {
    q: 'In Java, java.util.ArrayDeque is preferred over Stack because:',
    options: [
      'Stack is synchronized and older; ArrayDeque is the modern stack/deque',
      'ArrayDeque cannot push/pop',
      'Stack is generic-only',
      'ArrayDeque is slower always',
    ],
    correct: 'A',
    difficulty: 'easy',
  },
  {
    q: 'Largest rectangle in a histogram of heights uses nearest smaller to left and right so that area at i is:',
    options: [
      'height[i] * n',
      'height[i] * (right[i] - left[i] - 1)',
      'sum of all heights',
      'height[i] * height[i]',
    ],
    correct: 'B',
    difficulty: 'hard',
  },
  {
    q: 'The largest rectangle area for histogram [2, 1, 5, 6, 2, 3] is:',
    options: ['6', '8', '10', '12'],
    correct: 'C',
    difficulty: 'hard',
    explanation: 'The bars of height 5 and 6 form a 5×2 rectangle of area 10.',
  },
  {
    q: 'Student Java solutions in this exam must read from stdin using a class named:',
    options: ['Solution', 'Main', 'App', 'Test'],
    correct: 'B',
    difficulty: 'easy',
    explanation: 'The runner compiles and executes Main.java / public class Main.',
  },
  {
    q: 'Which Java snippet correctly reads n then n integers from Scanner?',
    options: [
      'int n = sc.nextInt(); int[] a = new int[n]; for (int i = 0; i < n; i++) a[i] = sc.nextInt();',
      'int[] a = sc.nextInt();',
      'Scanner.readAll()',
      'System.in.readArray()',
    ],
    correct: 'A',
    difficulty: 'easy',
  },
];
