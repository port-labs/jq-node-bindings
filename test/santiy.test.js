const jq = require('../lib');

describe('jq', () => {
    it('should break', () => {
        const json = { foo2: 'bar' };
        const input = '.foo';
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

        expect(result).toBe(undefined);
    })
})

