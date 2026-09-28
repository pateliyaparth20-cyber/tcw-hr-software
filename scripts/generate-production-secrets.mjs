import {randomBytes} from 'node:crypto';
const secret=(bytes=24)=>randomBytes(bytes).toString('base64url');
console.log('# Generate once, store in your production secret manager, and do not commit these values.');
console.log(`POSTGRES_PASSWORD=${secret(32)}`);
console.log(`ADMIN_PASSWORD=${secret(24)}!Aa7`);
console.log(`CONFIG_ENCRYPTION_KEY=${secret(48)}`);
console.log(`S3_SECRET_KEY=${secret(32)}`);
