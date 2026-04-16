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
                    "outputs": [
                        "build/deps/libjq.a",
                        "build/deps/libonig.a"
                    ]
                }
            ],
        }
    ]
}
