/** Keep application errors distinct from non-JSON hosting/proxy failures. */
export async function responseErrorMessage(response:Response,path:string):Promise<string>{
  if(response.headers.get('cf-mitigated')==='challenge')return 'Hosting security verification blocked this request. Please contact support.';
  try{
    const body:unknown=await response.json();
    const message=body&&typeof body==='object'?'message' in body?(body as {message?:unknown}).message:undefined:undefined;
    if(typeof message==='string'&&message.trim())return message.trim();
    if(Array.isArray(message)&&message.length&&message.every(value=>typeof value==='string'&&value.trim()))return message.join(' ');
  }catch{/* HTML/plain-text proxy errors must not be displayed as application messages. */}
  switch(response.status){
    case 400:return 'Please check the entered details and try again.';
    case 401:return path==='auth/login'?'Sign-in could not be verified. Check your sign-in details and try again.':'Your session has expired. Please sign in again.';
    case 403:return 'Access was blocked by the server or hosting security. Please contact support.';
    case 404:return 'The requested service could not be found. Please contact support.';
    case 408:case 504:return 'The server took too long to respond. Please try again shortly.';
    case 429:return 'Too many requests. Please wait a few minutes before trying again. If this continues, contact support.';
    case 502:case 503:return 'The server is starting or temporarily unavailable. Please try again shortly.';
    default:return response.status>=500?'A server error occurred. Please try again later or contact support.':`The request could not be completed (HTTP ${response.status}). Please try again or contact support.`;
  }
}
