/** Compilable Java Main that reads an array (and optional extra int) so students can Run immediately. */
export function javaArrayStarter(todo: string, extra?: 'target'): string {
  const extraRead =
    extra === 'target'
      ? `
    int target = sc.hasNextInt() ? sc.nextInt() : 0;`
      : '';
  const extraHint = extra === 'target' ? ' Use `target` as needed.' : '';
  return `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    int[] a = new int[n];
    for (int i = 0; i < n; i++) a[i] = sc.nextInt();${extraRead}
    // TODO: ${todo}${extraHint}
    sc.close();
  }
}
`;
}
