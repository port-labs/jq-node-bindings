{
    'targets': [
        {
            "target_name": "jq",
            "type": "none",
            "actions": [
                {
                    "action_name": "configure",
                    "inputs": [],
                    "action": [
                        "node", "../util/configure"
                    ],
                    "conditions": [
                        [
                            'OS=="mac"',
                            {
                                'outputs': [
                                    'deps/libjq/src/libjq.dylib',
                                    'deps/libjq/src/libjq.1.dylib'
                                ]
                            },
                            {
                                'outputs': [
                                    'deps/jq/src/libjq.so',
                                    'deps/jq/src/libjq.so.1',
                                    'deps/jq/src/libjq.a'
                                ],
                            }
                        ]
                    ]
                }
            ],
        }
    ]
}
