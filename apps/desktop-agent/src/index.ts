/** Integration contract, not an installed desktop monitoring agent. */
export interface VoluntaryActivityEvent {id:string;status:'WORKING'|'MEETING'|'BREAK'|'IDLE'|'OFFLINE';occurredAt:string}
export interface SecureBuffer {append(event:VoluntaryActivityEvent):Promise<void>;pending(limit:number):Promise<VoluntaryActivityEvent[]>;acknowledge(ids:string[]):Promise<void>}
export interface AgentSession {tenantId:string;employeeId:string;upload(events:VoluntaryActivityEvent[]):Promise<string[]>}
/** A platform-specific shell must provide encrypted storage and an authenticated uploader. */
export class VoluntaryAgent {
  private enabled=false;
  constructor(private storage:SecureBuffer,private session:AgentSession){}
  start(){this.enabled=true;}
  stop(){this.enabled=false;}
  async setStatus(status:VoluntaryActivityEvent['status']){if(!this.enabled)throw new Error('User consent is required before recording activity.');await this.storage.append({id:crypto.randomUUID(),status,occurredAt:new Date().toISOString()});}
  async flush(){if(!this.enabled)return;const events=await this.storage.pending(100);if(events.length)await this.storage.acknowledge(await this.session.upload(events));}
}
