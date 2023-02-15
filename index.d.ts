declare module 'jq-node-bindings' {
    export function exec(json: object, input: string): object | Array<any> | string | number | boolean | null;
}
