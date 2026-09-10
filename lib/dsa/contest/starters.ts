function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function contestProblemStarter(language: 'java' | 'python'): string {
  if (language === 'python') {
    return `# Read from stdin and write the answer to stdout.
# Implement your solution below.

import sys

def main():
    data = sys.stdin.read().strip().split()
    # TODO: parse input and print the result
    pass

if __name__ == "__main__":
    main()
`;
  }
  return `import java.io.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    FastScanner fs = new FastScanner(System.in);
    // First line is often several ints on ONE line, e.g. "3 1 2":
    //   int n = fs.nextInt(), r = fs.nextInt(), m = fs.nextInt();
    // Do NOT use Integer.parseInt(sc.nextLine()) — that throws NumberFormatException on "3 1 2".
    // TODO: parse input with fs.nextInt() / fs.next() and print the result
  }

  static class FastScanner {
    private final InputStream in;
    private final byte[] buffer = new byte[1 << 16];
    private int ptr = 0, len = 0;
    FastScanner(InputStream in) { this.in = in; }
    private int read() throws IOException {
      if (ptr >= len) {
        len = in.read(buffer);
        ptr = 0;
        if (len <= 0) return -1;
      }
      return buffer[ptr++];
    }
    long nextLong() throws IOException {
      int c; long s = 1, x = 0;
      do { c = read(); } while (c <= 32);
      if (c == '-') { s = -1; c = read(); }
      while (c > 32) { x = x * 10 + (c - '0'); c = read(); }
      return x * s;
    }
    int nextInt() throws IOException { return (int) nextLong(); }
    String next() throws IOException {
      int c; StringBuilder sb = new StringBuilder();
      do { c = read(); } while (c <= 32);
      while (c > 32) { sb.append((char) c); c = read(); }
      return sb.toString();
    }
  }
}
`;
}

export function slugForBankProblem(sourceId: number, title: string): string {
  const base = slugify(title) || `problem-${sourceId}`;
  return `contest-bank-${sourceId}-${base}`.slice(0, 80);
}
