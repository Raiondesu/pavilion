import example from './example/index.html';

Bun.serve({
  port: '1234',
  development: {
    hmr: true,
    console: true,
  },

  routes: {
    '/': example
  }
});
