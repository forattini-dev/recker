export const tools = [
  {
    name: 'custom_hello',
    description: 'Say hello',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    }
  }
];

export const handlers = {
  custom_hello: async (args) => {
    return {
      content: [{ type: 'text', text: `Hello, ${args.name || 'World'}!` }]
    };
  }
};
