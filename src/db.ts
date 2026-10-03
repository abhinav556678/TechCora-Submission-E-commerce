import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'flash_user',
  password: process.env.POSTGRES_PASSWORD || 'flash_password',
  database: process.env.POSTGRES_DB || 'flash_sale',
});
