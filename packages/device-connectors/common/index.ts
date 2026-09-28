export interface DeviceUser {id:string;name:string;employeeCode:string}
export interface RawPunch {sourceId:string;deviceUserId:string;time:string;type:'IN'|'OUT';raw:unknown}
export interface DeviceAdapter {
  connect():Promise<void>;disconnect():Promise<void>;testConnection():Promise<{online:boolean}>;
  getDeviceInfo():Promise<Record<string,unknown>>;getDeviceTime():Promise<Date>;setDeviceTime(time:Date):Promise<void>;
  getUsers():Promise<DeviceUser[]>;createUser(user:DeviceUser):Promise<void>;updateUser(user:DeviceUser):Promise<void>;
  deleteUser(id:string):Promise<void>;syncUsers(users:DeviceUser[]):Promise<void>;getPunches(since:Date):Promise<RawPunch[]>;
  getFaceTemplates():Promise<never>;restartDevice():Promise<void>;getStatus():Promise<Record<string,unknown>>;
}
export class AdapterNotConfigured extends Error {constructor(vendor:string){super(`${vendor} requires a vendor SDK connector and a network agent on the device network.`);}}
export class UnconfiguredAdapter implements DeviceAdapter {
  constructor(readonly vendor:string){}
  private fail():never{throw new AdapterNotConfigured(this.vendor);}
  async connect(){this.fail()} async disconnect(){} async testConnection():Promise<{online:boolean}>{return this.fail()}
  async getDeviceInfo():Promise<Record<string,unknown>>{return this.fail()} async getDeviceTime():Promise<Date>{return this.fail()}
  async setDeviceTime(_time:Date){this.fail()} async getUsers():Promise<DeviceUser[]>{return this.fail()}
  async createUser(_user:DeviceUser){this.fail()} async updateUser(_user:DeviceUser){this.fail()}
  async deleteUser(_id:string){this.fail()} async syncUsers(_users:DeviceUser[]){this.fail()}
  async getPunches(_since:Date):Promise<RawPunch[]>{return this.fail()} async getFaceTemplates():Promise<never>{return this.fail()}
  async restartDevice(){this.fail()} async getStatus():Promise<Record<string,unknown>>{return this.fail()}
}
