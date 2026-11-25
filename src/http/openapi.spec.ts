import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { createTransportServer } from './server';
import { HttpError } from './auth';
import { documentedOperations, openApiDocument } from './openapi';

// Every operation in the Swagger document must reach a real route: an unknown one answers "Route not found".
describe('Swagger / OpenAPI', () => {
  let server: Server, base: string;
  const start = async (docs?: boolean) => {
    server = createTransportServer({ execute: async () => { throw new HttpError(418, 'reached the handler'); }, health: async () => undefined } as never,
      async (authorization) => { if (!authorization) throw new HttpError(401, 'Token required'); return 'user-1'; }, { docs });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it('serves the Swagger UI and the OpenAPI document without a token', async () => {
    await start();
    const page = await fetch(`${base}/docs`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('SwaggerUIBundle');
    const spec = await (await fetch(`${base}/docs/openapi.json`)).json();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(spec.paths['/admin/carriers/{id}/status'].patch.requestBody.content['application/json'].schema.properties.status.enum).toContain('habilitado');
    expect(spec.paths['/health'].get.security).toEqual([]);
  });

  it('can be turned off', async () => {
    await start(false);
    expect((await fetch(`${base}/docs/openapi.json`)).status).toBe(401);
  });

  it('documents only routes the server actually answers', async () => {
    await start();
    expect(documentedOperations().length).toBeGreaterThan(80);
    const missing: string[] = [];
    for (const op of documentedOperations()) {
      const path = op.path.replace('{milestone}', 'DEPART_TO_ORIGIN').replace(/\{\w+\}/g, '00000000-0000-4000-8000-000000000001');
      const query = path.includes('/open') || path.includes('/nearby') && !path.includes('nearby-trucks') ? '?latitude=18.4&longitude=-69.9' : '';
      const hasBody = !['GET', 'DELETE'].includes(op.method);
      const response = await fetch(base + path + query, { method: op.method, headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'idempotency-key': 'k-1' }, body: hasBody ? '{}' : undefined });
      const body = await response.json().catch(() => ({}));
      if (body.message === 'Route not found') missing.push(`${op.method} ${op.path}`);
    }
    expect(missing).toEqual([]);
  });

  it('every operation has a summary and a tag, and path parameters are declared', () => {
    const spec = openApiDocument();
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const op of Object.values(methods as Record<string, { summary: string; tags: string[]; parameters: { name: string; in: string }[] }>)) {
        expect(op.summary).toBeTruthy();
        expect(op.tags).toHaveLength(1);
        const declared = op.parameters.filter(p => p.in === 'path').map(p => p.name);
        expect(declared).toEqual([...path.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
      }
    }
  });
});
