const jq = require('../lib');

describe('template', () => {
    it('should break', () => {
        const json = { foo2: 'bar' };
        const input = '{{.foo}}';
        const result = jq.renderRecursively(json, input);

        expect(result).toBe(null);
    });
    it('non template should work', () => {
        const json = { foo2: 'bar' };
        const render = (input) => jq.renderRecursively(json, input);

        expect(render(123)).toBe(123);
        expect(render(undefined)).toBe(undefined);
        expect(render(null)).toBe(null);
        expect(render(true)).toBe(true);
        expect(render(false)).toBe(false);
    });
    it('different types should work', () => {
        const input = '{{.foo}}';
        const render = (json) => jq.renderRecursively(json, input);

        expect(render({ foo: 'bar' })).toBe('bar');
        expect(render({ foo: 1 })).toBe(1);
        expect(render({ foo: true })).toBe(true);
        expect(render({ foo: null })).toBe(null);
        expect(render({ foo: undefined })).toBe(null);
        expect(render({ foo: ['bar'] })).toEqual(['bar']);
        expect(render({ foo: [{ bar: 'bar' }] })).toEqual([{ bar: 'bar' }]);
        expect(render({ foo: {prop1: "1"} })).toEqual({prop1: "1"});
        expect(render({ foo: {obj: { obj2: { num: 1, string: "str"} }} })).toEqual({obj: { obj2: { num: 1, string: "str"} }});
        expect(render({ foo: { obj: { obj2: { num: 1, string: "str", bool: true} }} })).toEqual({ obj: { obj2: { num: 1, string: "str", bool: true} }});
    });
    it ('should return undefined', () => {
        const json = { foo: 'bar' };
        const input = '{{empty}}';
        const result = jq.renderRecursively(json, input);

        expect(result).toBe(undefined);
    });
    it ('should return null on invalid json', () => {
        const json = "foo";
        const input = '{{.foo}}';
        const result = jq.renderRecursively(json, input);

        expect(result).toBe(undefined);
    });
    it('should excape \'\' to ""', () => {
        const json = { foo: 'com' };
        const input = "{{'https://url.' + .foo}}";
        const result = jq.renderRecursively(json, input);

        expect(result).toBe('https://url.com');
    });
    it('should not escape \' in the middle of the string', () => {
        const json = { foo: 'com' };
        const input = "{{\"https://'url.\" + 'test.' + .foo}}";
        const result = jq.renderRecursively(json, input);

        expect(result).toBe("https://'url.test.com");
    });
    it ('should run a jq function succesfully', () => {
        const json = { foo: 'bar' };
        const input = '{{.foo | gsub("bar";"foo")}}';
        const result = jq.renderRecursively(json, input);

        expect(result).toBe('foo');
    });
    it ('Testing multiple the \'\' in the same expression', () => {
        const json = { foo: 'bar' };
        const input = "{{'https://some.random.url' + .foo + '-1' + '.' + .foo + '.' + 'longgggg' + .foo + ')test(' + .foo + 'testadsftets'}}";
        const result = jq.renderRecursively(json, input);

        expect(result).toBe('https://some.random.urlbar-1.bar.longggggbar)test(bartestadsftets');
    });
    it ('Testing multiple the \'\' in the same expression', () => {
        const json = { foo: 'bar' };
        const input = "{{'https://some.random.url' + .foo + '-1' + '.' + .foo + '.' + 'longgggg' + .foo + ')test(' + .foo + 'testadsftets'}}";
        const result = jq.renderRecursively(json, input);

        expect(result).toBe('https://some.random.urlbar-1.bar.longggggbar)test(bartestadsftets');
    });
    it('should break for invalid template', () => {
        const json = { foo: 'bar' };
        const render = (input) => () => jq.renderRecursively(json, input);

        expect(render('prefix{{.foo}postfix')).toThrow('Found opening double braces in index 6 without closing double braces');
        expect(render('prefix{.foo}}postfix')).toThrow('Found closing double braces in index 11 without opening double braces');
        expect(render('prefix{{ .foo {{ }}postfix')).toThrow('Found double braces in index 14 inside other one in index 6');
        expect(render('prefix{{ .foo }} }}postfix')).toThrow('Found closing double braces in index 17 without opening double braces');
        expect(render('prefix{{ .foo }} }}postfix')).toThrow('Found closing double braces in index 17 without opening double braces');
        expect(render('prefix{{ "{{" + .foo }} }}postfix')).toThrow('Found closing double braces in index 24 without opening double braces');
        expect(render('prefix{{ \'{{\' + .foo }} }}postfix')).toThrow('Found closing double braces in index 24 without opening double braces');
        expect(render({'{{1}}': 'bar'})).toThrow('Evaluated object key should be undefined, null or string. Original key: {{1}}, evaluated to: 1');
        expect(render({'{{true}}': 'bar'})).toThrow('Evaluated object key should be undefined, null or string. Original key: {{true}}, evaluated to: true');
        expect(render({'{{ {} }}': 'bar'})).toThrow('Evaluated object key should be undefined, null or string. Original key: {{ {} }}, evaluated to: {}');
    });
    it('should concat string and other types', () => {
        const input = 'https://some.random.url?q={{.foo}}';
        const render = (json) => jq.renderRecursively(json, input);

        expect(render({ foo: 'bar' })).toBe('https://some.random.url?q=bar');
        expect(render({ foo: 1 })).toBe('https://some.random.url?q=1');
        expect(render({ foo: false })).toBe('https://some.random.url?q=false');
        expect(render({ foo: null })).toBe('https://some.random.url?q=null');
        expect(render({ foo: undefined })).toBe('https://some.random.url?q=null');
        expect(render({ foo: [1] })).toBe('https://some.random.url?q=[1]');
        expect(render({ foo: {bar: 'bar'} })).toBe('https://some.random.url?q={\"bar\":\"bar\"}');
    });
    it('testing multiple template blocks', () => {
        const json = {str: 'bar', num: 1, bool: true, 'null': null, arr: ['foo'], obj: {bar: 'bar'}};
        const input = 'https://some.random.url?str={{.str}}&num={{.num}}&bool={{.bool}}&null={{.null}}&arr={{.arr}}&obj={{.obj}}';
        const result = jq.renderRecursively(json, input);

        expect(result).toBe("https://some.random.url?str=bar&num=1&bool=true&null=null&arr=[\"foo\"]&obj={\"bar\":\"bar\"}");
    });
    it('testing conditional key', () => {
        const json = {};
        const render = (input) => jq.renderRecursively(json, input);

        expect(render({'{{empty}}': 'bar'})).toEqual({});
        expect(render({'{{null}}': 'bar'})).toEqual({});
        expect(render({'{{""}}': 'bar'})).toEqual({});
        expect(render({'{{\'\'}}': 'bar'})).toEqual({});
    });
    it('recursive templates should work', () => {
        const json = { foo: 'bar', bar: 'foo' };
        const render = (input) => jq.renderRecursively(json, input);

        expect(render({'{{.foo}}': '{{.bar}}{{.foo}}'})).toEqual({bar: 'foobar'});
        expect(render({'{{.foo}}': {foo: '{{.foo}}'}})).toEqual({bar: {foo: 'bar'}});
        expect(render([1, true, null, undefined, '{{.foo}}', 'https://{{.bar}}.com'])).toEqual([1, true, null, undefined, 'bar', 'https://foo.com']);
        expect(render([['{{.bar}}{{.foo}}'], 1, '{{.bar | ascii_upcase}}'])).toEqual([['foobar'], 1, 'FOO']);
        expect(render([{'{{.bar}}': [false, '/foo/{{.foo + .bar}}']}])).toEqual([{foo: [false, '/foo/barfoo']}]);
        expect(render({foo: [{bar: '{{1}}'}, '{{empty}}']})).toEqual({foo: [{bar: 1}, undefined]});
    });
})
