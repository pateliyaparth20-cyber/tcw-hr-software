import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export default {
  outputFileTracingRoot: root,
  poweredByHeader: false,
  experimental: {externalDir: true},
  webpack(config,{dev}) {
    if(dev){
      config.watchOptions={...(config.watchOptions??{}),ignored:['**/.local-data/**','**/.git/**','**/node_modules/**','**/*.log']};
    }
    return config;
  },
  async headers() {return [{source:'/:path*',headers:[{key:'Cache-Control',value:'no-store, max-age=0, must-revalidate'},{key:'Pragma',value:'no-cache'}]}];},
  async rewrites() {return [{source:'/socket.io/:path*',destination:`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/socket.io/:path*`}];}
};
