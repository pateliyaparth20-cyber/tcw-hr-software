export function avatarInitials(name:string|null|undefined){
  const parts=String(name??'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return '?';
  const first=Array.from(parts[0])[0]??'';
  const last=parts.length>1?(Array.from(parts[parts.length-1])[0]??''):'';
  return (first+last).toLocaleUpperCase();
}

export function avatarPhotoSrc(src:string|null|undefined){
  const value=String(src??'').trim();
  return value||null;
}
