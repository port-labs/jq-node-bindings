{
    "targets": [
        {
            "target_name": "jq-node-bindings",
            "sources": [
                "src/binding.cc",
            ],
            "include_dirs": [
                "<!(node -e \"require('nan')\")",
                "<(module_root_dir)/",
                "deps/jq/src"
            ],
            'conditions': [
                [
                    'OS=="linux"',
                    {
                        "libraries": [
                            "-Wl,-rpath='$$ORIGIN/../deps'",
                            "../build/deps/libjq.so.1",
                        ],
                        'cflags_cc': [
                            '-std=c++17'
                        ],
                        'cflags_cc!': [
                            '-fno-rtti -fno-exceptions'
                        ]
                    }
                ],
                [
                    'OS=="mac"',
                    {
                        "libraries": [
                            "../build/deps/libjq.dylib",
                            # "../build/deps/libonig.4.dylib",
                            # "../build/deps/libonig.dylib",
                        ],
                        'xcode_settings': {
                            'MACOSX_DEPLOYMENT_TARGET': '12.0.1',
                            'GCC_ENABLE_CPP_RTTI': 'YES',
                            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES'
                        },
                        'OTHER_CPLUSPLUSFLAGS': [
                            '-std=c++17'
                        ],
                        "include_dirs": [
                            "deps/jq/src"
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
