import { TransportNotificationsHandler } from './notifications';
describe('Transport notifications',()=>{
 const repo={list:jest.fn(async()=>[]),markRead:jest.fn(async()=>({id:'n-1',category:'viaje',title:'Aviso',body:'Aviso',payload:{},status:'enviada',createdAt:new Date()}))};
 it('lists bounded inbox pages',async()=>{await expect(new TransportNotificationsHandler(repo).list('u',20,2)).resolves.toEqual([]);});
 it('marks only a valid notification id',async()=>{await expect(new TransportNotificationsHandler(repo).read('u','n-1')).resolves.toMatchObject({status:'enviada'});expect(()=>new TransportNotificationsHandler(repo).read('u',' ')).toThrow('required');});
});
