import {releaseAssets} from '../../../../../../packages/ui/update-assets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await releaseAssets(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({message:'The update download list is not ready. Try again shortly.'},{status:503});}}
