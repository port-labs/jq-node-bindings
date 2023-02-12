{
  'targets': [
    {
      "target_name": "jq",
      "type": "none",
      "actions": [
            {
                "action_name": "configure",
                "inputs": [],
                "outputs": [
                        'deps/jq/src/libjq.so',
                        'deps/jq/src/libjq.so.1',
                        'deps/jq/src/libjq.a'
                ],
                "action": [
                    "node", "../util/configure"
                ]
            }
        ]
    }
  ]
}