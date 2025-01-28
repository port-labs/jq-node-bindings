const jq = require('../lib');

describe('jq', () => {
    it('should break', () => {
        const json = { foo2: 'bar' };
        const input = 'foo';
        const result = jq.exec(json, input);

        expect(result).toBe(null);
    }),
    it('should break for invalid input', () => {
        const json = { foo2: 'bar' };
        const input = 123;
        const result = jq.exec(json, input);

        expect(result).toBe(null);
    }),
    it('should break for invalid input', () => {
        const json = { foo2: 'bar' };
        const input = undefined;
        const result = jq.exec(json, input);

        expect(result).toBe(null);
    }),
    it('should break for invalid input', () => {
        const json = { foo2: 'bar' };
        const input = null;
        const result = jq.exec(json, input);

        expect(result).toBe(null);
    }),
    it('string should work', () => {
        const json = { foo: 'bar' };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result).toBe('bar');
    });

    it('number should work', ()=> {
      const json = { foo: 1 };
      const input = '.foo';
      const result = jq.exec(json, input);

      expect(result).toBe(1);
    });

    it ('should return null', () => {
        const json = { foo: 'bar' };
        const input = '.bar';
        const result = jq.exec(json, input);

        expect(result).toBe(null);
    });

    it ('should return array with object', () => {
        const json = { foo: ['bar'] };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result[0]).toBe('bar');
    });

    it ('should return an item of an array', () => {
        const json = { foo: ['bar'] };
        const input = '.foo[0]';
        const result = jq.exec(json, input);

        expect(result).toBe('bar');
    })

    it ('should return array with objects', () => {
        const json = { foo: [{ bar: 'bar' }] };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result[0].bar).toBe('bar');
    });

    it ('should return boolean', () => {
        const json = { foo: true };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result).toBe(true);
    });
    it ('should return object', () => {
        const json = { foo: {prop1: "1"} };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result.prop1).toBe("1");
    })

    it ('should return recursed obj', () => {
        const json = { foo: {obj: { obj2: { num: 1, string: "str"} }} };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result.obj.obj2.num).toBe(1);
        expect(result.obj.obj2.string).toBe("str");
    }),

    it ('should return recursed obj', () => {
        const json = { foo: { obj: { obj2: { num: 1, string: "str", bool: true} }} };
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result.obj.obj2.num).toBe(1);
        expect(result.obj.obj2.string).toBe("str");
        expect(result.obj.obj2.bool).toBe(true);
    })

    it ('should return null on invalid json', () => {
        const json = "foo";
        const input = '.foo';
        const result = jq.exec(json, input);

        expect(result).toBe(null);
    })

    it('should excape \'\' to ""', () => {
        const json = { foo: 'com' };
        const input = "'https://url.' + .foo";
        const result = jq.exec(json, input);

        expect(result).toBe('https://url.com');
    })

    it('should not escape \' in the middle of the string', () => {
        const json = { foo: 'com' };
        const input = "\"https://'url.\" + 'test.' + .foo";
        const result = jq.exec(json, input);

        expect(result).toBe("https://'url.test.com");
    });

    it ('should run a jq function succesfully', () => {
        const json = { foo: 'bar' };
        const input = '.foo | gsub("bar";"foo")';
        const result = jq.exec(json, input);

        expect(result).toBe('foo');
    })

    it ('Testing multiple the \'\' in the same expression', () => {
        const json = { foo: 'bar' };
        const input = "'https://some.random.url' + .foo + '-1' + '.' + .foo + '.' + 'longgggg' + .foo + ')test(' + .foo + 'testadsftets'";
        const result = jq.exec(json, input);

        expect(result).toBe('https://some.random.urlbar-1.bar.longggggbar)test(bartestadsftets');
    })

    it('test disable env', () => {
        expect(jq.exec({}, 'env', {enableEnv: false})).toEqual({});
        expect(jq.exec({}, 'env', {enableEnv: true})).not.toEqual({});
        expect(jq.exec({}, 'env', {})).toEqual({});
        expect(jq.exec({}, 'env')).toEqual({});
    })

    it('test throw on error', () => {
        expect(() => { jq.exec({}, 'foo', {throwOnError: true}) }).toThrow("jq: compile error: foo/0 is not defined at <top-level>, line 1:");
        expect(() => { jq.exec({}, '1/0', {throwOnError: true}) }).toThrow("number (1) and number (0) cannot be divided because the divisor is zero");
        expect(() => { jq.exec({}, '{', {throwOnError: true}) }).toThrow("jq: compile error: syntax error, unexpected end of file (Unix shell quoting issues?) at <top-level>, line 1:");
        expect(() => { jq.exec({}, '{(0):1}', {throwOnError: true}) }).toThrow("jq: compile error: Cannot use number (0) as object key at <top-level>, line 1:");
        expect(() => { jq.exec({}, 'if true then 1 else 0', {throwOnError: true}) }).toThrow("jq: compile error: Possibly unterminated 'if' statement at <top-level>, line 1:");
        expect(() => { jq.exec({}, 'null | map(.+1)', {throwOnError: true}) }).toThrow("jq: error: Cannot iterate over null (null)");
        expect(() => { jq.exec({foo: "bar"}, '.foo + 1', {throwOnError: true}) }).toThrow("jq: error: string (\"bar\") and number (1) cannot be added");
    })
})

