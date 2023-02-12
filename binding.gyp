{
  "targets": [
    {
      "target_name": "jq-node-bindings",
      'cflags_cc' : [
        '-std=c++17'
      ],
      'cflags_cc!': [
        '-fno-rtti'
      ],
      "sources": [
        "./src/binding.cpp",
        "./src/index.cpp",
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(module_root_dir)/",
        "deps/jq/src",
      ],
      "libraries": [
        "../build/deps/libjq.so",
        "-Wl,-rpath='$$ORIGIN/../deps'"
      ],
      "dependencies": [
        "deps/jq.gyp:jq"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
    }
  ]
}