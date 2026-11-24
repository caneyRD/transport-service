import { TripChatHandler } from './trip-chat';
describe('Trip chat',()=>{const repo={send:jest.fn(async(_t:string,u:string,b:string)=>({id:'m-1',tripId:'t',senderId:u,body:b,sentAt:new Date()})),list:jest.fn(async()=>[])};
 it('sends trimmed messages and paginates history',async()=>{await expect(new TripChatHandler(repo).send('t','u',' hola ')).resolves.toMatchObject({body:'hola'});await expect(new TripChatHandler(repo).list('t','u',10,0)).resolves.toEqual([]);});
 it('rejects empty or oversized messages',()=>{expect(()=>new TripChatHandler(repo).send('t','u',' ')).toThrow('required');expect(()=>new TripChatHandler(repo).send('t','u','x'.repeat(4001))).toThrow('required');});});
