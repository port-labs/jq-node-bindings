# jq-node-bindings

This is a library for Node.js that provides C bindings to the [jq](https://stedolan.github.io/jq/) library. It allows you to use jq to extract and manipulate data from JSON objects in Node.js.

## Installation

```
npm install @port-labs/jq-node-bindings
```

## Requirements

To use this library, you must have `node-gyp` installed on your system. and the following libraries

1. `node-gyp`
    ```
    npm install -g node-gyp
    ```

2.  XCode on Mac, gcc on unix
    Mac
    ```
    xcode-select --install
    ```
    
    Yum
    ```
    sudo yum install gcc g++
    ```

    apt-get
    ```
    sudo apt-get gcc g++
    ```

3. The following C\C++ toolchains autoconf make libtool automake
    Homebrew
    ```
        brew install autoconf make automake libtool
    ```

    Yum
    ```
        sudo apt-get install -y autoconf make libtool automake
    ```

    apt-get
    ```
        sudo apt-get install -y autoconf make libtool automake
    ```



## Usage

Here's an example of how to use the library:

```typescript
import { exec } from 'jq-node-bindings';

const json = { foo: 'bar' };
const input = '.foo';

const result = exec(json, input);

console.log(result); // outputs "bar"
```

The exec function takes two arguments: a JSON object and a jq input string. It returns the result of running the jq program on the JSON object. The result can be of any type supported by jq: object, array, string, number, boolean, or null.

Here are some examples of how to use the exec function:

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)