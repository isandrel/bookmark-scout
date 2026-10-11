/**
 * The live tests' reporter: one line per test, then each failure, with the API key replaced in
 * everything it prints (error messages, received page text, and test output). The built-in
 * reporters print an assertion's received value as is, and a provider error can echo the key.
 * `nx run extension:test:live` passes it with `--reporter`.
 */
import type {
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';
import { redactSecrets } from './live-env';

const MARKS: Record<TestResult['status'], string> = {
  passed: 'ok  ',
  failed: 'FAIL',
  timedOut: 'TIME',
  skipped: 'skip',
  interrupted: 'stop',
};

function write(text: string) {
  process.stdout.write(`${redactSecrets(text)}\n`);
}

function describeError(error: TestError): string {
  const { location } = error;
  const where = location ? `at ${location.file}:${location.line}:${location.column}` : '';
  return [error.message, error.snippet, where].filter(Boolean).join('\n');
}

export default class RedactingReporter implements Reporter {
  private failures: { test: TestCase; result: TestResult }[] = [];

  printsToStdio() {
    return true;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const seconds = (result.duration / 1000).toFixed(1);
    write(`${MARKS[result.status]} ${test.titlePath().slice(1).join(' > ')} (${seconds}s)`);
    if (result.status === 'skipped') {
      for (const annotation of test.annotations) {
        if (annotation.type === 'skip' && annotation.description) {
          write(`     ${annotation.description}`);
        }
      }
    }
    if (result.status !== 'passed' && result.status !== 'skipped') {
      this.failures.push({ test, result });
    }
  }

  onStdOut(chunk: string | Buffer) {
    process.stdout.write(redactSecrets(chunk.toString()));
  }

  onStdErr(chunk: string | Buffer) {
    process.stderr.write(redactSecrets(chunk.toString()));
  }

  onError(error: TestError) {
    write(`Error: ${describeError(error)}`);
  }

  onEnd(result: FullResult) {
    for (const { test, result: testResult } of this.failures) {
      write(`\n${test.titlePath().slice(1).join(' > ')} (attempt ${testResult.retry + 1})`);
      for (const error of testResult.errors) write(describeError(error));
    }
    write(`\nLive AI tests: ${result.status}`);
  }
}
