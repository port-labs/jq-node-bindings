const jq = require('../lib');

describe('jq - async', () => {
    it('should break', async () => {
        const json = { foo2: 'bar' };
        const input = 'foo';
        const result = await jq.execAsync(json, input);

        expect(result).toBe(null);
    }),
    it('should break for invalid input', async () => {
        const json = { foo2: 'bar' };
        const input = 123;
        const result = await jq.execAsync(json, input);

        expect(result).toBe(null);
    }),
    it('should break for invalid input', async () => {
        const json = { foo2: 'bar' };
        const input = undefined;
        const result = await jq.execAsync(json, input);

        expect(result).toBe(null);
    }),
    it('should break for invalid input', async () => {
        const json = { foo2: 'bar' };
        const input = null;
        const result = await jq.execAsync(json, input);

        expect(result).toBe(null);
    }),
    it('string should work', async () => {
        const json = { foo: 'bar' };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result).toBe('bar');
    });

    it('number should work', async ()=> {
      const json = { foo: 1 };
      const input = '.foo';
      const result = await jq.execAsync(json, input);

      expect(result).toBe(1);
    });

    it ('should return null', async () => {
        const json = { foo: 'bar' };
        const input = '.bar';
        const result = await jq.execAsync(json, input);

        expect(result).toBe(null);
    });

    it ('should return array with object', async () => {
        const json = { foo: ['bar'] };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result[0]).toBe('bar');
    });

    it ('should return an item of an array', async () => {
        const json = { foo: ['bar'] };
        const input = '.foo[0]';
        const result = await jq.execAsync(json, input);

        expect(result).toBe('bar');
    })

    it ('should return array with objects', async () => {
        const json = { foo: [{ bar: 'bar' }] };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result[0].bar).toBe('bar');
    });

    it ('should return boolean', async () => {
        const json = { foo: true };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result).toBe(true);
    });
    it ('should return object', async () => {
        const json = { foo: {prop1: "1"} };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result.prop1).toBe("1");
    })

    it ('should return recursed obj', async () => {
        const json = { foo: {obj: { obj2: { num: 1, string: "str"} }} };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result.obj.obj2.num).toBe(1);
        expect(result.obj.obj2.string).toBe("str");
    }),

    it ('should return recursed obj', async () => {
        const json = { foo: { obj: { obj2: { num: 1, string: "str", bool: true} }} };
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result.obj.obj2.num).toBe(1);
        expect(result.obj.obj2.string).toBe("str");
        expect(result.obj.obj2.bool).toBe(true);
    })

    it ('should return null on invalid json', async () => {
        const json = "foo";
        const input = '.foo';
        const result = await jq.execAsync(json, input);

        expect(result).toBe(null);
    })

    it('should excape \'\' to ""', async () => {
        const json = { foo: 'com' };
        const input = "'https://url.' + .foo";
        const result = await jq.execAsync(json, input);

        expect(result).toBe('https://url.com');
    })

    it('should not escape \' in the middle of the string', async () => {
        const json = { foo: 'com' };
        const input = "\"https://'url.\" + 'test.' + .foo";
        const result = await jq.execAsync(json, input);

        expect(result).toBe("https://'url.test.com");
    });

    it ('should run a jq function succesfully', async () => {
        const json = { foo: 'bar' };
        const input = '.foo | gsub("bar";"foo")';
        const result = await jq.execAsync(json, input);

        expect(result).toBe('foo');
    })

    it ('Testing multiple the \'\' in the same expression', async () => {
        const json = { foo: 'bar' };
        const input = "'https://some.random.url' + .foo + '-1' + '.' + .foo + '.' + 'longgggg' + .foo + ')test(' + .foo + 'testadsftets'";
        const result = await jq.execAsync(json, input);

        expect(result).toBe('https://some.random.urlbar-1.bar.longggggbar)test(bartestadsftets');
    })

    it('test disable env', async () => {
        expect(await jq.execAsync({}, 'env', {enableEnv: false})).toEqual({});
        expect(await jq.execAsync({}, 'env', {enableEnv: true})).not.toEqual({});
        expect(await jq.execAsync({}, 'env', {})).toEqual({});
        expect(await jq.execAsync({}, 'env')).toEqual({});
    })

    it('test throw on error', async () => {
        await expect(jq.execAsync({}, 'foo', {throwOnError: true})).rejects.toThrow("jq: compile error: foo/0 is not defined at <top-level>, line 1:");
        await expect(jq.execAsync({}, '1/0', {throwOnError: true})).rejects.toThrow("number (1) and number (0) cannot be divided because the divisor is zero");
        await expect(jq.execAsync({}, '{', {throwOnError: true})).rejects.toThrow("jq: compile error: syntax error, unexpected end of file (Unix shell quoting issues?) at <top-level>, line 1:");
        await expect(jq.execAsync({}, '{(0):1}', {throwOnError: true})).rejects.toThrow("jq: compile error: Cannot use number (0) as object key at <top-level>, line 1:");
        await expect(jq.execAsync({}, 'if true then 1 else 0', {throwOnError: true})).rejects.toThrow("jq: compile error: Possibly unterminated 'if' statement at <top-level>, line 1:");
        await expect(jq.execAsync({}, 'null | map(.+1)', {throwOnError: true})).rejects.toThrow("jq: error: Cannot iterate over null (null)");
        await expect(jq.execAsync({foo: "bar"}, '.foo + 1', {throwOnError: true})).rejects.toThrow("jq: error: string (\"bar\") and number (1) cannot be added");
    })

    it('throw after timeout', async () => {
      await expect(jq.execAsync({}, '[range(infinite)]', { timeoutSec: 1, throwOnError: true })).rejects.toThrow('timeout');
    });
})

