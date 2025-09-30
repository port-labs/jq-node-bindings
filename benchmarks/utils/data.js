function generateSmallData() {
  const data = { a: 1, b: "hello", c: true };
  return {
    queries: {
      simple: ".a",
    },
    data,
  };
}

function generateMediumData() {
  const data = { users: [] };

  for (let i = 0; i < 100; i++) {
    data.users.push({
      id: i,
      name: `User${i}`,
      email: `user${i}@example.com`,
      profile: {
        age: 20 + (i % 50),
        city: `City${i % 10}`,
        hobbies: ["reading", "coding", "gaming"].slice(0, (i % 3) + 1),
      },
    });
  }

  return {
    queries: {
      simple: ".users[0].name",
      moderate: "[.users[] | select(.profile.age > 30) | {name, email}]",
    },
    data,
  };
}

function generateLargeData() {
  const data = { items: [] };

  for (let i = 0; i < 1000; i++) {
    data.items.push({
      id: i,
      data: {
        nested: {
          value: Math.random(),
          array: Array.from({ length: 10 }, () => Math.random()),
        },
      },
    });
  }

  return {
    queries: {
      simple: ".items[0].data.nested.value",
      moderate:
        "[.items[] | select(.data.nested.value > 0.5) | {id, value: .data.nested.value}]",
      complex:
        "[.items[] | select(.data.nested.value > 0.5) | .data.nested.array | map(. * 2) | add]",
    },
    data,
  };
}

function generateSmallTemplateData() {
  const data = { a: 1, b: "hello", c: true };
  return {
    templates: {
      simple: { result: "{{.a}}" },
    },
    data,
  };
}

function generateMediumTemplateData() {
  const data = { users: [] };

  for (let i = 0; i < 100; i++) {
    data.users.push({
      id: i,
      name: `User${i}`,
      email: `user${i}@example.com`,
      profile: {
        age: 20 + (i % 50),
        city: `City${i % 10}`,
        hobbies: ["reading", "coding", "gaming"].slice(0, (i % 3) + 1),
      },
    });
  }

  return {
    templates: {
      simple: { userName: "{{.users[0].name}}" },
      moderate: {
        filteredUsers:
          "{{[.users[] | select(.profile.age > 30) | {name, email}]}}",
        summary: {
          totalUsers: "{{.users | length}}",
          averageAge: "{{[.users[].profile.age] | add / length}}",
        },
        message:
          "Hello {{.users[0].name}}, you have {{.users | length}} users in total, with an average age of {{[.users[].profile.age] | add / length}} and {{[.users[] | select(.profile.age > 30)] | length}} users over 30.",
      },
    },
    data,
  };
}

function generateLargeTemplateData() {
  const data = { items: [] };

  for (let i = 0; i < 1000; i++) {
    data.items.push({
      id: i,
      data: {
        nested: {
          value: Math.random(),
          array: Array.from({ length: 10 }, () => Math.random()),
        },
      },
    });
  }

  return {
    templates: {
      simple: { firstValue: "{{.items[0].data.nested.value}}" },
      moderate: {
        filteredItems:
          "{{[.items[] | select(.data.nested.value > 0.5) | {id, value: .data.nested.value}]}}",
        stats: {
          count: "{{.items | length}}",
          avgValue: "{{[.items[].data.nested.value] | add / length}}",
        },
      },
      complex: {
        processed:
          "{{[.items[] | select(.data.nested.value > 0.5) | {id, doubledArray: [.data.nested.array[] * 2], sum: (.data.nested.array | add)}]}}",
        summary: {
          totalItems: "{{.items | length}}",
          highValueCount:
            "{{[.items[] | select(.data.nested.value > 0.5)] | length}}",
        },
        report:
          "Dataset contains {{.items | length}} items, with {{[.items[] | select(.data.nested.value > 0.5)] | length}} having values over 0.5. The average value is {{[.items[].data.nested.value] | add / length}}, and the first high-value item has ID {{[.items[] | select(.data.nested.value > 0.5) | .id][0]}}.",
      },
    },
    data,
  };
}

module.exports = {
  generateSmallData,
  generateMediumData,
  generateLargeData,
  generateSmallTemplateData,
  generateMediumTemplateData,
  generateLargeTemplateData,
};
