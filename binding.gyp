{
    "targets": [
        {
            "target_name": "jq-node-bindings",
            "sources": [
                "src/binding.cc"
            ],
            "include_dirs": [
                "<!(node -p \"require('node-addon-api').include_dir\")",
                "<(module_root_dir)/",
                "deps/jq/src",
                "../node-addon-api/"
            ],
            "defines": [
                "NAPI_VERSION=8",
                'NAPI_DISABLE_CPP_EXCEPTIONS'
            ],
            "conditions": [
                [
                    "OS=='linux'",
                    {
                        "libraries": [
                            "-Wl,-rpath='$$ORIGIN/../deps'",
                            "../build/deps/libjq.so.1"
                        ],
                        "cflags_cc": [
                            "-std=c++17"
                        ],
                        "cflags_cc!": [
                            "-fno-rtti -fno-exceptions"
                        ]
                    }
                ],
                [
                    "OS=='mac'",
                    {
                        "libraries": [
                            "../build/deps/libjq.dylib"
                        ],
                        "xcode_settings": {
                            "MACOSX_DEPLOYMENT_TARGET": "12.0.1",
                            "GCC_ENABLE_CPP_RTTI": "YES",
                            "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
                        },
                        "OTHER_CPLUSPLUSFLAGS": [
                            "-std=c++17"
                        ],
                        "include_dirs": [
                            "deps/jq/src"
                        ],      "cflags": ["-fsanitize=address", "-fno-omit-frame-pointer"],
      "ldflags": ["-fsanitize=address"],
                    }
                ],
                [
                    "OS=='win'",
                    {
                        "msvs_settings": {
                            "VCCLCompilerTool": {
                                "AdditionalOptions": ["/std:c++17"],
                                "ExceptionHandling": 1,
                                "RuntimeTypeInfo": "true"
                            }
                        },
                        "libraries": [
                            "deps\\jq\\build\\Release\\libjq.lib"
                        ],
                        "include_dirs": [
                            "deps\\jq\\src"
                        ]
                    }
                ]
            ],
            "dependencies": [
                "deps/jq.gyp:jq"
            ]
        }
    ]
}
