import { handle } from './handler.ts';

Deno.serve(req => handle(req, {
  elevenKey: Deno.env.get('ELEVENLABS_API_KEY') ?? '',
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
}));
