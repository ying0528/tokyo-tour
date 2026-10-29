// 由 build.mjs 從 app.config.json 帶入
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
declare const __FAKE_BACKEND__: boolean;

export const SUPABASE_URL: string = typeof __SUPABASE_URL__ === 'string' ? __SUPABASE_URL__ : '';
export const SUPABASE_KEY: string = typeof __SUPABASE_KEY__ === 'string' ? __SUPABASE_KEY__ : '';
export const FAKE_BACKEND: boolean = typeof __FAKE_BACKEND__ === 'boolean' ? __FAKE_BACKEND__ : false;
