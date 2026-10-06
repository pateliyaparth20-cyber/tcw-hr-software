export type ReportingPerson={id:string;firstName:string;lastName:string;employeeCode:string;managerId?:string|null;departmentName?:string;designation?:string;status?:string};
export function reportingTree(people:ReportingPerson[],query=''){
 const byId=new Map(people.map(p=>[p.id,p]));
 const invalid=new Set<string>();
 for(const person of people){
  const path:string[]=[],visited=new Map<string,number>();let current:string|null|undefined=person.id;
  while(current&&byId.has(current)){
   if(visited.has(current)){for(const id of path.slice(visited.get(current)))invalid.add(id);break}
   visited.set(current,path.length);path.push(current);current=byId.get(current)?.managerId;
  }
 }
 const parents=new Map(people.map(p=>[p.id,p.managerId&&byId.has(p.managerId)&&!invalid.has(p.id)?p.managerId:null]));
 const needle=query.trim().toLocaleLowerCase();
 const matches=new Set(people.filter(p=>!needle||[p.firstName+' '+p.lastName,p.employeeCode,p.departmentName,p.designation].some(v=>String(v??'').toLocaleLowerCase().includes(needle))).map(p=>p.id));
 const visible=new Set(matches);
 for(const id of matches){let parent=parents.get(id);while(parent&&!visible.has(parent)){visible.add(parent);parent=parents.get(parent)}}
 const children=new Map<string,ReportingPerson[]>();const roots:ReportingPerson[]=[];
 for(const person of people.filter(p=>visible.has(p.id)).sort((a,b)=>(a.firstName+' '+a.lastName).localeCompare(b.firstName+' '+b.lastName)||a.employeeCode.localeCompare(b.employeeCode))){
  const parent=parents.get(person.id);
  if(parent){const list=children.get(parent)??[];list.push(person);children.set(parent,list)}else roots.push(person);
 }
 return {roots,children,matches,invalid,visibleCount:visible.size};
}
