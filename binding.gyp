{
    "targets": [
        {
            "target_name": "jq-node-bindings",
            "sources": [
                "src/binding.cpp",
                "src/index.cpp",
            ],
            "include_dirs": [
                "<!(node -e \"require('nan')\")",
                "<(module_root_dir)/",
                "deps/jq/src",
            ],
            'conditions': [
                [
                    'OS=="linux"',
                    {
                        "libraries": [
                            "../build/deps/libjq.so",
                            "-Wl,-rpath='$$ORIGIN/../deps'",
                        ],
                        'cflags_cc': [
                            '-std=c++17'
                        ],
                        'cflags_cc!': [
                            '-fno-rtti'
                        ]
                    }
                ],
                [
                    'OS=="mac"',
                    {
                        "libraries": [
                            "../build/deps/libjq.dylib",
                        ],
                        'xcode_settings': {
                            'MACOSX_DEPLOYMENT_TARGET': '12.0.1',
                            'GCC_ENABLE_CPP_RTTI': 'YES'
                        },
                    }
                ]
            ],
            "dependencies": [
                "deps/jq.gyp:jq"
            ],
            'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
        }
    ]
}
