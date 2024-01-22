declare module '@port-labs/jq-node-bindings' {
    type ExecOptions = {enableEnv?: boolean, throwOnError?: boolean};
    export function exec(json: object, input: string, options?: ExecOptions): object | Array<any> | string | number | boolean | null;
    export function renderRecursively(json: object, input: object | Array<any> | string | number | boolean | null, execOptions?: ExecOptions): object | Array<any> | string | number | boolean | null;
}
