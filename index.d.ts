declare module '@port-labs/jq-node-bindings' {
    export function exec(json: object, input: string, options?: {enableEnv?: boolean}): object | Array<any> | string | number | boolean | null;
    export function renderRecursively(json: object, input: object | Array<any> | string | number | boolean | null): object | Array<any> | string | number | boolean | null;
}
