import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200);
    response.end(JSON.stringify({ service: 'transport-service', status: 'ok' }));
    return;
  }

  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200);
    response.end(JSON.stringify({ service: 'transport-service', message: 'Backend de Transporte BANEY activo' }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ statusCode: 404, message: 'Route not found' }));
});

server.listen(port, () => {
  console.log(`transport-service listening on http://localhost:${port}`);
});
