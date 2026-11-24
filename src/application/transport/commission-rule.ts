export interface TransportCommissionRule { id:string; name:string; type:string; percentage:number; fixedAmount:number; minimum?:number; maximum?:number; currency:string; validFrom:Date; validTo?:Date }
export interface TransportCommissionRuleRepository { current():Promise<TransportCommissionRule>; }
