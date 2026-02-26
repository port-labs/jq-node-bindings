const jq = require('../lib');

describe('template', () => {
    it('should break', async () => {
        const json = { foo2: 'bar' };
        const input = '{{.foo}}';
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe(null);
    });
    it('non template should work', async () => {
        const json = { foo2: 'bar' };
        const render = async (input) => await jq.renderRecursivelyAsync(json, input);

        expect(await render(123)).toBe(123);
        expect(await render(undefined)).toBe(undefined);
        expect(await render(null)).toBe(null);
        expect(await render(true)).toBe(true);
        expect(await render(false)).toBe(false);
    });
    it('different types should work', async () => {
        const input = '{{.foo}}';
        const render = async (json) => await jq.renderRecursivelyAsync(json, input);

        expect(await render({ foo: 'bar' })).toBe('bar');
        expect(await render({ foo: 1 })).toBe(1);
        expect(await render({ foo: true })).toBe(true);
        expect(await render({ foo: null })).toBe(null);
        expect(await render({ foo: undefined })).toBe(null);
        expect(await render({ foo: ['bar'] })).toEqual(['bar']);
        expect(await render({ foo: [{ bar: 'bar' }] })).toEqual([{ bar: 'bar' }]);
        expect(await render({ foo: {prop1: "1"} })).toEqual({prop1: "1"});
        expect(await render({ foo: {obj: { obj2: { num: 1, string: "str"} }} })).toEqual({obj: { obj2: { num: 1, string: "str"} }});
        expect(await render({ foo: { obj: { obj2: { num: 1, string: "str", bool: true} }} })).toEqual({ obj: { obj2: { num: 1, string: "str", bool: true} }});
    });
    it ('should return undefined', async () => {
        const json = { foo: 'bar' };
        const input = '{{empty}}';
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe(undefined);
    });
    it ('should return null on invalid json', async () => {
        const json = "foo";
        const input = '{{.foo}}';
        const result = await jq.renderRecursivelyAsync(json, input);
        console.log('!!!!!',result);
        expect(result).toBe(null);
    });
    it('should excape \'\' to ""', async () => {
        const json = { foo: 'com' };
        const input = "{{'https://url.' + .foo}}";
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe('https://url.com');
    });
    it('should not escape \' in the middle of the string', async () => {
        const json = { foo: 'com' };
        const input = "{{\"https://'url.\" + 'test.' + .foo}}";
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe("https://'url.test.com");
    });
    it ('should run a jq function succesfully', async () => {
        const json = { foo: 'bar' };
        const input = '{{.foo | gsub("bar";"foo")}}';
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe('foo');
    });
    it ('Testing multiple the \'\' in the same expression', async () => {
        const json = { foo: 'bar' };
        const input = "{{'https://some.random.url' + .foo + '-1' + '.' + .foo + '.' + 'longgggg' + .foo + ')test(' + .foo + 'testadsftets'}}";
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe('https://some.random.urlbar-1.bar.longggggbar)test(bartestadsftets');
    });
    it ('Testing multiple the \'\' in the same expression', async () => {
        const json = { foo: 'bar' };
        const input = "{{'https://some.random.url' + .foo + '-1' + '.' + .foo + '.' + 'longgggg' + .foo + ')test(' + .foo + 'testadsftets'}}";
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe('https://some.random.urlbar-1.bar.longggggbar)test(bartestadsftets');
    });
    it('should break for invalid template', async () => {
        const json = { foo: 'bar' };
        const render = async (input) => async () => await jq.renderRecursivelyAsync(json, input);

        expect(await render('prefix{{.foo}postfix')).rejects.toThrow('Found opening double braces in index 6 without closing double braces');
        expect(await render('prefix{.foo}}postfix')).rejects.toThrow('Found closing double braces in index 11 without opening double braces');
        expect(await render('prefix{{ .foo {{ }}postfix')).rejects.toThrow('Found double braces in index 14 inside other one in index 6');
        expect(await render('prefix{{ .foo }} }}postfix')).rejects.toThrow('Found closing double braces in index 17 without opening double braces');
        expect(await render('prefix{{ .foo }} }}postfix')).rejects.toThrow('Found closing double braces in index 17 without opening double braces');
        expect(await render('prefix{{ "{{" + .foo }} }}postfix')).rejects.toThrow('Found closing double braces in index 24 without opening double braces');
        expect(await render('prefix{{ \'{{\' + .foo }} }}postfix')).rejects.toThrow('Found closing double braces in index 24 without opening double braces');
        expect(await render({'{{1}}': 'bar'})).rejects.toThrow('Evaluated object key should be undefined, null or string. Original key: {{1}}, evaluated to: 1');
        expect(await render({'{{true}}': 'bar'})).rejects.toThrow('Evaluated object key should be undefined, null or string. Original key: {{true}}, evaluated to: true');
        expect(await render({'{{ {} }}': 'bar'})).rejects.toThrow('Evaluated object key should be undefined, null or string. Original key: {{ {} }}, evaluated to: {}');
    });
    it('should concat string and other types', async () => {
        const input = 'https://some.random.url?q={{.foo}}';
        const render = async (json) => await jq.renderRecursivelyAsync(json, input);

        expect(await render({ foo: 'bar' })).toBe('https://some.random.url?q=bar');
        expect(await render({ foo: 1 })).toBe('https://some.random.url?q=1');
        expect(await render({ foo: false })).toBe('https://some.random.url?q=false');
        expect(await render({ foo: null })).toBe('https://some.random.url?q=null');
        expect(await render({ foo: undefined })).toBe('https://some.random.url?q=null');
        expect(await render({ foo: [1] })).toBe('https://some.random.url?q=[1]');
        expect(await render({ foo: {bar: 'bar'} })).toBe('https://some.random.url?q={\"bar\":\"bar\"}');
    });
    it('testing multiple template blocks', async () => {
        const json = {str: 'bar', num: 1, bool: true, 'null': null, arr: ['foo'], obj: {bar: 'bar'}};
        const input = 'https://some.random.url?str={{.str}}&num={{.num}}&bool={{.bool}}&null={{.null}}&arr={{.arr}}&obj={{.obj}}';
        const result = await jq.renderRecursivelyAsync(json, input);

        expect(result).toBe("https://some.random.url?str=bar&num=1&bool=true&null=null&arr=[\"foo\"]&obj={\"bar\":\"bar\"}");
    });
    it('testing conditional key', async () => {
        const json = {};
        const render = async (input) => await jq.renderRecursivelyAsync(json, input);

        expect(await render({'{{empty}}': 'bar'})).toEqual({});
        expect(await render({'{{null}}': 'bar'})).toEqual({});
        expect(await render({'{{""}}': 'bar'})).toEqual({});
        expect(await render({'{{\'\'}}': 'bar'})).toEqual({});
    });
    it('testing spread key', async () => {
        const json = { foo: "bar" };
        const render = async (input) => await jq.renderRecursivelyAsync(json, input);

        expect(await render({ "{{spreadValue()}}": { foo: "bar" } })).toEqual({foo: "bar"});
        expect(await render({ " {{ spreadValue( ) }} ": { foo: "bar" } })).toEqual({foo: "bar"});
        expect(await render({ "{{spreadValue()}}": "{{ . }}" })).toEqual({ foo: "bar" });
    });
    it('recursive templates should work', async () => {
        const json = { foo: 'bar', bar: 'foo' };
        const render = async (input) => await jq.renderRecursivelyAsync(json, input);

        expect(await render({'{{.foo}}': '{{.bar}}{{.foo}}'})).toEqual({bar: 'foobar'});
        expect(await render({'{{.foo}}': {foo: '{{.foo}}'}})).toEqual({bar: {foo: 'bar'}});
        expect(await render([1, true, null, undefined, '{{.foo}}', 'https://{{.bar}}.com'])).toEqual([1, true, null, undefined, 'bar', 'https://foo.com']);
        expect(await render([['{{.bar}}{{.foo}}'], 1, '{{.bar | ascii_upcase}}'])).toEqual([['foobar'], 1, 'FOO']);
        expect(await render([{'{{.bar}}': [false, '/foo/{{.foo + .bar}}']}])).toEqual([{foo: [false, '/foo/barfoo']}]);
        expect(await render({foo: [{bar: '{{1}}'}, '{{empty}}']})).toEqual({foo: [{bar: 1}, undefined]});
    });
    it('should accept quotes outside of template', async () => {
        const json = { foo: 'bar', bar: 'foo' };
        const render = async (input) => await jq.renderRecursivelyAsync(json, input);

        expect(await render('"{{.foo}}"')).toEqual('"bar"');
        expect(await render('\'{{.foo}}\'')).toEqual('\'bar\'');
    });
    it('should accept escaped quotes inside jq template', async () => {
        const json = { foo: 'bar', bar: 'foo' };
        const render = async (input) => await jq.renderRecursivelyAsync(json, input);

        expect(await render('{{"\\"foo\\""}}')).toEqual('"foo"');
    });
    it('test disable env', async () => {
        expect(await jq.renderRecursivelyAsync({}, '{{env}}', {enableEnv: false})).toEqual({});
        expect(await jq.renderRecursivelyAsync({}, '{{env}}', {enableEnv: true})).not.toEqual({});
        expect(await jq.renderRecursivelyAsync({}, '{{env}}', {})).toEqual({});
        expect(await jq.renderRecursivelyAsync({}, '{{env}}')).toEqual({});
    })
    it('test throw on error', async () => {
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{foo}}', {throwOnError: true}) }).rejects.toThrow(/jq: compile error: foo\/0 is not defined at <top-level>, line 1/);
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{1/0}}', {throwOnError: true}) }).rejects.toThrow("number (1) and number (0) cannot be divided because the divisor is zero");
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{{}}', {throwOnError: true}) }).rejects.toThrow(/jq: compile error: syntax error, unexpected end of file.*at <top-level>, line 1/);
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{ {(0):1} }}', {throwOnError: true}) }).rejects.toThrow(/jq: compile error: Cannot use number \(0\) as object key at <top-level>, line 1/);
        // jq version may produce different error messages for incomplete syntax
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{if true then 1 else 0}}', {throwOnError: true}) }).rejects.toThrow("jq: compile error:");
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{null | map(.+1)}}', {throwOnError: true}) }).rejects.toThrow("jq: error: Cannot iterate over null (null)");
        expect(async () => { await jq.renderRecursivelyAsync({foo: "bar"}, '{{.foo + 1}}', {throwOnError: true}) }).rejects.toThrow("jq: error: string (\"bar\") and number (1) cannot be added");
        expect(async () => { await jq.renderRecursivelyAsync({}, '{{foo}}/{{bar}}', {throwOnError: true}) }).rejects.toThrow(/jq: compile error: foo\/0 is not defined at <top-level>, line 1/);
        expect(async () => { await jq.renderRecursivelyAsync({}, '/{{foo}}/', {throwOnError: true}) }).rejects.toThrow(/jq: compile error: foo\/0 is not defined at <top-level>, line 1/);
        expect(async () => { await jq.renderRecursivelyAsync({}, { "{{ spreadValue() }}": "str" }, { throwOnError: true }) })
            .rejects.toThrow('Evaluated value should be an object if the key is {{ spreadValue() }}. Original value: str, evaluated to: "str"');
        expect(async () => { await jq.renderRecursivelyAsync({}, { "{{ spreadValue() }}": "{{ \"str\" }}" }, { throwOnError: true }) })
            .rejects.toThrow('Evaluated value should be an object if the key is {{ spreadValue() }}. Original value: {{ \"str\" }}, evaluated to: "str"');
    })
})

