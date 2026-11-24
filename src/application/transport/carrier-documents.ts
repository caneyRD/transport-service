import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';

export type CarrierDocumentType = 'cedula_frente' | 'cedula_reverso' | 'selfie' | 'licencia_conducir' | 'certificado_rnc' | 'otro';
export type CarrierDocumentContentType = 'application/pdf' | 'image/jpeg' | 'image/png';
export interface CarrierDocumentInput { type: CarrierDocumentType; url: string; contentType: CarrierDocumentContentType; bytes: number; sha256: string; expiresAt?: string; }
export interface CarrierDocumentRepository { add(userId: string, document: CarrierDocumentInput & { id: string }): Promise<unknown>; list(userId: string): Promise<unknown[]>; review?(documentId:string,reviewerId:string,status:'aprobado'|'rechazado',reason?:string):Promise<unknown>; }

export class CarrierDocumentsHandler {
  constructor(private readonly repository: CarrierDocumentRepository) {}
  async add(userId: string, input: CarrierDocumentInput) {
    if (!userId.trim()) throw new DomainError('Carrier user id is required');
    if (!input.url.trim() || input.url.length > 2048) throw new DomainError('Document url is invalid');
    if (!['cedula_frente','cedula_reverso','selfie','licencia_conducir','certificado_rnc','otro'].includes(input.type)) throw new DomainError('Invalid document type');
    if (!['application/pdf','image/jpeg','image/png'].includes(input.contentType)) throw new DomainError('Invalid document content type');
    if (!Number.isInteger(input.bytes) || input.bytes <= 0) throw new DomainError('Document bytes must be positive');
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new DomainError('Document sha256 is invalid');
    if (input.expiresAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) throw new DomainError('Document expiry must be YYYY-MM-DD');
    return this.repository.add(userId, { ...input, id: randomUUID() });
  }
  list(userId: string) { if (!userId.trim()) throw new DomainError('Carrier user id is required'); return this.repository.list(userId); }
  async review(documentId:string,reviewerId:string,status:'aprobado'|'rechazado',reason?:string) { if(!this.repository.review) throw new DomainError('Document review is not configured'); if(!documentId.trim()||!reviewerId.trim()) throw new DomainError('Document and reviewer are required'); if(!['aprobado','rechazado'].includes(status)) throw new DomainError('Invalid review status'); if(status==='rechazado'&&!reason?.trim()) throw new DomainError('Rejection reason is required'); return this.repository.review(documentId,reviewerId,status,reason?.trim()); }
}
