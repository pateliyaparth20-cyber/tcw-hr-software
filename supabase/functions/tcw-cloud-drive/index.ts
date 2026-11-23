import {createDriveHandler} from './handler.ts';
// Public verification key only. The private signing key lives on the HR API server.
const publicKeySpki="MCowBQYDK2VwAyEApJI/80IjmGFgiHV+2wbg1/02tx9ZLEERsq5vKC+WYdA=";
Deno.serve(createDriveHandler({publicKeySpki,bucket:'tcw-cloud-drive',storageUrl:Deno.env.get('SUPABASE_URL')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));
