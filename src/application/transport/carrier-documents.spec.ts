import { CarrierDocumentsHandler } from './carrier-documents';

const input = { type: 'licencia_conducir' as const, url: 'https://files.test/licencia.pdf', contentType: 'application/pdf' as const, bytes: 1200, sha256: 'a'.repeat(64), expiresAt: '2027-12-31' };

describe('UC-TRA-20 carrier KYC documents', () => {
  it('validates and stores a document without trusting client identity', async () => {
    const repository = { add: jest.fn(async (_userId: string, document: { id: string }) => document), list: jest.fn(async () => []) };
    const result = await new CarrierDocumentsHandler(repository).add('carrier-1', input);
    expect(repository.add).toHaveBeenCalledWith('carrier-1', expect.objectContaining({ ...input, id: expect.any(String) }));
    expect(result).toHaveProperty('id');
  });

  it('rejects invalid hashes, mime types and expiry dates', async () => {
    const repository = { add: jest.fn(), list: jest.fn() };
    const handler = new CarrierDocumentsHandler(repository);
    await expect(handler.add('carrier-1', { ...input, sha256: 'bad' })).rejects.toThrow('sha256');
    await expect(handler.add('carrier-1', { ...input, contentType: 'text/plain' as never })).rejects.toThrow('content type');
    await expect(handler.add('carrier-1', { ...input, expiresAt: 'tomorrow' })).rejects.toThrow('YYYY-MM-DD');
  });
  it('reviews documents and requires a reason for rejection', async () => {
    const repository = { add: jest.fn(), list: jest.fn(), review: jest.fn(async (_id:string,_reviewer:string,status:string,reason?:string) => ({ status, reason })) };
    const handler = new CarrierDocumentsHandler(repository);
    await expect(handler.review('doc-1','reviewer-1','aprobado')).resolves.toMatchObject({status:'aprobado'});
    await expect(handler.review('doc-1','reviewer-1','rechazado')).rejects.toThrow('reason');
    await expect(handler.review('doc-1','reviewer-1','rechazado','Documento ilegible')).resolves.toMatchObject({status:'rechazado'});
  });
});
