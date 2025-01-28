declare module '@port-labs/jq-node-bindings' {
  type ExecOptions = { enableEnv?: boolean, throwOnError?: boolean };

  export class JqExecError extends Error {
  }

  export class JqExecCompileError extends Error {
  }

  export function exec(json: object, input: string, options?: ExecOptions): object | Array<any> | string | number | boolean | null;
  export function execAsync(json: object, input: string, options?: ExecOptions): Promise<object | Array<any> | string | number | boolean | null>;

  export function renderRecursively(json: object, input: object | Array<any> | string | number | boolean | null, execOptions?: ExecOptions): object | Array<any> | string | number | boolean | null;
  export function renderRecursivelyAsync(json: object, input: object | Array<any> | string | number | boolean | null, execOptions?: ExecOptions): Promise<object | Array<any> | string | number | boolean | null>;
}
