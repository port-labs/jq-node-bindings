{
  "targets": [
    {
      "target_name": "jq-node-bindings",
      "cflags!": [ "-fno-exceptions", '-fno-rtti' ],
      "cflags_cc!": [ "-fno-exceptions",  "-std=c++17"],
      "sources": [
        "./src/binding.cpp",
        "./src/index.cpp",
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(module_root_dir)/",
        "deps/jq/src",
        "build/deps/include",
      ],
      "libraries": [
        "../build/deps/libjq.a",
      ],
      "dependencies": [
          "deps/jq.gyp:jq"
        ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
    }
  ]
}