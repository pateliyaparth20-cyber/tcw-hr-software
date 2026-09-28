import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient({log:process.env.SQL_LOG==='1'?['query','error']:['error']});
export type Database = PrismaClient;
