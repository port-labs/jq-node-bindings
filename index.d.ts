declare module '@port-labs/jq-node-bindings' {
  type JqResult = object | Array<any> | string | number | boolean | null;

  type ExecOptions = {
    enableEnv?: boolean;
    throwOnError?: boolean;
    timeoutSec?: number;
  };

  export class JqExecError extends Error {}
  export class JqExecCompileError extends JqExecError {}

  /**
   * Execute a jq filter synchronously
   */
  export function exec(json: object, filter: string, options?: ExecOptions): JqResult;

  /**
   * Execute a jq filter asynchronously
   */
  export function execAsync(json: object, filter: string, options?: ExecOptions): Promise<JqResult>;

  /**
   * No-op for backwards compatibility (caching removed in v2)
   */
  export function setCacheSize(cacheSize: number): number;

  /**
   * Render a template with jq expressions ({{...}}) synchronously
   */
  export function renderRecursively(json: object, template: JqResult, execOptions?: ExecOptions): JqResult;

  /**
   * Render a template with jq expressions ({{...}}) asynchronously
   */
  export function renderRecursivelyAsync(json: object, template: JqResult, execOptions?: ExecOptions): Promise<JqResult>;
}
