export interface ServiceZone { id:string; name:string; type:string; center:{latitude:number;longitude:number}; radiusMeters?:number; polygon?:unknown; }
export interface ServiceZoneRepository { active():Promise<ServiceZone[]>; }
